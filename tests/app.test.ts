import type { FastifyInstance } from 'fastify';
import { load } from 'cheerio';
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
    expect(response.body).toContain(
      '<h1>Artificial Intelligence Benchmark Registry</h1>',
    );
    expect(response.body).toContain('action="/search"');
    expect(response.body).toContain('Search operators');
    expect(response.body).toContain(
      '<span class="registry-record-count">0 records</span>',
    );
    expect(response.body).toContain('<code>brand:</code>');
    expect(response.body).toContain('uppercase <code>OR</code>');
    expect(response.body).toContain('Record No.');
    expect(response.body).not.toContain('Benchmark Records Leaderboard');
    expect(response.body).toContain('name="benchmark"');
    expect(response.body).toContain('name="metric"');
    expect(response.body).toContain('name="model"');
    expect(response.body).toContain('name="sort"');
    expect(response.body).toContain('name="order"');
    expect(response.body).toContain('name="per-page"');
    expect(response.body).toContain(
      '<option value="100" selected>100</option>',
    );
    expect(response.body).toContain('<option value="all">All</option>');
    expect(response.body).toContain('Descending');
    expect(response.body).toContain('not necessarily comparable');
    expect(response.body).not.toContain('<th>Rank</th>');
    expect(response.body).not.toContain('<h1>Benchmark Records</h1>');
    expect(response.body.indexOf('<th>Source</th>')).toBeLessThan(
      response.body.indexOf('sort=model-id'),
    );
    expect(response.body).toContain('Last database update: Not available');
    expect(response.body).not.toContain('data-local-datetime');
    expect(response.body).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
    expect(response.body).toContain(
      '<link rel="canonical" href="https://www.benchmarkregistry.org/">',
    );
    expect(response.body).toContain(
      '<meta name="robots" content="index,follow">',
    );
    expect(response.body).toContain('application/ld+json');
    expect(response.body).toContain('https://schema.org');
    const structuredData = JSON.parse(
      load(response.body)('script[type="application/ld+json"]').text(),
    ) as { '@graph': Array<{ '@type': string }> };
    expect(structuredData['@graph'].map((node) => node['@type'])).toEqual(
      expect.arrayContaining([
        'WebPage',
        'Organization',
        'WebSite',
        'Dataset',
        'ImageObject',
      ]),
    );
    expect(response.body).toContain('href="/public/styles/main.css"');
    expect(response.body).toContain(
      'rel="icon" href="/favicon.png" type="image/png" sizes="96x96"',
    );
    expect(response.body).toContain(
      '<meta property="og:image" content="https://www.benchmarkregistry.org/social-card.png">',
    );
    expect(response.body).toContain(
      '<meta name="twitter:card" content="summary_large_image">',
    );
    expect(response.body).toContain(
      '<script src="/public/scripts/record-actions.js" defer></script>',
    );
    expect(response.body).toContain('class="table-scroll" tabindex="0"');
    expect(response.body).toContain(
      'aria-label="Benchmark registry records table" data-nosnippet',
    );
    expect(response.body).toContain(
      'Table may be scrolled horizontally on narrow displays.',
    );
    expect(response.body).toContain('Page 1 of 1');
    expect(response.body).toContain('aria-label="Go to page"');
    expect(response.body).toContain('type="number" min="1" max="1"');
    expect(response.body).toContain('About Benchmark Registry');
    expect(response.body).toContain('What can you search?');
    expect(response.body).toContain('How Benchmark Registry works');
    expect(response.body).toContain('<li>Benchmark Record Identifiers</li>');
    expect(response.body.indexOf('Page 1 of 1')).toBeLessThan(
      response.body.indexOf('About Benchmark Registry'),
    );
    expect(response.body).toContain('<a href="/privacy">Privacy</a>');
    expect(response.body).toContain('<a href="/terms">Terms</a>');
    expect(response.body).toContain('<a href="/feedback">Feedback</a>');
    expect(response.body).toContain(
      '<a href="https://github.com/rolling7ho/benchmark-registry">GitHub</a>',
    );
    expect(response.body).toContain(
      '<footer class="site-footer">\n        <div data-nosnippet>',
    );
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('keeps homepage information out of registry search results', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/search?q=GPQA',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('About Benchmark Registry');
    expect(response.body).not.toContain('What can you search?');
    expect(response.body).not.toContain('How Benchmark Registry works');
  });

  it.each(['/api', '/export', '/records.json', '/records.csv'])(
    'does not expose an unpublished public data surface at %s',
    async (url) => {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
    },
  );

  it('serves the stable search-compatible favicon', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/favicon.png',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['cache-control']).toBe(
      'public, max-age=3600, must-revalidate',
    );
    expect(response.rawPayload.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });

  it.each([
    ['/logo.png', 512, 512],
    ['/social-card.png', 1200, 630],
  ])('serves stable search appearance asset %s', async (url, width, height) => {
    const response = await app.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['cache-control']).toBe(
      'public, max-age=3600, must-revalidate',
    );
    expect(response.rawPayload.readUInt32BE(16)).toBe(width);
    expect(response.rawPayload.readUInt32BE(20)).toBe(height);
  });

  it('keeps the editable institutional favicon source', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/public/favicon.svg',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.body).not.toContain('fill="#f5f3eb"');
    expect(response.body).toContain('fill="#fff"');
    expect(response.body).toContain('width="96" height="96"');
    expect(response.body).toContain('viewBox="0 0 96 96"');
    expect(response.body).toContain('fill="#17365d"');
    expect(response.body).toContain(
      'd="M18 42h9v42h-9zM43.5 18h9v66h-9zM69 30h9v54h-9z"',
    );
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

  it('serves the progressive record action script', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/public/scripts/record-actions.js',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('max-age=0');
    expect(response.body).toContain('navigator.clipboard.writeText');
    expect(response.body).toContain('navigator.share');
    expect(response.body).toContain('time[data-local-datetime]');
    expect(response.body).toContain("timeZoneName: 'short'");
  });

  it('keeps filter state in sortable column links', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?model=opnai-55&benchmark=deepswe&metric=overall&sort=model&order=asc&per-page=250',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(
      '/?model=opnai-55&amp;benchmark=deepswe&amp;metric=overall&amp;per-page=250&amp;sort=model&amp;order=desc',
    );
    expect(response.body).toContain(
      '<option value="250" selected>250</option>',
    );
    expect(response.body).toContain('No records match the selected filters.');
    expect(response.body).toContain('Clear all filters');
    expect(response.body).toContain(
      '<input type="hidden" name="model" value="opnai-55">',
    );
    expect(response.body).toContain(
      '<input type="hidden" name="benchmark" value="deepswe">',
    );
    expect(response.body).toContain(
      '<input type="hidden" name="metric" value="overall">',
    );
    expect(response.body).toContain(
      '<input type="hidden" name="per-page" value="250">',
    );
    expect(response.body).toContain(
      '<meta name="robots" content="noindex,follow">',
    );
    expect(response.body).toContain('class="sort-link" rel="nofollow"');
  });

  it('returns 404 for impossible all-record pagination', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?per-page=all&page=999',
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('404 — Record or page not found');
  });

  it.each([
    '/models',
    '/benchmarks',
    '/organizations',
    '/recent',
    '/sources',
    '/about',
    '/methodology',
  ])('renders %s', async (url) => {
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
  });

  it.each([
    [
      '/privacy',
      'Privacy Policy | Benchmark Registry',
      'We do not sell or rent personal information.',
    ],
    [
      '/terms',
      'Terms of Use | Benchmark Registry',
      'does not constitute independent verification',
    ],
  ])('renders the public policy page at %s', async (url, title, statement) => {
    const response = await app.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`<title>${title}</title>`);
    expect(response.body).toContain('13 July 2026');
    expect(response.body).toContain(statement);
    expect(response.body).toContain('href="mailto:cowcow21@yahoo.com"');
    if (url === '/privacy') {
      expect(response.body).toContain('Vercel’s Privacy Notice');
      expect(response.body).toContain('An email address is not required');
      expect(response.body).toContain(
        'be indemnified for damages as provided by law',
      );
    }
    expect(response.body).toContain(
      `<link rel="canonical" href="https://www.benchmarkregistry.org${url}">`,
    );
  });

  it('renders all required documentation anchors and examples', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs' });
    expect(response.statusCode).toBe(200);
    for (const anchor of [
      'about',
      'reading-records',
      'data-dictionary',
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
      'who-how-why',
      'disclaimer',
      'contact-us',
    ]) {
      expect(response.body).toContain(`id="${anchor}"`);
    }
    expect(response.body).toContain('OPNAI-56');
    expect(response.body).toContain('BR-00155-042');
    expect(response.body).toContain('brand:Meta, Anthropic');
    expect(response.body).toContain('Muse Spark OR Opus 4.7');
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

  it('scopes progressive enhancement to pages that use it', async () => {
    const models = await app.inject({ method: 'GET', url: '/models' });
    expect(models.body).not.toContain('scripts/record-actions.js');
    const recent = await app.inject({ method: 'GET', url: '/recent' });
    expect(recent.body).toContain('scripts/record-actions.js');
  });

  it('sets restrictive centralized security headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.headers['content-security-policy']).toContain(
      "script-src 'self'",
    );
    expect(response.headers['content-security-policy']).toContain(
      "script-src-attr 'none'",
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

  it('rejects repeated scalar query parameters without returning a 500', async () => {
    for (const url of [
      '/search?q=one&q=two',
      '/search?page=1&page=2',
      '/?model=one&model=two',
      '/?sort=score&sort=model',
    ]) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Query parameters must have one value.');
      expect(response.body).not.toContain('trim is not a function');
    }
  });

  it('does not expose files outside the static public root', async () => {
    for (const url of [
      '/public/../.env',
      '/public/%2e%2e/.env',
      '/public/%2e%2e/server.js.map',
    ]) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain('DATABASE_URL');
    }
  });

  it('returns 404 for malformed pagination', async () => {
    const response = await app.inject({ method: 'GET', url: '/?page=-2' });
    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('404 — Record or page not found');
  });

  it('renders institutional 404 pages', async () => {
    const response = await app.inject({ method: 'GET', url: '/missing' });
    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('404 — Record or page not found');
  });

  it('reports unavailable when database readiness cannot be established', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('publishes crawl rules and production-only sitemap URLs', async () => {
    const robots = await app.inject({ method: 'GET', url: '/robots.txt' });
    expect(robots.statusCode).toBe(200);
    expect(robots.body).toContain('Allow: /');
    expect(robots.body).toContain('Disallow: /admin');
    expect(robots.body).toContain(
      'Sitemap: https://www.benchmarkregistry.org/sitemap.xml',
    );

    const index = await app.inject({ method: 'GET', url: '/sitemap.xml' });
    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toContain('application/xml');
    expect(index.body).toContain(
      'https://www.benchmarkregistry.org/sitemaps/models.xml',
    );
    expect(index.body).toContain(
      'https://www.benchmarkregistry.org/sitemaps/organizations.xml',
    );
    expect(index.body).not.toMatch(
      /localhost|vercel\.app|supabase|staging|preview/i,
    );

    const pages = await app.inject({
      method: 'GET',
      url: '/sitemaps/pages.xml',
    });
    expect(pages.body).toContain(
      '<loc>https://www.benchmarkregistry.org/models</loc>',
    );
    expect(pages.body).toContain(
      '<loc>https://www.benchmarkregistry.org/privacy</loc>',
    );
    expect(pages.body).toContain(
      '<loc>https://www.benchmarkregistry.org/terms</loc>',
    );
    expect(pages.body).toContain(
      '<loc>https://www.benchmarkregistry.org/feedback</loc>',
    );
    expect(pages.body).toContain(
      '<loc>https://www.benchmarkregistry.org/about</loc>',
    );
    expect(pages.body).toContain(
      '<loc>https://www.benchmarkregistry.org/methodology</loc>',
    );
    expect(pages.body).not.toMatch(/<loc>[^<]*\?/);
  });

  it('marks search results noindex while leaving links followable', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/search?q=registry',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(
      '<meta name="robots" content="noindex,follow">',
    );
    expect(response.body).toContain(
      '<link rel="canonical" href="https://www.benchmarkregistry.org/search">',
    );
  });
});
