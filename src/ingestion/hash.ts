import { createHash } from 'node:crypto';

export function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

export function candidateFingerprint(input: {
  sourceId: string;
  modelText: string;
  benchmarkText: string;
  metricText: string;
  scoreDisplay: string;
  evidenceLocation: string;
  benchmarkVersionText?: string | null;
  configurationProposal?: Record<string, unknown> | null;
  providerModelIdentifier?: string | null;
  snapshotDate?: string | null;
  evaluatorText?: string | null;
  reportedDate?: string | null;
}): string {
  const normalize = (value: string): string =>
    value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  return sha256(
    Buffer.from(
      [
        input.sourceId,
        input.modelText,
        input.benchmarkText,
        input.metricText,
        input.scoreDisplay,
        input.evidenceLocation,
        input.benchmarkVersionText ?? '',
        JSON.stringify(input.configurationProposal ?? null),
        input.providerModelIdentifier ?? '',
        input.snapshotDate ?? '',
        input.evaluatorText ?? '',
        input.reportedDate ?? '',
      ]
        .map(normalize)
        .join('\u001f'),
    ),
  );
}
