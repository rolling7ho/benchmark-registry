import { sql } from 'kysely';

import type { Database } from '../db/database.js';
import { compactSearchText, normalizeSearchText } from './normalize.js';

export type SearchResolution =
  | { kind: 'EMPTY'; displayQuery: string }
  | { kind: 'EXACT_RECORD'; displayQuery: string; recordId: string }
  | {
      kind: 'RECORD_PREFIX';
      displayQuery: string;
      modelInternalId: string;
    }
  | { kind: 'MODEL'; displayQuery: string; modelInternalId: string }
  | {
      kind: 'BENCHMARK_VERSION';
      displayQuery: string;
      benchmarkVersionInternalId: string;
    }
  | {
      kind: 'BENCHMARK';
      displayQuery: string;
      benchmarkInternalId: string;
    }
  | {
      kind: 'ORGANIZATION';
      displayQuery: string;
      organizationInternalId: string;
    }
  | { kind: 'METRIC'; displayQuery: string; metricInternalId: string }
  | { kind: 'GENERAL'; displayQuery: string; normalizedQuery: string };

async function uniqueModelMatch(
  db: Database,
  column: 'official_name' | 'model_id',
  value: string,
): Promise<string | null> {
  const rows = await db
    .selectFrom('models')
    .select('id')
    .where(sql`lower(${sql.ref(column)})`, '=', value.toLowerCase())
    .limit(2)
    .execute();
  return rows.length === 1 ? rows[0]!.id : null;
}

async function uniqueAliasMatch(
  db: Database,
  column: 'normalized_alias' | 'compact_alias',
  value: string,
): Promise<
  | { kind: 'NONE' }
  | { kind: 'UNIQUE'; modelInternalId: string }
  | { kind: 'AMBIGUOUS' }
> {
  const rows = await db
    .selectFrom('model_aliases')
    .select('model_id')
    .distinct()
    .where(column, '=', value)
    .limit(2)
    .execute();
  if (rows.length === 0) return { kind: 'NONE' };
  if (rows.length > 1) return { kind: 'AMBIGUOUS' };
  return { kind: 'UNIQUE', modelInternalId: rows[0]!.model_id };
}

export async function resolveSearch(
  db: Database,
  query: string,
): Promise<SearchResolution> {
  const displayQuery = query.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return { kind: 'EMPTY', displayQuery };
  const identifierCandidate = displayQuery.toUpperCase();

  const record = await db
    .selectFrom('benchmark_records')
    .select('record_id')
    .where('record_id', '=', identifierCandidate)
    .executeTakeFirst();
  if (record !== undefined) {
    return { kind: 'EXACT_RECORD', displayQuery, recordId: record.record_id };
  }

  const prefix = await db
    .selectFrom('models')
    .select('id')
    .where('record_prefix', '=', identifierCandidate)
    .executeTakeFirst();
  if (prefix !== undefined) {
    return {
      kind: 'RECORD_PREFIX',
      displayQuery,
      modelInternalId: prefix.id,
    };
  }

  const modelIdentifier = await uniqueModelMatch(
    db,
    'model_id',
    identifierCandidate,
  );
  if (modelIdentifier !== null) {
    return { kind: 'MODEL', displayQuery, modelInternalId: modelIdentifier };
  }

  const officialName = await uniqueModelMatch(
    db,
    'official_name',
    normalizedQuery,
  );
  if (officialName !== null) {
    return { kind: 'MODEL', displayQuery, modelInternalId: officialName };
  }

  const normalizedAlias = await uniqueAliasMatch(
    db,
    'normalized_alias',
    normalizedQuery,
  );
  if (normalizedAlias.kind === 'AMBIGUOUS') {
    return { kind: 'GENERAL', displayQuery, normalizedQuery };
  }
  if (normalizedAlias.kind === 'UNIQUE') {
    return {
      kind: 'MODEL',
      displayQuery,
      modelInternalId: normalizedAlias.modelInternalId,
    };
  }

  const compactAlias = await uniqueAliasMatch(
    db,
    'compact_alias',
    compactSearchText(query),
  );
  if (compactAlias.kind === 'UNIQUE') {
    return {
      kind: 'MODEL',
      displayQuery,
      modelInternalId: compactAlias.modelInternalId,
    };
  }

  const benchmarkVersions = await db
    .selectFrom('benchmark_versions')
    .innerJoin('benchmarks', 'benchmarks.id', 'benchmark_versions.benchmark_id')
    .select('benchmark_versions.id')
    .where((eb) =>
      eb.or([
        eb(
          sql`lower(benchmark_versions.canonical_reference)`,
          '=',
          normalizedQuery,
        ),
        eb(
          sql`lower(benchmarks.name || ' ' || coalesce(benchmark_versions.variant_name, benchmark_versions.version_label, ''))`,
          '=',
          normalizedQuery,
        ),
      ]),
    )
    .limit(2)
    .execute();
  if (benchmarkVersions.length === 1) {
    return {
      kind: 'BENCHMARK_VERSION',
      displayQuery,
      benchmarkVersionInternalId: benchmarkVersions[0]!.id,
    };
  }

  const benchmark = await db
    .selectFrom('benchmarks')
    .select('id')
    .where((eb) =>
      eb.or([
        eb(sql`lower(name)`, '=', normalizedQuery),
        eb(sql`lower(slug)`, '=', normalizedQuery),
      ]),
    )
    .executeTakeFirst();
  if (benchmark !== undefined) {
    return {
      kind: 'BENCHMARK',
      displayQuery,
      benchmarkInternalId: benchmark.id,
    };
  }

  const organization = await db
    .selectFrom('organizations')
    .select('id')
    .where((eb) =>
      eb.or([
        eb(sql`lower(name)`, '=', normalizedQuery),
        eb(sql`lower(slug)`, '=', normalizedQuery),
        eb(sql`lower(provider_prefix)`, '=', normalizedQuery),
      ]),
    )
    .executeTakeFirst();
  if (organization !== undefined) {
    return {
      kind: 'ORGANIZATION',
      displayQuery,
      organizationInternalId: organization.id,
    };
  }

  const metric = await db
    .selectFrom('metrics')
    .select('id')
    .where((eb) =>
      eb.or([
        eb(sql`lower(name)`, '=', normalizedQuery),
        eb(sql`lower(slug)`, '=', normalizedQuery),
      ]),
    )
    .executeTakeFirst();
  if (metric !== undefined) {
    return {
      kind: 'METRIC',
      displayQuery,
      metricInternalId: metric.id,
    };
  }

  return { kind: 'GENERAL', displayQuery, normalizedQuery };
}
