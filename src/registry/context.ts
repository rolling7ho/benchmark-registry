import type { Selectable } from 'kysely';

import type { EvaluatorType, RegistryStatus } from '../db/constants.js';
import type { Database } from '../db/database.js';
import { RegistryEntityNotFoundError } from '../db/errors.js';
import { markRegistryUpdated } from '../db/registry-metadata.js';
import type {
  BenchmarkVersionsTable,
  EvaluatorsTable,
  ModelSnapshotsTable,
} from '../db/types.js';

function required(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
}
function optional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value.trim() || null;
}
function optionalExact(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value.trim().length === 0 ? null : value;
}
function date(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error('Invalid date; expected YYYY-MM-DD.');
  return value;
}

export async function createBenchmarkVersion(
  db: Database,
  input: {
    benchmarkSlug: string;
    canonicalReference: string;
    versionLabel?: string | null | undefined;
    variantName?: string | null | undefined;
    releaseDate?: string | null | undefined;
    notes?: string | null | undefined;
    status?: RegistryStatus | undefined;
  },
): Promise<Selectable<BenchmarkVersionsTable>> {
  const benchmark = await db
    .selectFrom('benchmarks')
    .select(['id'])
    .where('slug', '=', input.benchmarkSlug.trim().toLowerCase())
    .executeTakeFirst();
  if (benchmark === undefined)
    throw new RegistryEntityNotFoundError('Benchmark', input.benchmarkSlug);
  const reference = required(
    input.canonicalReference,
    'Canonical reference',
  ).toLowerCase();
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+$/.test(reference)
  )
    throw new Error('Invalid benchmark version canonical reference.');
  return db.transaction().execute(async (transaction) => {
    const row = await transaction
      .insertInto('benchmark_versions')
      .values({
        benchmark_id: benchmark.id,
        canonical_reference: reference,
        version_label: optional(input.versionLabel),
        variant_name: optional(input.variantName),
        release_date: date(input.releaseDate),
        notes: optional(input.notes),
        status: input.status ?? 'ACTIVE',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await markRegistryUpdated(transaction);
    return row;
  });
}

export async function createModelSnapshot(
  db: Database,
  input: {
    modelIdentifier: string;
    providerModelIdentifier?: string | null | undefined;
    snapshotLabel?: string | null | undefined;
    snapshotDate?: string | null | undefined;
    notes?: string | null | undefined;
    status?: RegistryStatus | undefined;
  },
): Promise<Selectable<ModelSnapshotsTable>> {
  const identifier = input.modelIdentifier.trim().toUpperCase();
  const model = await db
    .selectFrom('models')
    .select('id')
    .where('model_id', '=', identifier)
    .executeTakeFirst();
  if (model === undefined)
    throw new RegistryEntityNotFoundError('Model', identifier);
  return db.transaction().execute(async (transaction) => {
    const row = await transaction
      .insertInto('model_snapshots')
      .values({
        model_id: model.id,
        provider_model_identifier: optionalExact(input.providerModelIdentifier),
        snapshot_label: optional(input.snapshotLabel),
        snapshot_date: date(input.snapshotDate),
        notes: optional(input.notes),
        status: input.status ?? 'ACTIVE',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await markRegistryUpdated(transaction);
    return row;
  });
}

export async function createEvaluator(
  db: Database,
  input: { slug: string; name: string; evaluatorType: EvaluatorType },
): Promise<Selectable<EvaluatorsTable>> {
  const slug = required(input.slug, 'Evaluator slug').toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error('Invalid evaluator slug.');
  return db.transaction().execute(async (transaction) => {
    const row = await transaction
      .insertInto('evaluators')
      .values({
        slug,
        name: required(input.name, 'Evaluator name'),
        evaluator_type: input.evaluatorType,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await markRegistryUpdated(transaction);
    return row;
  });
}
