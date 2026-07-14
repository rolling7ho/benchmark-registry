import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AdminAuthConfig } from './auth.js';
import { isAuthorizedAdmin } from './auth.js';
import type { RequestRateLimiter } from '../security/request-rate-limit.js';

export interface AdminAccessConfig {
  adminAuth: AdminAuthConfig | undefined;
  requestRateLimiter: RequestRateLimiter | undefined;
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AdminAccessConfig,
): Promise<boolean> {
  reply
    .header('Cache-Control', 'no-store')
    .header('X-Robots-Tag', 'noindex, nofollow');
  if (config.adminAuth === undefined) {
    void reply.status(503).send('Administrator access is not configured.');
    return false;
  }
  if (!isAuthorizedAdmin(request, config.adminAuth)) {
    if (config.requestRateLimiter !== undefined) {
      const rateLimit = await config.requestRateLimiter.consume(request, {
        scope: 'admin-authentication',
        limit: 10,
        windowSeconds: 15 * 60,
      });
      if (!rateLimit.allowed) {
        void reply
          .header('Retry-After', String(rateLimit.retryAfterSeconds))
          .status(429)
          .send('Too many authentication attempts.');
        return false;
      }
    }
    void reply
      .header('WWW-Authenticate', 'Basic realm="Benchmark Registry Admin"')
      .status(401)
      .send('Authentication required.');
    return false;
  }
  return true;
}
