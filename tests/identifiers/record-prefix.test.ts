import { describe, expect, it } from 'vitest';

import { IdentifierError } from '../../src/identifiers/errors.js';
import {
  assertModelIdentifierMatchesRecordPrefix,
  generateRecordPrefix,
} from '../../src/identifiers/record-prefix.js';

describe('generateRecordPrefix', () => {
  it.each([
    [{ provider: 'openai', modelNumber: '55' }, 'BR-00155'],
    [{ provider: 'openai', modelNumber: '55', tierCode: 'P' }, 'BR-00155P'],
    [{ provider: 'anthropic', modelNumber: '48', tierCode: 'O' }, 'BR-002O48'],
    [
      {
        provider: 'google',
        family: 'Gemini',
        modelNumber: '35',
        tierCode: 'F',
      },
      'BR-00335F',
    ],
    [{ provider: 'xai', modelNumber: '45' }, 'BR-00445'],
    [{ provider: 'cursor', modelNumber: '1' }, 'BR-005C1'],
    [{ provider: 'perplexity', modelNumber: '4' }, 'BR-0064'],
    [{ provider: 'qwen', modelNumber: '35' }, 'BR-00735'],
    [{ provider: 'deepseek', family: 'R1' }, 'BR-008R1'],
    [{ provider: 'meta', family: 'MS' }, 'BR-009MS'],
    [{ provider: 'openai', modelNumber: '56', tierCode: 'SL' }, 'BR-00156SL'],
    [{ provider: 'anthropic', modelNumber: '5', tierCode: 'FB' }, 'BR-002FB5'],
    [{ provider: 'moonshot', family: 'K27CODE' }, 'BR-010K27CODE'],
    [{ provider: 'zhipu', modelNumber: '52' }, 'BR-01152'],
    [{ provider: 'minimax', family: 'M3' }, 'BR-012M3'],
    [{ provider: 'mistral', modelNumber: '4', tierCode: 'SM' }, 'BR-013SM4'],
    [{ provider: 'cohere', family: 'APLUS' }, 'BR-014APLUS'],
    [{ provider: 'nvidia', family: 'X1' }, 'BR-015X1'],
    [{ provider: 'amazon', family: 'X1' }, 'BR-016X1'],
    [{ provider: 'ibm', family: 'X1' }, 'BR-017X1'],
    [{ provider: 'ai2', family: 'X1' }, 'BR-018X1'],
    [{ provider: 'xiaomi', family: 'X1' }, 'BR-019X1'],
    [{ provider: 'liquidai', family: 'X1' }, 'BR-020X1'],
    [{ provider: 'inclusionai', family: 'X1' }, 'BR-021X1'],
    [{ provider: 'lg', family: 'X1' }, 'BR-022X1'],
    [{ provider: 'nous-research', family: 'X1' }, 'BR-023X1'],
    [{ provider: 'upstage', family: 'X1' }, 'BR-024X1'],
    [{ provider: 'ai21-labs', family: 'X1' }, 'BR-025X1'],
    [{ provider: 'stepfun', family: 'X1' }, 'BR-026X1'],
    [{ provider: 'microsoft', family: 'X1' }, 'BR-027X1'],
    [{ provider: 'mbzuai', family: 'X1' }, 'BR-028X1'],
    [{ provider: 'china-mobile', family: 'X1' }, 'BR-029X1'],
    [{ provider: 'sarvam', family: 'X1' }, 'BR-030X1'],
    [{ provider: 'openbmb', family: 'X1' }, 'BR-031X1'],
    [{ provider: 'swiss-ai-initiative', family: 'X1' }, 'BR-032X1'],
    [{ provider: 'bytedance-seed', family: 'X1' }, 'BR-033X1'],
    [{ provider: 'trillionlabs', family: 'X1' }, 'BR-034X1'],
    [{ provider: 'tencent', family: 'X1' }, 'BR-035X1'],
    [{ provider: 'baidu', family: 'X1' }, 'BR-036X1'],
    [{ provider: 'servicenow', family: 'X1' }, 'BR-037X1'],
    [{ provider: 'reka-ai', family: 'X1' }, 'BR-038X1'],
    [{ provider: 'korea-telecom', family: 'X1' }, 'BR-039X1'],
    [{ provider: 'kwaikat', family: 'X1' }, 'BR-040X1'],
    [{ provider: 'inception', family: 'X1' }, 'BR-041X1'],
    [{ provider: 'databricks', family: 'X1' }, 'BR-042X1'],
    [{ provider: 'naver', family: 'X1' }, 'BR-043X1'],
    [{ provider: 'multiversecomputing', family: 'X1' }, 'BR-044X1'],
    [{ provider: 'prime-intellect', family: 'X1' }, 'BR-045X1'],
    [{ provider: 'nex', family: 'X1' }, 'BR-046X1'],
    [{ provider: 'longcat', family: 'X1' }, 'BR-047X1'],
    [{ provider: 'motif-technologies', family: 'X1' }, 'BR-048X1'],
    [{ provider: 'nanbeige', family: 'X1' }, 'BR-049X1'],
    [{ provider: 'snowflake', family: 'X1' }, 'BR-050X1'],
    [{ provider: 'arcee', family: 'X1' }, 'BR-051X1'],
    [{ provider: 'tii-uae', family: 'X1' }, 'BR-052X1'],
    [{ provider: 'deepcogito', family: 'X1' }, 'BR-053X1'],
    [{ provider: 'openchat', family: 'X1' }, 'BR-054X1'],
    [{ provider: 'qwen', family: 'VL8B' }, 'BR-007VL8B'],
    [{ provider: 'zhipu', family: 'AIR' }, 'BR-011AIR'],
  ])('generates %s as %s', (input, expected) => {
    expect(generateRecordPrefix(input)).toBe(expected);
  });

  it('rejects mismatched model and record providers', () => {
    expect(() =>
      assertModelIdentifierMatchesRecordPrefix('OPNAI-55', 'BR-002O48'),
    ).toThrowError(expect.objectContaining({ code: 'PROVIDER_MISMATCH' }));
  });

  it('rejects mismatched encodings for the same provider', () => {
    expect(() =>
      assertModelIdentifierMatchesRecordPrefix('OPNAI-55', 'BR-00155P'),
    ).toThrow(IdentifierError);
  });
});
