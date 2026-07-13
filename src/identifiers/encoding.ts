import { IdentifierError } from './errors.js';
import { getProviderBySlug, type ProviderConfiguration } from './providers.js';
import { TIER_CODES } from './tier-codes.js';
import type { ModelIdentifierInput } from './types.js';

export interface ProviderEncoding {
  provider: ProviderConfiguration;
  modelEncoding: string;
  recordEncoding: string;
}

function normalizedOptionalComponent(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) {
    throw new IdentifierError(
      'INVALID_COMPONENT',
      'Identifier components cannot be empty.',
    );
  }

  return normalized;
}

function requireNumericModelNumber(
  modelNumber: string | null,
  providerName: string,
): string {
  if (modelNumber === null) {
    throw new IdentifierError(
      'MISSING_COMPONENT',
      `${providerName} requires a model number.`,
    );
  }

  if (!/^\d+$/.test(modelNumber)) {
    throw new IdentifierError(
      'INVALID_COMPONENT',
      `${providerName} model numbers must use the approved numeric encoding.`,
    );
  }

  return modelNumber;
}

function requireAlphanumericFamily(
  family: string | null,
  providerName: string,
): string {
  if (family === null) {
    throw new IdentifierError(
      'MISSING_COMPONENT',
      `${providerName} requires an explicit family code.`,
    );
  }

  if (!/^[A-Z0-9]+$/.test(family)) {
    throw new IdentifierError(
      'INVALID_COMPONENT',
      `${providerName} family codes must be alphanumeric.`,
    );
  }

  return family;
}

function requireTier(
  tierCode: string | null,
  allowedTiers: readonly string[],
  providerName: string,
): string {
  if (tierCode === null) {
    throw new IdentifierError(
      'MISSING_COMPONENT',
      `${providerName} requires a tier code.`,
    );
  }

  if (!allowedTiers.includes(tierCode)) {
    throw new IdentifierError(
      'INVALID_COMPONENT',
      `Tier ${tierCode} is not approved for ${providerName}.`,
    );
  }

  return tierCode;
}

function rejectTier(tierCode: string | null, providerName: string): void {
  if (tierCode !== null) {
    throw new IdentifierError(
      'INVALID_COMPONENT',
      `${providerName} does not use a tier code in BEIS v1.`,
    );
  }
}

