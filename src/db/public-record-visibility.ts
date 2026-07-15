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
