import { sql, type RawBuilder } from 'kysely';

/**
 * Temporary public quarantine for records derived from Artificial Analysis.
 *
 * The rows remain unchanged in PostgreSQL and remain available to internal
 * administrative and validation services. Set this to false only when the
 * quarantined records have defensible provenance and may be shown publicly.
 */
export const PUBLIC_ARTIFICIAL_ANALYSIS_QUARANTINE_ENABLED = true;

export const ARTIFICIAL_ANALYSIS_NATIVE_BENCHMARK_SLUGS = [
  'aa-intelligence-index',
  'aa-omniscience',
  'aa-lcr',
  'gdpval-aa',
  'terminal-bench-hard',
] as const;

const ARTIFICIAL_ANALYSIS_HOST_PATTERN =
  '^https?://([^/]+\\.)?artificialanalysis\\.ai([/:?#]|$)';

/**
 * Returns the shared SQL predicate for every public benchmark-record query.
 * Correlated subqueries keep the rule usable from queries that do not join
 * sources, evaluators, or benchmarks directly.
 */
export function publicRecordVisibilityExpression(
  recordTable = 'benchmark_records',
): RawBuilder<boolean> {
  if (!PUBLIC_ARTIFICIAL_ANALYSIS_QUARANTINE_ENABLED) {
    return sql<boolean>`true`;
  }

  const sourceId = sql.ref(`${recordTable}.source_id`);
  const evaluatorId = sql.ref(`${recordTable}.evaluator_id`);
  const benchmarkId = sql.ref(`${recordTable}.benchmark_id`);
  const nativeBenchmarkSlugs = sql.join(
    ARTIFICIAL_ANALYSIS_NATIVE_BENCHMARK_SLUGS.map((slug) => sql`${slug}`),
  );

  return sql<boolean>`
    NOT EXISTS (
      SELECT 1
      FROM sources AS public_quarantine_source
      WHERE public_quarantine_source.id = ${sourceId}
        AND (
          lower(public_quarantine_source.url) ~ ${ARTIFICIAL_ANALYSIS_HOST_PATTERN}
          OR lower(coalesce(public_quarantine_source.publisher, '')) = 'artificial analysis'
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM evaluators AS public_quarantine_evaluator
      WHERE public_quarantine_evaluator.id = ${evaluatorId}
        AND (
          lower(public_quarantine_evaluator.slug) = 'artificial-analysis'
          OR lower(public_quarantine_evaluator.name) = 'artificial analysis'
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM benchmarks AS public_quarantine_benchmark
      WHERE public_quarantine_benchmark.id = ${benchmarkId}
        AND public_quarantine_benchmark.slug IN (${nativeBenchmarkSlugs})
    )
  `;
}

export function publicRecordCountExpression(
  recordTable = 'benchmark_records',
): RawBuilder<string> {
  return sql<string>`count(${sql.ref(`${recordTable}.id`)}) filter (where ${publicRecordVisibilityExpression(recordTable)})`;
}

/**
 * Returns the newest timestamp contributed by publicly visible records only.
 * This prevents quarantined rows from changing public sitemap or SEO metadata.
 */
export function publicRecordMaxTimestampExpression(
  column = 'updated_at',
  recordTable = 'benchmark_records',
): RawBuilder<Date | null> {
  return sql<Date | null>`max(${sql.ref(`${recordTable}.${column}`)}) filter (where ${publicRecordVisibilityExpression(recordTable)})`;
}

/**
 * Public source pages contain only non-AA sources referenced by at least one
 * publicly visible record. Administrative source reads remain unchanged.
 */
export function publicSourceVisibilityExpression(
  sourceTable = 'sources',
): RawBuilder<boolean> {
  if (!PUBLIC_ARTIFICIAL_ANALYSIS_QUARANTINE_ENABLED) {
    return sql<boolean>`true`;
  }

  const sourceId = sql.ref(`${sourceTable}.id`);
  const sourceUrl = sql.ref(`${sourceTable}.url`);
  const sourcePublisher = sql.ref(`${sourceTable}.publisher`);

  return sql<boolean>`
    NOT (
      lower(${sourceUrl}) ~ ${ARTIFICIAL_ANALYSIS_HOST_PATTERN}
      OR lower(coalesce(${sourcePublisher}, '')) = 'artificial analysis'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM benchmark_records AS public_primary_record
        WHERE public_primary_record.source_id = ${sourceId}
          AND ${publicRecordVisibilityExpression('public_primary_record')}
      )
      OR EXISTS (
        SELECT 1
        FROM benchmark_record_sources AS public_linked_source
        JOIN benchmark_records AS public_linked_record
          ON public_linked_record.id = public_linked_source.benchmark_record_id
        WHERE public_linked_source.source_id = ${sourceId}
          AND ${publicRecordVisibilityExpression('public_linked_record')}
      )
      OR EXISTS (
        SELECT 1
        FROM record_provenance_events AS public_provenance_event
        JOIN benchmark_records AS public_provenance_record
          ON public_provenance_record.id = public_provenance_event.benchmark_record_id
        WHERE public_provenance_event.source_id = ${sourceId}
          AND ${publicRecordVisibilityExpression('public_provenance_record')}
      )
    )
  `;
}
