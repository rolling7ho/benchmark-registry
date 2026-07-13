import { createHash } from 'node:crypto';

import type { MigrationBuilder } from 'node-pg-migrate';

const STATUS_CHECK =
  "status IN ('ACTIVE', 'WITHDRAWN', 'SUPERSEDED', 'ERRONEOUS', 'ARCHIVED')";
const EVALUATOR_TYPE_CHECK =
  "evaluator_type IN ('MODEL_PROVIDER', 'BENCHMARK_OWNER', 'INDEPENDENT_ORGANIZATION', 'RESEARCH_GROUP', 'INDIVIDUAL', 'UNKNOWN')";
const SOURCE_ROLE_CHECK =
  "source_role IN ('PRIMARY', 'SUPPORTING', 'CORRECTION', 'ARCHIVE')";
const PROVENANCE_EVENT_CHECK =
  "event_type IN ('CREATED_MANUALLY', 'CREATED_FROM_INGESTION', 'WITHDRAWN', 'SUPERSEDED', 'CORRECTION_NOTED', 'SOURCE_ADDED', 'CONFIGURATION_ATTRIBUTED', 'SNAPSHOT_ATTRIBUTED')";

const unspecifiedConfiguration = {
  additional_configuration: {},
  agent_scaffold: null,
  evaluation_harness: null,
  max_output_tokens: null,
  pass_count: null,
  reasoning_effort: null,
  reasoning_mode: null,
  shots: null,
  system_prompt_description: null,
  temperature: null,
  top_p: null,
};
const unspecifiedFingerprint = createHash('sha256')
  .update(JSON.stringify(unspecifiedConfiguration))
  .digest('hex');

