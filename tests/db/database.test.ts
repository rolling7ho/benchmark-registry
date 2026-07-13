import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPool } from '../../src/db/database.js';

describe('createPool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not crash the process when the pool emits an idle-client error', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const pool = createPool('postgresql://localhost:5432/does-not-matter');
    const idleClientError = new Error('Connection terminated unexpectedly');

    // node-postgres emits 'error' on the pool for idle-client failures.
    // Without a listener this throws synchronously (Node's default
    // behavior for unhandled EventEmitter 'error' events); emitting it
    // directly here proves a listener is attached and swallows it safely.
    expect(() => pool.emit('error', idleClientError)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      'Idle database connection error',
      idleClientError,
    );

    await pool.end();
  });

  it('applies serverless pool sizing overrides', async () => {
    const pool = createPool('postgresql://localhost:5432/does-not-matter', {
      idleTimeoutMillis: 5_000,
      max: 4,
      min: 1,
    });

    expect(pool.options.idleTimeoutMillis).toBe(5_000);
    expect(pool.options.max).toBe(4);
    expect(pool.options.min).toBe(1);

    await pool.end();
  });
});
