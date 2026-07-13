import { createHash, timingSafeEqual } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

export interface AdminAuthConfig {
  username: string;
  password: string;
}

function secureEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function isAuthorizedAdmin(
  request: FastifyRequest,
  config: AdminAuthConfig | undefined,
): boolean {
  if (config === undefined) return false;
  const authorization = request.headers.authorization;
  if (authorization === undefined || !authorization.startsWith('Basic ')) {
    return false;
  }

  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString(
      'utf8',
    );
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    const usernameMatches = secureEqual(
      decoded.slice(0, separator),
      config.username,
    );
    const passwordMatches = secureEqual(
      decoded.slice(separator + 1),
      config.password,
    );
    return usernameMatches && passwordMatches;
  } catch {
    return false;
  }
}
