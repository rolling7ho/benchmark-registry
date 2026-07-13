import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('registry_metadata', {
    key: {
      type: 'text',
      primaryKey: true,
    },
    value: {
      type: 'text',
      notNull: true,
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('registry_metadata');
}
