import { z } from 'zod';

import { REGISTRY_STATUSES } from '../db/constants.js';

const nullableText = z
  .string()
  .trim()
  .min(1)
  .nullable()
  .optional()
  .default(null);
const nullableIsoDate = z.iso.date().nullable().optional().default(null);

export const createModelInputSchema = z
  .object({
    organizationSlug: z
      .string()
      .trim()
      .min(1)
      .transform((value) => value.toLowerCase()),
    officialName: z.string().trim().min(1),
    family: nullableText,
    modelNumber: nullableText,
    tierCode: nullableText,
    status: z.enum(REGISTRY_STATUSES).default('ACTIVE'),
    releaseDate: nullableIsoDate,
  })
  .strict();

export type CreateModelInput = z.input<typeof createModelInputSchema>;
export type ValidatedCreateModelInput = z.output<typeof createModelInputSchema>;
