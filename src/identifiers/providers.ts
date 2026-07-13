import { IdentifierError } from './errors.js';

export const IDENTIFIER_STRATEGIES = [
  'OPENAI',
  'ANTHROPIC',
  'GOOGLE_GEMINI',
  'XAI_GROK',
  'CURSOR_COMPOSER',
  'PERPLEXITY_SONAR',
  'QWEN',
  'DEEPSEEK',
  'META_FAMILY',
  'MOONSHOT_KIMI',
  'ZHIPU_GLM',
  'MINIMAX_FAMILY',
  'MISTRAL_TIER',
  'COHERE_FAMILY',
  'NVIDIA_FAMILY',
  'AMAZON_FAMILY',
  'IBM_FAMILY',
  'AI2_FAMILY',
  'XIAOMI_FAMILY',
  'LIQUIDAI_FAMILY',
  'INCLUSIONAI_FAMILY',
  'LG_FAMILY',
  'NOUS_FAMILY',
  'UPSTAGE_FAMILY',
  'AI21_FAMILY',
  'STEPFUN_FAMILY',
  'MICROSOFT_FAMILY',
  'MBZUAI_FAMILY',
  'CHINAMOBILE_FAMILY',
  'SARVAM_FAMILY',
  'OPENBMB_FAMILY',
  'SWISSAI_FAMILY',
  'BYTEDANCESEED_FAMILY',
  'TRILLIONLABS_FAMILY',
  'TENCENT_FAMILY',
  'BAIDU_FAMILY',
  'SERVICENOW_FAMILY',
  'REKA_FAMILY',
  'KOREATELECOM_FAMILY',
  'KWAIKAT_FAMILY',
  'INCEPTION_FAMILY',
  'DATABRICKS_FAMILY',
  'NAVER_FAMILY',
  'MULTIVERSE_FAMILY',
  'PRIMEINTELLECT_FAMILY',
  'NEX_FAMILY',
  'LONGCAT_FAMILY',
  'MOTIF_FAMILY',
  'NANBEIGE_FAMILY',
  'SNOWFLAKE_FAMILY',
  'ARCEE_FAMILY',
  'TIIUAE_FAMILY',
  'DEEPCOGITO_FAMILY',
  'OPENCHAT_FAMILY',
] as const;

export type IdentifierStrategy = (typeof IDENTIFIER_STRATEGIES)[number];

export interface ProviderConfiguration {
  readonly slug: string;
  readonly displayName: string;
  readonly providerPrefix: string;
  readonly brNamespace: string;
  readonly identifierStrategy: IdentifierStrategy;
}

