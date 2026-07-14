import { sql } from 'kysely';

import type { Database } from '../db/database.js';
import { compactSearchText, normalizeSearchText } from './normalize.js';
import { parseSearchQuery, type ParsedSearchQuery } from './query-language.js';

export type SearchResolution =
  | { kind: 'EMPTY'; displayQuery: string }
  | { kind: 'EXACT_RECORD'; displayQuery: string; recordId: string }
  | {
      kind: 'RECORD_PREFIX';
      displayQuery: string;
      recordPrefix: string;
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
  | { kind: 'QUERY'; displayQuery: string; query: ParsedSearchQuery }
  | { kind: 'GENERAL'; displayQuery: string; normalizedQuery: string };

interface ExactSearchMatch {
  priority: number;
  kind: string;
  entity_id: string;
  matched_value: string | null;
  alias_type: string | null;
}

export async function resolveSearch(
  db: Database,
  query: string,
): Promise<SearchResolution> {
  const displayQuery = query.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return { kind: 'EMPTY', displayQuery };
  const identifierCandidate = displayQuery.toUpperCase();

  // All exact resolution candidates are fetched in one database round trip.
  // Priority zero preserves the product-critical exact-record short circuit:
  // no broader result query is run when an exact published record ID exists.
  const matches = await sql<ExactSearchMatch>`
    WITH exact_matches AS (
      SELECT 0 AS priority, 'EXACT_RECORD' AS kind,
             benchmark_records.id::text AS entity_id,
             benchmark_records.record_id AS matched_value,
             NULL::text AS alias_type
      FROM benchmark_records
      WHERE benchmark_records.record_id = ${identifierCandidate}

      UNION ALL
      SELECT 10 AS priority, 'RECORD_PREFIX' AS kind,
             models.id::text AS entity_id,
             models.record_prefix AS matched_value,
             NULL::text AS alias_type
      FROM models
      WHERE models.record_prefix = ${identifierCandidate}

      UNION ALL
      SELECT 20, 'MODEL', models.id::text, models.model_id, NULL::text
      FROM models
      WHERE lower(models.model_id) = ${normalizedQuery}

      UNION ALL
      SELECT 30, 'MODEL', models.id::text, models.official_name, NULL::text
      FROM models
      WHERE lower(models.official_name) = ${normalizedQuery}

      -- Priority 40 combines every separator/case-insensitive identity form
      -- (curated aliases and the model's own id/name) into one group so a
      -- genuine conflict between them is caught as ambiguous rather than one
      -- form silently winning because it happened to be checked first.
      UNION ALL
      SELECT 40, 'ALIAS', model_aliases.model_id::text,
             model_aliases.alias, model_aliases.alias_type
      FROM model_aliases
      WHERE model_aliases.normalized_alias = ${normalizedQuery}
         OR model_aliases.compact_alias = ${compactSearchText(query)}

      UNION ALL
      SELECT 40, 'ALIAS', models.id::text, models.model_id, NULL::text
      FROM models
      WHERE regexp_replace(lower(models.model_id), '[\\s._-]', '', 'g')
            = ${compactSearchText(query)}

      UNION ALL
      SELECT 40, 'ALIAS', models.id::text, models.official_name, NULL::text
      FROM models
      WHERE regexp_replace(lower(models.official_name), '[\\s._-]', '', 'g')
            = ${compactSearchText(query)}

      UNION ALL
      SELECT 60, 'BENCHMARK_VERSION', benchmark_versions.id::text,
             benchmark_versions.canonical_reference, NULL::text
      FROM benchmark_versions
      INNER JOIN benchmarks
        ON benchmarks.id = benchmark_versions.benchmark_id
      WHERE lower(benchmark_versions.canonical_reference) = ${normalizedQuery}
         OR lower(
              benchmarks.name || ' ' ||
              coalesce(
                benchmark_versions.variant_name,
                benchmark_versions.version_label,
                ''
              )
            ) = ${normalizedQuery}

      UNION ALL
      SELECT 70, 'BENCHMARK', benchmarks.id::text,
             benchmarks.slug, NULL::text
      FROM benchmarks
      WHERE lower(benchmarks.name) = ${normalizedQuery}
         OR lower(benchmarks.slug) = ${normalizedQuery}

      UNION ALL
      SELECT 80, 'ORGANIZATION', organizations.id::text,
             organizations.slug, NULL::text
      FROM organizations
      WHERE lower(organizations.name) = ${normalizedQuery}
         OR lower(organizations.slug) = ${normalizedQuery}
         OR lower(organizations.provider_prefix) = ${normalizedQuery}

      UNION ALL
      SELECT 90, 'METRIC', metrics.id::text, metrics.slug, NULL::text
      FROM metrics
      WHERE lower(metrics.name) = ${normalizedQuery}
         OR lower(metrics.slug) = ${normalizedQuery}
    )
    SELECT priority, kind, entity_id, matched_value, alias_type
    FROM exact_matches
    ORDER BY priority, entity_id
  `.execute(db);

  const grouped = new Map<number, ExactSearchMatch[]>();
  for (const match of matches.rows) {
    const priorityMatches = grouped.get(match.priority) ?? [];
    priorityMatches.push(match);
    grouped.set(match.priority, priorityMatches);
  }
  for (const priorityMatches of grouped.values()) {
    const distinctEntities = new Set(
      priorityMatches.map((match) => match.entity_id),
    );
    const first = priorityMatches[0]!;
    if (
      first.kind === 'MODEL' ||
      first.kind === 'ALIAS' ||
      first.kind === 'BENCHMARK_VERSION'
    ) {
      if (distinctEntities.size !== 1) {
        if (first.kind === 'BENCHMARK_VERSION') continue;
        return { kind: 'GENERAL', displayQuery, normalizedQuery };
      }
    }
    switch (first.kind) {
      case 'EXACT_RECORD':
        return {
          kind: 'EXACT_RECORD',
          displayQuery,
          recordId: first.matched_value!,
        };
      case 'RECORD_PREFIX':
        return {
          kind: 'RECORD_PREFIX',
          displayQuery,
          recordPrefix: first.matched_value!,
        };
      case 'MODEL':
        return {
          kind: 'MODEL',
          displayQuery,
          modelInternalId: first.entity_id,
        };
      case 'ALIAS': {
        const legacyPrefix = priorityMatches.find(
          (match) => match.alias_type === 'LEGACY_RECORD_PREFIX',
        );
        if (legacyPrefix !== undefined) {
          return {
            kind: 'RECORD_PREFIX',
            displayQuery,
            recordPrefix: legacyPrefix.matched_value!.toUpperCase(),
          };
        }
        return {
          kind: 'MODEL',
          displayQuery,
          modelInternalId: first.entity_id,
        };
      }
      case 'BENCHMARK_VERSION':
        return {
          kind: 'BENCHMARK_VERSION',
          displayQuery,
          benchmarkVersionInternalId: first.entity_id,
        };
      case 'BENCHMARK':
        return {
          kind: 'BENCHMARK',
          displayQuery,
          benchmarkInternalId: first.entity_id,
        };
      case 'ORGANIZATION':
        return {
          kind: 'ORGANIZATION',
          displayQuery,
          organizationInternalId: first.entity_id,
        };
      case 'METRIC':
        return {
          kind: 'METRIC',
          displayQuery,
          metricInternalId: first.entity_id,
        };
    }
  }

  const parsedQuery = parseSearchQuery(displayQuery);
  return parsedQuery === null
    ? { kind: 'GENERAL', displayQuery, normalizedQuery }
    : { kind: 'QUERY', displayQuery, query: parsedQuery };
}
