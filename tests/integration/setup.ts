import { register } from 'tsx/esm/api';

/**
 * node-pg-migrate's `runner()` API dynamically imports migration files at
 * runtime. Those files use TypeScript's `.js`-specifier-for-a-`.ts`-file
 * convention, which only resolves under a loader that remaps it (tsx, the
 * same one the `--tsx` CLI flag registers for `pnpm db:migrate`). Vitest's
 * own transform does not cover imports made by third-party packages, so
 * without this the migration files fail to load with a "Cannot find
 * module '.../constants.js'" error.
 */
register();
