import { randomUUID } from 'node:crypto';

import type { FastifyPluginCallback, FastifyReply } from 'fastify';

import type { AdminAuthConfig } from '../admin/auth.js';
import { requireAdmin } from '../admin/require-admin.js';
import type { FeedbackStore } from '../feedback/types.js';
import {
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABELS,
  type FeedbackStatus,
  type FeedbackType,
} from '../feedback/types.js';
import {
  feedbackFormSchema,
  feedbackStatusSchema,
  normalizeRecordIdentifier,
} from '../feedback/validation.js';
import type { RequestRateLimiter } from '../security/request-rate-limit.js';
import { hasSameOrigin } from '../web/same-origin.js';
import { createPageSeo } from '../web/seo.js';
import type { SeoRoutePolicy } from '../web/seo.js';

interface FeedbackRouteOptions {
  store: FeedbackStore | undefined;
  adminAuth: AdminAuthConfig | undefined;
  requestRateLimiter: RequestRateLimiter | undefined;
}

interface FeedbackQuery {
  record?: string;
  type?: string;
  submitted?: string;
}

interface AdminFeedbackQuery {
  status?: string;
  type?: string;
}

type FormBody = Record<string, unknown>;

const FEEDBACK_DESCRIPTION =
  'Report an incorrect benchmark record, missing result, search issue, or other problem with Benchmark Registry.';

function formString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function publicFormValues(query: FeedbackQuery): {
  type: FeedbackType;
  recordIdentifier: string;
  message: string;
  sourceUrl: string;
  email: string;
} {
  const queryType = FEEDBACK_TYPES.find(
    (type) => type === formString(query.type),
  );
  const rawRecord = formString(query.record).trim().slice(0, 64);
  return {
    type: queryType ?? 'other',
    recordIdentifier: normalizeRecordIdentifier(rawRecord) ?? rawRecord,
    message: '',
    sourceUrl: '',
    email: '',
  };
}

function renderFeedbackForm(
  reply: FastifyReply,
  input: {
    values: ReturnType<typeof publicFormValues>;
    submitted: boolean;
    error: boolean;
    submissionToken: string;
    policy?: SeoRoutePolicy;
  },
): FastifyReply {
  return reply.view('feedback.eta', {
    title: 'Feedback and Corrections — Benchmark Registry',
    seo: createPageSeo({
      title: 'Feedback and Corrections | Benchmark Registry',
      description: FEEDBACK_DESCRIPTION,
      path: '/feedback',
      policy:
        input.policy ??
        (input.error || input.submitted ? 'NON_INDEXABLE' : 'INDEXABLE'),
    }),
    query: '',
    ...input,
    types: FEEDBACK_TYPES.map((value) => ({
      value,
      label: FEEDBACK_TYPE_LABELS[value],
    })),
  });
}

function parseStatus(value: string | undefined): FeedbackStatus | undefined {
  return FEEDBACK_STATUSES.find((status) => status === value);
}

function parseType(value: string | undefined): FeedbackType | undefined {
  return FEEDBACK_TYPES.find((type) => type === value);
}

function validSubmissionId(value: string): boolean {
  return /^\d+$/.test(value) && value.length <= 20;
}