export const PROVIDERS = [
  {
    slug: 'openai',
    displayName: 'OpenAI',
    providerPrefix: 'OPNAI',
    brNamespace: '001',
    identifierStrategy: 'OPENAI',
  },
  {
    slug: 'anthropic',
    displayName: 'Anthropic',
    providerPrefix: 'ANTHR',
    brNamespace: '002',
    identifierStrategy: 'ANTHROPIC',
  },
  {
    slug: 'google',
    displayName: 'Google',
    providerPrefix: 'GOOGL',
    brNamespace: '003',
    identifierStrategy: 'GOOGLE_GEMINI',
  },
  {
    slug: 'xai',
    displayName: 'xAI',
    providerPrefix: 'XAI',
    brNamespace: '004',
    identifierStrategy: 'XAI_GROK',
  },
  {
    slug: 'cursor',
    displayName: 'Cursor',
    providerPrefix: 'CURSR',
    brNamespace: '005',
    identifierStrategy: 'CURSOR_COMPOSER',
  },
  {
    slug: 'perplexity',
    displayName: 'Perplexity',
    providerPrefix: 'PPLX',
    brNamespace: '006',
    identifierStrategy: 'PERPLEXITY_SONAR',
  },
  {
    slug: 'qwen',
    displayName: 'Qwen',
    providerPrefix: 'QWEN',
    brNamespace: '007',
    identifierStrategy: 'QWEN',
  },
  {
    slug: 'deepseek',
    displayName: 'DeepSeek',
    providerPrefix: 'DPSK',
    brNamespace: '008',
    identifierStrategy: 'DEEPSEEK',
  },
  {
    slug: 'meta',
    displayName: 'Meta',
    providerPrefix: 'META',
    brNamespace: '009',
    identifierStrategy: 'META_FAMILY',
  },
  {
    slug: 'moonshot',
    displayName: 'Moonshot AI',
    providerPrefix: 'KIMI',
    brNamespace: '010',
    identifierStrategy: 'MOONSHOT_KIMI',
  },
  {
    slug: 'zhipu',
    displayName: 'Zhipu',
    providerPrefix: 'GLM',
    brNamespace: '011',
    identifierStrategy: 'ZHIPU_GLM',
  },
  {
    slug: 'minimax',
    displayName: 'MiniMax',
    providerPrefix: 'MMAX',
    brNamespace: '012',
    identifierStrategy: 'MINIMAX_FAMILY',
  },
  {
    slug: 'mistral',
    displayName: 'Mistral AI',
    providerPrefix: 'MSTRL',
    brNamespace: '013',
    identifierStrategy: 'MISTRAL_TIER',
  },
  {
    slug: 'cohere',
    displayName: 'Cohere',
    providerPrefix: 'COHR',
    brNamespace: '014',
    identifierStrategy: 'COHERE_FAMILY',
  },
  {
    slug: 'nvidia',
    displayName: 'NVIDIA',
    providerPrefix: 'NVDA',
    brNamespace: '015',
    identifierStrategy: 'NVIDIA_FAMILY',
  },
  {
    slug: 'amazon',
    displayName: 'Amazon',
    providerPrefix: 'AMZN',
    brNamespace: '016',
    identifierStrategy: 'AMAZON_FAMILY',
  },
  {
    slug: 'ibm',
    displayName: 'IBM',
    providerPrefix: 'IBM',
    brNamespace: '017',
    identifierStrategy: 'IBM_FAMILY',
  },
  {
    slug: 'ai2',
    displayName: 'Allen Institute for AI',
    providerPrefix: 'AI2',
    brNamespace: '018',
    identifierStrategy: 'AI2_FAMILY',
  },
  {
    slug: 'xiaomi',
    displayName: 'Xiaomi',
    providerPrefix: 'XIAOM',
    brNamespace: '019',
    identifierStrategy: 'XIAOMI_FAMILY',
  },
  {
    slug: 'liquidai',
    displayName: 'Liquid AI',
    providerPrefix: 'LQAI',
    brNamespace: '020',
    identifierStrategy: 'LIQUIDAI_FAMILY',
  },
  {
    slug: 'inclusionai',
    displayName: 'InclusionAI',
    providerPrefix: 'INCAI',
    brNamespace: '021',
    identifierStrategy: 'INCLUSIONAI_FAMILY',
  },
  {
    slug: 'lg',
    displayName: 'LG AI Research',
    providerPrefix: 'LGAI',
    brNamespace: '022',
    identifierStrategy: 'LG_FAMILY',
  },
  {
    slug: 'nous-research',
    displayName: 'Nous Research',
    providerPrefix: 'NOUS',
    brNamespace: '023',
    identifierStrategy: 'NOUS_FAMILY',
  },
  {
    slug: 'upstage',
    displayName: 'Upstage',
    providerPrefix: 'UPSTG',
    brNamespace: '024',
    identifierStrategy: 'UPSTAGE_FAMILY',
  },
  {
    slug: 'ai21-labs',
    displayName: 'AI21 Labs',
    providerPrefix: 'AI21',
    brNamespace: '025',
    identifierStrategy: 'AI21_FAMILY',
  },
  {
    slug: 'stepfun',
    displayName: 'StepFun',
    providerPrefix: 'STPFN',
    brNamespace: '026',
    identifierStrategy: 'STEPFUN_FAMILY',
  },
  {
    slug: 'microsoft',
    displayName: 'Microsoft',
    providerPrefix: 'MSFT',
    brNamespace: '027',
    identifierStrategy: 'MICROSOFT_FAMILY',
  },
  {
    slug: 'mbzuai',
    displayName: 'MBZUAI',
    providerPrefix: 'MBZAI',
    brNamespace: '028',
    identifierStrategy: 'MBZUAI_FAMILY',
  },
  {
    slug: 'china-mobile',
    displayName: 'China Mobile',
    providerPrefix: 'CMOB',
    brNamespace: '029',
    identifierStrategy: 'CHINAMOBILE_FAMILY',
  },
  {
    slug: 'sarvam',
    displayName: 'Sarvam',
    providerPrefix: 'SRVM',
    brNamespace: '030',
    identifierStrategy: 'SARVAM_FAMILY',
  },
  {
    slug: 'openbmb',
    displayName: 'OpenBMB',
    providerPrefix: 'OBMB',
    brNamespace: '031',
    identifierStrategy: 'OPENBMB_FAMILY',
  },
  {
    slug: 'swiss-ai-initiative',
    displayName: 'Swiss AI Initiative',
    providerPrefix: 'SWAI',
    brNamespace: '032',
    identifierStrategy: 'SWISSAI_FAMILY',
  },
  {
    slug: 'bytedance-seed',
    displayName: 'ByteDance Seed',
    providerPrefix: 'BDSD',
    brNamespace: '033',
    identifierStrategy: 'BYTEDANCESEED_FAMILY',
  },
  {
    slug: 'trillionlabs',
    displayName: 'Trillion Labs',
    providerPrefix: 'TRLN',
    brNamespace: '034',
    identifierStrategy: 'TRILLIONLABS_FAMILY',
  },
  {
    slug: 'tencent',
    displayName: 'Tencent',
    providerPrefix: 'TCNT',
    brNamespace: '035',
    identifierStrategy: 'TENCENT_FAMILY',
  },
  {
    slug: 'baidu',
    displayName: 'Baidu',
    providerPrefix: 'BAIDU',
    brNamespace: '036',
    identifierStrategy: 'BAIDU_FAMILY',
  },
  {
    slug: 'servicenow',
    displayName: 'ServiceNow',
    providerPrefix: 'SVNW',
    brNamespace: '037',
    identifierStrategy: 'SERVICENOW_FAMILY',
  },
  {
    slug: 'reka-ai',
    displayName: 'Reka AI',
    providerPrefix: 'REKA',
    brNamespace: '038',
    identifierStrategy: 'REKA_FAMILY',
  },
  {
    slug: 'korea-telecom',
    displayName: 'Korea Telecom',
    providerPrefix: 'KT',
    brNamespace: '039',
    identifierStrategy: 'KOREATELECOM_FAMILY',
  },
  {
    slug: 'kwaikat',
    displayName: 'KwaiKAT',
    providerPrefix: 'KWAI',
    brNamespace: '040',
    identifierStrategy: 'KWAIKAT_FAMILY',
  },
  {
    slug: 'inception',
    displayName: 'Inception',
    providerPrefix: 'INCPT',
    brNamespace: '041',
    identifierStrategy: 'INCEPTION_FAMILY',
  },
  {
    slug: 'databricks',
    displayName: 'Databricks',
    providerPrefix: 'DBRX',
    brNamespace: '042',
    identifierStrategy: 'DATABRICKS_FAMILY',
  },
  {
    slug: 'naver',
    displayName: 'Naver',
    providerPrefix: 'NAVER',
    brNamespace: '043',
    identifierStrategy: 'NAVER_FAMILY',
  },
  {
    slug: 'multiversecomputing',
    displayName: 'Multiverse Computing',
    providerPrefix: 'MVSC',
    brNamespace: '044',
    identifierStrategy: 'MULTIVERSE_FAMILY',
  },
  {
    slug: 'prime-intellect',
    displayName: 'Prime Intellect',
    providerPrefix: 'PRIME',
    brNamespace: '045',
    identifierStrategy: 'PRIMEINTELLECT_FAMILY',
  },
  {
    slug: 'nex',
    displayName: 'Nex AGI',
    providerPrefix: 'NEXAI',
    brNamespace: '046',
    identifierStrategy: 'NEX_FAMILY',
  },
  {
    slug: 'longcat',
    displayName: 'LongCat',
    providerPrefix: 'LCAT',
    brNamespace: '047',
    identifierStrategy: 'LONGCAT_FAMILY',
  },
  {
    slug: 'motif-technologies',
    displayName: 'Motif Technologies',
    providerPrefix: 'MOTIF',
    brNamespace: '048',
    identifierStrategy: 'MOTIF_FAMILY',
  },
  {
    slug: 'nanbeige',
    displayName: 'Nanbeige',
    providerPrefix: 'NANB',
    brNamespace: '049',
    identifierStrategy: 'NANBEIGE_FAMILY',
  },
  {
    slug: 'snowflake',
    displayName: 'Snowflake',
    providerPrefix: 'SNOW',
    brNamespace: '050',
    identifierStrategy: 'SNOWFLAKE_FAMILY',
  },
  {
    slug: 'arcee',
    displayName: 'Arcee AI',
    providerPrefix: 'ARCEE',
    brNamespace: '051',
    identifierStrategy: 'ARCEE_FAMILY',
  },
  {
    slug: 'tii-uae',
    displayName: 'TII UAE',
    providerPrefix: 'TIIUA',
    brNamespace: '052',
    identifierStrategy: 'TIIUAE_FAMILY',
  },
  {
    slug: 'deepcogito',
    displayName: 'Deep Cogito',
    providerPrefix: 'DPCOG',
    brNamespace: '053',
    identifierStrategy: 'DEEPCOGITO_FAMILY',
  },
  {
    slug: 'openchat',
    displayName: 'OpenChat',
    providerPrefix: 'OPCHT',
    brNamespace: '054',
    identifierStrategy: 'OPENCHAT_FAMILY',
  },
] as const satisfies readonly ProviderConfiguration[];

export type ProviderSlug = (typeof PROVIDERS)[number]['slug'];

export function getProviderBySlug(slug: string): ProviderConfiguration {
  const normalizedSlug = slug.trim().toLowerCase();
  const provider = PROVIDERS.find(
    (candidate) => candidate.slug === normalizedSlug,
  );

  if (provider === undefined) {
    throw new IdentifierError(
      'UNKNOWN_PROVIDER',
      `Unsupported provider slug: ${slug}`,
    );
  }

  return provider;
}

export function getProviderByPrefix(prefix: string): ProviderConfiguration {
  const provider = PROVIDERS.find(
    (candidate) => candidate.providerPrefix === prefix,
  );

  if (provider === undefined) {
    throw new IdentifierError(
      'UNKNOWN_PROVIDER',
      `Unknown provider prefix: ${prefix}`,
    );
  }

  return provider;
}

export function getProviderByNamespace(
  namespace: string,
): ProviderConfiguration {
  const provider = PROVIDERS.find(
    (candidate) => candidate.brNamespace === namespace,
  );

  if (provider === undefined) {
    throw new IdentifierError(
      'UNKNOWN_PROVIDER',
      `Unknown Benchmark Record namespace: ${namespace}`,
    );
  }

  return provider;
}
