import fs from 'node:fs';

import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/db/database.js';
import { createOrganization, listAdministrativeOrganizations } from '../src/registry/admin.js';
import { createModel } from '../src/db/models.js';
import { PROVIDERS } from '../src/identifiers/providers.js';

const SCRATCH =
  '/private/tmp/claude-501/-Users-ivanuy-Desktop-Projects-active-projects-benchmark-registry/5a4b2356-b0e9-4428-9150-daf94c0e1a3c/scratchpad';

interface KeptGroup {
  orgSlug: string;
  canonicalName: string;
  variants: Array<{ raw: any; config: any }>;
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

const env = loadEnvironment();
const db = createDatabase(env.DATABASE_URL);

const existingOrgs = new Set(
  (await listAdministrativeOrganizations(db)).map((o) => o.slug),
);

const neededOrgSlugs = [...new Set(groups.map((g) => g.orgSlug))];
console.log('needed orgs:', neededOrgSlugs.length);

const createdOrgs: string[] = [];
for (const slug of neededOrgSlugs) {
  if (existingOrgs.has(slug)) continue;
  const provider = PROVIDERS.find((p) => p.slug === slug);
  if (provider === undefined) {
    throw new Error(`No provider configuration for org slug ${slug}`);
  }
  await createOrganization(db, { provider: slug });
  createdOrgs.push(slug);
}
console.log('created orgs:', createdOrgs.length, createdOrgs);

// Model creation
const modelIdByGroupKey = new Map<string, string>();
let createdModels = 0;
let failedModels = 0;

for (const g of groups) {
  const key = `${g.orgSlug}|||${g.canonicalName}`;
  const family = g.identity.family ?? null;
  const modelNumber = g.identity.modelNumber ?? null;
  const tierCode = g.identity.tierCode ?? null;

  // release date: earliest non-null releaseDate among variants
  const releaseDates = g.variants
    .map((v) => v.raw.releaseDate)
    .filter((d: unknown): d is string => typeof d === 'string' && d.length > 0)
    .sort();
  const releaseDate = releaseDates[0] ?? null;

  try {
    const model = await createModel(db, {
      organizationSlug: g.orgSlug,
      officialName: g.canonicalName,
      family,
      modelNumber,
      tierCode,
      status: 'ACTIVE',
      releaseDate,
    });
    modelIdByGroupKey.set(key, model.model_id);
    createdModels++;
  } catch (error) {
    failedModels++;
    console.error(
      'FAILED to create model',
      g.orgSlug,
      g.canonicalName,
      (error as Error).message,
    );
  }
}

console.log('created models:', createdModels, 'failed:', failedModels);

fs.writeFileSync(
  `${SCRATCH}/stage3-model-ids.json`,
  JSON.stringify([...modelIdByGroupKey.entries()], null, 0),
);

await db.destroy();
