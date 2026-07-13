import type { RegistryStatus } from './constants.js';
import type { Database } from './database.js';
import { modelSlug } from '../web/seo.js';

export interface PublicModel {
  id: string;
  slug: string;
  modelId: string;
  officialName: string;
  organizationName: string;
  family: string | null;
  modelNumber: string | null;
  tierCode: string | null;
  status: RegistryStatus;
  releaseDate: string | null;
}

export interface PublicBenchmark {
  id: string;
  slug: string;
  name: string;
  version: string | null;
  organizationName: string | null;
  status: RegistryStatus;
  recordCount: number;
  versions: PublicBenchmarkVersion[];
}

export interface PublicBenchmarkVersion {
  id: string;
  canonicalReference: string;
  versionLabel: string | null;
  variantName: string | null;
  status: RegistryStatus;
  releaseDate: string | null;
  recordCount: number;
}

async function versionsByBenchmark(
  db: Database,
  benchmarkId?: string,
): Promise<Map<string, PublicBenchmarkVersion[]>> {
  let query = db
    .selectFrom('benchmark_versions')
    .leftJoin(
      'benchmark_records',
      'benchmark_records.benchmark_version_id',
      'benchmark_versions.id',
    )
    .select([
      'benchmark_versions.benchmark_id as benchmarkId',
      'benchmark_versions.id',
      'benchmark_versions.canonical_reference as canonicalReference',
      'benchmark_versions.version_label as versionLabel',
      'benchmark_versions.variant_name as variantName',
      'benchmark_versions.status',
      'benchmark_versions.release_date as releaseDate',
    ])
    .select((eb) => eb.fn.count('benchmark_records.id').as('recordCount'))
    .groupBy('benchmark_versions.id')
    .orderBy('benchmark_versions.canonical_reference');
  if (benchmarkId !== undefined) {
    query = query.where('benchmark_versions.benchmark_id', '=', benchmarkId);
  }
  const result = new Map<string, PublicBenchmarkVersion[]>();
  for (const row of await query.execute()) {
    const versions = result.get(row.benchmarkId) ?? [];
    versions.push({
      id: row.id,
      canonicalReference: row.canonicalReference,
      versionLabel: row.versionLabel,
      variantName: row.variantName,
      status: row.status,
      releaseDate: isoDate(row.releaseDate),
      recordCount: Number(row.recordCount),
    });
    result.set(row.benchmarkId, versions);
  }
  return result;
}

async function versionsForBenchmark(
  db: Database,
  benchmarkId: string,
): Promise<PublicBenchmarkVersion[]> {
  return (await versionsByBenchmark(db, benchmarkId)).get(benchmarkId) ?? [];
}

export interface PublicOrganization {
  id: string;
  slug: string;
  name: string;
  providerPrefix: string;
  brNamespace: string;
  recordCount: number;
}

