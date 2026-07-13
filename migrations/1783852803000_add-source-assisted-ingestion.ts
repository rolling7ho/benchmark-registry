import type { MigrationBuilder } from 'node-pg-migrate';

const JOB_STATUS_CHECK =
  "status IN ('PENDING', 'RETRIEVING', 'EXTRACTING', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED')";
const CANDIDATE_STATUS_CHECK =
  "candidate_status IN ('PENDING_REVIEW', 'VALIDATION_FAILED', 'APPROVED', 'REJECTED', 'PUBLISHED')";

export function up(pgm: MigrationBuilder): void {
  pgm.createSequence('ingestion_job_reference_sequence');
  pgm.createSequence('ingestion_candidate_reference_sequence');

  pgm.createTable('benchmark_aliases', {
    id: { type: 'bigserial', primaryKey: true },
    benchmark_id: {
      type: 'bigint',
      notNull: true,
      references: 'benchmarks',
      onDelete: 'CASCADE',
    },
    alias: { type: 'text', notNull: true },
    normalized_alias: { type: 'text', notNull: true },
    compact_alias: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.addConstraint('benchmark_aliases', 'benchmark_aliases_alias_unique', {
    unique: ['benchmark_id', 'alias'],
  });
  pgm.createIndex('benchmark_aliases', 'normalized_alias');
  pgm.createIndex('benchmark_aliases', 'compact_alias');

  pgm.createTable('ingestion_jobs', {
    id: { type: 'bigserial', primaryKey: true },
    job_reference: {
      type: 'text',
      notNull: true,
      unique: true,
      default: pgm.func(
        "'IJ-' || lpad(nextval('ingestion_job_reference_sequence')::text, 6, '0')",
      ),
    },
    source_id: {
      type: 'bigint',
      references: 'sources',
      onDelete: 'RESTRICT',
    },
    input_type: { type: 'text', notNull: true },
    input_reference: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'PENDING' },
    content_hash: { type: 'text' },
    retrieved_at: { type: 'timestamptz' },
    started_at: { type: 'timestamptz', notNull: true },
    completed_at: { type: 'timestamptz' },
    error_message: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.addConstraint('ingestion_jobs', 'ingestion_jobs_input_type_check', {
    check: "input_type IN ('URL', 'FILE')",
  });
  pgm.addConstraint('ingestion_jobs', 'ingestion_jobs_status_check', {
    check: JOB_STATUS_CHECK,
  });
  pgm.createIndex('ingestion_jobs', ['source_id', 'content_hash']);
  pgm.createIndex('ingestion_jobs', 'status');

  pgm.createTable('ingestion_candidates', {
    id: { type: 'bigserial', primaryKey: true },
    candidate_reference: {
      type: 'text',
      notNull: true,
      unique: true,
      default: pgm.func(
        "'IC-' || lpad(nextval('ingestion_candidate_reference_sequence')::text, 6, '0')",
      ),
    },
    ingestion_job_id: {
      type: 'bigint',
      notNull: true,
      references: 'ingestion_jobs',
      onDelete: 'RESTRICT',
    },
    source_id: {
      type: 'bigint',
      notNull: true,
      references: 'sources',
      onDelete: 'RESTRICT',
    },
    candidate_status: {
      type: 'text',
      notNull: true,
      default: 'PENDING_REVIEW',
    },
    model_text: { type: 'text' },
    benchmark_text: { type: 'text' },
    metric_text: { type: 'text' },
    score_display: { type: 'text' },
    score_value: { type: 'numeric' },
    evaluation_date: { type: 'date' },
    report_type: { type: 'text', notNull: true, default: 'UNKNOWN' },
    notes: { type: 'text' },
    evidence_text: { type: 'text' },
    evidence_location: { type: 'text' },
    proposed_model_id: { type: 'text' },
    proposed_benchmark_slug: { type: 'text' },
    proposed_metric_slug: { type: 'text' },
    confidence: { type: 'numeric' },
    validation_errors: { type: 'jsonb', notNull: true, default: '[]' },
    validation_warnings: { type: 'jsonb', notNull: true, default: '[]' },
    candidate_fingerprint: { type: 'text', notNull: true },
    approval_overrides: { type: 'jsonb', notNull: true, default: '{}' },
    rejection_reason: { type: 'text' },
    created_record_id: {
      type: 'bigint',
      references: 'benchmark_records',
      onDelete: 'RESTRICT',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.addConstraint(
    'ingestion_candidates',
    'ingestion_candidates_status_check',
    { check: CANDIDATE_STATUS_CHECK },
  );
  pgm.addConstraint(
    'ingestion_candidates',
    'ingestion_candidates_report_type_check',
    {
      check:
        "report_type IN ('PROVIDER', 'INDEPENDENT', 'BENCHMARK_OWNER', 'REPRODUCED', 'UNKNOWN')",
    },
  );
  pgm.addConstraint(
    'ingestion_candidates',
    'ingestion_candidates_confidence_check',
    { check: 'confidence IS NULL OR (confidence >= 0 AND confidence <= 1)' },
  );
  pgm.addConstraint(
    'ingestion_candidates',
    'ingestion_candidates_published_link_check',
    {
      check:
        "(candidate_status = 'PUBLISHED' AND created_record_id IS NOT NULL) OR (candidate_status <> 'PUBLISHED' AND created_record_id IS NULL)",
    },
  );
  pgm.addConstraint(
    'ingestion_candidates',
    'ingestion_candidates_rejection_reason_check',
    {
      check:
        "candidate_status <> 'REJECTED' OR nullif(btrim(rejection_reason), '') IS NOT NULL",
    },
  );
  pgm.addConstraint(
    'ingestion_candidates',
    'ingestion_candidates_job_fingerprint_unique',
    { unique: ['ingestion_job_id', 'candidate_fingerprint'] },
  );
  pgm.createIndex('ingestion_candidates', 'candidate_status');
  pgm.createIndex('ingestion_candidates', 'ingestion_job_id');
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('ingestion_candidates');
  pgm.dropTable('ingestion_jobs');
  pgm.dropTable('benchmark_aliases');
  pgm.dropSequence('ingestion_candidate_reference_sequence');
  pgm.dropSequence('ingestion_job_reference_sequence');
}
