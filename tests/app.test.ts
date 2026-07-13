import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/application.js';

describe('public application routes without a database', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('renders the registry as the root product', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('BENCHMARK REGISTRY');
    expect(response.body).toContain('action="/search"');
    expect(response.body).toContain('Record No.');
    expect(response.body).not.toContain('Benchmark Records Leaderboard');
    expect(response.body).toContain('name="benchmark"');
    expect(response.body).toContain('name="metric"');
    expect(response.body).toContain('name="order"');
    expect(response.body).toContain('Highest to lowest');
    expect(response.body).toContain('not necessarily comparable');
    expect(response.body).toContain('<th>Rank</th>');
    expect(response.body.indexOf('Source</th>')).toBeLessThan(
      response.body.indexOf('Model ID</th>'),
    );
    expect(response.body).toContain('Last database update: Not available');
    expect(response.body).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
    expect(response.body).toContain('href="/public/styles/main.css"');
    expect(response.body).toContain(
      'rel="icon" href="/public/favicon.svg" type="image/svg+xml"',
    );
    expect(response.body).toContain('class="table-scroll" tabindex="0"');
    expect(response.body).toContain(
      'Table may be scrolled horizontally on narrow displays.',
    );
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('serves the institutional favicon', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/public/favicon.svg',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.body).toContain('fill="#f5f3eb"');
    expect(response.body).toContain('>B</text>');
  });

  it('serves readable development assets without immutable caching', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/public/styles/main.css',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('max-age=0');
    expect(response.headers['cache-control']).not.toContain('immutable');
    expect(response.body).toContain('@media (max-width: 640px)');
  });

  it.each(['/models', '/benchmarks', '/organizations', '/recent', '/sources'])(
    'renders %s',
    async (url) => {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    },
  );

  it('renders all required documentation anchors and examples', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs' });
    expect(response.statusCode).toBe(200);
    for (const anchor of [
      'about',
      'record-numbers',
      'model-ids',
      'search',
      'benchmark-versions',
      'evaluation-context',
      'model-snapshots',
      'comparability',
      'sources',
      'record-statuses',
      'identifier-stability',
      'disclaimer',
      'contact-us',
    ]) {
      expect(response.body).toContain(`id="${anchor}"`);
    }
    expect(response.body).toContain('OPNAI-56');
    expect(response.body).toContain('BR-00155-042');
    expect(response.body).toContain('does not constitute endorsement');
    expect(response.body).toContain('href="https://x.com/rolling7ho"');
    expect(response.body).toContain('@rolling7ho');
    expect(response.body).toContain(
      'Unknown does not mean a default value was used',
    );
    expect(response.body).toContain(
      'does not assume that records sharing a benchmark name',
    );
    expect(response.body).toContain('class="identifier-diagram"');
    expect(response.body).toContain(
      'aria-label="Provider identifier reference table"',
    );
    expect(response.body).toContain('class="table-scroll" tabindex="0"');
  });

  it('sets restrictive centralized security headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.headers['content-security-policy']).toContain(
      "script-src 'none'",
    );
    expect(response.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe(
      'strict-origin-when-cross-origin',
    );
  });

  it('rejects an overlong search query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/search?q=${'a'.repeat(257)}`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('normalizes invalid pages to page one', async () => {
    const response = await app.inject({ method: 'GET', url: '/?page=-2' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Showing 0 records');
  });

  it('renders institutional 404 pages', async () => {
    const response = await app.inject({ method: 'GET', url: '/missing' });
    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('404 — Record or page not found');
  });

  it('reports simple health status', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
