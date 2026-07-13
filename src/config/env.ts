import 'dotenv/config';

import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: z
      .string()
      .min(1)
      .refine(
        (value) => {
          try {
            const protocol = new URL(value).protocol;
            return protocol === 'postgres:' || protocol === 'postgresql:';
          } catch {
            return false;
          }
        },
        { message: 'Must be a valid PostgreSQL connection URL' },
      ),
    ADMIN_USERNAME: z.string().min(1).max(128).optional(),
    ADMIN_PASSWORD: z.string().min(12).max(1024).optional(),
  })
  .superRefine((environment, context) => {
    if (
      (environment.ADMIN_USERNAME === undefined) !==
      (environment.ADMIN_PASSWORD === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'ADMIN_USERNAME and ADMIN_PASSWORD must be configured together',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  input: NodeJS.ProcessEnv = process.env,
): Environment {
  return environmentSchema.parse(input);
}
