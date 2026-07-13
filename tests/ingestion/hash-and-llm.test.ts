import { describe, expect, it } from 'vitest';

import { createLlmExtractor } from '../../src/ingestion/extractors/llm-extractor.js';
import { candidateFingerprint, sha256 } from '../../src/ingestion/hash.js';
import { normalizePlainText } from '../../src/ingestion/normalize.js';

describe('ingestion hashing and LLM boundary', () => {
  it('produces deterministic content hashes and proposal fingerprints', () => {
    expect(sha256(Buffer.from('same'))).toBe(sha256(Buffer.from('same')));
    const base = {
      sourceId: '1',
      modelText: 'GPT-5.5',
      benchmarkText: 'DeepSWE',
      metricText: 'Overall',
      scoreDisplay: '72.4',
      evidenceLocation: 'row 1',
    };
    expect(candidateFingerprint(base)).toBe(
      candidateFingerprint({ ...base, modelText: '  gpt-5.5  ' }),
    );
    expect(candidateFingerprint(base)).not.toBe(
      candidateFingerprint({ ...base, evidenceLocation: 'row 2' }),
    );
  });

  it('validates untrusted structured LLM output', async () => {
    const document = normalizePlainText('1', Buffer.from('source evidence'));
    const valid = createLlmExtractor({
      extractCandidates: () =>
        Promise.resolve([
          {
            modelText: 'GPT-5.5',
            benchmarkText: 'DeepSWE',
            metricText: 'Overall',
            scoreDisplay: '72.4',
            scoreValue: 72.4,
            evaluationDate: null,
            evidenceText: 'GPT-5.5 | DeepSWE | Overall | 72.4',
            evidenceLocation: 'Source document',
            confidence: 0.8,
          },
        ]),
    });
    await expect(valid.extract(document)).resolves.toHaveLength(1);
    const invalid = createLlmExtractor({
      extractCandidates: () => Promise.resolve([{ invented: true }]),
    });
    await expect(invalid.extract(document)).rejects.toThrow();
  });
});
