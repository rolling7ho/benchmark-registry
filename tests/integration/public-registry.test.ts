import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/application.js';
import { createDatabase, type Database } from '../../src/db/database.js';
import {
  getBenchmarkBySlug,
  getOrganizationBySlug,
  listSources,
} from '../../src/db/registry-browse.js';
import { getLastPublicRegistryUpdate } from '../../src/db/registry-metadata.js';
import { getPublicRecordDetail } from '../../src/db/record-detail.js';
import {
  getLeaderboardOptions,
  getRegistryRecords,
} from '../../src/db/registry-records.js';
import { seedTestData } from '../../src/db/seed-test-data.js';
import {
  listBenchmarkSitemapEntries,
  listModelSitemapEntries,
  listOrganizationSitemapEntries,
  listRecordSitemapEntries,
} from '../../src/db/sitemaps.js';
import {
  compactSearchText,
  normalizeSearchText,
} from '../../src/search/normalize.js';
import { resolveSearch } from '../../src/search/resolve-search.js';

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

describe.skipIf(integrationDatabaseUrl === undefined)(
  'public registry and deterministic search',
  () => {
    let database: Database;

    beforeAll(async () => {
      await runner({
        databaseUrl: integrationDatabaseUrl as string,
        dir: 'migrations',
        direction: 'up',
        migrationsTable: 'pgmigrations',
        verbose: false,
      });
      database = createDatabase(integrationDatabaseUrl as string);
      await database.deleteFrom('ingestion_candidates').execute();
      await database.deleteFrom('ingestion_jobs').execute();
      await database.deleteFrom('benchmark_records').execute();
      await database.deleteFrom('benchmark_versions').execute();
      await database.deleteFrom('model_snapshots').execute();
      await database.deleteFrom('models').execute();
      await database.deleteFrom('benchmarks').execute();
      await database.deleteFrom('metrics').execute();
      await database.deleteFrom('sources').execute();
      await seedTestData(database);
    });

    afterAll(async () => database?.destroy());

    it.each([
      ['BR-00155-001', 'EXACT_RECORD'],
      ['BR-00155', 'RECORD_PREFIX'],
      ['OPNAI-55', 'MODEL'],
      ['opnai-55', 'MODEL'],
      ['GPT-5.5', 'MODEL'],
      ['GPT 5.5', 'MODEL'],
      ['gpt_5.5', 'MODEL'],
      ['GPT55', 'MODEL'],
      ['gpt.55', 'MODEL'],
      ['DeepSWE', 'BENCHMARK'],
      ['OpenAI', 'ORGANIZATION'],
      ['OPNAI', 'ORGANIZATION'],
      ['Overall', 'METRIC'],
      ['clearly unknown search value', 'GENERAL'],
    ])('resolves %s as %s', async (query, kind) => {
      expect((await resolveSearch(database, query)).kind).toBe(kind);
    });

    it('exact record search short-circuits and returns one row', async () => {
      const result = await getRegistryRecords(database, {
        kind: 'EXACT_RECORD',
        recordId: 'BR-00155-001',
      });
      expect(result.records.map((record) => record.recordId)).toEqual([
        'BR-00155-001',
      ]);
    });

    it('quarantines Artificial Analysis records from every public read path', async () => {
      const original = await database
        .selectFrom('benchmark_records')
        .selectAll()
        .where('record_id', '=', 'BR-00155-001')
        .executeTakeFirstOrThrow();
      const aaSource = await database
        .insertInto('sources')
        .values({
          url: 'https://leaderboard.artificialanalysis.ai/models/test',
          title: 'Artificial Analysis quarantine fixture',
          source_type: 'OTHER',
          publisher: 'Artificial Analysis',
          published_date: null,
          accessed_at: new Date('2026-07-15T00:00:00Z'),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const nativeBenchmark = await database
        .insertInto('benchmarks')
        .values({
          slug: 'gdpval-aa',
          name: 'GDPval-AA',
          organization_name: 'Artificial Analysis',
          version: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const nativeVersion = await database
        .insertInto('benchmark_versions')
        .values({
          benchmark_id: nativeBenchmark.id,
          canonical_reference: 'gdpval-aa/default',
          version_label: null,
          variant_name: null,
          status: 'ACTIVE',
          release_date: null,
          notes: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const recordValues = {
        model_id: original.model_id,
        evaluation_configuration_id: original.evaluation_configuration_id,
        model_snapshot_id: original.model_snapshot_id,
        evaluator_id: original.evaluator_id,
        metric_id: original.metric_id,
        score_value: original.score_value,
        score_display: original.score_display,
        evaluation_date: original.evaluation_date,
        reported_date: original.reported_date,
        report_type: original.report_type,
        status: original.status,
        notes: original.notes,
        superseded_by_record_id: null,
      } as const;
      const directRecordId = 'BR-00155-999';
      const nativeRecordId = 'BR-00155-998';

      try {
        await database
          .insertInto('benchmark_records')
          .values([
            {
              ...recordValues,
              record_id: directRecordId,
              benchmark_id: original.benchmark_id,
              benchmark_version_id: original.benchmark_version_id,
              source_id: aaSource.id,
              sequence_number: 999,
              updated_at: new Date('2099-01-01T00:00:00Z'),
            },
            {
              ...recordValues,
              record_id: nativeRecordId,
              benchmark_id: nativeBenchmark.id,
              benchmark_version_id: nativeVersion.id,
              source_id: original.source_id,
              sequence_number: 998,
              updated_at: new Date('2099-01-01T00:00:00Z'),
            },
          ])
          .execute();

        const [
          options,
          directResult,
          nativeResult,
          recordSitemap,
          modelSitemap,
          benchmarkSitemap,
          organizationSitemap,
          sources,
          publicUpdate,
          nativeBenchmarkDetails,
          openAiDetails,
        ] = await Promise.all([
          getLeaderboardOptions(database),
          getRegistryRecords(database, {
            kind: 'EXACT_RECORD',
            recordId: directRecordId,
          }),
          getRegistryRecords(database, {
            kind: 'EXACT_RECORD',
            recordId: nativeRecordId,
          }),
          listRecordSitemapEntries(database, 1),
          listModelSitemapEntries(database),
          listBenchmarkSitemapEntries(database),
          listOrganizationSitemapEntries(database),
          listSources(database),
          getLastPublicRegistryUpdate(database),
          getBenchmarkBySlug(database, 'gdpval-aa'),
          getOrganizationBySlug(database, 'openai'),
        ]);
        expect(options.recordCount).toBe(5);
        expect(directResult.records).toEqual([]);
        expect(nativeResult.records).toEqual([]);
        expect((await resolveSearch(database, directRecordId)).kind).not.toBe(
          'EXACT_RECORD',
        );
        expect(await getPublicRecordDetail(database, directRecordId)).toBe(
          undefined,
        );
        expect(
          recordSitemap.some(
            (entry) =>
              entry.path.includes(directRecordId) ||
              entry.path.includes(nativeRecordId),
          ),
        ).toBe(false);
        expect(
          sources.some(
            (source) =>
              source.url ===
              'https://leaderboard.artificialanalysis.ai/models/test',
          ),
        ).toBe(false);
        expect(publicUpdate?.startsWith('2099-')).toBe(false);
        expect(nativeBenchmarkDetails?.recordCount).toBe(0);
        expect(openAiDetails?.recordCount).toBe(3);
        for (const entries of [
          modelSitemap,
          benchmarkSitemap,
          organizationSitemap,
        ]) {
          expect(
            entries.some(
              (entry) => entry.lastModified?.getUTCFullYear() === 2099,
            ),
          ).toBe(false);
        }

        const app = createApp({ database });
        const hiddenDetail = await app.inject({
          url: `/records/${directRecordId}`,
        });
        const hiddenSearch = await app.inject({
          url: `/search?q=${directRecordId}`,
        });
        const sourcesPage = await app.inject({ url: '/sources' });
        const homePage = await app.inject({ url: '/' });
        const recordSitemapPage = await app.inject({
          url: '/sitemaps/records-1.xml',
        });
        expect(hiddenDetail.statusCode).toBe(404);
        expect(hiddenDetail.body).not.toContain(directRecordId);
        expect(hiddenDetail.body).not.toContain('application/ld+json');
        expect(hiddenSearch.statusCode).toBe(200);
        expect(hiddenSearch.body).not.toContain(`/records/${directRecordId}`);
        expect(sourcesPage.statusCode).toBe(200);
        expect(sourcesPage.body).not.toContain(
          'Artificial Analysis quarantine fixture',
        );
        expect(sourcesPage.body).not.toContain('artificialanalysis.ai');
        expect(homePage.statusCode).toBe(200);
        expect(homePage.body).toContain(
          '<span class="registry-record-count">5 records</span>',
        );
        expect(homePage.body).not.toContain('2099-01-01');
        expect(recordSitemapPage.statusCode).toBe(200);
        expect(recordSitemapPage.body).not.toContain(directRecordId);
        expect(recordSitemapPage.body).not.toContain(nativeRecordId);
        await app.close();
      } finally {
        await database
          .deleteFrom('benchmark_records')
          .where('record_id', 'in', [directRecordId, nativeRecordId])
          .execute();
        await database
          .deleteFrom('benchmark_versions')
          .where('id', '=', nativeVersion.id)
          .execute();
        await database
          .deleteFrom('benchmarks')
          .where('id', '=', nativeBenchmark.id)
          .execute();
        await database
          .deleteFrom('sources')
          .where('id', '=', aaSource.id)
          .execute();
      }
    });

    it('supports field operators, comma search, and OR alternatives', async () => {
      const searches = [
        ['brand:OpenAI, Anthropic', 4],
        ['benchmark:DeepSWE metric:Overall', 2],
        ['model:GPT-5.5 benchmark:GPQA', 1],
        ['record:BR-00155-001', 1],
        ['record:1', 3],
        ['date:2026-06-18', 1],
        ['date:2026-06', 5],
        ['org:Example', 5],
        ['GPT-5.5 OR Claude Opus 4.8', 4],
      ] as const;

      for (const [query, expectedCount] of searches) {
        const resolution = await resolveSearch(database, query);
        expect(resolution.kind, query).toBe('QUERY');
        if (resolution.kind !== 'QUERY') continue;
        const result = await getRegistryRecords(database, {
          kind: 'QUERY',
          query: resolution.query,
        });
        expect(result.total, query).toBe(expectedCount);
      }
    });

    it('combines complete operator groups with OR', async () => {
      const resolution = await resolveSearch(
        database,
        'brand:OpenAI benchmark:GPQA OR brand:Anthropic benchmark:DeepSWE',
      );
      expect(resolution.kind).toBe('QUERY');
      if (resolution.kind !== 'QUERY') return;
      const result = await getRegistryRecords(database, {
        kind: 'QUERY',
        query: resolution.query,
      });
      expect(result.records.map((record) => record.recordId)).toEqual([
        'BR-00155-002',
        'BR-002O48-001',
      ]);
    });

    it('counts the first page and clamps out-of-range pages', async () => {
      const firstPage = await getRegistryRecords(
        database,
        { kind: 'RECENT' },
        1,
        2,
      );
      expect(firstPage.page).toBe(1);
      expect(firstPage.records).toHaveLength(2);
      expect(firstPage.total).toBeGreaterThan(2);

      const finalPage = await getRegistryRecords(
        database,
        { kind: 'RECENT' },
        999,
        2,
      );
      expect(finalPage.page).toBe(Math.ceil(firstPage.total / 2));
      expect(finalPage.records.length).toBeGreaterThan(0);
      expect(finalPage.total).toBe(firstPage.total);

      const allRecords = await getRegistryRecords(
        database,
        { kind: 'RECENT' },
        999,
        null,
      );
      expect(allRecords.page).toBe(1);
      expect(allRecords.records).toHaveLength(firstPage.total);
      expect(allRecords.pageSize).toBe(firstPage.total);
    });

    it('model identity forms return the same canonical record set', async () => {
      const resultSets = await Promise.all(
        ['BR-00155', 'OPNAI-55', 'GPT-5.5', 'GPT 5.5', 'GPT55'].map(
          async (query) => {
            const resolution = await resolveSearch(database, query);
            if (
              resolution.kind !== 'RECORD_PREFIX' &&
              resolution.kind !== 'MODEL'
            )
              throw new Error('Expected a model resolution');
            return (
              await getRegistryRecords(database, {
                ...(resolution.kind === 'MODEL'
                  ? {
                      kind: 'MODEL' as const,
                      modelInternalId: resolution.modelInternalId,
                    }
                  : {
                      kind: 'RECORD_PREFIX' as const,
                      recordPrefix: resolution.recordPrefix,
                    }),
              })
            ).records.map((record) => record.recordId);
          },
        ),
      );
      expect(resultSets[0]).toEqual([
        'BR-00155-003',
        'BR-00155-002',
        'BR-00155-001',
      ]);
      expect(
        resultSets.every(
          (records) =>
            JSON.stringify(records) === JSON.stringify(resultSets[0]),
        ),
      ).toBe(true);
    });

    it('does not silently select an ambiguous normalized alias', async () => {
      const anthropic = await database
        .selectFrom('models')
        .select('id')
        .where('model_id', '=', 'ANTHR-O48')
        .executeTakeFirstOrThrow();
      await database
        .insertInto('model_aliases')
        .values({
          model_id: anthropic.id,
          alias: 'GPT 5.5',
          normalized_alias: normalizeSearchText('GPT 5.5'),
          compact_alias: compactSearchText('GPT 5.5'),
          alias_type: 'TEST_AMBIGUITY',
        })
        .execute();
      expect((await resolveSearch(database, 'GPT 5.5')).kind).toBe('GENERAL');
    });

    it('resolves legacy model identifiers and record prefixes canonically', async () => {
      const model = await database
        .selectFrom('models')
        .select('id')
        .where('model_id', '=', 'OPNAI-55')
        .executeTakeFirstOrThrow();
      await database
        .insertInto('model_aliases')
        .values([
          {
            model_id: model.id,
            alias: 'OPNAI-GPT55',
            normalized_alias: 'opnai-gpt55',
            compact_alias: 'opnaigpt55',
            alias_type: 'LEGACY_MODEL_ID',
          },
          {
            model_id: model.id,
            alias: 'BR-001GPT55',
            normalized_alias: 'br-001gpt55',
            compact_alias: 'br001gpt55',
            alias_type: 'LEGACY_RECORD_PREFIX',
          },
        ])
        .execute();

      const modelResolution = await resolveSearch(database, 'OPNAI-GPT55');
      expect(modelResolution).toMatchObject({
        kind: 'MODEL',
        modelInternalId: model.id,
      });
      const prefixResolution = await resolveSearch(database, 'BR-001GPT55');
      expect(prefixResolution).toMatchObject({
        kind: 'RECORD_PREFIX',
        recordPrefix: 'BR-001GPT55',
      });

      const app = createApp({ database, closeDatabaseOnShutdown: false });
      const legacyModelPage = await app.inject({
        method: 'GET',
        url: '/models/opnai-gpt55',
      });
      expect(legacyModelPage.statusCode).toBe(308);
      expect(legacyModelPage.headers.location).toBe('/models/opnai-55');
      await app.close();
    });

    it('uses database-backed request limiting and database-aware health', async () => {
      await database.deleteFrom('request_rate_limits').execute();
      await database.deleteFrom('feedback_submissions').execute();
      const app = createApp({
        database,
        closeDatabaseOnShutdown: false,
        rateLimitSecret: 'integration-rate-limit-secret-0001',
      });
      const health = await app.inject({ method: 'GET', url: '/health' });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toEqual({ status: 'ok' });

      for (let index = 0; index < 6; index += 1) {
        const response = await app.inject({
          method: 'POST',
          url: '/feedback',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
          },
          payload: new URLSearchParams({
            type: 'other',
            record_identifier: '',
            message: `Integration feedback ${index}`,
            source_url: '',
            email: '',
            website: '',
            submission_token: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
          }).toString(),
        });
        expect(response.statusCode).toBe(index < 5 ? 303 : 429);
      }
      await app.close();
    });

    it('renders public routes and exact-result invariants', async () => {
      const app = createApp({ database, closeDatabaseOnShutdown: false });
      const root = await app.inject({ method: 'GET', url: '/' });
      const ascending = await app.inject({
        method: 'GET',
        url: '/?order=asc',
      });
      const filtered = await app.inject({
        method: 'GET',
        url: '/?benchmark=deepswe&metric=overall&order=desc',
      });
      const modelFiltered = await app.inject({
        method: 'GET',
        url: '/?model=opnai-55',
      });
      const recordAscending = await app.inject({
        method: 'GET',
        url: '/?sort=record&order=asc',
      });
      const exact = await app.inject({
        method: 'GET',
        url: '/search?q=BR-00155-001',
      });
      const modelId = await app.inject({
        method: 'GET',
        url: '/search?q=OPNAI-55',
      });
      const modelPage = await app.inject({
        method: 'GET',
        url: '/models/opnai-55',
      });
      const name = await app.inject({
        method: 'GET',
        url: '/search?q=GPT-5.5',
      });
      const detail = await app.inject({
        method: 'GET',
        url: '/records/BR-00155-001',
      });
      expect(root.statusCode).toBe(200);
      expect(root.body).toContain(
        '<h1>Artificial Intelligence Benchmark Registry</h1>',
      );
      expect(root.body).toContain(
        '<span class="registry-record-count">5 records</span>',
      );
      expect(root.body).not.toContain('<h1>Benchmark Records</h1>');
      expect(root.body).not.toContain('<th>Rank</th>');
      expect(root.body).toContain('Record No.');
      expect(root.body).toMatch(
        /Last database update: <time datetime="[^"]+Z" data-local-datetime>[^<]+ PHT<\/time>/,
      );
      expect(root.body).not.toContain('Benchmark Records Leaderboard');
      expect(root.body.indexOf('88.1%')).toBeLessThan(
        root.body.indexOf('69.2'),
      );
      expect(root.body).toContain('<td><a href="/records/BR-00155-002"');
      expect(root.body).toContain('<td><a href="/records/BR-002O48-001"');
      expect(ascending.body.indexOf('69.2')).toBeLessThan(
        ascending.body.indexOf('88.1%'),
      );
      expect(filtered.body).toContain('72.4');
      expect(filtered.body).toContain('69.2');
      expect(filtered.body).not.toContain('88.1%');
      expect(filtered.body).toContain(
        '<span class="registry-record-count">5 records</span>',
      );
      expect(filtered.body).toContain(
        '<option value="deepswe" selected>DeepSWE</option>',
      );
      expect(filtered.body).toContain(
        '<meta name="robots" content="noindex,follow">',
      );
      expect(modelFiltered.body).toContain(
        '<option value="opnai-55" selected>GPT-5.5</option>',
      );
      expect(modelFiltered.body).not.toContain('BR-002O48-001');
      expect(recordAscending.body.indexOf('BR-00155-001')).toBeLessThan(
        recordAscending.body.indexOf('BR-00155-002'),
      );
      expect(exact.statusCode).toBe(200);
      expect(
        exact.body.match(/<code class="identifier">BR-00155-001<\/code>/g)
          ?.length,
      ).toBe(1);
      expect(exact.body).not.toContain('BR-00155-002');
      expect(modelId.body).toContain('BR-00155-002');
      expect(name.body).toContain('BR-00155-002');
      expect(modelPage.statusCode).toBe(200);
      expect(modelPage.body).toContain(
        '<meta name="description" content="Browse 3 records for GPT-5.5 by OpenAI. Review reported scores, metrics, primary sources, and evaluation dates. Model ID: OPNAI-55.">',
      );
      expect(modelPage.body).toContain(
        '<p class="page-summary">Browse 3 records for GPT-5.5 by OpenAI. Review reported scores, metrics, primary sources, and evaluation dates. Model ID: OPNAI-55.</p>',
      );
      expect(modelPage.body).toContain(
        'aria-label="Benchmark registry records table" data-nosnippet',
      );
      expect(modelPage.body).toContain('aria-label="Breadcrumb"');
      expect(modelPage.body).toContain('"@type":"BreadcrumbList"');
      expect(modelPage.body).toContain(
        '<a href="/organizations/openai">OpenAI</a>',
      );
      expect(detail.statusCode).toBe(200);
      expect(detail.body).toContain('BENCHMARK RECORD:');
      expect(detail.body).toContain(
        '<p class="page-summary">Reported Overall result of 72.4',
      );
      expect(detail.body).toContain('aria-label="Breadcrumb"');
      expect(detail.body).toContain('Evaluation Context');
      expect(detail.body).toContain('Provenance');
      expect(detail.body).toContain('Copy record ID');
      expect(detail.body).toContain('Copy canonical URL');
      expect(detail.body).toContain('Share record');
      expect(detail.body).toContain('Report record');
      expect(detail.body).toContain(
        '/feedback?record=BR-00155-001&amp;type=incorrect-record',
      );
      expect(detail.body).toContain('class="source-link"');
      expect(detail.body).toContain('not necessarily directly comparable');
      expect(
        (await app.inject({ method: 'GET', url: '/records/UNKNOWN' }))
          .statusCode,
      ).toBe(404);
      expect(
        (await app.inject({ method: 'GET', url: '/models/UNKNOWN' }))
          .statusCode,
      ).toBe(404);
      expect(
        (await app.inject({ method: 'GET', url: '/?model=unknown-model' }))
          .statusCode,
      ).toBe(404);
      expect(
        (await app.inject({ method: 'GET', url: '/recent?page=999' }))
          .statusCode,
      ).toBe(404);
      await app.close();
    });
  },
);
