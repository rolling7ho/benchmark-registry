import { sql } from 'kysely';

import type { Database } from './database.js';
import { modelSlug } from '../web/seo.js';

export const SITEMAP_BATCH_SIZE = 10_000;

export interface SitemapEntry {
  path: string;
  lastModified?: Date | undefined;
}

function asDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error('Database returned an invalid sitemap timestamp.');
  }
  return date;
}

export async function countRecordSitemapBatches(db: Database): Promise<number> {
  const row = await db
    .selectFrom('benchmark_records')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .executeTakeFirstOrThrow();
  return Math.max(1, Math.ceil(Number(row.count) / SITEMAP_BATCH_SIZE));
}

export async function listModelSitemapEntries(
  db: Database,
): Promise<SitemapEntry[]> {
  const rows = await db
    .selectFrom('models')
    .leftJoin('benchmark_records', 'benchmark_records.model_id', 'models.id')
    .select(['models.model_id as modelIdentifier'])
    .select(
      sql<Date>`greatest(models.updated_at, coalesce(max(benchmark_records.updated_at), models.updated_at))`.as(
        'lastModified',
      ),
    )
    .groupBy('models.id')
    .orderBy('models.model_id')
    .execute();
  return rows.map((row) => ({
    path: `/models/${encodeURIComponent(modelSlug(row.modelIdentifier))}`,
    lastModified: asDate(row.lastModified),
  }));
}

export async function listOrganizationSitemapEntries(
  db: Database,
): Promise<SitemapEntry[]> {
  const rows = await db
    .selectFrom('organizations')
    .leftJoin('models', 'models.organization_id', 'organizations.id')
    .leftJoin('benchmark_records', 'benchmark_records.model_id', 'models.id')
    .select(['organizations.slug'])
    .select(
      sql<Date>`greatest(organizations.updated_at, coalesce(max(models.updated_at), organizations.updated_at), coalesce(max(benchmark_records.updated_at), organizations.updated_at))`.as(
        'lastModified',
      ),
    )
    .groupBy('organizations.id')
    .orderBy('organizations.slug')
    .execute();
  return rows.map((row) => ({
    path: `/organizations/${encodeURIComponent(row.slug)}`,
    lastModified: asDate(row.lastModified),
  }));
}

export async function listBenchmarkSitemapEntries(
  db: Database,
): Promise<SitemapEntry[]> {
  const benchmarkRows = await db
    .selectFrom('benchmarks')
    .leftJoin(
      'benchmark_records',
      'benchmark_records.benchmark_id',
      'benchmarks.id',
    )
    .select(['benchmarks.slug'])
    .select(
      sql<Date>`greatest(benchmarks.updated_at, coalesce(max(benchmark_records.updated_at), benchmarks.updated_at))`.as(
        'lastModified',
      ),
    )
    .groupBy('benchmarks.id')
    .orderBy('benchmarks.slug')
    .execute();
  const versionRows = await db
    .selectFrom('benchmark_versions')
    .innerJoin('benchmarks', 'benchmarks.id', 'benchmark_versions.benchmark_id')
    .leftJoin(
      'benchmark_records',
      'benchmark_records.benchmark_version_id',
      'benchmark_versions.id',
    )
    .select([
      'benchmarks.slug',
      'benchmark_versions.canonical_reference as canonicalReference',
    ])
    .select(
      sql<Date>`greatest(benchmark_versions.updated_at, coalesce(max(benchmark_records.updated_at), benchmark_versions.updated_at))`.as(
        'lastModified',
      ),
    )
    .groupBy(['benchmark_versions.id', 'benchmarks.id'])
    .orderBy('benchmark_versions.canonical_reference')
    .execute();
  return [
    ...benchmarkRows.map((row) => ({
      path: `/benchmarks/${encodeURIComponent(row.slug)}`,
      lastModified: asDate(row.lastModified),
    })),
    ...versionRows.map((row) => {
      const versionSegment = row.canonicalReference
        .split('/')
        .slice(1)
        .join('/');
      return {
        path: `/benchmarks/${encodeURIComponent(row.slug)}/versions/${encodeURIComponent(versionSegment)}`,
        lastModified: asDate(row.lastModified),
      };
    }),
  ];
}

export async function listRecordSitemapEntries(
  db: Database,
  batch: number,
): Promise<SitemapEntry[]> {
  const offset = (batch - 1) * SITEMAP_BATCH_SIZE;
  const rows = await db
    .selectFrom('benchmark_records')
    .leftJoin(
      'record_provenance_events',
      'record_provenance_events.benchmark_record_id',
      'benchmark_records.id',
    )
    .leftJoin(
      'benchmark_record_sources',
      'benchmark_record_sources.benchmark_record_id',
      'benchmark_records.id',
    )
    .select(['benchmark_records.record_id as recordIdentifier'])
    .select(
      sql<Date>`greatest(benchmark_records.updated_at, coalesce(max(record_provenance_events.created_at), benchmark_records.updated_at), coalesce(max(benchmark_record_sources.created_at), benchmark_records.updated_at))`.as(
        'lastModified',
      ),
    )
    .groupBy('benchmark_records.id')
    .orderBy('benchmark_records.record_id')
    .limit(SITEMAP_BATCH_SIZE)
    .offset(offset)
    .execute();
  return rows.map((row) => ({
    path: `/records/${encodeURIComponent(row.recordIdentifier)}`,
    lastModified: asDate(row.lastModified),
  }));
}
