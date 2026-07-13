import type { ColumnType, Generated } from 'kysely';

import type { IdentifierStrategy } from '../identifiers/providers.js';
import type {
  EvaluatorType,
  ProvenanceEventType,
  RegistryStatus,
  ReportType,
  SourceRole,
  SourceType,
} from './constants.js';
import type { FeedbackStatus, FeedbackType } from '../feedback/types.js';

type NullableDateColumn = ColumnType<
  string | null,
  string | null | undefined,
  string | null
>;

type TimestampColumn = ColumnType<
  Date,
  Date | string | undefined,
  Date | string
>;

export interface RegistryMetadataTable {
  key: string;
  value: string;
  updated_at: Generated<Date>;
}

export interface OrganizationsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  provider_prefix: string;
  br_namespace: string;
  identifier_strategy: IdentifierStrategy;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ModelsTable {
  id: Generated<string>;
  model_id: string;
  organization_id: string;
  official_name: string;
  family: string | null;
  model_number: string | null;
  tier_code: string | null;
  status: Generated<RegistryStatus>;
  release_date: NullableDateColumn;
  record_prefix: string;
  next_record_sequence: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ModelAliasesTable {
  id: Generated<string>;
  model_id: string;
  alias: string;
  normalized_alias: string;
  compact_alias: string | null;
  alias_type: string | null;
  created_at: Generated<Date>;
}

export interface BenchmarkAliasesTable {
  id: Generated<string>;
  benchmark_id: string;
  alias: string;
  normalized_alias: string;
  compact_alias: string;
  created_at: Generated<Date>;
}

export interface BenchmarksTable {
  id: Generated<string>;
  slug: string;
  name: string;
  organization_name: string | null;
  version: string | null;
  status: Generated<RegistryStatus>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BenchmarkVersionsTable {
  id: Generated<string>;
  benchmark_id: string;
  version_label: string | null;
  variant_name: string | null;
  canonical_reference: string;
  status: Generated<RegistryStatus>;
  release_date: NullableDateColumn;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

type NullableNumericColumn = ColumnType<
  string | null,
  number | string | null | undefined,
  number | string | null
>;

export interface EvaluationConfigurationsTable {
  id: Generated<string>;
  configuration_reference: Generated<string>;
  configuration_fingerprint: string;
  is_unspecified: Generated<boolean>;
  shots: number | null;
  reasoning_mode: string | null;
  reasoning_effort: string | null;
  pass_count: number | null;
  agent_scaffold: string | null;
  evaluation_harness: string | null;
  temperature: NullableNumericColumn;
  top_p: NullableNumericColumn;
  max_output_tokens: number | null;
  system_prompt_description: string | null;
  additional_configuration: ColumnType<
    Record<string, unknown>,
    Record<string, unknown> | undefined,
    Record<string, unknown>
  >;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ModelSnapshotsTable {
  id: Generated<string>;
  model_id: string;
  snapshot_reference: Generated<string>;
  provider_model_identifier: string | null;
  snapshot_label: string | null;
  snapshot_date: NullableDateColumn;
  status: Generated<RegistryStatus>;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EvaluatorsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  evaluator_type: EvaluatorType;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MetricsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  unit: string | null;
  higher_is_better: boolean | null;
  created_at: Generated<Date>;
}

export interface SourcesTable {
  id: Generated<string>;
  url: string;
  title: string | null;
  source_type: SourceType;
  publisher: string | null;
  published_date: NullableDateColumn;
  accessed_at: TimestampColumn;
  created_at: Generated<Date>;
}

export interface BenchmarkRecordsTable {
  id: Generated<string>;
  record_id: string;
  model_id: string;
  benchmark_id: string;
  benchmark_version_id: string;
  evaluation_configuration_id: string;
  model_snapshot_id: string | null;
  evaluator_id: string;
  metric_id: string;
  source_id: string;
  score_value: ColumnType<
    string | null,
    number | string | null | undefined,
    number | string | null
  >;
  score_display: string;
  evaluation_date: NullableDateColumn;
  reported_date: NullableDateColumn;
  report_type: Generated<ReportType>;
  status: Generated<RegistryStatus>;
  sequence_number: number;
  notes: string | null;
  superseded_by_record_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BenchmarkRecordSourcesTable {
  benchmark_record_id: string;
  source_id: string;
  source_role: SourceRole;
  created_at: Generated<Date>;
}

export interface RecordProvenanceEventsTable {
  id: Generated<string>;
  benchmark_record_id: string;
  event_type: ProvenanceEventType;
  source_id: string | null;
  ingestion_candidate_id: string | null;
  details: ColumnType<
    Record<string, unknown>,
    Record<string, unknown> | undefined,
    Record<string, unknown>
  >;
  created_at: Generated<Date>;
}

export type IngestionInputType = 'URL' | 'FILE';
export type IngestionJobStatus =
  | 'PENDING'
  | 'RETRIEVING'
  | 'EXTRACTING'
  | 'REVIEW_REQUIRED'
  | 'COMPLETED'
  | 'FAILED';
export type IngestionCandidateStatus =
  | 'PENDING_REVIEW'
  | 'VALIDATION_FAILED'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED';

export interface IngestionJobsTable {
  id: Generated<string>;
  job_reference: Generated<string>;
  source_id: string | null;
  input_type: IngestionInputType;
  input_reference: string | null;
  status: Generated<IngestionJobStatus>;
  content_hash: string | null;
  retrieved_at: Date | null;
  started_at: TimestampColumn;
  completed_at: Date | null;
  error_message: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface IngestionCandidatesTable {
  id: Generated<string>;
  candidate_reference: Generated<string>;
  ingestion_job_id: string;
  source_id: string;
  candidate_status: Generated<IngestionCandidateStatus>;
  model_text: string | null;
  benchmark_text: string | null;
  metric_text: string | null;
  score_display: string | null;
  score_value: ColumnType<
    string | null,
    number | string | null | undefined,
    number | string | null
  >;
  evaluation_date: NullableDateColumn;
  report_type: Generated<ReportType>;
  notes: string | null;
  evidence_text: string | null;
  evidence_location: string | null;
  proposed_model_id: string | null;
  proposed_benchmark_slug: string | null;
  proposed_metric_slug: string | null;
  benchmark_version_text: string | null;
  proposed_benchmark_version_reference: string | null;
  configuration_proposal: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null | undefined,
    Record<string, unknown> | null
  >;
  proposed_configuration_reference: string | null;
  provider_model_identifier: string | null;
  snapshot_date: NullableDateColumn;
  proposed_snapshot_reference: string | null;
  evaluator_text: string | null;
  proposed_evaluator_slug: string | null;
  reported_date: NullableDateColumn;
  confidence: ColumnType<
    string | null,
    number | string | null | undefined,
    number | string | null
  >;
  validation_errors: ColumnType<unknown[], unknown[] | undefined, unknown[]>;
  validation_warnings: ColumnType<unknown[], unknown[] | undefined, unknown[]>;
  candidate_fingerprint: string;
  approval_overrides: ColumnType<
    Record<string, unknown>,
    Record<string, unknown> | undefined,
    Record<string, unknown>
  >;
  rejection_reason: string | null;
  created_record_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface FeedbackSubmissionsTable {
  id: Generated<string>;
  type: FeedbackType;
  record_identifier: string | null;
  message: string;
  source_url: string | null;
  email: string | null;
  status: Generated<FeedbackStatus>;
  submission_token: string;
  created_at: Generated<Date>;
  updated_at: TimestampColumn;
}

export interface DatabaseSchema {
  registry_metadata: RegistryMetadataTable;
  organizations: OrganizationsTable;
  models: ModelsTable;
  model_aliases: ModelAliasesTable;
  benchmark_aliases: BenchmarkAliasesTable;
  benchmarks: BenchmarksTable;
  benchmark_versions: BenchmarkVersionsTable;
  evaluation_configurations: EvaluationConfigurationsTable;
  model_snapshots: ModelSnapshotsTable;
  evaluators: EvaluatorsTable;
  metrics: MetricsTable;
  sources: SourcesTable;
  benchmark_records: BenchmarkRecordsTable;
  benchmark_record_sources: BenchmarkRecordSourcesTable;
  record_provenance_events: RecordProvenanceEventsTable;
  ingestion_jobs: IngestionJobsTable;
  ingestion_candidates: IngestionCandidatesTable;
  feedback_submissions: FeedbackSubmissionsTable;
}
