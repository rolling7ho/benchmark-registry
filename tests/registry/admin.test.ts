import { describe, expect, it } from 'vitest';

import {
  canonicalHttpUrl,
  prepareBenchmark,
  prepareMetric,
  prepareOrganization,
} from '../../src/registry/admin.js';

describe('administrative registry validation', () => {
  it('uses canonical provider configuration from a provider slug', () => {
    expect(prepareOrganization({ provider: 'openai' })).toEqual({
      slug: 'openai',
      name: 'OpenAI',
      providerPrefix: 'OPNAI',
      brNamespace: '001',
      identifierStrategy: 'OPENAI',
    });
  });

  it('rejects canonical provider configuration overrides', () => {
    expect(() =>
      prepareOrganization({ provider: 'openai', brNamespace: '777' }),
    ).toThrow('cannot override canonical provider configuration');
  });

  it('accepts only HTTP and HTTPS source URLs', () => {
    expect(canonicalHttpUrl('https://example.com/report?version=1')).toBe(
      'https://example.com/report?version=1',
    );
    expect(() => canonicalHttpUrl('ftp://example.com/report')).toThrow(
      'Invalid source URL',
    );
    expect(() =>
      canonicalHttpUrl('https://user:password@example.com/report'),
    ).toThrow('Invalid source URL');
    expect(() => canonicalHttpUrl('not a url')).toThrow('Invalid source URL');
  });

  it('validates benchmark and metric values before commit', () => {
    expect(
      prepareBenchmark({
        name: 'SWE-bench Verified',
        slug: 'swe-bench-verified',
      }),
    ).toMatchObject({ version: null, status: 'ACTIVE' });
    expect(() =>
      prepareBenchmark({ name: 'Benchmark', slug: 'Not Valid' }),
    ).toThrow('Invalid benchmark slug');
    expect(
      prepareMetric({ name: 'Overall', slug: 'overall' }).higher_is_better,
    ).toBeNull();
  });
});
