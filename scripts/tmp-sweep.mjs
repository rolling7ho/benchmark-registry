import 'dotenv/config';
import { createDatabase } from '../src/db/database.js';
import { getRegistryRecords } from '../src/db/registry-records.js';
import { resolveSearch } from '../src/search/resolve-search.js';

const db = createDatabase(process.env.DATABASE_URL);

const models = await db
  .selectFrom('models')
  .select(['official_name'])
  .execute();

let mismatches = 0;
for (const { official_name } of models) {
  const spaced = official_name;
  const hyphenated = official_name.replace(/[\s]/g, '-');
  const compact = official_name.replace(/[\s._-]/g, '');

  const totals = [];
  for (const variant of [spaced, hyphenated, compact]) {
    const resolution = await resolveSearch(db, variant);
    if (resolution.kind === 'GENERAL') {
      const result = await getRegistryRecords(db, {
        kind: 'GENERAL',
        query: resolution.normalizedQuery,
      });
      totals.push(result.total);
    } else if (resolution.kind === 'MODEL') {
      const result = await getRegistryRecords(db, {
        kind: 'MODEL',
        modelInternalId: resolution.modelInternalId,
      });
      totals.push(result.total);
    } else {
      totals.push(`?${resolution.kind}`);
    }
  }
  const allEqual = totals.every((t) => t === totals[0]);
  if (!allEqual) {
    mismatches++;
    console.log('MISMATCH', official_name, totals);
  }
}
console.log(`checked ${models.length} models, ${mismatches} mismatches`);
await db.destroy();
