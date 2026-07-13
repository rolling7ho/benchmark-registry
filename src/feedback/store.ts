import type { Database } from '../db/database.js';
import type {
  FeedbackFilters,
  FeedbackStatus,
  FeedbackStore,
  FeedbackSubmission,
  NewFeedbackSubmission,
} from './types.js';

function toFeedbackSubmission(row: {
  id: string;
  type: FeedbackSubmission['type'];
  record_identifier: string | null;
  message: string;
  source_url: string | null;
  email: string | null;
  status: FeedbackStatus;
  record_exists: boolean;
  created_at: Date;
  updated_at: Date;
}): FeedbackSubmission {
  return {
    id: row.id,
    type: row.type,
    recordIdentifier: row.record_identifier,
    message: row.message,
    sourceUrl: row.source_url,
    email: row.email,
    status: row.status,
    recordExists: row.record_exists,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createFeedbackStore(database: Database): FeedbackStore {
  const baseSelection = [
    'feedback_submissions.id',
    'feedback_submissions.type',
    'feedback_submissions.record_identifier',
    'feedback_submissions.message',
    'feedback_submissions.source_url',
    'feedback_submissions.email',
    'feedback_submissions.status',
    'feedback_submissions.created_at',
    'feedback_submissions.updated_at',
  ] as const;

  return {
    async create(submission: NewFeedbackSubmission): Promise<void> {
      await database
        .insertInto('feedback_submissions')
        .values({
          type: submission.type,
          record_identifier: submission.recordIdentifier,
          message: submission.message,
          source_url: submission.sourceUrl,
          email: submission.email,
          submission_token: submission.submissionToken,
        })
        .onConflict((conflict) =>
          conflict.column('submission_token').doNothing(),
        )
        .execute();
    },

    async list(filters: FeedbackFilters): Promise<FeedbackSubmission[]> {
      let query = database
        .selectFrom('feedback_submissions')
        .leftJoin(
          'benchmark_records',
          'benchmark_records.record_id',
          'feedback_submissions.record_identifier',
        )
        .select(baseSelection)
        .select((expression) =>
          expression
            .case()
            .when('benchmark_records.id', 'is not', null)
            .then(true)
            .else(false)
            .end()
            .as('record_exists'),
        );
      if (filters.status !== undefined) {
        query = query.where('feedback_submissions.status', '=', filters.status);
      }
      if (filters.type !== undefined) {
        query = query.where('feedback_submissions.type', '=', filters.type);
      }
      return (
        await query.orderBy('feedback_submissions.created_at', 'desc').execute()
      ).map(toFeedbackSubmission);
    },

    async get(id: string): Promise<FeedbackSubmission | undefined> {
      const row = await database
        .selectFrom('feedback_submissions')
        .leftJoin(
          'benchmark_records',
          'benchmark_records.record_id',
          'feedback_submissions.record_identifier',
        )
        .select(baseSelection)
        .select((expression) =>
          expression
            .case()
            .when('benchmark_records.id', 'is not', null)
            .then(true)
            .else(false)
            .end()
            .as('record_exists'),
        )
        .where('feedback_submissions.id', '=', id)
        .executeTakeFirst();
      return row === undefined ? undefined : toFeedbackSubmission(row);
    },

    async updateStatus(id: string, status: FeedbackStatus): Promise<boolean> {
      const result = await database
        .updateTable('feedback_submissions')
        .set({ status, updated_at: new Date() })
        .where('id', '=', id)
        .executeTakeFirst();
      return result.numUpdatedRows === 1n;
    },
  };
}
