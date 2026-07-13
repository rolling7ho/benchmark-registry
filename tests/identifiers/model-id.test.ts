import { describe, expect, it } from 'vitest';

import { IdentifierError } from '../../src/identifiers/errors.js';
import {
  generateModelIdentifier,
  validateModelIdentifier,
} from '../../src/identifiers/model-id.js';

describe('generateModelIdentifier', () => {
  it.each([
    [{ provider: 'openai', family: 'GPT', modelNumber: '55' }, 'OPNAI-55'],
    [
      { provider: 'openai', family: 'GPT', modelNumber: '55', tierCode: 'P' },
      'OPNAI-55P',
    ],
    [
      {
        provider: 'anthropic',
        family: 'Claude',
        modelNumber: '48',
        tierCode: 'O',
      },
      'ANTHR-O48',
    ],
    [
      {
        provider: 'anthropic',
        family: 'Claude',
        modelNumber: '48',
        tierCode: 'S',
      },
      'ANTHR-S48',
    ],
    [
      {
        provider: 'google',
        family: 'Gemini',
        modelNumber: '35',
        tierCode: 'F',
      },
      'GOOGL-G35F',
    ],
    [
      {
        provider: 'google',
        family: 'Gemini',
        modelNumber: '35',
        tierCode: 'P',
      },
      'GOOGL-G35P',
    ],
    [{ provider: 'xai', family: 'Grok', modelNumber: '45' }, 'XAI-G45'],
    [{ provider: 'cursor', family: 'Composer', modelNumber: '1' }, 'CURSR-C1'],
    [{ provider: 'perplexity', family: 'Sonar', modelNumber: '4' }, 'PPLX-S4'],
    [{ provider: 'qwen', family: 'Qwen', modelNumber: '35' }, 'QWEN-35'],
    [{ provider: 'deepseek', family: 'R1' }, 'DPSK-R1'],
    [{ provider: 'meta', family: 'MS' }, 'META-MS'],
    [
      { provider: 'openai', family: 'GPT', modelNumber: '56', tierCode: 'SL' },
      'OPNAI-56SL',
    ],
    [
      { provider: 'openai', family: 'GPT', modelNumber: '56', tierCode: 'TR' },
      'OPNAI-56TR',
    ],
    [
      { provider: 'openai', family: 'GPT', modelNumber: '56', tierCode: 'LN' },
      'OPNAI-56LN',
    ],
    [
      {
        provider: 'anthropic',
        family: 'Claude',
        modelNumber: '5',
        tierCode: 'FB',
      },
      'ANTHR-FB5',
    ],
    [{ provider: 'moonshot', family: 'K27CODE' }, 'KIMI-K27CODE'],
    [{ provider: 'zhipu', family: 'GLM', modelNumber: '52' }, 'GLM-52'],
    [{ provider: 'minimax', family: 'M3' }, 'MMAX-M3'],
    [
      {
        provider: 'mistral',
        family: 'Small',
        modelNumber: '4',
        tierCode: 'SM',
      },
      'MSTRL-SM4',
    ],
    [
      {
        provider: 'mistral',
        family: 'Large',
        modelNumber: '3',
        tierCode: 'LG',
      },
      'MSTRL-LG3',
    ],
    [{ provider: 'cohere', family: 'APLUS' }, 'COHR-APLUS'],
    [{ provider: 'nvidia', family: 'X1' }, 'NVDA-X1'],
    [{ provider: 'amazon', family: 'X1' }, 'AMZN-X1'],
    [{ provider: 'ibm', family: 'X1' }, 'IBM-X1'],
    [{ provider: 'ai2', family: 'X1' }, 'AI2-X1'],
    [{ provider: 'xiaomi', family: 'X1' }, 'XIAOM-X1'],
    [{ provider: 'liquidai', family: 'X1' }, 'LQAI-X1'],
    [{ provider: 'inclusionai', family: 'X1' }, 'INCAI-X1'],
    [{ provider: 'lg', family: 'X1' }, 'LGAI-X1'],
    [{ provider: 'nous-research', family: 'X1' }, 'NOUS-X1'],
    [{ provider: 'upstage', family: 'X1' }, 'UPSTG-X1'],
    [{ provider: 'ai21-labs', family: 'X1' }, 'AI21-X1'],
    [{ provider: 'stepfun', family: 'X1' }, 'STPFN-X1'],
    [{ provider: 'microsoft', family: 'X1' }, 'MSFT-X1'],
    [{ provider: 'mbzuai', family: 'X1' }, 'MBZAI-X1'],
    [{ provider: 'china-mobile', family: 'X1' }, 'CMOB-X1'],
    [{ provider: 'sarvam', family: 'X1' }, 'SRVM-X1'],
    [{ provider: 'openbmb', family: 'X1' }, 'OBMB-X1'],
    [{ provider: 'swiss-ai-initiative', family: 'X1' }, 'SWAI-X1'],
    [{ provider: 'bytedance-seed', family: 'X1' }, 'BDSD-X1'],
    [{ provider: 'trillionlabs', family: 'X1' }, 'TRLN-X1'],
    [{ provider: 'tencent', family: 'X1' }, 'TCNT-X1'],
    [{ provider: 'baidu', family: 'X1' }, 'BAIDU-X1'],
    [{ provider: 'servicenow', family: 'X1' }, 'SVNW-X1'],
    [{ provider: 'reka-ai', family: 'X1' }, 'REKA-X1'],
    [{ provider: 'korea-telecom', family: 'X1' }, 'KT-X1'],
    [{ provider: 'kwaikat', family: 'X1' }, 'KWAI-X1'],
    [{ provider: 'inception', family: 'X1' }, 'INCPT-X1'],
    [{ provider: 'databricks', family: 'X1' }, 'DBRX-X1'],
    [{ provider: 'naver', family: 'X1' }, 'NAVER-X1'],
    [{ provider: 'multiversecomputing', family: 'X1' }, 'MVSC-X1'],
    [{ provider: 'prime-intellect', family: 'X1' }, 'PRIME-X1'],
    [{ provider: 'nex', family: 'X1' }, 'NEXAI-X1'],
    [{ provider: 'longcat', family: 'X1' }, 'LCAT-X1'],
    [{ provider: 'motif-technologies', family: 'X1' }, 'MOTIF-X1'],
    [{ provider: 'nanbeige', family: 'X1' }, 'NANB-X1'],
    [{ provider: 'snowflake', family: 'X1' }, 'SNOW-X1'],
    [{ provider: 'arcee', family: 'X1' }, 'ARCEE-X1'],
    [{ provider: 'tii-uae', family: 'X1' }, 'TIIUA-X1'],
    [{ provider: 'deepcogito', family: 'X1' }, 'DPCOG-X1'],
    [{ provider: 'openchat', family: 'X1' }, 'OPCHT-X1'],
  ])('generates %s as %s', (input, expected) => {
    expect(generateModelIdentifier(input)).toBe(expected);
  });

  it.each([
    [{ provider: 'qwen', family: 'VL8B' }, 'QWEN-VL8B'],
    [{ provider: 'zhipu', family: 'AIR' }, 'GLM-AIR'],
  ])(
    'falls back to a family code when no numeric model number is given: %s -> %s',
    (input, expected) => {
      expect(generateModelIdentifier(input)).toBe(expected);
    },
  );

  it('rejects a tier code for the new FAMILY-strategy providers', () => {
    expect(() =>
      generateModelIdentifier({
        provider: 'nvidia',
        family: 'X1',
        tierCode: 'P',
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_COMPONENT' }));
  });

  it.each([
    { provider: 'openai', family: 'GPT' },
    { provider: 'anthropic', family: 'Claude', modelNumber: '48' },
    {
      provider: 'google',
      family: 'Gemini',
      modelNumber: '35',
    },
    { provider: 'deepseek' },
    { provider: 'meta' },
    { provider: 'moonshot' },
    { provider: 'zhipu' },
    { provider: 'minimax' },
    { provider: 'mistral', modelNumber: '4' },
    { provider: 'cohere' },
  ])('rejects missing required components: %s', (input) => {
    expect(() => generateModelIdentifier(input)).toThrow(IdentifierError);
  });

  it('rejects unsupported providers', () => {
    expect(() =>
      generateModelIdentifier({ provider: 'unsupported', modelNumber: '1' }),
    ).toThrowError(expect.objectContaining({ code: 'UNKNOWN_PROVIDER' }));
  });

  it('rejects tiers that are not valid for the provider strategy', () => {
    expect(() =>
      generateModelIdentifier({
        provider: 'anthropic',
        modelNumber: '48',
        tierCode: 'P',
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_COMPONENT' }));
  });

  it('rejects OpenAI tiers that are not approved for the provider', () => {
    expect(() =>
      generateModelIdentifier({
        provider: 'openai',
        modelNumber: '56',
        tierCode: 'O',
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_COMPONENT' }));
  });

  it('rejects a tier code for Moonshot AI (family-only strategy)', () => {
    expect(() =>
      generateModelIdentifier({
        provider: 'moonshot',
        family: 'K27CODE',
        tierCode: 'P',
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_COMPONENT' }));
  });
});

describe('validateModelIdentifier', () => {
  it.each([
    ['OPNAI-55P', 'openai'],
    ['ANTHR-O48', 'anthropic'],
    ['GOOGL-G35F', 'google'],
    ['XAI-G45', 'xai'],
    ['CURSR-C1', 'cursor'],
    ['PPLX-S4', 'perplexity'],
    ['QWEN-35', 'qwen'],
    ['DPSK-R1', 'deepseek'],
    ['META-MS', 'meta'],
    ['OPNAI-56SL', 'openai'],
    ['OPNAI-56TR', 'openai'],
    ['OPNAI-56LN', 'openai'],
    ['ANTHR-FB5', 'anthropic'],
    ['KIMI-K27CODE', 'moonshot'],
    ['GLM-52', 'zhipu'],
    ['MMAX-M3', 'minimax'],
    ['MSTRL-SM4', 'mistral'],
    ['COHR-APLUS', 'cohere'],
    ['NVDA-X1', 'nvidia'],
    ['AMZN-X1', 'amazon'],
    ['IBM-X1', 'ibm'],
    ['AI2-X1', 'ai2'],
    ['XIAOM-X1', 'xiaomi'],
    ['LQAI-X1', 'liquidai'],
    ['INCAI-X1', 'inclusionai'],
    ['LGAI-X1', 'lg'],
    ['NOUS-X1', 'nous-research'],
    ['UPSTG-X1', 'upstage'],
    ['AI21-X1', 'ai21-labs'],
    ['STPFN-X1', 'stepfun'],
    ['MSFT-X1', 'microsoft'],
    ['MBZAI-X1', 'mbzuai'],
    ['CMOB-X1', 'china-mobile'],
    ['SRVM-X1', 'sarvam'],
    ['OBMB-X1', 'openbmb'],
    ['SWAI-X1', 'swiss-ai-initiative'],
    ['BDSD-X1', 'bytedance-seed'],
    ['TRLN-X1', 'trillionlabs'],
    ['TCNT-X1', 'tencent'],
    ['BAIDU-X1', 'baidu'],
    ['SVNW-X1', 'servicenow'],
    ['REKA-X1', 'reka-ai'],
    ['KT-X1', 'korea-telecom'],
    ['KWAI-X1', 'kwaikat'],
    ['INCPT-X1', 'inception'],
    ['DBRX-X1', 'databricks'],
    ['NAVER-X1', 'naver'],
    ['MVSC-X1', 'multiversecomputing'],
    ['PRIME-X1', 'prime-intellect'],
    ['NEXAI-X1', 'nex'],
    ['LCAT-X1', 'longcat'],
    ['MOTIF-X1', 'motif-technologies'],
    ['NANB-X1', 'nanbeige'],
    ['SNOW-X1', 'snowflake'],
    ['ARCEE-X1', 'arcee'],
    ['TIIUA-X1', 'tii-uae'],
    ['DPCOG-X1', 'deepcogito'],
    ['OPCHT-X1', 'openchat'],
    ['QWEN-VL8B', 'qwen'],
    ['GLM-AIR', 'zhipu'],
  ])('validates %s', (identifier, providerSlug) => {
    expect(validateModelIdentifier(identifier)).toMatchObject({
      normalizedIdentifier: identifier,
      providerSlug,
    });
  });

  it('normalizes lowercase candidates', () => {
    expect(validateModelIdentifier('opnai-55').normalizedIdentifier).toBe(
      'OPNAI-55',
    );
  });

  it.each(['ANTHR-48O', 'GOOGL-F35', 'OPNAI-', 'DPSK-R-1'])(
    'rejects malformed provider-specific format %s',
    (identifier) => {
      expect(() => validateModelIdentifier(identifier)).toThrowError(
        expect.objectContaining({ code: 'INVALID_IDENTIFIER' }),
      );
    },
  );

  it('rejects unknown provider prefixes', () => {
    expect(() => validateModelIdentifier('OTHER-1')).toThrowError(
      expect.objectContaining({ code: 'UNKNOWN_PROVIDER' }),
    );
  });
});
