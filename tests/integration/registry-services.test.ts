import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDatabase, type Database } from '../../src/db/database.js';
import { createModel } from '../../src/db/models.js';
import { seedOrganizations } from '../../src/db/seed-organizations.js';
import {
  addAlias,
  addBenchmarkRecordSource,
  commitPreparedBatch,
  commitPreparedRecord,
  prepareRecord,
  supersedeRecord,
  withdrawRecord,
} from '../../src/registry/admin.js';
import { createModelSnapshot } from '../../src/registry/context.js';
import { createOrReuseEvaluationConfiguration } from '../../src/registry/evaluation-configurations.js';

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

interface RecordReferences {
  benchmark: { id: string };
  metric: { id: string };
  source: { id: string };
}

if (integrationDatabaseUrl === undefined) {
  console.warn(
    'Integration tests skipped: INTEGRATION_DATABASE_URL is not configured.',
  );
}

describe.skipIf(integrationDatabaseUrl === undefined)(
  'registry database services (requires INTEGRATION_DATABASE_URL)',
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
      await seedOrganizations(database);
    });

    beforeEach(async () => {
      await database.deleteFrom('ingestion_candidates').execute();
      await database.deleteFrom('ingestion_jobs').execute();
      await database.deleteFrom('benchmark_records').execute();
      await database.deleteFrom('benchmark_versions').execute();
      await database.deleteFrom('model_snapshots').execute();
      await database.deleteFrom('models').execute();
      await database.deleteFrom('benchmarks').execute();
      await database.deleteFrom('metrics').execute();
      await database.deleteFrom('sources').execute();
      await database.deleteFrom('registry_metadata').execute();
    });

    afterAll(async () => {
      await database?.destroy();
    });

    async function createFixtureModel(): ReturnType<typeof createModel> {
      return createModel(database, {
        organizationSlug: 'openai',
        officialName: 'GPT-5.5',
        family: 'GPT',
        modelNumber: '55',
      });
    }

    async function createRecordReferences(): Promise<RecordReferences> {
      const benchmark = await database
        .insertInto('benchmarks')
        .values({
          slug: 'fixture-benchmark',
          name: 'Fixture Benchmark',
          organization_name: null,
          version: null,
          status: 'ACTIVE',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await database
        .insertInto('benchmark_versions')
        .values({
          benchmark_id: benchmark.id,
          version_label: null,
          variant_name: null,
          canonical_reference: 'fixture-benchmark/default',
          status: 'ACTIVE',
          release_date: null,
          notes: null,
        })
        .execute();
      const metric = await database
        .insertInto('metrics')
        .values({
          slug: 'fixture-score',
          name: 'Fixture Score',
          unit: null,
          higher_is_better: true,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const source = await database
        .insertInto('sources')
        .values({
          url: 'https://example.test/source',
          title: null,
          source_type: 'OTHER',
          publisher: null,
          published_date: null,
          accessed_at: new Date(),
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      return { benchmark, metric, source };
    }

    it('creates models with canonical identifiers and rejects duplicates', async () => {
      const model = await createFixtureModel();

      expect(model.model_id).toBe('OPNAI-55');
      expect(model.record_prefix).toBe('BR-00155');
      await expect(createFixtureModel()).rejects.toMatchObject({
        code: '23505',
      });
    });

    async function fixtureSourceUrl(sourceId: string): Promise<string> {
      return (
        await database
          .selectFrom('sources')
          .select('url')
          .where('id', '=', sourceId)
          .executeTakeFirstOrThrow()
      ).url;
    }

    it('allocates sequential Benchmark Record Identifiers', async () => {
      const model = await createFixtureModel();
      const { source } = await createRecordReferences();
      const input = {
        modelIdentifier: model.model_id,
        benchmarkSlug: 'fixture-benchmark',
        metricSlug: 'fixture-score',
        scoreDisplay: '91.2%',
        scoreValue: 91.2,
        sourceUrl: await fixtureSourceUrl(source.id),
      };

      const first = await commitPreparedRecord(
        database,
        await prepareRecord(database, input),
      );
      const second = await commitPreparedRecord(
        database,
        await prepareRecord(database, input),
      );

      expect(first.record_id).toBe('BR-00155-001');
      expect(second.record_id).toBe('BR-00155-002');
    });

    it('does not consume a sequence when record insertion fails', async () => {
      const model = await createFixtureModel();
      const { source } = await createRecordReferences();
      const input = {
        modelIdentifier: model.model_id,
        benchmarkSlug: 'fixture-benchmark',
        metricSlug: 'fixture-score',
        scoreDisplay: '91.2%',
        sourceUrl: await fixtureSourceUrl(source.id),
      };

      await commitPreparedRecord(
        database,
        await prepareRecord(database, input),
      );
      await database
        .updateTable('models')
        .set({ next_record_sequence: 1 })
        .where('id', '=', model.id)
        .execute();

      await expect(
        commitPreparedRecord(database, await prepareRecord(database, input)),
      ).rejects.toMatchObject({
        code: '23505',
      });

      const modelAfterFailure = await database
        .selectFrom('models')
        .select('next_record_sequence')
        .where('id', '=', model.id)
        .executeTakeFirstOrThrow();
      expect(modelAfterFailure.next_record_sequence).toBe(1);
    });

    it('serializes concurrent record allocation', async () => {
      const model = await createFixtureModel();
      const { source } = await createRecordReferences();
      const input = {
        modelIdentifier: model.model_id,
        benchmarkSlug: 'fixture-benchmark',
        metricSlug: 'fixture-score',
        scoreDisplay: '91.2%',
        sourceUrl: await fixtureSourceUrl(source.id),
      };

      const prepared = await Promise.all([
        prepareRecord(database, input),
        prepareRecord(database, input),
      ]);
      const records = await Promise.all([
        commitPreparedRecord(database, prepared[0]),
        commitPreparedRecord(database, prepared[1]),
      ]);

      expect(records.map((record) => record.record_id).sort()).toEqual([
        'BR-00155-001',
        'BR-00155-002',
      ]);
    });

    it('previews exact references without consuming a sequence and flags probable duplicates', async () => {
      const model = await createFixtureModel();
      const { benchmark, metric, source } = await createRecordReferences();
      const benchmarkSlug = 'fixture-benchmark';
      const metricSlug = 'fixture-score';
      const sourceRow = await database
        .selectFrom('sources')
        .select('url')
        .where('id', '=', source.id)
        .executeTakeFirstOrThrow();
      const input = {
        modelIdentifier: model.model_id,
        benchmarkSlug,
        metricSlug,
        scoreDisplay: '91.2%',
        sourceUrl: sourceRow.url,
      };

      const preview = await prepareRecord(database, input);
      expect(preview.possibleDuplicates).toEqual([]);
      expect(
        (
          await database
            .selectFrom('models')
            .select('next_record_sequence')
            .where('id', '=', model.id)
            .executeTakeFirstOrThrow()
        ).next_record_sequence,
      ).toBe(1);

      const created = await commitPreparedRecord(database, preview);
      expect(created.record_id).toBe('BR-00155-001');
      const duplicatePreview = await prepareRecord(database, {
        ...input,
        scoreDisplay: '92.0%',
        evaluationDate: '2026-07-01',
      });
      expect(
        duplicatePreview.possibleDuplicates.map((row) => row.recordId),
      ).toEqual(['BR-00155-001']);
      expect(benchmark.id).toBeTruthy();
      expect(metric.id).toBeTruthy();
    });

    it('stores normalized aliases and rejects cross-model compact conflicts', async () => {
      const first = await createFixtureModel();
      const second = await createModel(database, {
        organizationSlug: 'openai',
        officialName: 'GPT-5.6',
        family: 'GPT',
        modelNumber: '56',
      });
      const alias = await addAlias(database, {
        modelIdentifier: first.model_id,
        alias: 'GPT 5.5',
      });
      const stored = await alias.commit();
      expect(stored.normalized_alias).toBe('gpt 5.5');
      expect(stored.compact_alias).toBe('gpt55');
      await expect(
        addAlias(database, {
          modelIdentifier: second.model_id,
          alias: 'gpt-5.5',
        }),
      ).rejects.toThrow('conflicts with canonical model');
    });

    it('commits batches in input order and preserves records through status changes', async () => {
      const model = await createFixtureModel();
      const { source } = await createRecordReferences();
      const sourceUrl = (
        await database
          .selectFrom('sources')
          .select('url')
          .where('id', '=', source.id)
          .executeTakeFirstOrThrow()
      ).url;
      const base = {
        modelIdentifier: model.model_id,
        benchmarkSlug: 'fixture-benchmark',
        metricSlug: 'fixture-score',
        sourceUrl,
      };
      const prepared = await Promise.all([
        prepareRecord(database, { ...base, scoreDisplay: '90.0%' }),
        prepareRecord(database, { ...base, scoreDisplay: '91.0%' }),
      ]);
      const created = await commitPreparedBatch(database, prepared);
      expect(created.map((row) => row.recordId)).toEqual([
        'BR-00155-001',
        'BR-00155-002',
      ]);

      await withdrawRecord(database, created[0]!.recordId);
      await supersedeRecord(
        database,
        created[0]!.recordId,
        created[1]!.recordId,
      );
      const original = await database
        .selectFrom('benchmark_records')
        .select([
          'id',
          'record_id',
          'status',
          'sequence_number',
          'superseded_by_record_id',
        ])
        .where('record_id', '=', created[0]!.recordId)
        .executeTakeFirstOrThrow();
      expect(original).toMatchObject({
        record_id: 'BR-00155-001',
        status: 'SUPERSEDED',
        sequence_number: 1,
      });
      expect(original.superseded_by_record_id).not.toBeNull();
      const events = await database
        .selectFrom('record_provenance_events')
        .select('event_type')
        .where('benchmark_record_id', '=', original.id)
        .orderBy('id')
        .execute();
      expect(events.map((event) => event.event_type)).toEqual([
        'CREATED_MANUALLY',
        'WITHDRAWN',
        'SUPERSEDED',
      ]);
      expect(
        await database
          .selectFrom('registry_metadata')
          .select('value')
          .where('key', '=', 'last_database_update')
          .executeTakeFirst(),
      ).toBeDefined();
    });

    it('deduplicates canonical configurations and preserves snapshot ownership', async () => {
      const model = await createFixtureModel();
      const first = await createOrReuseEvaluationConfiguration(database, {
        shots: 0,
        passCount: 1,
        additionalConfiguration: { nested: { b: 2, a: 1 } },
      });
      const second = await createOrReuseEvaluationConfiguration(database, {
        additionalConfiguration: { nested: { a: 1, b: 2 } },
        passCount: 1,
        shots: 0,
      });
      expect(first.configuration.configuration_reference).toBe(
        second.configuration.configuration_reference,
      );
      expect(second.created).toBe(false);

      const snapshot = await createModelSnapshot(database, {
        modelIdentifier: model.model_id,
        providerModelIdentifier: 'gpt-5.5-2026-06-18',
        snapshotDate: '2026-06-18',
      });
      expect(snapshot.provider_model_identifier).toBe('gpt-5.5-2026-06-18');
      const other = await createModel(database, {
        organizationSlug: 'openai',
        officialName: 'GPT-5.6',
        family: 'GPT',
        modelNumber: '56',
      });
      const { source } = await createRecordReferences();
      const sourceUrl = (
        await database
          .selectFrom('sources')
          .select('url')
          .where('id', '=', source.id)
          .executeTakeFirstOrThrow()
      ).url;
      await expect(
        prepareRecord(database, {
          modelIdentifier: other.model_id,
          benchmarkSlug: 'fixture-benchmark',
          metricSlug: 'fixture-score',
          scoreDisplay: '90%',
          sourceUrl,
          snapshotReference: snapshot.snapshot_reference,
        }),
      ).rejects.toThrow('does not belong');
    });

    it('keeps one primary source and adds traceable supporting sources', async () => {
      const model = await createFixtureModel();
      const { source } = await createRecordReferences();
      const primaryUrl = (
        await database
          .selectFrom('sources')
          .select('url')
          .where('id', '=', source.id)
          .executeTakeFirstOrThrow()
      ).url;
      const record = await commitPreparedRecord(
        database,
        await prepareRecord(database, {
          modelIdentifier: model.model_id,
          benchmarkSlug: 'fixture-benchmark',
          metricSlug: 'fixture-score',
          scoreDisplay: '91%',
          sourceUrl: primaryUrl,
        }),
      );
      const supporting = await database
        .insertInto('sources')
        .values({
          url: 'https://example.test/supporting',
          title: 'Supporting source',
          source_type: 'OTHER',
          publisher: null,
          published_date: null,
          accessed_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await addBenchmarkRecordSource(database, {
        recordIdentifier: record.record_id,
        sourceUrl: supporting.url,
        role: 'SUPPORTING',
      });
      const sources = await database
        .selectFrom('benchmark_record_sources')
        .select('source_role')
        .where('benchmark_record_id', '=', record.id)
        .orderBy('source_role')
        .execute();
      expect(sources.map((row) => row.source_role)).toEqual([
        'PRIMARY',
        'SUPPORTING',
      ]);
      await expect(
        addBenchmarkRecordSource(database, {
          recordIdentifier: record.record_id,
          sourceUrl: supporting.url,
          role: 'SUPPORTING',
        }),
      ).rejects.toMatchObject({ code: '23505' });
    });
  },
);
