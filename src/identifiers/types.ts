import type { IdentifierStrategy, ProviderSlug } from './providers.js';

export interface ModelIdentifierInput {
  provider: string;
  family?: string | null;
  modelNumber?: string | null;
  tierCode?: string | null;
}

export interface ModelIdentifierValidationResult {
  normalizedIdentifier: string;
  providerSlug: ProviderSlug;
  providerPrefix: string;
  identifierStrategy: IdentifierStrategy;
  modelEncoding: string;
  recordEncoding: string;
}

export interface RecordPrefixValidationResult {
  normalizedRecordPrefix: string;
  providerSlug: ProviderSlug;
  brNamespace: string;
  identifierStrategy: IdentifierStrategy;
  recordEncoding: string;
}
