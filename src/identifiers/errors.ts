export type IdentifierErrorCode =
  | 'UNKNOWN_PROVIDER'
  | 'MISSING_COMPONENT'
  | 'INVALID_COMPONENT'
  | 'INVALID_IDENTIFIER'
  | 'PROVIDER_MISMATCH'
  | 'INVALID_SEQUENCE'
  | 'SEQUENCE_CAPACITY_EXHAUSTED'
  | 'MODEL_NOT_FOUND';

export class IdentifierError extends Error {
  override readonly name = 'IdentifierError';

  constructor(
    readonly code: IdentifierErrorCode,
    message: string,
  ) {
    super(message);
  }
}
