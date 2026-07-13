import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('request_rate_limits', {
    scope: { type: 'text', notNull: true },
    fingerprint: { type: 'char(64)', notNull: true },
    window_started_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    request_count: { type: 'integer', notNull: true, default: 1 },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.addConstraint('request_rate_limits', 'request_rate_limits_primary_key', {
    primaryKey: ['scope', 'fingerprint'],
  });
  pgm.addConstraint(
    'request_rate_limits',
    'request_rate_limits_count_positive_check',
    { check: 'request_count > 0' },
  );
  pgm.createIndex('request_rate_limits', 'updated_at');
  pgm.sql('ALTER TABLE request_rate_limits ENABLE ROW LEVEL SECURITY');

  for (const role of ['anon', 'authenticated']) {
    pgm.sql(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
          EXECUTE 'REVOKE ALL PRIVILEGES ON request_rate_limits FROM ${role}';
        END IF;
      END
      $$
    `);
  }
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('request_rate_limits');
}
