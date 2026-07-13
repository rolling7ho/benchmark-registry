import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/application.js';
import { createDatabase, type Database } from '../../src/db/database.js';
import { getRegistryRecords } from '../../src/db/registry-records.js';
import { seedTestData } from '../../src/db/seed-test-data.js';
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
        ['BR-00155', 'OPNAI-55', 'GPT-5.5', 'GPT 5.5'].map(async (query) => {
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
        }),
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
        '<span class="registry-record-count">5 records</span>',
      );
      expect(root.body).not.toContain('<h1>Benchmark Records</h1>');
      expect(root.body).toContain('<th>Rank</th>');
      expect(root.body).toContain('Record No.');
      expect(root.body).toMatch(
        /Last database update: <time datetime="[^"]+Z" data-local-datetime>[^<]+ PHT<\/time>/,
      );
      expect(root.body).not.toContain('Benchmark Records Leaderboard');
      expect(root.body.indexOf('88.1%')).toBeLessThan(
        root.body.indexOf('69.2'),
      );
      expect(root.body).toMatch(
        /<td>1<\/td>\s*<td><a href="\/records\/BR-00155-002"/,
      );
      expect(root.body).toMatch(
        /<td>5<\/td>\s*<td><a href="\/records\/BR-002O48-001"/,
      );
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
      expect(detail.statusCode).toBe(200);
      expect(detail.body).toContain('BENCHMARK RECORD:');
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
      await app.close();
    });
  },
);
