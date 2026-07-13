import { loadEnvironment } from '../config/env.js';
import { createDatabase } from '../db/database.js';
import { seedTestData } from '../db/seed-test-data.js';

async function main(): Promise<void> {
  const environment = loadEnvironment();
  if (environment.NODE_ENV === 'production') {
    throw new Error('Test fixture data cannot be seeded in production.');
  }
  const database = createDatabase(environment.DATABASE_URL);
  try {
    await seedTestData(database);
    console.info('Development/test fixture data seeded.');
  } finally {
    await database.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error('Failed to seed development/test fixture data.', error);
  process.exitCode = 1;
});
