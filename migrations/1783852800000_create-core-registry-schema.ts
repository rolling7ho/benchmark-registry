import type { MigrationBuilder } from 'node-pg-migrate';

const STATUS_CHECK =
  "status IN ('ACTIVE', 'WITHDRAWN', 'SUPERSEDED', 'ERRONEOUS', 'ARCHIVED')";
const REPORT_TYPE_CHECK =
  "report_type IN ('PROVIDER', 'INDEPENDENT', 'BENCHMARK_OWNER', 'REPRODUCED', 'UNKNOWN')";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('organizations', {
    id: { type: 'bigserial', primaryKey: true },
    slug: { type: 'text', notNull: true, unique: true },
    name: { type: 'text', notNull: true },
    provider_prefix: { type: 'text', notNull: true, unique: true },
    br_namespace: { type: 'char(3)', notNull: true, unique: true },
    identifier_strategy: { type: 'text', notNull: true },
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

  pgm.createTable('models', {
    id: { type: 'bigserial', primaryKey: true },
    model_id: { type: 'text', notNull: true, unique: true },
    organization_id: {
      type: 'bigint',
      notNull: true,
      references: 'organizations',
      onDelete: 'RESTRICT',
    },
    official_name: { type: 'text', notNull: true },
    family: { type: 'text' },
    model_number: { type: 'text' },
    tier_code: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'ACTIVE' },
    release_date: { type: 'date' },
    record_prefix: { type: 'text', notNull: true, unique: true },
    next_record_sequence: { type: 'integer', notNull: true, default: 1 },
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
  pgm.addConstraint('models', 'models_status_check', { check: STATUS_CHECK });
  pgm.addConstraint('models', 'models_next_record_sequence_check', {
    check: 'next_record_sequence > 0',
  });

  pgm.createTable('model_aliases', {
    id: { type: 'bigserial', primaryKey: true },
    model_id: {
      type: 'bigint',
      notNull: true,
      references: 'models',
      onDelete: 'CASCADE',
    },
    alias: { type: 'text', notNull: true },
    normalized_alias: { type: 'text', notNull: true },
    compact_alias: { type: 'text' },
    alias_type: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.addConstraint('model_aliases', 'model_aliases_model_alias_unique', {
    unique: ['model_id', 'alias'],
  });
  pgm.createIndex('model_aliases', 'normalized_alias');
  pgm.createIndex('model_aliases', 'compact_alias');

  pgm.createTable('benchmarks', {
    id: { type: 'bigserial', primaryKey: true },
    slug: { type: 'text', notNull: true, unique: true },
    name: { type: 'text', notNull: true },
    organization_name: { type: 'text' },
    version: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'ACTIVE' },
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
  pgm.addConstraint('benchmarks', 'benchmarks_status_check', {
    check: STATUS_CHECK,
  });

  pgm.createTable('metrics', {
    id: { type: 'bigserial', primaryKey: true },
    slug: { type: 'text', notNull: true, unique: true },
    name: { type: 'text', notNull: true },
    unit: { type: 'text' },
    higher_is_better: { type: 'boolean' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createTable('sources', {
    id: { type: 'bigserial', primaryKey: true },
    url: { type: 'text', notNull: true, unique: true },
    title: { type: 'text' },
    source_type: { type: 'text', notNull: true },
    publisher: { type: 'text' },
    published_date: { type: 'date' },
    accessed_at: { type: 'timestamptz', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createTable('benchmark_records', {
    id: { type: 'bigserial', primaryKey: true },
    record_id: { type: 'text', notNull: true, unique: true },
    model_id: {
      type: 'bigint',
      notNull: true,
      references: 'models',
      onDelete: 'RESTRICT',
    },
    benchmark_id: {
      type: 'bigint',
      notNull: true,
      references: 'benchmarks',
      onDelete: 'RESTRICT',
    },
    metric_id: {
      type: 'bigint',
      notNull: true,
      references: 'metrics',
      onDelete: 'RESTRICT',
    },
    source_id: {
      type: 'bigint',
      notNull: true,
      references: 'sources',
      onDelete: 'RESTRICT',
    },
    score_value: { type: 'numeric' },
    score_display: { type: 'text', notNull: true },
    evaluation_date: { type: 'date' },
    report_type: { type: 'text', notNull: true, default: 'UNKNOWN' },
    status: { type: 'text', notNull: true, default: 'ACTIVE' },
    sequence_number: { type: 'integer', notNull: true },
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
  pgm.addConstraint('benchmark_records', 'benchmark_records_status_check', {
    check: STATUS_CHECK,
  });
  pgm.addConstraint(
    'benchmark_records',
    'benchmark_records_report_type_check',
    { check: REPORT_TYPE_CHECK },
  );
  pgm.addConstraint(
    'benchmark_records',
    'benchmark_records_sequence_positive_check',
    { check: 'sequence_number > 0 AND sequence_number <= 999' },
  );
  pgm.addConstraint(
    'benchmark_records',
    'benchmark_records_score_value_positive_check',
    { check: 'score_value IS NULL OR score_value > 0' },
  );
  pgm.addConstraint(
    'benchmark_records',
    'benchmark_records_model_sequence_unique',
    { unique: ['model_id', 'sequence_number'] },
  );
  pgm.createIndex('benchmark_records', 'model_id');
  pgm.createIndex('benchmark_records', 'benchmark_id');
  pgm.createIndex('benchmark_records', 'metric_id');
  pgm.createIndex('benchmark_records', 'evaluation_date');
  pgm.createIndex('benchmark_records', 'created_at');
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('benchmark_records');
  pgm.dropTable('sources');
  pgm.dropTable('metrics');
  pgm.dropTable('benchmarks');
  pgm.dropTable('model_aliases');
  pgm.dropTable('models');
  pgm.dropTable('organizations');
}
