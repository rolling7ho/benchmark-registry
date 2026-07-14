import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import Fastify, { type FastifyInstance } from 'fastify';
import { Eta } from 'eta';

import type { Database } from './db/database.js';
import type { AdminAuthConfig } from './admin/auth.js';
import { createFeedbackStore } from './feedback/store.js';
import type { FeedbackStore } from './feedback/types.js';
import { registerCompression } from './plugins/compression.js';
import { registerDynamicResponseCaching } from './plugins/response-cache.js';
import { registerSecurityHeaders } from './plugins/security.js';
import indexRoutes from './routes/index.js';
import feedbackRoutes from './routes/feedback.js';
import {
  createDatabaseRequestRateLimiter,
  type RequestRateLimiter,
} from './security/request-rate-limit.js';
import { createAssetPath } from './web/assets.js';
import { createPageSeo } from './web/seo.js';

export interface CreateAppOptions {
  database?: Database;
  closeDatabaseOnShutdown?: boolean;
  production?: boolean;
  runtimeDirectory?: string;
  adminAuth?: AdminAuthConfig;
  feedbackStore?: FeedbackStore;
  requestRateLimiter?: RequestRateLimiter;
  rateLimitSecret?: string;
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const production =
    options.production ?? process.env.NODE_ENV === 'production';
  const app = Fastify({ logger: true });
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    },
  );
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
  const favicon = readFileSync(path.join(publicDirectory, 'favicon.png'));
  const logo = readFileSync(path.join(publicDirectory, 'logo.png'));
  const socialCard = readFileSync(
    path.join(publicDirectory, 'social-card.png'),
  );

  registerSecurityHeaders(app);
  registerCompression(app, production);
  registerDynamicResponseCaching(app);

  app.setErrorHandler((error, _request, reply) => {
    const errorStatus =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;
    const statusCode =
      typeof errorStatus === 'number' && errorStatus >= 400 && errorStatus < 500
        ? errorStatus
        : 500;
    if (statusCode >= 500) {
      app.log.error(error, 'Registry request failed');
    } else {
      app.log.warn(error, 'Invalid registry request');
    }
    const message =
      statusCode === 413
        ? 'Request payload is too large'
        : statusCode < 500
          ? 'Invalid request'
          : 'Registry request failed';
    return reply.status(statusCode).view('error.eta', {
      title: `${statusCode} — Benchmark Registry`,
      seo: createPageSeo({
        title: `${statusCode} — Benchmark Registry`,
        description: message,
        policy: 'NON_INDEXABLE',
      }),
      statusCode,
      message,
      query: '',
    });
  });

  const eta = new Eta({
    views: viewsDirectory,
  });

  void app.register(fastifyView, {
    engine: { eta },
    root: viewsDirectory,
    production,
    defaultContext: { assetPath, production },
  });

  void app.register(fastifyStatic, {
    root: publicDirectory,
    prefix: '/public/',
    cacheControl: true,
    immutable: production,
    maxAge: production ? '1y' : 0,
  });

  app.get('/favicon.png', (_request, reply) =>
    reply
      .header('Cache-Control', 'public, max-age=3600, must-revalidate')
      .type('image/png')
      .send(favicon),
  );
  app.get('/logo.png', (_request, reply) =>
    reply
      .header('Cache-Control', 'public, max-age=3600, must-revalidate')
      .type('image/png')
      .send(logo),
  );
  app.get('/social-card.png', (_request, reply) =>
    reply
      .header('Cache-Control', 'public, max-age=3600, must-revalidate')
      .type('image/png')
      .send(socialCard),
  );

  const database = options.database;

  const feedbackStore =
    options.feedbackStore ??
    (database === undefined ? undefined : createFeedbackStore(database));
  const requestRateLimiter =
    options.requestRateLimiter ??
    (database === undefined || options.rateLimitSecret === undefined
      ? undefined
      : createDatabaseRequestRateLimiter(database, options.rateLimitSecret));

  void app.register(feedbackRoutes, {
    store: feedbackStore,
    adminAuth: options.adminAuth,
    requestRateLimiter,
  });
  void app.register(indexRoutes, { database });

  if (database !== undefined && options.closeDatabaseOnShutdown !== false) {
    app.addHook('onClose', async () => {
      await database.destroy();
    });
  }

  return app;
}
