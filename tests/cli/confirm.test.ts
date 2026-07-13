import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { confirm } from '../../src/cli/confirm.js';

describe('registry CLI confirmation', () => {
  it('fails safely in non-interactive mode without --yes', async () => {
    const input = Object.assign(Readable.from([]), { isTTY: false });
    await expect(confirm('Create?', { yes: false, input })).rejects.toThrow(
      'Confirmation required',
    );
  });

  it('allows an explicit --yes equivalent without reading stdin', async () => {
    const input = Object.assign(Readable.from([]), { isTTY: false });
    await expect(confirm('Create?', { yes: true, input })).resolves.toBe(true);
  });
});
