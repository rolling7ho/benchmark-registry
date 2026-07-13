import type { MigrationBuilder } from 'node-pg-migrate';

const REGISTRY_TABLES = [
  'benchmark_aliases',
  'benchmark_record_sources',
  'benchmark_records',
  'benchmark_versions',
  'benchmarks',
  'evaluation_configurations',
  'evaluators',
  'feedback_submissions',
  'ingestion_candidates',
  'ingestion_jobs',
  'metrics',
  'model_aliases',
  'model_snapshots',
  'models',
  'organizations',
  'record_provenance_events',
  'registry_metadata',
  'sources',
] as const;

function setRowLevelSecurity(
  pgm: MigrationBuilder,
  action: 'ENABLE' | 'DISABLE',
): void {
  for (const table of REGISTRY_TABLES) {
    pgm.sql(`ALTER TABLE ${table} ${action} ROW LEVEL SECURITY`);
  }
}

function changeSupabasePrivileges(
  pgm: MigrationBuilder,
  action: 'GRANT' | 'REVOKE',
): void {
  for (const role of ['anon', 'authenticated']) {
    const statements =
      action === 'REVOKE'
        ? [
            `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`,
            `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${role}`,
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM ${role}`,
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM ${role}`,
          ]
        : [
            `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${role}`,
            `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ${role}`,
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO ${role}`,
          ];
    pgm.sql(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
          ${statements.map((statement) => `EXECUTE '${statement}';`).join('\n          ')}
        END IF;
      END
      $$
    `);
  }
}

export function up(pgm: MigrationBuilder): void {
  setRowLevelSecurity(pgm, 'ENABLE');
  changeSupabasePrivileges(pgm, 'REVOKE');
}

export function down(pgm: MigrationBuilder): void {
  setRowLevelSecurity(pgm, 'DISABLE');
  changeSupabasePrivileges(pgm, 'GRANT');
}