export interface PublicSource {
  url: string | null;
  title: string;
  sourceType: string;
  publisher: string | null;
  publishedDate: string | null;
  accessedAt: Date;
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  if (value === null) return null;
  if (value instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(value)
      .reduce<Record<string, string>>((result, part) => {
        result[part.type] = part.value;
        return result;
      }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  if (typeof value === 'string') return value.slice(0, 10);
  return null;
}

export async function listModels(db: Database): Promise<PublicModel[]> {
  const rows = await db
    .selectFrom('models')
    .innerJoin('organizations', 'organizations.id', 'models.organization_id')
    .select([
      'models.id as id',
      'models.model_id as modelId',
      'models.official_name as officialName',
      'organizations.name as organizationName',
      'models.family as family',
      'models.model_number as modelNumber',
      'models.tier_code as tierCode',
      'models.status as status',
      'models.release_date as releaseDate',
    ])
    .orderBy('models.official_name', 'asc')
    .orderBy('models.model_id', 'asc')
    .execute();
  return rows.map((row) => ({
    ...row,
    slug: modelSlug(row.modelId),
    releaseDate: isoDate(row.releaseDate),
  }));
}

export async function getModelBySlug(
  db: Database,
  slug: string,
): Promise<PublicModel | undefined> {
  const selection = [
    'models.id as id',
    'models.model_id as modelId',
    'models.official_name as officialName',
    'organizations.name as organizationName',
    'models.family as family',
    'models.model_number as modelNumber',
    'models.tier_code as tierCode',
    'models.status as status',
    'models.release_date as releaseDate',
  ] as const;
  let row = await db
    .selectFrom('models')
    .innerJoin('organizations', 'organizations.id', 'models.organization_id')
    .select(selection)
    .where('models.model_id', '=', slug.toUpperCase())
    .executeTakeFirst();
  row ??= await db
    .selectFrom('model_aliases')
    .innerJoin('models', 'models.id', 'model_aliases.model_id')
    .innerJoin('organizations', 'organizations.id', 'models.organization_id')
    .select(selection)
    .where('model_aliases.alias_type', '=', 'LEGACY_MODEL_ID')
    .where('model_aliases.normalized_alias', '=', slug.toLowerCase())
    .executeTakeFirst();
  return row === undefined
    ? undefined
    : {
        ...row,
        slug: modelSlug(row.modelId),
        releaseDate: isoDate(row.releaseDate),
      };
}

export async function listBenchmarks(db: Database): Promise<PublicBenchmark[]> {
  const [rows, versions] = await Promise.all([
    db
      .selectFrom('benchmarks')
      .leftJoin(
        'benchmark_records',
        'benchmark_records.benchmark_id',
        'benchmarks.id',
      )
      .select([
        'benchmarks.id as id',
        'benchmarks.slug as slug',
        'benchmarks.name as name',
        'benchmarks.version as version',
        'benchmarks.organization_name as organizationName',
        'benchmarks.status as status',
      ])
      .select((eb) => eb.fn.count('benchmark_records.id').as('recordCount'))
      .groupBy('benchmarks.id')
      .orderBy('benchmarks.name', 'asc')
      .execute(),
    versionsByBenchmark(db),
  ]);
  return rows.map((row) => ({
    ...row,
    recordCount: Number(row.recordCount),
    versions: versions.get(row.id) ?? [],
  }));
}

export async function getBenchmarkBySlug(
  db: Database,
  slug: string,
): Promise<PublicBenchmark | undefined> {
  const row = await db
    .selectFrom('benchmarks')
    .leftJoin(
      'benchmark_records',
      'benchmark_records.benchmark_id',
      'benchmarks.id',
    )
    .select([
      'benchmarks.id as id',
      'benchmarks.slug as slug',
      'benchmarks.name as name',
      'benchmarks.version as version',
      'benchmarks.organization_name as organizationName',
      'benchmarks.status as status',
    ])
    .select((eb) => eb.fn.count('benchmark_records.id').as('recordCount'))
    .where('benchmarks.slug', '=', slug.toLowerCase())
    .groupBy('benchmarks.id')
    .executeTakeFirst();
  return row === undefined
    ? undefined
    : {
        ...row,
        recordCount: Number(row.recordCount),
        versions: await versionsForBenchmark(db, row.id),
      };
}

export async function getBenchmarkVersionByReference(
  db: Database,
  canonicalReference: string,
): Promise<PublicBenchmarkVersion | undefined> {
  const [benchmarkSlug] = canonicalReference.split('/');
  const benchmark = await getBenchmarkBySlug(db, benchmarkSlug ?? '');
  return benchmark?.versions.find(
    (version) =>
      version.canonicalReference === canonicalReference.toLowerCase(),
  );
}

export async function listOrganizations(
  db: Database,
): Promise<PublicOrganization[]> {
  const rows = await db
    .selectFrom('organizations')
    .leftJoin('models', 'models.organization_id', 'organizations.id')
    .leftJoin('benchmark_records', 'benchmark_records.model_id', 'models.id')
    .select([
      'organizations.id as id',
      'organizations.slug as slug',
      'organizations.name as name',
      'organizations.provider_prefix as providerPrefix',
      'organizations.br_namespace as brNamespace',
    ])
    .select((eb) => eb.fn.count('benchmark_records.id').as('recordCount'))
    .groupBy('organizations.id')
    .orderBy('organizations.name', 'asc')
    .execute();
  return rows.map((row) => ({ ...row, recordCount: Number(row.recordCount) }));
}

export async function getOrganizationBySlug(
  db: Database,
  slug: string,
): Promise<PublicOrganization | undefined> {
  const row = await db
    .selectFrom('organizations')
    .leftJoin('models', 'models.organization_id', 'organizations.id')
    .leftJoin('benchmark_records', 'benchmark_records.model_id', 'models.id')
    .select([
      'organizations.id as id',
      'organizations.slug as slug',
      'organizations.name as name',
      'organizations.provider_prefix as providerPrefix',
      'organizations.br_namespace as brNamespace',
    ])
    .select((eb) => eb.fn.count('benchmark_records.id').as('recordCount'))
    .where('organizations.slug', '=', slug.toLowerCase())
    .groupBy('organizations.id')
    .executeTakeFirst();
  return row === undefined
    ? undefined
    : { ...row, recordCount: Number(row.recordCount) };
}

export async function listSources(db: Database): Promise<PublicSource[]> {
  const rows = await db
    .selectFrom('sources')
    .select([
      'url',
      'title',
      'source_type as sourceType',
      'publisher',
      'published_date as publishedDate',
      'accessed_at as accessedAt',
    ])
    .orderBy('published_date', 'desc')
    .orderBy('id', 'desc')
    .execute();
  return rows.map((row) => ({
    ...row,
    url: safeUrl(row.url),
    title: row.title ?? 'Untitled source',
    publishedDate: isoDate(row.publishedDate),
  }));
}
