import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(
    'CREATE INDEX models_official_name_lower_idx ON models (lower(official_name))',
  );
  pgm.sql('CREATE INDEX benchmarks_name_lower_idx ON benchmarks (lower(name))');
  pgm.sql(
    'CREATE INDEX organizations_name_lower_idx ON organizations (lower(name))',
  );
  pgm.sql('CREATE INDEX metrics_name_lower_idx ON metrics (lower(name))');
  pgm.createIndex('benchmark_records', 'status');
  pgm.sql(
    "CREATE INDEX benchmark_records_active_recent_idx ON benchmark_records (created_at DESC, record_id ASC) WHERE status = 'ACTIVE'",
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql('DROP INDEX benchmark_records_active_recent_idx');
  pgm.dropIndex('benchmark_records', 'status');
  pgm.sql('DROP INDEX metrics_name_lower_idx');
  pgm.sql('DROP INDEX organizations_name_lower_idx');
  pgm.sql('DROP INDEX benchmarks_name_lower_idx');
  pgm.sql('DROP INDEX models_official_name_lower_idx');
}
