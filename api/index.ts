import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createApp } from '../src/application.js';
import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/db/database.js';

const environment = loadEnvironment();
const database = createDatabase(environment.DATABASE_URL);
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
