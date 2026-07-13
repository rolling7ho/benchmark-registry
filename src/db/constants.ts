export const REGISTRY_STATUSES = [
  'ACTIVE',
  'WITHDRAWN',
  'SUPERSEDED',
  'ERRONEOUS',
  'ARCHIVED',
] as const;

export type RegistryStatus = (typeof REGISTRY_STATUSES)[number];

export const REPORT_TYPES = [
  'PROVIDER',
  'INDEPENDENT',
  'BENCHMARK_OWNER',
  'REPRODUCED',
  'UNKNOWN',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const SOURCE_TYPES = [
  'PROVIDER_REPORT',
  'SYSTEM_CARD',
  'TECHNICAL_REPORT',
  'PAPER',
  'LEADERBOARD',
  'MODEL_CARD',
  'PROVIDER_PAGE',
  'INDEPENDENT_EVALUATION',
  'OTHER',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const EVALUATOR_TYPES = [
  'MODEL_PROVIDER',
  'BENCHMARK_OWNER',
  'INDEPENDENT_ORGANIZATION',
  'RESEARCH_GROUP',
  'INDIVIDUAL',
  'UNKNOWN',
] as const;
export type EvaluatorType = (typeof EVALUATOR_TYPES)[number];

export const SOURCE_ROLES = [
  'PRIMARY',
  'SUPPORTING',
  'CORRECTION',
  'ARCHIVE',
] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

export const PROVENANCE_EVENT_TYPES = [
  'CREATED_MANUALLY',
  'CREATED_FROM_INGESTION',
  'WITHDRAWN',
  'SUPERSEDED',
  'CORRECTION_NOTED',
  'SOURCE_ADDED',
  'CONFIGURATION_ATTRIBUTED',
  'SNAPSHOT_ATTRIBUTED',
] as const;
export type ProvenanceEventType = (typeof PROVENANCE_EVENT_TYPES)[number];
