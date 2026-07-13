import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.dropConstraint(
    'benchmark_records',
    'benchmark_records_score_value_positive_check',
  );
}

export function down(pgm: MigrationBuilder): void {
  // NOT VALID preserves any zero or negative historical measurements already
  // published while restoring the former rule for subsequent writes.
  pgm.sql(`
    ALTER TABLE benchmark_records
    ADD CONSTRAINT benchmark_records_score_value_positive_check
    CHECK (score_value IS NULL OR score_value > 0) NOT VALID
  `);
}
