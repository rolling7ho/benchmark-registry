import type { MigrationBuilder } from 'node-pg-migrate';

interface ModelIdentityCorrection {
  canonicalModelId: string;
  duplicateModelId: string;
  legacyRecordPrefix: string;
}

const CORRECTIONS: readonly ModelIdentityCorrection[] = [
  {
    canonicalModelId: 'COHR-APLUS',
    duplicateModelId: 'COHR-COMMANDAPLUS',
    legacyRecordPrefix: 'BR-014COMMANDAPLUS',
  },
  {
    canonicalModelId: 'MMAX-M3',
    duplicateModelId: 'MMAX-MINIMAXM3',
    legacyRecordPrefix: 'BR-012MINIMAXM3',
  },
  {
    canonicalModelId: 'META-MS11',
    duplicateModelId: 'META-MUSESPARK11',
    legacyRecordPrefix: 'BR-009MUSESPARK11',
  },
] as const;

function normalizedAlias(value: string): string {
  return value.toLowerCase();
}

function compactAlias(value: string): string {
  return normalizedAlias(value).replace(/[\s._-]/g, '');
}

export function up(pgm: MigrationBuilder): void {
  // A record sequence is unique within the prefix under which it was
  // allocated, not necessarily within the canonical model to which its
  // evaluation context is later attributed. record_id remains globally
  // unique and immutable.
  pgm.dropConstraint(
    'benchmark_records',
    'benchmark_records_model_sequence_unique',
  );

  for (const correction of CORRECTIONS) {
    const { canonicalModelId, duplicateModelId, legacyRecordPrefix } =
      correction;

    pgm.sql(`
      INSERT INTO record_provenance_events
        (benchmark_record_id, event_type, details)
      SELECT record.id,
             'CORRECTION_NOTED',
             jsonb_build_object(
               'correction', 'CANONICAL_MODEL_IDENTITY_MERGE',
               'previous_model_identifier', '${duplicateModelId}',
               'canonical_model_identifier', '${canonicalModelId}',
               'published_record_identifier_preserved', true
             )
      FROM benchmark_records AS record
      INNER JOIN models AS duplicate_model
        ON duplicate_model.id = record.model_id
       AND duplicate_model.model_id = '${duplicateModelId}'
      INNER JOIN models AS canonical_model
        ON canonical_model.model_id = '${canonicalModelId}'
    `);

    pgm.sql(`
      UPDATE benchmark_records AS record
      SET model_id = canonical_model.id,
          updated_at = current_timestamp
      FROM models AS duplicate_model,
           models AS canonical_model
      WHERE duplicate_model.model_id = '${duplicateModelId}'
        AND canonical_model.model_id = '${canonicalModelId}'
        AND record.model_id = duplicate_model.id
    `);

    pgm.sql(`
      UPDATE model_snapshots AS snapshot
      SET model_id = canonical_model.id,
          updated_at = current_timestamp
      FROM models AS duplicate_model,
           models AS canonical_model
      WHERE duplicate_model.model_id = '${duplicateModelId}'
        AND canonical_model.model_id = '${canonicalModelId}'
        AND snapshot.model_id = duplicate_model.id
    `);

    pgm.sql(`
      INSERT INTO model_aliases
        (model_id, alias, normalized_alias, compact_alias, alias_type)
      SELECT canonical_model.id,
             '${duplicateModelId}',
             '${normalizedAlias(duplicateModelId)}',
             '${compactAlias(duplicateModelId)}',
             'LEGACY_MODEL_ID'
      FROM models AS canonical_model
      WHERE canonical_model.model_id = '${canonicalModelId}'
        AND EXISTS (
          SELECT 1 FROM models AS duplicate_model
          WHERE duplicate_model.model_id = '${duplicateModelId}'
        )
      ON CONFLICT (model_id, alias) DO NOTHING
    `);

    pgm.sql(`
      INSERT INTO model_aliases
        (model_id, alias, normalized_alias, compact_alias, alias_type)
      SELECT canonical_model.id,
             '${legacyRecordPrefix}',
             '${normalizedAlias(legacyRecordPrefix)}',
             '${compactAlias(legacyRecordPrefix)}',
             'LEGACY_RECORD_PREFIX'
      FROM models AS canonical_model
      WHERE canonical_model.model_id = '${canonicalModelId}'
        AND EXISTS (
          SELECT 1 FROM models AS duplicate_model
          WHERE duplicate_model.model_id = '${duplicateModelId}'
        )
      ON CONFLICT (model_id, alias) DO NOTHING
    `);

    pgm.sql(`
      UPDATE ingestion_candidates
      SET proposed_model_id = '${canonicalModelId}',
          updated_at = current_timestamp
      WHERE proposed_model_id = '${duplicateModelId}'
    `);

    pgm.sql(`
      UPDATE models AS canonical_model
      SET release_date = coalesce(
            canonical_model.release_date,
            duplicate_model.release_date
          ),
          updated_at = current_timestamp
      FROM models AS duplicate_model
      WHERE canonical_model.model_id = '${canonicalModelId}'
        AND duplicate_model.model_id = '${duplicateModelId}'
    `);

    pgm.sql(`
      DELETE FROM models
      WHERE model_id = '${duplicateModelId}'
        AND EXISTS (
          SELECT 1 FROM models AS canonical_model
          WHERE canonical_model.model_id = '${canonicalModelId}'
        )
    `);
  }

  pgm.sql(`
    UPDATE registry_metadata
    SET value = current_timestamp::text,
        updated_at = current_timestamp
    WHERE key = 'last_database_update'
  `);
}

export function down(): void {
  throw new Error(
    'Canonical model identity corrections are intentionally irreversible; restore from a reviewed backup instead.',
  );
}
