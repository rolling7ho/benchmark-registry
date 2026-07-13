import { encodeProviderIdentifier } from './encoding.js';
import { IdentifierError } from './errors.js';
import { validateModelIdentifier } from './model-id.js';
import { getProviderByNamespace } from './providers.js';
import type {
  ModelIdentifierInput,
  RecordPrefixValidationResult,
} from './types.js';

export function generateRecordPrefix(input: ModelIdentifierInput): string {
  const { provider, recordEncoding } = encodeProviderIdentifier(input);
  return `BR-${provider.brNamespace}${recordEncoding}`;
}

export function validateRecordPrefix(
  recordPrefix: string,
): RecordPrefixValidationResult {
  const normalizedRecordPrefix = recordPrefix.trim().toUpperCase();
  const namespaceMatch = /^BR-(\d{3})/.exec(normalizedRecordPrefix);
  if (namespaceMatch === null) {
    throw new IdentifierError(
      'INVALID_IDENTIFIER',
      `${recordPrefix} is not a valid Benchmark Record prefix.`,
    );
  }

  const provider = getProviderByNamespace(namespaceMatch[1]!);
  let match: RegExpExecArray | null;

  switch (provider.identifierStrategy) {
    case 'OPENAI':
      match = /^BR-001(\d+(?:P|SL|TR|LN)?)$/.exec(normalizedRecordPrefix);
      break;
    case 'ANTHROPIC':
      match = /^BR-002((?:O|S|H|FB)\d+)$/.exec(normalizedRecordPrefix);
      break;
    case 'GOOGLE_GEMINI':
      match = /^BR-003(\d+[PF])$/.exec(normalizedRecordPrefix);
      break;
    case 'XAI_GROK':
      match = /^BR-004(\d+)$/.exec(normalizedRecordPrefix);
      break;
    case 'CURSOR_COMPOSER':
      match = /^BR-005(C\d+)$/.exec(normalizedRecordPrefix);
      break;
    case 'PERPLEXITY_SONAR':
      match = /^BR-006(\d+)$/.exec(normalizedRecordPrefix);
      break;
    case 'QWEN':
      match = /^BR-007([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'DEEPSEEK':
      match = /^BR-008([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'META_FAMILY':
      match = /^BR-009([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'MOONSHOT_KIMI':
      match = /^BR-010([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'ZHIPU_GLM':
      match = /^BR-011([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'MINIMAX_FAMILY':
      match = /^BR-012([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'MISTRAL_TIER':
      match = /^BR-013((?:SM|LG)\d+)$/.exec(normalizedRecordPrefix);
      break;
    case 'COHERE_FAMILY':
      match = /^BR-014([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'NVIDIA_FAMILY':
      match = /^BR-015([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'AMAZON_FAMILY':
      match = /^BR-016([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'IBM_FAMILY':
      match = /^BR-017([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'AI2_FAMILY':
      match = /^BR-018([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'XIAOMI_FAMILY':
      match = /^BR-019([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'LIQUIDAI_FAMILY':
      match = /^BR-020([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'INCLUSIONAI_FAMILY':
      match = /^BR-021([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'LG_FAMILY':
      match = /^BR-022([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'NOUS_FAMILY':
      match = /^BR-023([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'UPSTAGE_FAMILY':
      match = /^BR-024([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'AI21_FAMILY':
      match = /^BR-025([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'STEPFUN_FAMILY':
      match = /^BR-026([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'MICROSOFT_FAMILY':
      match = /^BR-027([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'MBZUAI_FAMILY':
      match = /^BR-028([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'CHINAMOBILE_FAMILY':
      match = /^BR-029([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'SARVAM_FAMILY':
      match = /^BR-030([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'OPENBMB_FAMILY':
      match = /^BR-031([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'SWISSAI_FAMILY':
      match = /^BR-032([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'BYTEDANCESEED_FAMILY':
      match = /^BR-033([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'TRILLIONLABS_FAMILY':
      match = /^BR-034([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'TENCENT_FAMILY':
      match = /^BR-035([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'BAIDU_FAMILY':
      match = /^BR-036([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'SERVICENOW_FAMILY':
      match = /^BR-037([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'REKA_FAMILY':
      match = /^BR-038([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'KOREATELECOM_FAMILY':
      match = /^BR-039([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'KWAIKAT_FAMILY':
      match = /^BR-040([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'INCEPTION_FAMILY':
      match = /^BR-041([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'DATABRICKS_FAMILY':
      match = /^BR-042([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'NAVER_FAMILY':
      match = /^BR-043([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'MULTIVERSE_FAMILY':
      match = /^BR-044([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'PRIMEINTELLECT_FAMILY':
      match = /^BR-045([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'NEX_FAMILY':
      match = /^BR-046([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'LONGCAT_FAMILY':
      match = /^BR-047([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'MOTIF_FAMILY':
      match = /^BR-048([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'NANBEIGE_FAMILY':
      match = /^BR-049([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'SNOWFLAKE_FAMILY':
      match = /^BR-050([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'ARCEE_FAMILY':
      match = /^BR-051([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'TIIUAE_FAMILY':
      match = /^BR-052([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'DEEPCOGITO_FAMILY':
      match = /^BR-053([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
    case 'OPENCHAT_FAMILY':
      match = /^BR-054([A-Z0-9]+)$/.exec(normalizedRecordPrefix);
      break;
  }

  if (match === null || match[1] === undefined) {
    throw new IdentifierError(
      'INVALID_IDENTIFIER',
      `${recordPrefix} is not valid for ${provider.displayName}.`,
    );
  }

  return {
    normalizedRecordPrefix,
    providerSlug: provider.slug as RecordPrefixValidationResult['providerSlug'],
    brNamespace: provider.brNamespace,
    identifierStrategy: provider.identifierStrategy,
    recordEncoding: match[1],
  };
}

export function assertModelIdentifierMatchesRecordPrefix(
  modelIdentifier: string,
  recordPrefix: string,
): void {
  const model = validateModelIdentifier(modelIdentifier);
  const record = validateRecordPrefix(recordPrefix);

  if (
    model.providerSlug !== record.providerSlug ||
    model.identifierStrategy !== record.identifierStrategy ||
    model.recordEncoding !== record.recordEncoding
  ) {
    throw new IdentifierError(
      'PROVIDER_MISMATCH',
      `${modelIdentifier} and ${recordPrefix} do not identify the same provider and model encoding.`,
    );
  }
}
