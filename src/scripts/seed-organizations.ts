import { loadEnvironment } from '../config/env.js';
import { createDatabase } from '../db/database.js';
import { seedOrganizations } from '../db/seed-organizations.js';

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const database = createDatabase(environment.DATABASE_URL);

  try {
    await seedOrganizations(database);
    console.info('Provider organizations seeded.');
  } finally {
    await database.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error('Failed to seed provider organizations.', error);
  process.exitCode = 1;
});
