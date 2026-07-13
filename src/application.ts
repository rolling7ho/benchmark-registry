import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import Fastify, { type FastifyInstance } from 'fastify';
import { Eta } from 'eta';

import type { Database } from './db/database.js';
import { registerCompression } from './plugins/compression.js';
import { registerDynamicResponseCaching } from './plugins/response-cache.js';
import { registerSecurityHeaders } from './plugins/security.js';
import indexRoutes from './routes/index.js';
import { createAssetPath } from './web/assets.js';

export interface CreateAppOptions {
  database?: Database;
  closeDatabaseOnShutdown?: boolean;
  production?: boolean;
  runtimeDirectory?: string;
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const production =
    options.production ?? process.env.NODE_ENV === 'production';
  const app = Fastify({ logger: true });
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(moduleDirectory, '..');
  const runtimeDirectory =
    options.runtimeDirectory ?? (production ? moduleDirectory : projectRoot);
  const viewsDirectory = production
    ? path.join(runtimeDirectory, 'views')
    : path.join(projectRoot, 'src', 'views');
  const publicDirectory = production
    ? path.join(runtimeDirectory, 'public')
    : path.join(projectRoot, 'public');
  const assetPath = createAssetPath(production, runtimeDirectory);

  registerSecurityHeaders(app);
  registerCompression(app, production);
  registerDynamicResponseCaching(app);

  const eta = new Eta({
    views: viewsDirectory,
  });

  void app.register(fastifyView, {
    engine: { eta },
    root: viewsDirectory,
    production,
    defaultContext: { assetPath },
  });

  void app.register(fastifyStatic, {
    root: publicDirectory,
    prefix: '/public/',
    cacheControl: true,
    immutable: production,
    maxAge: production ? '1y' : 0,
  });

  const database = options.database;

  void app.register(indexRoutes, { database });

  if (database !== undefined && options.closeDatabaseOnShutdown !== false) {
    app.addHook('onClose', async () => {
      await database.destroy();
    });
  }

  return app;
}
