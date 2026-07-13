import { PROVIDERS, type IdentifierStrategy } from './providers.js';

const PATTERNS: Record<
  IdentifierStrategy,
  { modelPattern: string; recordPrefixPattern: string }
> = {
  OPENAI: {
    modelPattern: 'OPNAI-[MN][TIER?]',
    recordPrefixPattern: 'BR-001[MN][TIER?]',
  },
  ANTHROPIC: {
    modelPattern: 'ANTHR-[TIER][MN]',
    recordPrefixPattern: 'BR-002[TIER][MN]',
  },
  GOOGLE_GEMINI: {
    modelPattern: 'GOOGL-G[MN][TIER]',
    recordPrefixPattern: 'BR-003[MN][TIER]',
  },
  XAI_GROK: {
    modelPattern: 'XAI-G[MN]',
    recordPrefixPattern: 'BR-004[MN]',
  },
  CURSOR_COMPOSER: {
    modelPattern: 'CURSR-C[MN]',
    recordPrefixPattern: 'BR-005C[MN]',
  },
  PERPLEXITY_SONAR: {
    modelPattern: 'PPLX-S[MN]',
    recordPrefixPattern: 'BR-006[MN]',
  },
  QWEN: {
    modelPattern: 'QWEN-[MN]',
    recordPrefixPattern: 'BR-007[MN]',
  },
  DEEPSEEK: {
    modelPattern: 'DPSK-[FAMILY]',
    recordPrefixPattern: 'BR-008[FAMILY]',
  },
  META_FAMILY: {
    modelPattern: 'META-[FAMILY CODE]',
    recordPrefixPattern: 'BR-009[FAMILY CODE]',
  },
  MOONSHOT_KIMI: {
    modelPattern: 'KIMI-[FAMILY CODE]',
    recordPrefixPattern: 'BR-010[FAMILY CODE]',
  },
  ZHIPU_GLM: {
    modelPattern: 'GLM-[MN]',
    recordPrefixPattern: 'BR-011[MN]',
  },
  MINIMAX_FAMILY: {
    modelPattern: 'MMAX-[FAMILY CODE]',
    recordPrefixPattern: 'BR-012[FAMILY CODE]',
  },
  MISTRAL_TIER: {
    modelPattern: 'MSTRL-[TIER][MN]',
    recordPrefixPattern: 'BR-013[TIER][MN]',
  },
  COHERE_FAMILY: {
    modelPattern: 'COHR-[FAMILY CODE]',
    recordPrefixPattern: 'BR-014[FAMILY CODE]',
  },
  NVIDIA_FAMILY: {
    modelPattern: 'NVDA-[FAMILY CODE]',
    recordPrefixPattern: 'BR-015[FAMILY CODE]',
  },
  AMAZON_FAMILY: {
    modelPattern: 'AMZN-[FAMILY CODE]',
    recordPrefixPattern: 'BR-016[FAMILY CODE]',
  },
  IBM_FAMILY: {
    modelPattern: 'IBM-[FAMILY CODE]',
    recordPrefixPattern: 'BR-017[FAMILY CODE]',
  },
  AI2_FAMILY: {
    modelPattern: 'AI2-[FAMILY CODE]',
    recordPrefixPattern: 'BR-018[FAMILY CODE]',
  },
  XIAOMI_FAMILY: {
    modelPattern: 'XIAOM-[FAMILY CODE]',
    recordPrefixPattern: 'BR-019[FAMILY CODE]',
  },
  LIQUIDAI_FAMILY: {
    modelPattern: 'LQAI-[FAMILY CODE]',
    recordPrefixPattern: 'BR-020[FAMILY CODE]',
  },
  INCLUSIONAI_FAMILY: {
    modelPattern: 'INCAI-[FAMILY CODE]',
    recordPrefixPattern: 'BR-021[FAMILY CODE]',
  },
  LG_FAMILY: {
    modelPattern: 'LGAI-[FAMILY CODE]',
    recordPrefixPattern: 'BR-022[FAMILY CODE]',
  },
  NOUS_FAMILY: {
    modelPattern: 'NOUS-[FAMILY CODE]',
    recordPrefixPattern: 'BR-023[FAMILY CODE]',
  },
  UPSTAGE_FAMILY: {
    modelPattern: 'UPSTG-[FAMILY CODE]',
    recordPrefixPattern: 'BR-024[FAMILY CODE]',
  },
  AI21_FAMILY: {
    modelPattern: 'AI21-[FAMILY CODE]',
    recordPrefixPattern: 'BR-025[FAMILY CODE]',
  },
  STEPFUN_FAMILY: {
    modelPattern: 'STPFN-[FAMILY CODE]',
    recordPrefixPattern: 'BR-026[FAMILY CODE]',
  },
  MICROSOFT_FAMILY: {
    modelPattern: 'MSFT-[FAMILY CODE]',
    recordPrefixPattern: 'BR-027[FAMILY CODE]',
  },
  MBZUAI_FAMILY: {
    modelPattern: 'MBZAI-[FAMILY CODE]',
    recordPrefixPattern: 'BR-028[FAMILY CODE]',
  },
  CHINAMOBILE_FAMILY: {
    modelPattern: 'CMOB-[FAMILY CODE]',
    recordPrefixPattern: 'BR-029[FAMILY CODE]',
  },
  SARVAM_FAMILY: {
    modelPattern: 'SRVM-[FAMILY CODE]',
    recordPrefixPattern: 'BR-030[FAMILY CODE]',
  },
  OPENBMB_FAMILY: {
    modelPattern: 'OBMB-[FAMILY CODE]',
    recordPrefixPattern: 'BR-031[FAMILY CODE]',
  },
  SWISSAI_FAMILY: {
    modelPattern: 'SWAI-[FAMILY CODE]',
    recordPrefixPattern: 'BR-032[FAMILY CODE]',
  },
  BYTEDANCESEED_FAMILY: {
    modelPattern: 'BDSD-[FAMILY CODE]',
    recordPrefixPattern: 'BR-033[FAMILY CODE]',
  },
  TRILLIONLABS_FAMILY: {
    modelPattern: 'TRLN-[FAMILY CODE]',
    recordPrefixPattern: 'BR-034[FAMILY CODE]',
  },
  TENCENT_FAMILY: {
    modelPattern: 'TCNT-[FAMILY CODE]',
    recordPrefixPattern: 'BR-035[FAMILY CODE]',
  },
  BAIDU_FAMILY: {
    modelPattern: 'BAIDU-[FAMILY CODE]',
    recordPrefixPattern: 'BR-036[FAMILY CODE]',
  },
  SERVICENOW_FAMILY: {
    modelPattern: 'SVNW-[FAMILY CODE]',
    recordPrefixPattern: 'BR-037[FAMILY CODE]',
  },
  REKA_FAMILY: {
    modelPattern: 'REKA-[FAMILY CODE]',
    recordPrefixPattern: 'BR-038[FAMILY CODE]',
  },
  KOREATELECOM_FAMILY: {
    modelPattern: 'KT-[FAMILY CODE]',
    recordPrefixPattern: 'BR-039[FAMILY CODE]',
  },
  KWAIKAT_FAMILY: {
    modelPattern: 'KWAI-[FAMILY CODE]',
    recordPrefixPattern: 'BR-040[FAMILY CODE]',
  },
  INCEPTION_FAMILY: {
    modelPattern: 'INCPT-[FAMILY CODE]',
    recordPrefixPattern: 'BR-041[FAMILY CODE]',
  },
  DATABRICKS_FAMILY: {
    modelPattern: 'DBRX-[FAMILY CODE]',
    recordPrefixPattern: 'BR-042[FAMILY CODE]',
  },
  NAVER_FAMILY: {
    modelPattern: 'NAVER-[FAMILY CODE]',
    recordPrefixPattern: 'BR-043[FAMILY CODE]',
  },
  MULTIVERSE_FAMILY: {
    modelPattern: 'MVSC-[FAMILY CODE]',
    recordPrefixPattern: 'BR-044[FAMILY CODE]',
  },
  PRIMEINTELLECT_FAMILY: {
    modelPattern: 'PRIME-[FAMILY CODE]',
    recordPrefixPattern: 'BR-045[FAMILY CODE]',
  },
  NEX_FAMILY: {
    modelPattern: 'NEXAI-[FAMILY CODE]',
    recordPrefixPattern: 'BR-046[FAMILY CODE]',
  },
  LONGCAT_FAMILY: {
    modelPattern: 'LCAT-[FAMILY CODE]',
    recordPrefixPattern: 'BR-047[FAMILY CODE]',
  },
  MOTIF_FAMILY: {
    modelPattern: 'MOTIF-[FAMILY CODE]',
    recordPrefixPattern: 'BR-048[FAMILY CODE]',
  },
  NANBEIGE_FAMILY: {
    modelPattern: 'NANB-[FAMILY CODE]',
    recordPrefixPattern: 'BR-049[FAMILY CODE]',
  },
  SNOWFLAKE_FAMILY: {
    modelPattern: 'SNOW-[FAMILY CODE]',
    recordPrefixPattern: 'BR-050[FAMILY CODE]',
  },
  ARCEE_FAMILY: {
    modelPattern: 'ARCEE-[FAMILY CODE]',
    recordPrefixPattern: 'BR-051[FAMILY CODE]',
  },
  TIIUAE_FAMILY: {
    modelPattern: 'TIIUA-[FAMILY CODE]',
    recordPrefixPattern: 'BR-052[FAMILY CODE]',
  },
  DEEPCOGITO_FAMILY: {
    modelPattern: 'DPCOG-[FAMILY CODE]',
    recordPrefixPattern: 'BR-053[FAMILY CODE]',
  },
  OPENCHAT_FAMILY: {
    modelPattern: 'OPCHT-[FAMILY CODE]',
    recordPrefixPattern: 'BR-054[FAMILY CODE]',
  },
};

export const PROVIDER_DOCUMENTATION = PROVIDERS.map((provider) => ({
  ...provider,
  ...PATTERNS[provider.identifierStrategy],
}));
