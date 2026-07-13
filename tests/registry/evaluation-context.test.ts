import { describe, expect, it } from 'vitest';

import { formatBenchmarkDisplay } from '../../src/registry/benchmark-display.js';
import { assessRecordComparability } from '../../src/registry/comparability.js';
import {
  configurationFingerprint,
  normalizeEvaluationConfiguration,
} from '../../src/registry/evaluation-configurations.js';

describe('benchmark display formatting', () => {
  it.each([
    [{ familyName: 'GPQA', variantName: 'Diamond' }, 'GPQA Diamond'],
    [
      { familyName: 'SWE-bench', variantName: 'Verified' },
      'SWE-bench Verified',
    ],
    [{ familyName: 'DeepSWE' }, 'DeepSWE'],
    [{ familyName: 'GPQA', variantName: 'GPQA Diamond' }, 'GPQA Diamond'],
  ])('formats %j as %s', (input, expected) => {
    expect(formatBenchmarkDisplay(input)).toBe(expected);
  });
});

describe('evaluation configuration canonicalization', () => {
  it('is stable across recursively reordered additional JSON', () => {
    const left = configurationFingerprint({
      shots: 0,
      additionalConfiguration: { z: 1, nested: { b: 2, a: 1 } },
    });
    const right = configurationFingerprint({
      additionalConfiguration: { nested: { a: 1, b: 2 }, z: 1 },
      shots: 0,
    });
    expect(left).toBe(right);
  });

  it('preserves null versus zero and material pass-count differences', () => {
    expect(configurationFingerprint({ shots: null })).not.toBe(
      configurationFingerprint({ shots: 0 }),
    );
    expect(configurationFingerprint({ passCount: 1 })).not.toBe(
      configurationFingerprint({ passCount: 2 }),
    );
  });

  it('accepts zero shots and rejects invalid structural ranges', () => {
    expect(normalizeEvaluationConfiguration({ shots: 0 }).shots).toBe(0);
    expect(() => normalizeEvaluationConfiguration({ shots: -1 })).toThrow(
      'non-negative',
    );
    expect(() => normalizeEvaluationConfiguration({ passCount: 0 })).toThrow(
      'positive',
    );
  });
});

describe('structural comparability', () => {
  const base = {
    benchmarkVersionId: 'version-1',
    metricId: 'metric-1',
    configurationFingerprint: 'same',
  };

  it('reports comparable only for matching version, metric, and configuration', () => {
    expect(assessRecordComparability(base, base).assessment).toBe('COMPARABLE');
  });

  it('rejects version, metric, and known configuration conflicts', () => {
    expect(
      assessRecordComparability(base, {
        ...base,
        benchmarkVersionId: 'version-2',
      }).assessment,
    ).toBe('NOT_COMPARABLE');
    expect(
      assessRecordComparability(base, { ...base, metricId: 'metric-2' })
        .assessment,
    ).toBe('NOT_COMPARABLE');
    expect(
      assessRecordComparability(base, {
        ...base,
        configurationFingerprint: 'different',
      }).assessment,
    ).toBe('NOT_COMPARABLE');
  });

  it('reports insufficient context without benchmark or configuration evidence', () => {
    expect(
      assessRecordComparability(base, {
        ...base,
        benchmarkVersionId: null,
      }).assessment,
    ).toBe('INSUFFICIENT_CONTEXT');
    expect(
      assessRecordComparability(
        {
          ...base,
          configurationFingerprint: null,
          configurationUnspecified: true,
        },
        {
          ...base,
          configurationFingerprint: null,
          configurationUnspecified: true,
        },
      ).assessment,
    ).toBe('INSUFFICIENT_CONTEXT');
  });
});