const feedbackRoutes: FastifyPluginCallback<FeedbackRouteOptions> = (
  app,
  options,
  done,
) => {
  app.get<{ Querystring: FeedbackQuery }>('/feedback', (request, reply) =>
    renderFeedbackForm(reply, {
      values: publicFormValues(request.query),
      submitted: request.query.submitted === '1',
      error: false,
      submissionToken: randomUUID(),
      policy:
        Object.keys(request.query).length === 0 ? 'INDEXABLE' : 'NON_INDEXABLE',
    }),
  );

  app.post<{ Body: FormBody }>(
    '/feedback',
    { bodyLimit: 16_384 },
    async (request, reply) => {
      if (!hasSameOrigin(request)) {
        return renderFeedbackForm(reply.status(400), {
          values: publicFormValues({}),
          submitted: false,
          error: true,
          submissionToken: randomUUID(),
        });
      }
      const parsed = feedbackFormSchema.safeParse(request.body);
      if (!parsed.success) {
        const body = request.body;
        return renderFeedbackForm(reply.status(400), {
          values: {
            type: parseType(formString(body.type)) ?? 'other',
            recordIdentifier: formString(body.record_identifier).slice(0, 64),
            message: formString(body.message).slice(0, 4000),
            sourceUrl: formString(body.source_url).slice(0, 2048),
            email: formString(body.email).slice(0, 254),
          },
          submitted: false,
          error: true,
          submissionToken: randomUUID(),
        });
      }

      // A bot receives the same success response without learning that the
      // hidden field caused its submission to be discarded.
      if (!parsed.data.honeypotFilled) {
        if (
          options.store === undefined ||
          options.requestRateLimiter === undefined
        ) {
          return renderFeedbackForm(reply.status(503), {
            values: publicFormValues({}),
            submitted: false,
            error: true,
            submissionToken: randomUUID(),
          });
        }
        const rateLimit = await options.requestRateLimiter.consume(request, {
          scope: 'public-feedback',
          limit: 5,
          windowSeconds: 60 * 60,
        });
        if (!rateLimit.allowed) {
          reply.header('Retry-After', String(rateLimit.retryAfterSeconds));
          return renderFeedbackForm(reply.status(429), {
            values: publicFormValues({}),
            submitted: false,
            error: true,
            submissionToken: randomUUID(),
          });
        }
        await options.store.create(parsed.data);
      }
      return reply
        .status(303)
        .header('Location', '/feedback?submitted=1')
        .send();
    },
  );

  app.get<{ Querystring: AdminFeedbackQuery }>(
    '/admin/feedback',
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, options))) return reply;
      if (options.store === undefined) {
        return reply.status(503).send('Feedback storage is unavailable.');
      }
      const selectedStatus = parseStatus(request.query.status);
      const selectedType = parseType(request.query.type);
      const submissions = await options.store.list({
        ...(selectedStatus === undefined ? {} : { status: selectedStatus }),
        ...(selectedType === undefined ? {} : { type: selectedType }),
      });
      return reply.view('admin-feedback-list.eta', {
        title: 'Feedback — Benchmark Registry Administration',
        seo: createPageSeo({
          title: 'Feedback | Benchmark Registry Administration',
          description: 'Administrator feedback review queue.',
          policy: 'NON_INDEXABLE',
        }),
        query: '',
        submissions,
        selectedStatus: selectedStatus ?? '',
        selectedType: selectedType ?? '',
        statuses: FEEDBACK_STATUSES.map((value) => ({
          value,
          label: FEEDBACK_STATUS_LABELS[value],
        })),
        types: FEEDBACK_TYPES.map((value) => ({
          value,
          label: FEEDBACK_TYPE_LABELS[value],
        })),
        typeLabels: FEEDBACK_TYPE_LABELS,
        statusLabels: FEEDBACK_STATUS_LABELS,
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/admin/feedback/:id',
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, options))) return reply;
      if (!validSubmissionId(request.params.id)) {
        return reply.status(404).send('Feedback submission not found.');
      }
      const submission = await options.store?.get(request.params.id);
      if (submission === undefined) {
        return reply.status(404).send('Feedback submission not found.');
      }
      return reply.view('admin-feedback-detail.eta', {
        title: 'Feedback submission — Benchmark Registry Administration',
        seo: createPageSeo({
          title: 'Feedback submission | Benchmark Registry Administration',
          description: 'Administrator feedback submission review.',
          policy: 'NON_INDEXABLE',
        }),
        query: '',
        submission,
        statuses: FEEDBACK_STATUSES.map((value) => ({
          value,
          label: FEEDBACK_STATUS_LABELS[value],
        })),
        typeLabel: FEEDBACK_TYPE_LABELS[submission.type],
        statusLabel: FEEDBACK_STATUS_LABELS[submission.status],
      });
    },
  );

  app.post<{ Params: { id: string }; Body: FormBody }>(
    '/admin/feedback/:id/status',
    { bodyLimit: 2048 },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, options))) return reply;
      if (!hasSameOrigin(request)) {
        return reply.status(400).send('Unable to update feedback.');
      }
      if (!validSubmissionId(request.params.id)) {
        return reply.status(404).send('Feedback submission not found.');
      }
      const parsed = feedbackStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send('Unable to update feedback.');
      }
      const updated = await options.store?.updateStatus(
        request.params.id,
        parsed.data.status,
      );
      if (updated !== true) {
        return reply.status(404).send('Feedback submission not found.');
      }
      return reply
        .status(303)
        .header('Location', `/admin/feedback/${request.params.id}`)
        .send();
    },
  );

  done();
};

export default feedbackRoutes;
