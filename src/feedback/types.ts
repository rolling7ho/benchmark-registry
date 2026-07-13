export const FEEDBACK_TYPES = [
  'incorrect-record',
  'missing-record',
  'search-issue',
  'other',
] as const;

export const FEEDBACK_STATUSES = ['open', 'resolved', 'dismissed'] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  'incorrect-record': 'Incorrect record',
  'missing-record': 'Missing record',
  'search-issue': 'Search issue',
  other: 'Other',
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export interface NewFeedbackSubmission {
  type: FeedbackType;
  recordIdentifier: string | null;
  message: string;
  sourceUrl: string | null;
  email: string | null;
  submissionToken: string;
}

export interface FeedbackSubmission {
  id: string;
  type: FeedbackType;
  recordIdentifier: string | null;
  message: string;
  sourceUrl: string | null;
  email: string | null;
  status: FeedbackStatus;
  recordExists: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeedbackFilters {
  status?: FeedbackStatus;
  type?: FeedbackType;
}

export interface FeedbackStore {
  create(submission: NewFeedbackSubmission): Promise<void>;
  list(filters: FeedbackFilters): Promise<FeedbackSubmission[]>;
  get(id: string): Promise<FeedbackSubmission | undefined>;
  updateStatus(id: string, status: FeedbackStatus): Promise<boolean>;
}
