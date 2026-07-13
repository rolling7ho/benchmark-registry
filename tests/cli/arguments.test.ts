import { describe, expect, it } from 'vitest';

import {
  assertAllowedFlags,
  booleanValue,
  parseArguments,
  requiredFlag,
} from '../../src/cli/arguments.js';

describe('registry CLI argument parsing', () => {
  it('parses explicit named flags and boolean controls', () => {
    const parsed = parseArguments([
      'record',
      'add',
      '--model',
      'OPNAI-55',
      '--score-display=72.4',
      '--yes',
    ]);
    expect(parsed.command).toEqual(['record', 'add']);
    expect(parsed.flags.get('model')).toBe('OPNAI-55');
    expect(parsed.flags.get('score-display')).toBe('72.4');
    expect(parsed.flags.get('yes')).toBe(true);
  });

  it('rejects missing required flags and unknown flags', () => {
    const parsed = parseArguments(['model', 'add', '--name', 'GPT-5.5']);
    expect(() => requiredFlag(parsed.flags, 'organization')).toThrow(
      'Missing required flag: --organization',
    );
    expect(() => assertAllowedFlags(parsed.flags, ['organization'])).toThrow(
      'Unknown flag: --name',
    );
  });

  it('rejects caller-supplied identifier flags for model creation', () => {
    const parsed = parseArguments(['model', 'add', '--model-id', 'CUSTOM']);
    expect(() =>
      assertAllowedFlags(parsed.flags, [
        'organization',
        'name',
        'family',
        'model-number',
        'tier',
        'status',
      ]),
    ).toThrow('Unknown flag: --model-id');
  });

  it.each(['yes', '1', 'TRUE'])(
    'rejects invalid nullable boolean %s',
    (value) => {
      expect(() => booleanValue(value, '--higher-is-better')).toThrow();
    },
  );
});
