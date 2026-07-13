import { encodeProviderIdentifier } from './encoding.js';
import { IdentifierError } from './errors.js';
import { getProviderByPrefix } from './providers.js';
import type {
  ModelIdentifierInput,
  ModelIdentifierValidationResult,
} from './types.js';

export function generateModelIdentifier(input: ModelIdentifierInput): string {
  const { provider, modelEncoding } = encodeProviderIdentifier(input);
  return `${provider.providerPrefix}-${modelEncoding}`;
}

function invalidFormat(identifier: string, providerName: string): never {
  throw new IdentifierError(
    'INVALID_IDENTIFIER',
    `${identifier} is not a valid ${providerName} Model Identifier.`,
  );
}

export function validateModelIdentifier(
  identifier: string,
): ModelIdentifierValidationResult {
  const normalizedIdentifier = identifier.trim().toUpperCase();
  const separatorIndex = normalizedIdentifier.indexOf('-');
  if (separatorIndex <= 0) {
    throw new IdentifierError(
      'INVALID_IDENTIFIER',
      `${identifier} is not a valid Model Identifier.`,
    );
  }

  const provider = getProviderByPrefix(
    normalizedIdentifier.slice(0, separatorIndex),
  );
  let modelEncoding: string;
  let recordEncoding: string;

  switch (provider.identifierStrategy) {
    case 'OPENAI': {
      const match = /^OPNAI-(\d+)(P|SL|TR|LN)?$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = `${match[1]}${match[2] ?? ''}`;
      recordEncoding = modelEncoding;
      break;
    }
    case 'ANTHROPIC': {
      const match = /^ANTHR-(O|S|H|FB)(\d+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = `${match[1]}${match[2]}`;
      recordEncoding = modelEncoding;
      break;
    }
    case 'GOOGLE_GEMINI': {
      const match = /^GOOGL-G(\d+)([PF])$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = `G${match[1]}${match[2]}`;
      recordEncoding = `${match[1]}${match[2]}`;
      break;
    }
    case 'XAI_GROK': {
      const match = /^XAI-G(\d+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = `G${match[1]}`;
      recordEncoding = match[1]!;
      break;
    }
    case 'CURSOR_COMPOSER': {
      const match = /^CURSR-C(\d+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = `C${match[1]}`;
      recordEncoding = modelEncoding;
      break;
    }
    case 'PERPLEXITY_SONAR': {
      const match = /^PPLX-S(\d+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = `S${match[1]}`;
      recordEncoding = match[1]!;
      break;
    }
    case 'QWEN': {
      const match = /^QWEN-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'DEEPSEEK': {
      const match = /^DPSK-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'META_FAMILY': {
      const match = /^META-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'MOONSHOT_KIMI': {
      const match = /^KIMI-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'ZHIPU_GLM': {
      const match = /^GLM-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'MINIMAX_FAMILY': {
      const match = /^MMAX-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'MISTRAL_TIER': {
      const match = /^MSTRL-(SM|LG)(\d+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = `${match[1]}${match[2]}`;
      recordEncoding = modelEncoding;
      break;
    }
    case 'COHERE_FAMILY': {
      const match = /^COHR-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'NVIDIA_FAMILY': {
      const match = /^NVDA-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'AMAZON_FAMILY': {
      const match = /^AMZN-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'IBM_FAMILY': {
      const match = /^IBM-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'AI2_FAMILY': {
      const match = /^AI2-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'XIAOMI_FAMILY': {
      const match = /^XIAOM-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'LIQUIDAI_FAMILY': {
      const match = /^LQAI-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'INCLUSIONAI_FAMILY': {
      const match = /^INCAI-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'LG_FAMILY': {
      const match = /^LGAI-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'NOUS_FAMILY': {
      const match = /^NOUS-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'UPSTAGE_FAMILY': {
      const match = /^UPSTG-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'AI21_FAMILY': {
      const match = /^AI21-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'STEPFUN_FAMILY': {
      const match = /^STPFN-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'MICROSOFT_FAMILY': {
      const match = /^MSFT-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'MBZUAI_FAMILY': {
      const match = /^MBZAI-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'CHINAMOBILE_FAMILY': {
      const match = /^CMOB-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'SARVAM_FAMILY': {
      const match = /^SRVM-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'OPENBMB_FAMILY': {
      const match = /^OBMB-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'SWISSAI_FAMILY': {
      const match = /^SWAI-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'BYTEDANCESEED_FAMILY': {
      const match = /^BDSD-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'TRILLIONLABS_FAMILY': {
      const match = /^TRLN-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'TENCENT_FAMILY': {
      const match = /^TCNT-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'BAIDU_FAMILY': {
      const match = /^BAIDU-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'SERVICENOW_FAMILY': {
      const match = /^SVNW-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'REKA_FAMILY': {
      const match = /^REKA-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'KOREATELECOM_FAMILY': {
      const match = /^KT-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'KWAIKAT_FAMILY': {
      const match = /^KWAI-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'INCEPTION_FAMILY': {
      const match = /^INCPT-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'DATABRICKS_FAMILY': {
      const match = /^DBRX-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'NAVER_FAMILY': {
      const match = /^NAVER-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'MULTIVERSE_FAMILY': {
      const match = /^MVSC-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'PRIMEINTELLECT_FAMILY': {
      const match = /^PRIME-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'NEX_FAMILY': {
      const match = /^NEXAI-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'LONGCAT_FAMILY': {
      const match = /^LCAT-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'MOTIF_FAMILY': {
      const match = /^MOTIF-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'NANBEIGE_FAMILY': {
      const match = /^NANB-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'SNOWFLAKE_FAMILY': {
      const match = /^SNOW-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'ARCEE_FAMILY': {
      const match = /^ARCEE-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'TIIUAE_FAMILY': {
      const match = /^TIIUA-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'DEEPCOGITO_FAMILY': {
      const match = /^DPCOG-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
    case 'OPENCHAT_FAMILY': {
      const match = /^OPCHT-([A-Z0-9]+)$/.exec(normalizedIdentifier);
      if (match === null) invalidFormat(identifier, provider.displayName);
      modelEncoding = match[1]!;
      recordEncoding = modelEncoding;
      break;
    }
  }

  return {
    normalizedIdentifier,
    providerSlug:
      provider.slug as ModelIdentifierValidationResult['providerSlug'],
    providerPrefix: provider.providerPrefix,
    identifierStrategy: provider.identifierStrategy,
    modelEncoding,
    recordEncoding,
  };
}
