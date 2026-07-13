import { describe, expect, it } from 'vitest';

import { tableExtractor } from '../../src/ingestion/extractors/table-extractor.js';
import { normalizeMarkdown } from '../../src/ingestion/normalize.js';
import type { CandidateProposal } from '../../src/ingestion/types.js';

async function extract(markdown: string): Promise<CandidateProposal[]> {
  return tableExtractor.extract(normalizeMarkdown('1', Buffer.from(markdown)));
}

describe('deterministic table extraction', () => {
  it('inherits GPQA Diamond context and the Accuracy metric', async () => {
    await expect(
      extract(
        '## GPQA Diamond\n| Model | Accuracy |\n| --- | --- |\n| GPT-5.5 | 88.1% |',
      ),
    ).resolves.toMatchObject([
      {
        modelText: 'GPT-5.5',
        benchmarkText: 'GPQA Diamond',
        metricText: 'Accuracy',
        scoreDisplay: '88.1%',
      },
    ]);
  });

  it('conservatively removes Results from SWE-bench heading context', async () => {
    await expect(
      extract(
        '## SWE-bench Verified Results\n| Model | Resolved |\n| --- | --- |\n| GPT-5.5 | 74.0% |',
      ),
    ).resolves.toMatchObject([
      {
        benchmarkText: 'SWE-bench Verified',
        metricText: 'Resolved',
        scoreDisplay: '74.0%',
      },
    ]);
  });

  it('maps explicit benchmark and metric columns', async () => {
    await expect(
      extract(
        '| Model | Benchmark | Metric | Score |\n| --- | --- | --- | --- |\n| Claude Opus 4.8 | DeepSWE | Overall | 69.2 |',
      ),
    ).resolves.toMatchObject([
      {
        modelText: 'Claude Opus 4.8',
        benchmarkText: 'DeepSWE',
        metricText: 'Overall',
        scoreDisplay: '69.2',
      },
    ]);
  });

  it('ignores irrelevant tables', async () => {
    await expect(
      extract(
        '| Region | Revenue | Employees |\n| --- | --- | --- |\n| APAC | 10 | 20 |',
      ),
    ).resolves.toEqual([]);
  });
});
