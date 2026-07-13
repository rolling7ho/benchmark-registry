import { describe, expect, it } from 'vitest';

import { formatBenchmarkRecordIdentifier } from '../../src/identifiers/record-id.js';

describe('formatBenchmarkRecordIdentifier', () => {
  it.each([
    [1, 'BR-00155-001'],
    [17, 'BR-00155-017'],
    [42, 'BR-00155-042'],
    [999, 'BR-00155-999'],
  ])('formats sequence %s', (sequenceNumber, expected) => {
    expect(formatBenchmarkRecordIdentifier('BR-00155', sequenceNumber)).toBe(
      expected,
    );
  });

  it.each([0, -1, 1.5, 1000])('rejects sequence %s', (sequenceNumber) => {
    expect(() =>
      formatBenchmarkRecordIdentifier('BR-00155', sequenceNumber),
    ).toThrow();
  });
});
