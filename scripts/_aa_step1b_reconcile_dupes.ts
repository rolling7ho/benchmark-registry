import fs from 'node:fs';

import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/db/database.js';
import { generateModelIdentifier } from '../src/identifiers/model-id.js';

const SCRATCH =
  '/private/tmp/claude-501/-Users-ivanuy-Desktop-Projects-active-projects-benchmark-registry/5a4b2356-b0e9-4428-9150-daf94c0e1a3c/scratchpad';

interface KeptGroup {
  orgSlug: string;
  canonicalName: string;
  identity: {
    kind: 'family' | 'strict';
    family?: string;
    modelNumber?: string | null;
    tierCode?: string | null;
  };
}

const groups: KeptGroup[] = JSON.parse(
  fs.readFileSync(`${SCRATCH}/stage2-parsed.json`, 'utf8'),
);
const existing = new Map<string, string>(
  JSON.parse(fs.readFileSync(`${SCRATCH}/stage3-model-ids.json`, 'utf8')),
);

const env = loadEnvironment();
const db = createDatabase(env.DATABASE_URL);

let reconciled = 0;
for (const g of groups) {
  const key = `${g.orgSlug}|||${g.canonicalName}`;
  if (existing.has(key)) continue;
  const modelIdentifier = generateModelIdentifier({
    provider: g.orgSlug,
    family: g.identity.family ?? null,
    modelNumber: g.identity.modelNumber ?? null,
    tierCode: g.identity.tierCode ?? null,
  });
  const row = await db
    .selectFrom('models')
    .select(['model_id', 'official_name'])
    .where('model_id', '=', modelIdentifier)
    .executeTakeFirst();
  if (row === undefined) {
    console.error('STILL MISSING', g.orgSlug, g.canonicalName, modelIdentifier);
    continue;
  }
  console.log('reconciled', g.orgSlug, g.canonicalName, '->', row.model_id, `(${row.official_name})`);
  existing.set(key, row.model_id);
  reconciled++;
}

console.log('reconciled:', reconciled, 'total mapped:', existing.size, 'of', groups.length);

fs.writeFileSync(
  `${SCRATCH}/stage3-model-ids.json`,
  JSON.stringify([...existing.entries()], null, 0),
);

await db.destroy();
