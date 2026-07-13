import type {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from 'fastify';

import type { Database } from '../db/database.js';
import { seedOrganizations } from '../db/seed-organizations.js';
import { seedTestData } from '../db/seed-test-data.js';
import { hasSameOrigin } from '../web/same-origin.js';
import { createPageSeo } from '../web/seo.js';

export interface DevRouteOptions {
  database: Database | undefined;
  databaseTarget: string | undefined;
}

interface DevQuery {
  seeded?: string;
  error?: string;
}

const QUICK_LINKS = [
  { href: '/health', label: 'Health check' },
  { href: '/sitemap.xml', label: 'Sitemap index' },
  { href: '/robots.txt', label: 'robots.txt' },
  { href: '/docs', label: 'Registry documentation' },
  { href: '/feedback', label: 'Feedback form' },
  { href: '/admin/feedback', label: 'Feedback queue (requires admin auth)' },
] as const;

const SEED_LABELS: Record<string, string> = {
  organizations: 'Provider organizations',
  'test-data': 'Test fixture data',
};

function renderDevPage(
  reply: FastifyReply,
  options: DevRouteOptions,
  status: { seeded: string | null; error: string | null },
): FastifyReply {
  reply
    .header('Cache-Control', 'no-store')
    .header('X-Robots-Tag', 'noindex, nofollow');
  return reply.view('dev.eta', {
    title: 'Developer Server — Benchmark Registry',
    seo: createPageSeo({
      title: 'Developer Server | Benchmark Registry',
      description: 'Local development controls for Benchmark Registry.',
      index: false,
    }),
    query: '',
    env: {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      host: process.env.HOST ?? '127.0.0.1',
      port: process.env.PORT ?? '3000',
      databaseTarget: options.databaseTarget ?? 'Not configured',
      nodeVersion: process.version,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
    },
    databaseConfigured: options.database !== undefined,
    quickLinks: QUICK_LINKS,
    seeded: status.seeded,
    error: status.error,
  });
}

function seedHandler(
  options: DevRouteOptions,
  kind: 'organizations' | 'test-data',
  onError: (error: unknown) => void,
) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    if (!hasSameOrigin(request)) {
      return reply.status(400).send('Unable to run seed action.');
    }
    if (options.database === undefined) {
      return reply.status(503).send('Database is not configured.');
    }
    try {
      if (kind === 'organizations') {
        await seedOrganizations(options.database);
      } else {
        await seedTestData(options.database);
      }
    } catch (error) {
      onError(error);
      return reply
        .status(303)
        .header('Location', `/dev?error=${encodeURIComponent(kind)}`)
        .send();
    }
    return reply
      .status(303)
      .header('Location', `/dev?seeded=${encodeURIComponent(kind)}`)
      .send();
  };
}

const devRoutes: FastifyPluginCallback<DevRouteOptions> = (
  app,
  options,
  done,
) => {
  app.get<{ Querystring: DevQuery }>('/dev', (request, reply) =>
    renderDevPage(reply, options, {
      seeded: SEED_LABELS[request.query.seeded ?? ''] ?? null,
      error: request.query.error ?? null,
    }),
  );

  app.post(
    '/dev/seed/organizations',
    seedHandler(options, 'organizations', (error) =>
      app.log.error(error, 'Developer seed action failed'),
    ),
  );
  app.post(
    '/dev/seed/test-data',
    seedHandler(options, 'test-data', (error) =>
      app.log.error(error, 'Developer seed action failed'),
    ),
  );

  done();
};

export default devRoutes;
