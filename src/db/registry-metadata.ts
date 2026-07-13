import type { Kysely } from 'kysely';

import type { Database } from './database.js';
import type { DatabaseSchema } from './types.js';

export async function markRegistryUpdated(
  db: Kysely<DatabaseSchema>,
  timestamp = new Date(),
): Promise<void> {
  await db
    .insertInto('registry_metadata')
    .values({
      key: 'last_database_update',
      value: timestamp.toISOString(),
      updated_at: timestamp,
    })
    .onConflict((conflict) =>
      conflict.column('key').doUpdateSet({
        value: timestamp.toISOString(),
        updated_at: timestamp,
      }),
    )
    .execute();
}

export async function getLastDatabaseUpdate(
  db: Database,
): Promise<string | null> {
  const metadata = await db
    .selectFrom('registry_metadata')
    .select('value')
    .where('key', '=', 'last_database_update')
    .executeTakeFirst();

  return metadata?.value ?? null;
}
