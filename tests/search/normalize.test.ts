import { describe, expect, it } from 'vitest';

import {
  compactSearchText,
  normalizeSearchText,
} from '../../src/search/normalize.js';

describe('alias normalization', () => {
  it('normalizes case and repeated whitespace', () => {
    expect(normalizeSearchText('  GPT   5.5  ')).toBe('gpt 5.5');
  });

  it.each(['GPT-5.5', 'gpt_5.5'])(
    'compacts common separators in %s',
    (value) => {
      expect(compactSearchText(value)).toBe('gpt55');
    },
  );
});
