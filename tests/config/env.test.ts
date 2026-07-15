import { describe, expect, it } from 'vitest';

import { loadEnvironment } from '../../src/config/env.js';

const DATABASE_URL = 'postgresql://registry:secret@localhost:5432/registry';

describe('production environment validation', () => {
  it('accepts the database credential as the production HMAC-key fallback', () => {
    const environment = loadEnvironment({
      NODE_ENV: 'production',
      DATABASE_URL,
    });

    expect(environment.FEEDBACK_RATE_LIMIT_SECRET).toBeUndefined();
  });

  it('accepts a sufficiently long production rate-limit secret', () => {
    const environment = loadEnvironment({
      NODE_ENV: 'production',
      DATABASE_URL,
      FEEDBACK_RATE_LIMIT_SECRET: 'a'.repeat(32),
    });
    expect(environment.FEEDBACK_RATE_LIMIT_SECRET).toHaveLength(32);
  });

  it('trims a trailing newline pasted into ADMIN_USERNAME/ADMIN_PASSWORD', () => {
    const environment = loadEnvironment({
      DATABASE_URL,
      ADMIN_USERNAME: 'registry-admin\n',
      ADMIN_PASSWORD: 'a-long-test-password\n',
    });
    expect(environment.ADMIN_USERNAME).toBe('registry-admin');
    expect(environment.ADMIN_PASSWORD).toBe('a-long-test-password');
  });
});
