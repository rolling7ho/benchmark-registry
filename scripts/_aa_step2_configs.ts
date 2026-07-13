import fs from 'node:fs';

import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/db/database.js';
import {
  createOrReuseEvaluationConfiguration,
  getUnspecifiedConfiguration,
  configurationFingerprint,
} from '../src/registry/evaluation-configurations.js';

const SCRATCH =
  '/private/tmp/claude-501/-Users-ivanuy-Desktop-Projects-active-projects-benchmark-registry/5a4b2356-b0e9-4428-9150-daf94c0e1a3c/scratchpad';

const groups = JSON.parse(fs.readFileSync(`${SCRATCH}/stage2-parsed.json`, 'utf8'));

const env = loadEnvironment();
const db = createDatabase(env.DATABASE_URL);

const unspecified = await getUnspecifiedConfiguration(db);

// distinct config descriptors across all variants
const distinct = new Map<string, any>();
for (const g of groups) {
  for (const v of g.variants) {
    if (v.config === null) continue;
    const input = {
      reasoningMode: v.config.reasoningMode ?? null,
      reasoningEffort: v.config.reasoningEffort ?? null,
      additionalConfiguration:
        v.config.additional != null ? { note: v.config.additional } : {},
    };
    const fp = configurationFingerprint(input);
    if (!distinct.has(fp)) distinct.set(fp, input);
  }
}
console.log('distinct non-default configurations:', distinct.size);

const fingerprintToReference = new Map<string, string>();
let created = 0;
let reused = 0;
for (const [fp, input] of distinct) {
  const result = await createOrReuseEvaluationConfiguration(db, input);
  fingerprintToReference.set(fp, result.configuration.configuration_reference);
  if (result.created) created++;
  else reused++;
}
console.log('created configs:', created, 'reused:', reused);

fs.writeFileSync(
  `${SCRATCH}/stage4-config-refs.json`,
  JSON.stringify(
    {
      unspecifiedReference: unspecified.configuration_reference,
      byFingerprint: [...fingerprintToReference.entries()],
    },
    null,
    0,
  ),
);

await db.destroy();
