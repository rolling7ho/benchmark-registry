import type { MigrationBuilder } from 'node-pg-migrate';

import { SOURCE_TYPES } from '../src/db/constants.js';

const SOURCE_TYPE_CHECK = `source_type IN (${SOURCE_TYPES.map((value) => `'${value}'`).join(', ')})`;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('benchmark_records', {
    superseded_by_record_id: { type: 'bigint' },
  });
  pgm.addConstraint(
    'benchmark_records',
    'benchmark_records_superseded_by_record_fk',
    {
      foreignKeys: {
        columns: 'superseded_by_record_id',
        references: 'benchmark_records(id)',
        onDelete: 'RESTRICT',
      },
    },
  );
  pgm.addConstraint(
    'benchmark_records',
    'benchmark_records_not_self_superseded_check',
    {
      check: 'superseded_by_record_id IS NULL OR superseded_by_record_id <> id',
    },
  );
  pgm.createIndex('benchmark_records', 'superseded_by_record_id');
  // New writes are constrained without assigning meanings to legacy values.
  // The read-only validator reports legacy rows for explicit operator review.
  pgm.sql(
    `ALTER TABLE sources ADD CONSTRAINT sources_source_type_check CHECK (${SOURCE_TYPE_CHECK}) NOT VALID`,
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropConstraint('sources', 'sources_source_type_check');
  pgm.dropIndex('benchmark_records', 'superseded_by_record_id');
  pgm.dropConstraint(
    'benchmark_records',
    'benchmark_records_not_self_superseded_check',
  );
  pgm.dropConstraint(
    'benchmark_records',
    'benchmark_records_superseded_by_record_fk',
  );
  pgm.dropColumn('benchmark_records', 'superseded_by_record_id');
}
