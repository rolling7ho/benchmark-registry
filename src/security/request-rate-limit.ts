import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

import type { FastifyRequest } from 'fastify';
import { sql } from 'kysely';

import type { Database } from '../db/database.js';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RequestRateLimiter {
  consume(
    request: FastifyRequest,
    input: { scope: string; limit: number; windowSeconds: number },
  ): Promise<RateLimitResult>;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function clientAddress(request: FastifyRequest): string {
  const forwarded = headerValue(request.headers['x-vercel-forwarded-for'])
    ?.split(',')[0]
    ?.trim();
  return forwarded !== undefined && isIP(forwarded) !== 0
    ? forwarded
    : request.ip;
}

function requestFingerprint(request: FastifyRequest, secret: string): string {
  return createHmac('sha256', secret)
    .update(clientAddress(request))
    .digest('hex');
}

export function createDatabaseRequestRateLimiter(
  database: Database,
  secret: string,
): RequestRateLimiter {
  return {
    async consume(request, input): Promise<RateLimitResult> {
      const fingerprint = requestFingerprint(request, secret);
      const now = new Date();
      const windowCutoff = new Date(now.getTime() - input.windowSeconds * 1000);

      const result = await database
        .transaction()
        .execute(async (transaction) => {
          await transaction
            .deleteFrom('request_rate_limits')
            .where(
              'updated_at',
              '<',
              new Date(now.getTime() - 24 * 60 * 60 * 1000),
            )
            .execute();

          return sql<{
            request_count: number;
            window_started_at: Date;
          }>`
          INSERT INTO request_rate_limits
            (scope, fingerprint, window_started_at, request_count, updated_at)
          VALUES
            (${input.scope}, ${fingerprint}, ${now}, 1, ${now})
          ON CONFLICT (scope, fingerprint) DO UPDATE
          SET window_started_at = CASE
                WHEN request_rate_limits.window_started_at <=
                     ${windowCutoff}
                  THEN ${now}
                ELSE request_rate_limits.window_started_at
              END,
              request_count = CASE
                WHEN request_rate_limits.window_started_at <=
                     ${windowCutoff}
                  THEN 1
                ELSE least(
                  request_rate_limits.request_count + 1,
                  ${input.limit + 1}
                )
              END,
              updated_at = ${now}
          RETURNING request_count, window_started_at
        `.execute(transaction);
        });

      const row = result.rows[0];
      if (row === undefined) {
        throw new Error('Rate limit state was not returned.');
      }
      const allowed = row.request_count <= input.limit;
      const resetAt =
        new Date(row.window_started_at).getTime() + input.windowSeconds * 1000;
      return {
        allowed,
        retryAfterSeconds: allowed
          ? 0
          : Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)),
      };
    },
  };
}
