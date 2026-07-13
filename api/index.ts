import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { attachDatabasePool } from '@vercel/functions';

import { createApp } from '../src/application.js';
import { loadEnvironment } from '../src/config/env.js';
import { createDatabaseFromPool, createPool } from '../src/db/database.js';

const environment = loadEnvironment();
const pool = createPool(environment.DATABASE_URL, {
  idleTimeoutMillis: 5_000,
  min: 1,
});
attachDatabasePool(pool);
const database = createDatabaseFromPool(pool);
const app = createApp({
  database,
  runtimeDirectory: path.join(process.cwd(), 'dist'),
});

await app.ready();

export default function handler(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  app.server.emit('request', request, response);
}
