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
              kind: 'MODEL',
              modelInternalId: resolution.modelInternalId,
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
      expect(root.body).toContain('Record No.');
      expect(root.body).not.toContain('Benchmark Records Leaderboard');
      expect(root.body.indexOf('88.1%')).toBeLessThan(
        root.body.indexOf('69.2'),
      );
      expect(ascending.body.indexOf('69.2')).toBeLessThan(
        ascending.body.indexOf('88.1%'),
      );
      expect(filtered.body).toContain('72.4');
      expect(filtered.body).toContain('69.2');
      expect(filtered.body).not.toContain('88.1%');
      expect(filtered.body).toContain(
        '<option value="deepswe" selected>DeepSWE</option>',
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
