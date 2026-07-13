import type { MigrationBuilder } from 'node-pg-migrate';

const FEEDBACK_TYPE_CHECK =
  "type IN ('incorrect-record', 'missing-record', 'search-issue', 'other')";
const FEEDBACK_STATUS_CHECK = "status IN ('open', 'resolved', 'dismissed')";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('feedback_submissions', {
    id: { type: 'bigserial', primaryKey: true },
    type: { type: 'text', notNull: true },
    record_identifier: { type: 'text' },
    message: { type: 'text', notNull: true },
    source_url: { type: 'text' },
    email: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'open' },
    submission_token: { type: 'uuid', notNull: true, unique: true },
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

  pgm.addConstraint('feedback_submissions', 'feedback_submissions_type_check', {
    check: FEEDBACK_TYPE_CHECK,
  });
  pgm.addConstraint(
    'feedback_submissions',
    'feedback_submissions_status_check',
    { check: FEEDBACK_STATUS_CHECK },
  );
  pgm.addConstraint(
    'feedback_submissions',
    'feedback_submissions_message_check',
    {
      check: "char_length(message) BETWEEN 1 AND 4000 AND btrim(message) <> ''",
    },
  );
  pgm.addConstraint(
    'feedback_submissions',
    'feedback_submissions_record_identifier_check',
    {
      check:
        "record_identifier IS NULL OR (char_length(record_identifier) <= 64 AND record_identifier ~ '^BR-[A-Z0-9]+-[0-9]{3}$')",
    },
  );
  pgm.addConstraint(
    'feedback_submissions',
    'feedback_submissions_source_url_check',
    {
      check:
        "source_url IS NULL OR (char_length(source_url) <= 2048 AND source_url ~ '^https?://')",
    },
  );
  pgm.addConstraint(
    'feedback_submissions',
    'feedback_submissions_email_check',
    { check: 'email IS NULL OR char_length(email) <= 254' },
  );
  pgm.createIndex('feedback_submissions', ['status', 'created_at']);
  pgm.createIndex('feedback_submissions', 'type');

  // Supabase's anonymous and authenticated API roles receive no direct table
  // privileges or RLS policies. Public submission and administrator review are
  // deliberately mediated by the server-side application connection.
  pgm.sql('ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY');
  pgm.sql('REVOKE ALL ON feedback_submissions FROM PUBLIC');
  pgm.sql('REVOKE ALL ON SEQUENCE feedback_submissions_id_seq FROM PUBLIC');
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON feedback_submissions FROM anon';
        EXECUTE 'REVOKE ALL ON SEQUENCE feedback_submissions_id_seq FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON feedback_submissions FROM authenticated';
        EXECUTE 'REVOKE ALL ON SEQUENCE feedback_submissions_id_seq FROM authenticated';
      END IF;
    END
    $$
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('feedback_submissions');
}