export function up(pgm: MigrationBuilder): void {
  pgm.createSequence('evaluation_configuration_reference_sequence');
  pgm.createSequence('model_snapshot_reference_sequence');

  pgm.createTable('benchmark_versions', {
    id: { type: 'bigserial', primaryKey: true },
    benchmark_id: {
      type: 'bigint',
      notNull: true,
      references: 'benchmarks',
      onDelete: 'RESTRICT',
    },
    version_label: { type: 'text' },
    variant_name: { type: 'text' },
    canonical_reference: { type: 'text', notNull: true, unique: true },
    status: { type: 'text', notNull: true, default: 'ACTIVE' },
    release_date: { type: 'date' },
    notes: { type: 'text' },
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
  pgm.addConstraint('benchmark_versions', 'benchmark_versions_status_check', {
    check: STATUS_CHECK,
  });
  pgm.createIndex('benchmark_versions', 'benchmark_id');
  pgm.sql(
    'CREATE INDEX benchmark_versions_display_lower_idx ON benchmark_versions (lower(coalesce(variant_name, version_label)))',
  );

  pgm.createTable('evaluation_configurations', {
    id: { type: 'bigserial', primaryKey: true },
    configuration_reference: {
      type: 'text',
      notNull: true,
      unique: true,
      default: pgm.func(
        "'CFG-' || lpad(nextval('evaluation_configuration_reference_sequence')::text, 6, '0')",
      ),
    },
    configuration_fingerprint: { type: 'text', notNull: true, unique: true },
    is_unspecified: { type: 'boolean', notNull: true, default: false },
    shots: { type: 'integer' },
    reasoning_mode: { type: 'text' },
    reasoning_effort: { type: 'text' },
    pass_count: { type: 'integer' },
    agent_scaffold: { type: 'text' },
    evaluation_harness: { type: 'text' },
    temperature: { type: 'numeric' },
    top_p: { type: 'numeric' },
    max_output_tokens: { type: 'integer' },
    system_prompt_description: { type: 'text' },
    additional_configuration: { type: 'jsonb', notNull: true, default: '{}' },
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
    'evaluation_configurations',
    'evaluation_configurations_shots_check',
    { check: 'shots IS NULL OR shots >= 0' },
  );
  pgm.addConstraint(
    'evaluation_configurations',
    'evaluation_configurations_pass_count_check',
    { check: 'pass_count IS NULL OR pass_count > 0' },
  );
  pgm.addConstraint(
    'evaluation_configurations',
    'evaluation_configurations_max_tokens_check',
    { check: 'max_output_tokens IS NULL OR max_output_tokens > 0' },
  );
  pgm.sql(
    'CREATE UNIQUE INDEX evaluation_configurations_unspecified_unique ON evaluation_configurations (is_unspecified) WHERE is_unspecified',
  );
  pgm.sql(
    `INSERT INTO evaluation_configurations (configuration_fingerprint, is_unspecified, additional_configuration) VALUES ('${unspecifiedFingerprint}', true, '{}'::jsonb)`,
  );

  pgm.createTable('model_snapshots', {
    id: { type: 'bigserial', primaryKey: true },
    model_id: {
      type: 'bigint',
      notNull: true,
      references: 'models',
      onDelete: 'RESTRICT',
    },
    snapshot_reference: {
      type: 'text',
      notNull: true,
      unique: true,
      default: pgm.func(
        "'SNP-' || lpad(nextval('model_snapshot_reference_sequence')::text, 6, '0')",
      ),
    },
    provider_model_identifier: { type: 'text' },
    snapshot_label: { type: 'text' },
    snapshot_date: { type: 'date' },
    status: { type: 'text', notNull: true, default: 'ACTIVE' },
    notes: { type: 'text' },
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
  pgm.addConstraint('model_snapshots', 'model_snapshots_status_check', {
    check: STATUS_CHECK,
  });
  pgm.createIndex('model_snapshots', 'model_id');
  pgm.sql(
    'CREATE INDEX model_snapshots_provider_identifier_idx ON model_snapshots (provider_model_identifier) WHERE provider_model_identifier IS NOT NULL',
  );

  pgm.createTable('evaluators', {
    id: { type: 'bigserial', primaryKey: true },
    slug: { type: 'text', notNull: true, unique: true },
    name: { type: 'text', notNull: true },
    evaluator_type: { type: 'text', notNull: true },
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
  pgm.addConstraint('evaluators', 'evaluators_type_check', {
    check: EVALUATOR_TYPE_CHECK,
  });
  pgm.sql(
    "INSERT INTO evaluators (slug, name, evaluator_type) VALUES ('unknown', 'Unknown', 'UNKNOWN')",
  );

  pgm.addColumns('benchmark_records', {
    benchmark_version_id: {
      type: 'bigint',
      references: 'benchmark_versions',
      onDelete: 'RESTRICT',
    },
    evaluation_configuration_id: {
      type: 'bigint',
      references: 'evaluation_configurations',
      onDelete: 'RESTRICT',
    },
    model_snapshot_id: {
      type: 'bigint',
      references: 'model_snapshots',
      onDelete: 'RESTRICT',
    },
    evaluator_id: {
      type: 'bigint',
      references: 'evaluators',
      onDelete: 'RESTRICT',
    },
    reported_date: { type: 'date' },
  });

  // Existing benchmark.version values are preserved as explicit labels. No
  // absent version, variant, or date is inferred during this data migration.
  pgm.sql(`
    INSERT INTO benchmark_versions
      (benchmark_id, version_label, variant_name, canonical_reference, status)
    SELECT id, version, NULL, slug || '/default', status
    FROM benchmarks
  `);
  pgm.sql(`
    UPDATE benchmark_records AS record
    SET benchmark_version_id = version.id,
        evaluation_configuration_id = configuration.id,
        evaluator_id = evaluator.id
    FROM benchmark_versions AS version,
         evaluation_configurations AS configuration,
         evaluators AS evaluator
    WHERE version.benchmark_id = record.benchmark_id
      AND version.canonical_reference = (SELECT slug || '/default' FROM benchmarks WHERE id = record.benchmark_id)
      AND configuration.is_unspecified = true
      AND evaluator.slug = 'unknown'
  `);
  pgm.alterColumn('benchmark_records', 'benchmark_version_id', {
    notNull: true,
  });
  pgm.alterColumn('benchmark_records', 'evaluation_configuration_id', {
    notNull: true,
  });
  pgm.alterColumn('benchmark_records', 'evaluator_id', { notNull: true });
  pgm.createIndex('benchmark_records', 'benchmark_version_id');
  pgm.createIndex('benchmark_records', 'evaluation_configuration_id');
  pgm.createIndex('benchmark_records', 'model_snapshot_id');
  pgm.createIndex('benchmark_records', 'evaluator_id');

  pgm.createTable('benchmark_record_sources', {
    benchmark_record_id: {
      type: 'bigint',
      notNull: true,
      references: 'benchmark_records',
      onDelete: 'CASCADE',
    },
    source_id: {
      type: 'bigint',
      notNull: true,
      references: 'sources',
      onDelete: 'RESTRICT',
    },
    source_role: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.addConstraint(
    'benchmark_record_sources',
    'benchmark_record_sources_primary_key',
    { primaryKey: ['benchmark_record_id', 'source_id', 'source_role'] },
  );
  pgm.addConstraint(
    'benchmark_record_sources',
    'benchmark_record_sources_role_check',
    { check: SOURCE_ROLE_CHECK },
  );
  pgm.createIndex('benchmark_record_sources', 'benchmark_record_id');
  pgm.createIndex('benchmark_record_sources', 'source_id');
  pgm.sql(`
    INSERT INTO benchmark_record_sources (benchmark_record_id, source_id, source_role)
    SELECT id, source_id, 'PRIMARY' FROM benchmark_records
  `);
  pgm.sql(
    "CREATE UNIQUE INDEX benchmark_record_sources_one_primary_idx ON benchmark_record_sources (benchmark_record_id) WHERE source_role = 'PRIMARY'",
  );

  pgm.createTable('record_provenance_events', {
    id: { type: 'bigserial', primaryKey: true },
    benchmark_record_id: {
      type: 'bigint',
      notNull: true,
      references: 'benchmark_records',
      onDelete: 'CASCADE',
    },
    event_type: { type: 'text', notNull: true },
    source_id: {
      type: 'bigint',
      references: 'sources',
      onDelete: 'RESTRICT',
    },
    ingestion_candidate_id: {
      type: 'bigint',
      references: 'ingestion_candidates',
      onDelete: 'SET NULL',
    },
    details: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.addConstraint(
    'record_provenance_events',
    'record_provenance_events_type_check',
    { check: PROVENANCE_EVENT_CHECK },
  );
  pgm.createIndex('record_provenance_events', [
    'benchmark_record_id',
    'created_at',
    'id',
  ]);
  pgm.sql(`
    INSERT INTO record_provenance_events
      (benchmark_record_id, event_type, source_id, ingestion_candidate_id, created_at)
    SELECT record.id,
           CASE WHEN candidate.id IS NULL THEN 'CREATED_MANUALLY' ELSE 'CREATED_FROM_INGESTION' END,
           record.source_id,
           candidate.id,
           record.created_at
    FROM benchmark_records AS record
    LEFT JOIN ingestion_candidates AS candidate ON candidate.created_record_id = record.id
  `);

  pgm.addColumns('ingestion_candidates', {
    benchmark_version_text: { type: 'text' },
    proposed_benchmark_version_reference: { type: 'text' },
    configuration_proposal: { type: 'jsonb' },
    proposed_configuration_reference: { type: 'text' },
    provider_model_identifier: { type: 'text' },
    snapshot_date: { type: 'date' },
    proposed_snapshot_reference: { type: 'text' },
    evaluator_text: { type: 'text' },
    proposed_evaluator_slug: { type: 'text' },
    reported_date: { type: 'date' },
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumns('ingestion_candidates', [
    'benchmark_version_text',
    'proposed_benchmark_version_reference',
    'configuration_proposal',
    'proposed_configuration_reference',
    'provider_model_identifier',
    'snapshot_date',
    'proposed_snapshot_reference',
    'evaluator_text',
    'proposed_evaluator_slug',
    'reported_date',
  ]);
  pgm.dropTable('record_provenance_events');
  pgm.dropTable('benchmark_record_sources');
  pgm.dropColumns('benchmark_records', [
    'benchmark_version_id',
    'evaluation_configuration_id',
    'model_snapshot_id',
    'evaluator_id',
    'reported_date',
  ]);
  pgm.dropTable('evaluators');
  pgm.dropTable('model_snapshots');
  pgm.dropTable('evaluation_configurations');
  pgm.dropTable('benchmark_versions');
  pgm.dropSequence('model_snapshot_reference_sequence');
  pgm.dropSequence('evaluation_configuration_reference_sequence');
}
