import { z } from 'zod';

import { validateRecordPrefix } from '../identifiers/record-prefix.js';
import { FEEDBACK_STATUSES, FEEDBACK_TYPES } from './types.js';

export const FEEDBACK_MESSAGE_MAX_LENGTH = 4000;
export const FEEDBACK_RECORD_MAX_LENGTH = 64;
export const FEEDBACK_URL_MAX_LENGTH = 2048;
export const FEEDBACK_EMAIL_MAX_LENGTH = 254;

function optionalTrimmed(maximum: number): z.ZodType<string | undefined> {
  return z
    .string()
    .max(maximum)
    .transform((value) => value.trim() || undefined);
}

export function normalizeRecordIdentifier(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  if (normalized === '') return undefined;
  if (normalized.length > FEEDBACK_RECORD_MAX_LENGTH) return undefined;

  const match = /^(.*)-(\d{3})$/.exec(normalized);
  if (match === null || match[1] === undefined) return undefined;
  const sequence = Number(match[2]);
  if (sequence < 1 || sequence > 999) return undefined;

  try {
    validateRecordPrefix(match[1]);
    return normalized;
  } catch {
    return undefined;
  }
}

const sourceUrlSchema = optionalTrimmed(FEEDBACK_URL_MAX_LENGTH).refine(
  (value) => {
    if (value === undefined) return true;
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        url.username === '' &&
        url.password === ''
      );
    } catch {
      return false;
    }
  },
  { message: 'Invalid supporting source URL' },
);

const emailSchema = optionalTrimmed(FEEDBACK_EMAIL_MAX_LENGTH).refine(
  (value) => value === undefined || z.email().safeParse(value).success,
  { message: 'Invalid email address' },
);

export const feedbackFormSchema = z
  .object({
    type: z.enum(FEEDBACK_TYPES),
    record_identifier: optionalTrimmed(FEEDBACK_RECORD_MAX_LENGTH).refine(
      (value) =>
        value === undefined || normalizeRecordIdentifier(value) !== undefined,
      { message: 'Invalid Benchmark Record Identifier' },
    ),
    message: z
      .string()
      .max(FEEDBACK_MESSAGE_MAX_LENGTH)
      .transform((value) => value.trim())
      .refine((value) => value.length > 0, { message: 'Message is required' }),
    source_url: sourceUrlSchema,
    email: emailSchema,
    submission_token: z.uuid(),
    website: z.string().max(200).default(''),
  })
  .strict()
  .transform((value) => ({
    type: value.type,
    recordIdentifier:
      value.record_identifier === undefined
        ? null
        : (normalizeRecordIdentifier(value.record_identifier) ?? null),
    message: value.message,
    sourceUrl: value.source_url ?? null,
    email: value.email?.toLowerCase() ?? null,
    submissionToken: value.submission_token,
    honeypotFilled: value.website.trim() !== '',
  }));

export const feedbackStatusSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES),
});
