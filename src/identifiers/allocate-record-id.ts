import type { Transaction } from 'kysely';

import type { Database } from '../db/database.js';
import type { DatabaseSchema } from '../db/types.js';
import { IdentifierError } from './errors.js';
import { formatBenchmarkRecordIdentifier } from './record-id.js';

export interface AllocatedBenchmarkRecordIdentifier {
  recordId: string;
  sequenceNumber: number;
  recordPrefix: string;
}

export async function allocateBenchmarkRecordIdentifierInTransaction(
  transaction: Transaction<DatabaseSchema>,
  modelInternalId: string,
): Promise<AllocatedBenchmarkRecordIdentifier> {
  const model = await transaction
    .selectFrom('models')
    .select(['record_prefix', 'next_record_sequence'])
    .where('id', '=', modelInternalId)
    .forUpdate()
    .executeTakeFirst();

  if (model === undefined) {
    throw new IdentifierError(
      'MODEL_NOT_FOUND',
      `Cannot allocate a Benchmark Record Identifier: model ${modelInternalId} does not exist.`,
    );
  }

  const recordId = formatBenchmarkRecordIdentifier(
    model.record_prefix,
    model.next_record_sequence,
  );

  await transaction
    .updateTable('models')
    .set({ next_record_sequence: model.next_record_sequence + 1 })
    .where('id', '=', modelInternalId)
    .executeTakeFirstOrThrow();

  return {
    recordId,
    sequenceNumber: model.next_record_sequence,
    recordPrefix: model.record_prefix,
  };
}

export async function allocateBenchmarkRecordIdentifier(
  db: Database,
  modelInternalId: string,
): Promise<AllocatedBenchmarkRecordIdentifier> {
  return db
    .transaction()
    .execute(async (transaction) =>
      allocateBenchmarkRecordIdentifierInTransaction(
        transaction,
        modelInternalId,
      ),
    );
}
