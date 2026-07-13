import type { Database } from './database.js';
import { formatBenchmarkDisplay } from '../registry/benchmark-display.js';

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
  return typeof value === 'string' ? value.slice(0, 10) : null;
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

// The joined Kysely projection intentionally remains inferred so route/view
// changes cannot drift from the selected database columns.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function getPublicRecordDetail(db: Database, identifier: string) {
  const core = await db
    .selectFrom('benchmark_records')
    .innerJoin('models', 'models.id', 'benchmark_records.model_id')
    .innerJoin('organizations', 'organizations.id', 'models.organization_id')
    .innerJoin('benchmarks', 'benchmarks.id', 'benchmark_records.benchmark_id')
    .innerJoin(
      'benchmark_versions',
      'benchmark_versions.id',
      'benchmark_records.benchmark_version_id',
    )
    .innerJoin('metrics', 'metrics.id', 'benchmark_records.metric_id')
    .innerJoin('sources', 'sources.id', 'benchmark_records.source_id')
    .innerJoin(
      'evaluation_configurations',
      'evaluation_configurations.id',
      'benchmark_records.evaluation_configuration_id',
    )
    .innerJoin('evaluators', 'evaluators.id', 'benchmark_records.evaluator_id')
    .leftJoin(
      'model_snapshots',
      'model_snapshots.id',
      'benchmark_records.model_snapshot_id',
    )
    .leftJoin(
      'benchmark_records as replacement',
      'replacement.id',
      'benchmark_records.superseded_by_record_id',
    )
    .select([
      'benchmark_records.id as internalId',
      'benchmark_records.record_id as recordId',
      'benchmark_records.status as recordStatus',
      'benchmark_records.score_display as scoreDisplay',
      'benchmark_records.score_value as scoreValue',
      'benchmark_records.evaluation_date as evaluationDate',
      'benchmark_records.reported_date as reportedDate',
      'benchmark_records.report_type as reportType',
      'benchmark_records.created_at as createdAt',
      'benchmark_records.updated_at as updatedAt',
      'replacement.record_id as supersededByRecordId',
      'models.official_name as modelName',
      'models.model_id as modelIdentifier',
      'models.family as modelFamily',
      'models.model_number as modelNumber',
      'models.tier_code as modelTier',
      'organizations.name as modelOrganization',
      'model_snapshots.snapshot_reference as snapshotReference',
      'model_snapshots.snapshot_label as snapshotLabel',
      'model_snapshots.provider_model_identifier as providerModelIdentifier',
      'model_snapshots.snapshot_date as snapshotDate',
      'benchmarks.name as benchmarkFamily',
      'benchmarks.organization_name as benchmarkOrganization',
      'benchmark_versions.version_label as benchmarkVersionLabel',
      'benchmark_versions.variant_name as benchmarkVariantName',
      'benchmark_versions.canonical_reference as benchmarkVersionReference',
      'benchmark_versions.status as benchmarkStatus',
      'metrics.name as metricName',
      'evaluation_configurations.configuration_reference as configurationReference',
      'evaluation_configurations.is_unspecified as configurationUnspecified',
      'evaluation_configurations.shots',
      'evaluation_configurations.reasoning_mode as reasoningMode',
      'evaluation_configurations.reasoning_effort as reasoningEffort',
      'evaluation_configurations.pass_count as passCount',
      'evaluation_configurations.agent_scaffold as agentScaffold',
      'evaluation_configurations.evaluation_harness as evaluationHarness',
      'evaluation_configurations.temperature',
      'evaluation_configurations.top_p as topP',
      'evaluation_configurations.max_output_tokens as maxOutputTokens',
      'evaluation_configurations.system_prompt_description as systemPromptDescription',
      'evaluation_configurations.additional_configuration as additionalConfiguration',
      'sources.url as sourceUrl',
      'sources.title as sourceTitle',
      'sources.source_type as sourceType',
      'sources.publisher as sourcePublisher',
      'sources.published_date as sourcePublishedDate',
      'sources.accessed_at as sourceAccessedAt',
      'evaluators.name as evaluatorName',
      'evaluators.evaluator_type as evaluatorType',
    ])
    .where('benchmark_records.record_id', '=', identifier.trim().toUpperCase())
    .executeTakeFirst();
  if (core === undefined) return undefined;

  const [sources, provenance] = await Promise.all([
    db
      .selectFrom('benchmark_record_sources')
      .innerJoin('sources', 'sources.id', 'benchmark_record_sources.source_id')
      .select([
        'benchmark_record_sources.source_role as role',
        'sources.title',
        'sources.url',
      ])
      .where(
        'benchmark_record_sources.benchmark_record_id',
        '=',
        core.internalId,
      )
      .where('benchmark_record_sources.source_role', '!=', 'PRIMARY')
      .orderBy('benchmark_record_sources.source_role')
      .orderBy('benchmark_record_sources.created_at')
      .execute(),
    db
      .selectFrom('record_provenance_events')
      .leftJoin('sources', 'sources.id', 'record_provenance_events.source_id')
      .select([
        'record_provenance_events.event_type as eventType',
        'record_provenance_events.details',
        'record_provenance_events.created_at as createdAt',
        'sources.title as sourceTitle',
        'sources.url as sourceUrl',
      ])
      .where(
        'record_provenance_events.benchmark_record_id',
        '=',
        core.internalId,
      )
      .orderBy('record_provenance_events.created_at')
      .orderBy('record_provenance_events.id')
      .execute(),
  ]);

  return {
    ...core,
    benchmarkDisplay: formatBenchmarkDisplay({
      familyName: core.benchmarkFamily,
      versionLabel: core.benchmarkVersionLabel,
      variantName: core.benchmarkVariantName,
    }),
    evaluationDate: isoDate(core.evaluationDate),
    reportedDate: isoDate(core.reportedDate),
    snapshotDate: isoDate(core.snapshotDate),
    sourcePublishedDate: isoDate(core.sourcePublishedDate),
    sourceUrl: safeUrl(core.sourceUrl),
    additionalSources: sources.map((source) => ({
      ...source,
      url: safeUrl(source.url),
    })),
    provenance: provenance.map((event) => ({
      ...event,
      sourceUrl: event.sourceUrl === null ? null : safeUrl(event.sourceUrl),
      publicDetails:
        event.eventType === 'SUPERSEDED' &&
        typeof event.details.replacementRecordId === 'string'
          ? `Replacement record: ${event.details.replacementRecordId}`
          : null,
    })),
  };
}
