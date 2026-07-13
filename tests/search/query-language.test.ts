import { describe, expect, it } from 'vitest';

import { parseSearchQuery } from '../../src/search/query-language.js';

describe('search query language', () => {
  it('leaves normal search queries unchanged', () => {
    expect(parseSearchQuery('Muse Spark')).toBeNull();
    expect(parseSearchQuery('research organization')).toBeNull();
  });

  it('parses comma-separated values as alternatives within a field', () => {
    expect(parseSearchQuery('brand: Meta, Anthropic')).toEqual({
      alternatives: [
        {
          terms: [{ field: 'brand', values: ['Meta', 'Anthropic'] }],
        },
      ],
    });
  });

  it('parses separate fields as terms in one alternative', () => {
    expect(
      parseSearchQuery('benchmark: GPQA metric: Accuracy date: 2026-06'),
    ).toEqual({
      alternatives: [
        {
          terms: [
            { field: 'benchmark', values: ['GPQA'] },
            { field: 'metric', values: ['Accuracy'] },
            { field: 'date', values: ['2026-06'] },
          ],
        },
      ],
    });
  });

  it('parses uppercase OR as complete alternatives', () => {
    expect(parseSearchQuery('Muse Spark OR Opus 4.7')).toEqual({
      alternatives: [
        { terms: [{ field: null, values: ['Muse Spark'] }] },
        { terms: [{ field: null, values: ['Opus 4.7'] }] },
      ],
    });
  });

  it('recognizes field names case-insensitively but not embedded text', () => {
    expect(parseSearchQuery('MODEL: GPT-5.5')).toMatchObject({
      alternatives: [{ terms: [{ field: 'model', values: ['GPT-5.5'] }] }],
    });
    expect(parseSearchQuery('notmodel:GPT-5.5')).toBeNull();
  });
});
