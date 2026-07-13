import { describe, expect, it } from 'vitest';

import { createModelInputSchema } from '../../src/validation/schemas.js';

describe('createModelInputSchema', () => {
  it('applies the active status default and accepts an ISO release date', () => {
    expect(
      createModelInputSchema.parse({
        organizationSlug: 'OpenAI',
        officialName: 'GPT-5.5',
        family: 'GPT',
        modelNumber: '55',
        releaseDate: '2026-06-01',
      }),
    ).toMatchObject({
      organizationSlug: 'openai',
      status: 'ACTIVE',
      releaseDate: '2026-06-01',
    });
  });

  it.each([
    { organizationSlug: 'openai', officialName: '  ' },
    {
      organizationSlug: 'openai',
      officialName: 'GPT-5.5',
      status: 'UNKNOWN',
    },
    {
      organizationSlug: 'openai',
      officialName: 'GPT-5.5',
      releaseDate: '2026-02-30',
    },
    {
      organizationSlug: 'openai',
      officialName: 'GPT-5.5',
      model_id: 'CALLER-PROVIDED',
    },
  ])('rejects invalid model input %s', (input) => {
    expect(() => createModelInputSchema.parse(input)).toThrow();
  });
});