export function encodeProviderIdentifier(
  input: ModelIdentifierInput,
): ProviderEncoding {
  const provider = getProviderBySlug(input.provider);
  const family = normalizedOptionalComponent(input.family);
  const modelNumber = normalizedOptionalComponent(input.modelNumber);
  const tierCode = normalizedOptionalComponent(input.tierCode);

  switch (provider.identifierStrategy) {
    case 'OPENAI': {
      const number = requireNumericModelNumber(
        modelNumber,
        provider.displayName,
      );
      const allowedOpenAiTiers: readonly string[] = [
        TIER_CODES.PRO,
        TIER_CODES.SOL,
        TIER_CODES.TERRA,
        TIER_CODES.LUNA,
      ];
      if (tierCode !== null && !allowedOpenAiTiers.includes(tierCode)) {
        throw new IdentifierError(
          'INVALID_COMPONENT',
          `Tier ${tierCode} is not approved for ${provider.displayName}.`,
        );
      }
      const encoding = `${number}${tierCode ?? ''}`;
      return { provider, modelEncoding: encoding, recordEncoding: encoding };
    }
    case 'ANTHROPIC': {
      const number = requireNumericModelNumber(
        modelNumber,
        provider.displayName,
      );
      const tier = requireTier(
        tierCode,
        [
          TIER_CODES.OPUS,
          TIER_CODES.SONNET,
          TIER_CODES.HAIKU,
          TIER_CODES.FABLE,
        ],
        provider.displayName,
      );
      const encoding = `${tier}${number}`;
      return { provider, modelEncoding: encoding, recordEncoding: encoding };
    }
    case 'GOOGLE_GEMINI': {
      if (family !== 'GEMINI') {
        throw new IdentifierError(
          family === null ? 'MISSING_COMPONENT' : 'INVALID_COMPONENT',
          'Google Gemini identifiers require the explicit Gemini family.',
        );
      }
      const number = requireNumericModelNumber(
        modelNumber,
        provider.displayName,
      );
      const tier = requireTier(
        tierCode,
        [TIER_CODES.PRO, TIER_CODES.FLASH],
        provider.displayName,
      );
      return {
        provider,
        modelEncoding: `G${number}${tier}`,
        recordEncoding: `${number}${tier}`,
      };
    }
    case 'XAI_GROK': {
      rejectTier(tierCode, provider.displayName);
      const number = requireNumericModelNumber(
        modelNumber,
        provider.displayName,
      );
      return {
        provider,
        modelEncoding: `G${number}`,
        recordEncoding: number,
      };
    }
    case 'CURSOR_COMPOSER': {
      rejectTier(tierCode, provider.displayName);
      const number = requireNumericModelNumber(
        modelNumber,
        provider.displayName,
      );
      const encoding = `C${number}`;
      return { provider, modelEncoding: encoding, recordEncoding: encoding };
    }
    case 'PERPLEXITY_SONAR': {
      rejectTier(tierCode, provider.displayName);
      const number = requireNumericModelNumber(
        modelNumber,
        provider.displayName,
      );
      return {
        provider,
        modelEncoding: `S${number}`,
        recordEncoding: number,
      };
    }
    case 'QWEN': {
      rejectTier(tierCode, provider.displayName);
      // Pure numeric releases keep the original numeric-only encoding.
      // Non-numeric model names (which carry no tier semantics to lose)
      // fall back to an alphanumeric family code, matching the FAMILY
      // strategies elsewhere in this file. Purely additive: every
      // previously generated QWEN-<digits> identifier still parses.
      const code =
        modelNumber !== null
          ? requireNumericModelNumber(modelNumber, provider.displayName)
          : requireAlphanumericFamily(family, provider.displayName);
      return { provider, modelEncoding: code, recordEncoding: code };
    }
    case 'DEEPSEEK': {
      rejectTier(tierCode, provider.displayName);
      const familyCode = requireAlphanumericFamily(
        family,
        provider.displayName,
      );
      return {
        provider,
        modelEncoding: familyCode,
        recordEncoding: familyCode,
      };
    }
    case 'META_FAMILY': {
      rejectTier(tierCode, provider.displayName);
      const familyCode = requireAlphanumericFamily(
        family,
        provider.displayName,
      );
      return {
        provider,
        modelEncoding: familyCode,
        recordEncoding: familyCode,
      };
    }
    case 'MOONSHOT_KIMI': {
      rejectTier(tierCode, provider.displayName);
      const familyCode = requireAlphanumericFamily(
        family,
        provider.displayName,
      );
      return {
        provider,
        modelEncoding: familyCode,
        recordEncoding: familyCode,
      };
    }
    case 'ZHIPU_GLM': {
      rejectTier(tierCode, provider.displayName);
      // Same additive numeric-or-family fallback as QWEN above.
      const code =
        modelNumber !== null
          ? requireNumericModelNumber(modelNumber, provider.displayName)
          : requireAlphanumericFamily(family, provider.displayName);
      return { provider, modelEncoding: code, recordEncoding: code };
    }
    case 'MINIMAX_FAMILY': {
      rejectTier(tierCode, provider.displayName);
      const familyCode = requireAlphanumericFamily(
        family,
        provider.displayName,
      );
      return {
        provider,
        modelEncoding: familyCode,
        recordEncoding: familyCode,
      };
    }
    case 'MISTRAL_TIER': {
      const number = requireNumericModelNumber(
        modelNumber,
        provider.displayName,
      );
      const tier = requireTier(
        tierCode,
        [TIER_CODES.SMALL, TIER_CODES.LARGE],
        provider.displayName,
      );
      const encoding = `${tier}${number}`;
      return { provider, modelEncoding: encoding, recordEncoding: encoding };
    }
    case 'COHERE_FAMILY': {
      rejectTier(tierCode, provider.displayName);
      const familyCode = requireAlphanumericFamily(
        family,
        provider.displayName,
      );
      return {
        provider,
        modelEncoding: familyCode,
        recordEncoding: familyCode,
      };
    }
    case 'NVIDIA_FAMILY':
    case 'AMAZON_FAMILY':
    case 'IBM_FAMILY':
    case 'AI2_FAMILY':
    case 'XIAOMI_FAMILY':
    case 'LIQUIDAI_FAMILY':
    case 'INCLUSIONAI_FAMILY':
    case 'LG_FAMILY':
    case 'NOUS_FAMILY':
    case 'UPSTAGE_FAMILY':
    case 'AI21_FAMILY':
    case 'STEPFUN_FAMILY':
    case 'MICROSOFT_FAMILY':
    case 'MBZUAI_FAMILY':
    case 'CHINAMOBILE_FAMILY':
    case 'SARVAM_FAMILY':
    case 'OPENBMB_FAMILY':
    case 'SWISSAI_FAMILY':
    case 'BYTEDANCESEED_FAMILY':
    case 'TRILLIONLABS_FAMILY':
    case 'TENCENT_FAMILY':
    case 'BAIDU_FAMILY':
    case 'SERVICENOW_FAMILY':
    case 'REKA_FAMILY':
    case 'KOREATELECOM_FAMILY':
    case 'KWAIKAT_FAMILY':
    case 'INCEPTION_FAMILY':
    case 'DATABRICKS_FAMILY':
    case 'NAVER_FAMILY':
    case 'MULTIVERSE_FAMILY':
    case 'PRIMEINTELLECT_FAMILY':
    case 'NEX_FAMILY':
    case 'LONGCAT_FAMILY':
    case 'MOTIF_FAMILY':
    case 'NANBEIGE_FAMILY':
    case 'SNOWFLAKE_FAMILY':
    case 'ARCEE_FAMILY':
    case 'TIIUAE_FAMILY':
    case 'DEEPCOGITO_FAMILY':
    case 'OPENCHAT_FAMILY': {
      // Simple providers without an established internal tier taxonomy use a
      // single operator-assigned alphanumeric family code, matching the
      // existing DEEPSEEK / META_FAMILY / MOONSHOT_KIMI / MINIMAX_FAMILY /
      // COHERE_FAMILY pattern above. Inventing a bespoke tier system for a
      // provider we don't have authoritative tiering knowledge of would
      // violate the "unknown must remain unknown" rule.
      rejectTier(tierCode, provider.displayName);
      const familyCode = requireAlphanumericFamily(
        family,
        provider.displayName,
      );
      return {
        provider,
        modelEncoding: familyCode,
        recordEncoding: familyCode,
      };
    }
  }
}
