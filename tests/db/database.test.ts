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
});
