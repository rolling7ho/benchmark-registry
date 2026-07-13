import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDatabase, type Database } from '../../src/db/database.js';
import { createModel } from '../../src/db/models.js';
import { seedOrganizations } from '../../src/db/seed-organizations.js';
import { addAlias, addBenchmarkAlias } from '../../src/registry/admin.js';
import {
  getCandidate,
  ingestFile,
  listCandidates,
  prepareCandidateApproval,
  publishCandidate,
  rejectCandidate,
  validateIngestion,
} from '../../src/ingestion/service.js';
import { resolveCandidate } from '../../src/ingestion/resolve-candidate.js';

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

describe.skipIf(integrationDatabaseUrl === undefined)(
  'source-assisted ingestion services',
  () => {
    let database: Database;
    let directory: string;
    const sourceUrl = 'https://example.test/ingestion-report';

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
      directory = await mkdtemp(
        join(tmpdir(), 'benchmark-registry-ingestion-'),
      );
    });

    beforeEach(async () => {
      await database.deleteFrom('ingestion_candidates').execute();
      await database.deleteFrom('ingestion_jobs').execute();
      await database.deleteFrom('benchmark_records').execute();
      await database.deleteFrom('benchmark_versions').execute();
      await database.deleteFrom('model_snapshots').execute();
      await database.deleteFrom('benchmark_aliases').execute();
      await database.deleteFrom('model_aliases').execute();
      await database.deleteFrom('models').execute();
      await database.deleteFrom('benchmarks').execute();
      await database.deleteFrom('metrics').execute();
      await database.deleteFrom('sources').execute();
      await database.deleteFrom('registry_metadata').execute();
      await createModel(database, {
        organizationSlug: 'openai',
        officialName: 'GPT-5.5',
        family: 'GPT',
        modelNumber: '55',
      });
      const benchmark = await database
        .insertInto('benchmarks')
        .values({
          slug: 'gpqa-diamond',
          name: 'GPQA Diamond',
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
          canonical_reference: 'gpqa-diamond/default',
          status: 'ACTIVE',
          release_date: null,
          notes: null,
        })
        .execute();
      await database
        .insertInto('metrics')
        .values({
          slug: 'accuracy',
          name: 'Accuracy',
          unit: '%',
          higher_is_better: true,
        })
        .execute();
      await database
        .insertInto('sources')
        .values({
          url: sourceUrl,
          title: 'Ingestion fixture',
          source_type: 'PROVIDER_REPORT',
          publisher: 'Example',
          published_date: null,
          accessed_at: new Date(),
        })
        .execute();
      await database.deleteFrom('registry_metadata').execute();
    });

    afterAll(async () => {
      await database?.destroy();
      if (directory !== undefined) await rm(directory, { recursive: true });
    });

    async function fixtureFile(): Promise<string> {
      const file = join(directory, `report-${crypto.randomUUID()}.md`);
      await writeFile(
        file,
        '## GPQA Diamond\n| Model | Accuracy |\n| --- | --- |\n| GPT-5.5 | 88.1% |',
      );
      return file;
    }

    it('creates concurrency-safe job/candidate references and canonical proposals', async () => {
      const result = await ingestFile(
        database,
        await fixtureFile(),
        sourceUrl,
        {
          logger: { info: () => undefined, error: () => undefined },
        },
      );
      expect(result.jobReference).toMatch(/^IJ-\d{6}$/);
      expect(result.candidateCount).toBe(1);
      const rows = await listCandidates(database, { limit: 10 });
      expect(rows[0]!.candidate).toMatch(/^IC-\d{6}$/);
      expect(rows[0]).toMatchObject({
        status: 'PENDING_REVIEW',
        proposedModel: 'OPNAI-55',
        proposedBenchmark: 'gpqa-diamond',
        proposedMetric: 'accuracy',
      });
    });

    it('detects identical content, permits force, and deduplicates identical proposals', async () => {
      const file = await fixtureFile();
      const first = await ingestFile(database, file, sourceUrl, {
        logger: { info: () => undefined, error: () => undefined },
      });
      const duplicate = await ingestFile(database, file, sourceUrl, {
        logger: { info: () => undefined, error: () => undefined },
      });
      expect(duplicate.identicalJob).toBe(first.jobReference);
      const forced = await ingestFile(database, file, sourceUrl, {
        force: true,
        logger: { info: () => undefined, error: () => undefined },
      });
      expect(forced.jobReference).not.toBe(first.jobReference);
      expect(forced.candidateCount).toBe(1);
    });

    it('resolves exact aliases without fuzzy identity matching', async () => {
      const modelAlias = await addAlias(database, {
        modelIdentifier: 'OPNAI-55',
        alias: 'GPT 55 Alias',
      });
      await modelAlias.commit();
      const benchmarkAlias = await addBenchmarkAlias(database, {
        benchmarkSlug: 'gpqa-diamond',
        alias: 'GPQA-D',
      });
      await benchmarkAlias.commit();
      const resolution = await resolveCandidate(database, {
        modelText: 'gpt55alias',
        benchmarkText: 'GPQA-D',
        metricText: 'Accuracy',
      });
      expect(resolution).toMatchObject({
        modelId: 'OPNAI-55',
        benchmarkSlug: 'gpqa-diamond',
        metricSlug: 'accuracy',
      });
      expect(resolution.warnings).toContain(
        'Model resolved through compact alias.',
      );
      expect(resolution.warnings).toContain(
        'Benchmark resolved through alias.',
      );
      expect(
        (
          await resolveCandidate(database, {
            modelText: 'GPT approximately 5.5',
            benchmarkText: 'GPQA approximate',
            metricText: 'Accuracy-ish',
          })
        ).modelId,
      ).toBeNull();
    });

    it('publishes through canonical allocation and links the candidate atomically', async () => {
      await ingestFile(database, await fixtureFile(), sourceUrl, {
        logger: { info: () => undefined, error: () => undefined },
      });
      const candidateReference = (
        await listCandidates(database, { limit: 1 })
      )[0]!.candidate;
      const approval = await prepareCandidateApproval(
        database,
        candidateReference,
        {
          evaluationDate: '2026-07-01',
          notes: 'Operator reviewed',
        },
      );
      const before = await database
        .selectFrom('models')
        .select('next_record_sequence')
        .where('model_id', '=', 'OPNAI-55')
        .executeTakeFirstOrThrow();
      expect(before.next_record_sequence).toBe(1);
      const record = await publishCandidate(database, approval);
      expect(record.record_id).toBe('BR-00155-001');
      const candidate = await getCandidate(database, candidateReference);
      expect(candidate).toMatchObject({
        candidate_status: 'PUBLISHED',
        created_record_id: record.id,
        evidence_text: 'GPT-5.5 | 88.1%',
        approval_overrides: {
          evaluationDate: '2026-07-01',
          notes: 'Operator reviewed',
        },
      });
      expect(
        await database
          .selectFrom('registry_metadata')
          .select('value')
          .where('key', '=', 'last_database_update')
          .executeTakeFirst(),
      ).toBeDefined();
    });

    it('rolls back candidate publication and record allocation together', async () => {
      await ingestFile(database, await fixtureFile(), sourceUrl, {
        logger: { info: () => undefined, error: () => undefined },
      });
      const candidateReference = (
        await listCandidates(database, { limit: 1 })
      )[0]!.candidate;
      const approval = await prepareCandidateApproval(
        database,
        candidateReference,
      );
      await database
        .deleteFrom('metrics')
        .where('slug', '=', 'accuracy')
        .execute();
      await expect(publishCandidate(database, approval)).rejects.toMatchObject({
        code: '23503',
      });
      expect(
        (await getCandidate(database, candidateReference)).candidate_status,
      ).toBe('PENDING_REVIEW');
      expect(
        (
          await database
            .selectFrom('models')
            .select('next_record_sequence')
            .where('model_id', '=', 'OPNAI-55')
            .executeTakeFirstOrThrow()
        ).next_record_sequence,
      ).toBe(1);
    });

    it('preserves rejected candidates without public metadata mutation', async () => {
      await ingestFile(database, await fixtureFile(), sourceUrl, {
        logger: { info: () => undefined, error: () => undefined },
      });
      const reference = (await listCandidates(database, { limit: 1 }))[0]!
        .candidate;
      await expect(rejectCandidate(database, reference, '  ')).rejects.toThrow(
        'reason is required',
      );
      await rejectCandidate(database, reference, 'Aggregate row, not a result');
      const candidate = await getCandidate(database, reference);
      expect(candidate).toMatchObject({
        candidate_status: 'REJECTED',
        rejection_reason: 'Aggregate row, not a result',
        evidence_text: 'GPT-5.5 | 88.1%',
      });
      await expect(
        prepareCandidateApproval(database, reference),
      ).rejects.toThrow('not reviewable');
      expect(
        await database
          .selectFrom('registry_metadata')
          .select('value')
          .where('key', '=', 'last_database_update')
          .executeTakeFirst(),
      ).toBeUndefined();
      await expect(validateIngestion(database)).resolves.toEqual([]);
    });
  },
);
