import { IdentifierError } from './errors.js';
import { validateRecordPrefix } from './record-prefix.js';

export const BEIS_V1_MAX_SEQUENCE = 999;

export function formatBenchmarkRecordIdentifier(
  recordPrefix: string,
  sequenceNumber: number,
): string {
  const { normalizedRecordPrefix } = validateRecordPrefix(recordPrefix);

  if (!Number.isInteger(sequenceNumber) || sequenceNumber <= 0) {
    throw new IdentifierError(
      'INVALID_SEQUENCE',
      'Benchmark Record sequence numbers must be positive integers.',
    );
  }

  if (sequenceNumber > BEIS_V1_MAX_SEQUENCE) {
    throw new IdentifierError(
      'SEQUENCE_CAPACITY_EXHAUSTED',
      `BEIS v1 sequence capacity is exhausted for ${normalizedRecordPrefix}; sequence numbers cannot exceed ${BEIS_V1_MAX_SEQUENCE}.`,
    );
  }

  return `${normalizedRecordPrefix}-${sequenceNumber.toString().padStart(3, '0')}`;
}
