import type { FastifyInstance, FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/application.js';
import type {
  FeedbackFilters,
  FeedbackStatus,
  FeedbackStore,
  FeedbackSubmission,
  NewFeedbackSubmission,
} from '../src/feedback/types.js';
import type {
  RateLimitResult,
  RequestRateLimiter,
} from '../src/security/request-rate-limit.js';

const ADMIN_AUTHORIZATION = `Basic ${Buffer.from('reviewer:a-long-test-password').toString('base64')}`;

interface TestResponse {
  statusCode: number;
  headers: Record<string, string | number | string[] | undefined>;
  body: string;
}

class MemoryFeedbackStore implements FeedbackStore {
  readonly submissions: FeedbackSubmission[] = [];
  private readonly tokens = new Set<string>();

  create(submission: NewFeedbackSubmission): Promise<void> {
    if (this.tokens.has(submission.submissionToken)) return Promise.resolve();
    this.tokens.add(submission.submissionToken);
    const now = new Date('2026-07-13T00:00:00.000Z');
    this.submissions.push({
      id: String(this.submissions.length + 1),
      type: submission.type,
      recordIdentifier: submission.recordIdentifier,
      message: submission.message,
      sourceUrl: submission.sourceUrl,
      email: submission.email,
      status: 'open',
      recordExists: submission.recordIdentifier === 'BR-00155-001',
      createdAt: now,
      updatedAt: now,
    });
    return Promise.resolve();
  }

  list(filters: FeedbackFilters): Promise<FeedbackSubmission[]> {
    return Promise.resolve(
      this.submissions.filter(
        (submission) =>
          (filters.status === undefined ||
            submission.status === filters.status) &&
          (filters.type === undefined || submission.type === filters.type),
      ),
    );
  }

  get(id: string): Promise<FeedbackSubmission | undefined> {
    return Promise.resolve(
      this.submissions.find((submission) => submission.id === id),
    );
  }

  async updateStatus(id: string, status: FeedbackStatus): Promise<boolean> {
    const submission = await this.get(id);
    if (submission === undefined) return false;
    submission.status = status;
    submission.updatedAt = new Date('2026-07-13T01:00:00.000Z');
    return true;
  }
}

class MemoryRequestRateLimiter implements RequestRateLimiter {
  private readonly counts = new Map<string, number>();

  consume(
    _request: FastifyRequest,
    input: { scope: string; limit: number },
  ): Promise<RateLimitResult> {
    const count = (this.counts.get(input.scope) ?? 0) + 1;
    this.counts.set(input.scope, count);
    return Promise.resolve({
      allowed: count <= input.limit,
      retryAfterSeconds: count <= input.limit ? 0 : 60,
    });
  }
}

function validPayload(overrides: Record<string, string> = {}): string {
  return new URLSearchParams({
    type: 'incorrect-record',
    record_identifier: 'BR-00155-001',
    message: 'The source reports a different score.',
    source_url: 'https://example.org/report',
    email: '',
    website: '',
    submission_token: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  }).toString();
}

describe('feedback and corrections workflow', () => {
  let app: FastifyInstance;
  let store: MemoryFeedbackStore;

  beforeEach(() => {
    store = new MemoryFeedbackStore();
    app = createApp({
      feedbackStore: store,
      requestRateLimiter: new MemoryRequestRateLimiter(),
      adminAuth: {
        username: 'reviewer',
        password: 'a-long-test-password',
      },
    });
  });

  afterEach(async () => app.close());

  function submit(payload: string): Promise<TestResponse> {
    return app.inject({
      method: 'POST',
      url: '/feedback',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });
  }

  it('accepts and normalizes a valid feedback submission', async () => {
    const response = await submit(
      validPayload({
        record_identifier: 'br-00155-001',
        email: 'REPORTER@EXAMPLE.ORG',
      }),
    );

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/feedback?submitted=1');
    expect(store.submissions).toHaveLength(1);
    expect(store.submissions[0]).toMatchObject({
      type: 'incorrect-record',
      recordIdentifier: 'BR-00155-001',
      email: 'reporter@example.org',
      status: 'open',
    });

    const confirmation = await app.inject({
      method: 'GET',
      url: response.headers.location as string,
    });
    expect(confirmation.body).toContain(
      'Feedback submitted. Thank you for helping improve the registry.',
    );
  });

  it('rejects an empty or whitespace-only message', async () => {
    const response = await submit(validPayload({ message: '   ' }));
    expect(response.statusCode).toBe(400);
    expect(store.submissions).toHaveLength(0);
  });

  it('rejects a malformed feedback type', async () => {
    const response = await submit(validPayload({ type: 'urgent-ticket' }));
    expect(response.statusCode).toBe(400);
    expect(store.submissions).toHaveLength(0);
  });

  it('rejects a malformed or credential-bearing source URL', async () => {
    const malformed = await submit(
      validPayload({ source_url: 'not a source URL' }),
    );
    const credentials = await submit(
      validPayload({
        source_url: 'https://user:password@example.org/report',
      }),
    );
    expect(malformed.statusCode).toBe(400);
    expect(credentials.statusCode).toBe(400);
    expect(store.submissions).toHaveLength(0);
  });

  it('rejects overly long input', async () => {
    const response = await submit(validPayload({ message: 'x'.repeat(4001) }));
    expect(response.statusCode).toBe(400);
    expect(store.submissions).toHaveLength(0);
  });

  it('prefills a record and incorrect-record type from the query string', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/feedback?record=BR-00155-001&type=incorrect-record',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(
      'name="record_identifier" type="text" value="BR-00155-001"',
    );
    expect(response.body).toContain(
      '<option value="incorrect-record" selected>Incorrect record</option>',
    );
  });

  it('handles repeated prefill parameters without an internal error', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/feedback?record=one&record=two&type=other&type=search-issue',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('trim is not a function');
  });

  it('rejects cross-origin browser submissions', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/feedback',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        host: 'www.benchmarkregistry.org',
        origin: 'https://attacker.example',
      },
      payload: validPayload(),
    });
    expect(response.statusCode).toBe(400);
    expect(store.submissions).toHaveLength(0);
  });

  it('returns a generic HTML error when feedback storage fails', async () => {
    vi.spyOn(store, 'create').mockRejectedValueOnce(
      new Error('sensitive database failure detail'),
    );
    const response = await submit(validPayload());
    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('500 — Registry request failed');
    expect(response.body).not.toContain('sensitive database failure detail');
  });

  it('handles a repeated submission token idempotently', async () => {
    const first = await submit(validPayload());
    const repeated = await submit(validPayload());
    expect(first.statusCode).toBe(303);
    expect(repeated.statusCode).toBe(303);
    expect(store.submissions).toHaveLength(1);
  });

  it('rate limits repeated public feedback submissions', async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await submit(
        validPayload({
          submission_token: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
        }),
      );
      expect(response.statusCode).toBe(303);
    }
    const limited = await submit(
      validPayload({
        submission_token: '11111111-1111-4111-8111-999999999999',
      }),
    );
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
    expect(store.submissions).toHaveLength(5);
  });

  it('does not store honeypot submissions', async () => {
    const response = await submit(validPayload({ website: 'spam.example' }));
    expect(response.statusCode).toBe(303);
    expect(store.submissions).toHaveLength(0);
  });

  it('prevents anonymous users from reading submissions', async () => {
    await submit(validPayload());
    const list = await app.inject({ method: 'GET', url: '/admin/feedback' });
    const detail = await app.inject({
      method: 'GET',
      url: '/admin/feedback/1',
    });
    expect(list.statusCode).toBe(401);
    expect(detail.statusCode).toBe(401);
    expect(list.body).not.toContain('different score');
  });

  it('prevents anonymous users from updating submission status', async () => {
    await submit(validPayload());
    const response = await app.inject({
      method: 'POST',
      url: '/admin/feedback/1/status',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'status=resolved',
    });
    expect(response.statusCode).toBe(401);
    expect(store.submissions[0]?.status).toBe('open');
  });

  it('rate limits repeated failed administrator authentication', async () => {
    for (let index = 0; index < 10; index += 1) {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/feedback',
      });
      expect(response.statusCode).toBe(401);
    }
    const limited = await app.inject({
      method: 'GET',
      url: '/admin/feedback',
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
  });

  it('allows an authorized administrator to list and filter submissions', async () => {
    await submit(validPayload());
    const response = await app.inject({
      method: 'GET',
      url: '/admin/feedback?status=open&type=incorrect-record',
      headers: { authorization: ADMIN_AUTHORIZATION },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('The source reports a different score.');
    expect(response.body).toContain('/records/BR-00155-001');
    expect(response.body).toContain('name="status"');
    expect(response.body).toContain(
      '<meta name="robots" content="noindex,follow">',
    );
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('allows an authorized administrator to inspect a full submission', async () => {
    await submit(
      validPayload({
        email: 'reporter@example.org',
        message: 'Full correction evidence and explanation.',
      }),
    );
    const response = await app.inject({
      method: 'GET',
      url: '/admin/feedback/1',
      headers: { authorization: ADMIN_AUTHORIZATION },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(
      'Full correction evidence and explanation.',
    );
    expect(response.body).toContain('https://example.org/report');
    expect(response.body).toContain('reporter@example.org');
    expect(response.body).toContain('value="resolved"');
  });

  it('allows an authorized administrator to update only a valid status', async () => {
    await submit(validPayload());
    const headers = {
      authorization: ADMIN_AUTHORIZATION,
      'content-type': 'application/x-www-form-urlencoded',
      host: 'www.benchmarkregistry.org',
      origin: 'https://www.benchmarkregistry.org',
    };
    const invalid = await app.inject({
      method: 'POST',
      url: '/admin/feedback/1/status',
      headers,
      payload: 'status=escalated',
    });
    expect(invalid.statusCode).toBe(400);
    expect(store.submissions[0]?.status).toBe('open');

    const response = await app.inject({
      method: 'POST',
      url: '/admin/feedback/1/status',
      headers,
      payload: 'status=resolved',
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/admin/feedback/1');
    expect(store.submissions[0]?.status).toBe('resolved');
  });
});
