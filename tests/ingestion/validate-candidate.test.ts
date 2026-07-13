import { describe, expect, it } from 'vitest';

import type { Database } from '../../src/db/database.js';
import { validateCandidate } from '../../src/ingestion/validate-candidate.js';

describe('candidate validation without canonical mutation', () => {
  it('reports unresolved and missing required fields', async () => {
    const result = await validateCandidate({} as Database, {
      sourceUrl: null,
      proposedModelId: null,
      proposedBenchmarkSlug: null,
      proposedMetricSlug: null,
      scoreDisplay: null,
      scoreValue: Number.POSITIVE_INFINITY,
      evaluationDate: null,
      reportType: 'UNKNOWN',
      evidenceText: null,
      evidenceLocation: null,
      confidence: 0.2,
    });
    for (const error of [
      'Unresolved model.',
      'Unresolved benchmark.',
      'Unresolved metric.',
      'Missing score display.',
      'Missing source.',
      'Missing evidence.',
      'Missing evidence location.',
      'Invalid score value.',
    ]) {
      expect(result.errors).toContain(error);
    }
  });

  it('distinguishes unknown metadata and low confidence as warnings', async () => {
    const result = await validateCandidate({} as Database, {
      sourceUrl: null,
      proposedModelId: null,
      proposedBenchmarkSlug: null,
      proposedMetricSlug: null,
      scoreDisplay: '88.1%',
      scoreValue: null,
      evaluationDate: null,
      reportType: 'UNKNOWN',
      evidenceText: 'GPT-5.5 | 88.1%',
      evidenceLocation: 'HTML table 1, row 1',
      confidence: 0.4,
    });
    expect(result.warnings).toEqual([
      'Evaluation date unknown.',
      'Numeric score absent.',
      'Low extraction confidence.',
      'Report type UNKNOWN.',
    ]);
  });
});
