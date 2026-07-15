import type { Kysely } from 'kysely';

import type { Database } from './database.js';
import type { DatabaseSchema } from './types.js';
import { publicRecordMaxTimestampExpression } from './public-record-visibility.js';

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

/**
 * Public pages must not reveal changes made only to quarantined records.
 * Administrative tooling continues to use the registry-wide metadata value.
 */
export async function getLastPublicRegistryUpdate(
  db: Database,
): Promise<string | null> {
  const row = await db
    .selectFrom('benchmark_records')
    .select(publicRecordMaxTimestampExpression().as('value'))
    .executeTakeFirstOrThrow();

  if (row.value === null) return null;
  const value = row.value instanceof Date ? row.value : new Date(row.value);
  if (Number.isNaN(value.getTime())) {
    throw new Error('Database returned an invalid public registry timestamp.');
  }
  return value.toISOString();
}
