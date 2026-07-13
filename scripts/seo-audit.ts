import path from 'node:path';

import { load } from 'cheerio';

import { createApp } from '../src/application.js';
import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/db/database.js';
import { getPublicRecordDetail } from '../src/db/record-detail.js';
import { CANONICAL_ORIGIN, modelSlug } from '../src/web/seo.js';

const FORBIDDEN_URL_PATTERN =
  /(?:localhost|127\.0\.0\.1|vercel\.app|supabase|\bstaging\b|\bpreview\b)/i;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertNoUrlLeak(value: string, surface: string): void {
  assert(
    !FORBIDDEN_URL_PATTERN.test(value),
    `${surface} contains a non-production URL: ${value}`,
  );
}

async function run(): Promise<void> {
  const environment = loadEnvironment();
  const database = createDatabase(environment.DATABASE_URL);
  const runtimeDirectory = path.join(process.cwd(), 'dist');
  const app = createApp({
    database,
    closeDatabaseOnShutdown: false,
    production: true,
    runtimeDirectory,
  });

  try {
    const representative = await database
      .selectFrom('benchmark_records')
      .innerJoin('models', 'models.id', 'benchmark_records.model_id')
      .innerJoin(
        'benchmarks',
        'benchmarks.id',
        'benchmark_records.benchmark_id',
      )
      .select([
        'benchmark_records.record_id as recordIdentifier',
        'models.model_id as modelIdentifier',
        'benchmarks.slug as benchmarkSlug',
      ])
      .orderBy('benchmark_records.record_id')
      .executeTakeFirst();
    assert(
      representative !== undefined,
      'SEO audit requires at least one public benchmark record.',
    );
    const detail = await getPublicRecordDetail(
      database,
      representative.recordIdentifier,
    );
    assert(detail !== undefined, 'Representative record detail was not found.');

    const representativeModelSlug = modelSlug(representative.modelIdentifier);
    const paths = {
      home: '/',
      model: `/models/${encodeURIComponent(representativeModelSlug)}`,
      benchmark: `/benchmarks/${encodeURIComponent(representative.benchmarkSlug)}`,
      record: `/records/${encodeURIComponent(representative.recordIdentifier)}`,
    };

    const auditHtmlPage = async (
      label: string,
      pagePath: string,
      expectedTitle: string,
      expectedLinkPrefixes: string[],
    ): Promise<void> => {
      const response = await app.inject({ method: 'GET', url: pagePath });
      assert(
        response.statusCode === 200,
        `${label} returned ${response.statusCode}.`,
      );
      const $ = load(response.body);
      const title = $('title').text().trim();
      const description = $('meta[name="description"]').attr('content')?.trim();
      const canonical = $('link[rel="canonical"]').attr('href');
      const robots = $('meta[name="robots"]').attr('content');
      assert(
        title === expectedTitle,
        `${label} has an unexpected title: ${title}`,
      );
      assert(
        description !== undefined && description.length > 40,
        `${label} has no meaningful description.`,
      );
      assert(
        canonical === `${CANONICAL_ORIGIN}${pagePath}`,
        `${label} has an incorrect canonical URL: ${canonical ?? 'missing'}`,
      );
      assert(
        robots === 'index,follow',
        `${label} is not indexable: ${robots ?? 'missing'}`,
      );
      assert($('h1').length === 1, `${label} must contain exactly one h1.`);
      const links = new Set(
        $('a[href]')
          .map((_, element) => $(element).attr('href'))
          .get(),
      );
      for (const expectedPrefix of expectedLinkPrefixes) {
        assert(
          [...links].some((link) => link?.startsWith(expectedPrefix)),
          `${label} is missing an internal link beginning with ${expectedPrefix}.`,
        );
      }
      for (const value of [
        canonical,
        $('meta[property="og:url"]').attr('content'),
      ]) {
        if (value !== undefined) assertNoUrlLeak(value, `${label} metadata`);
      }
      assert(
        $('meta[property="og:title"]').attr('content') === title,
        `${label} Open Graph title does not match.`,
      );
      assert(
        $('meta[name="twitter:title"]').attr('content') === title,
        `${label} Twitter title does not match.`,
      );
    };

    await auditHtmlPage('home page', paths.home, 'Benchmark Registry', [
      '/models',
      '/benchmarks',
    ]);
    await auditHtmlPage(
      'model page',
      paths.model,
      `${detail.modelName} Benchmark Results & Scores | Benchmark Registry`,
      ['/records/', '/benchmarks/'],
    );
    await auditHtmlPage(
      'benchmark page',
      paths.benchmark,
      `${detail.benchmarkFamily} AI Benchmark Results | Benchmark Registry`,
      ['/records/', '/models/'],
    );
    await auditHtmlPage(
      'record page',
      paths.record,
      `${detail.modelName} on ${detail.benchmarkDisplay}: ${detail.scoreDisplay} ${detail.metricName} | Benchmark Registry`,
      [paths.model, paths.benchmark],
    );

    for (const [label, duplicatePath, canonicalPath] of [
      [
        'legacy model URL',
        `/models/${encodeURIComponent(representative.modelIdentifier)}`,
        paths.model,
      ],
      [
        'non-canonical record URL',
        `/records/${encodeURIComponent(representative.recordIdentifier.toLowerCase())}`,
        paths.record,
      ],
      [
        'non-canonical benchmark URL',
        `/benchmarks/${encodeURIComponent(representative.benchmarkSlug.toUpperCase())}`,
        paths.benchmark,
      ],
    ] as const) {
      if (duplicatePath === canonicalPath) continue;
      const response = await app.inject({ method: 'GET', url: duplicatePath });
      assert(
        response.statusCode === 308,
        `${label} does not permanently redirect.`,
      );
      assert(
        response.headers.location === canonicalPath,
        `${label} redirects to ${String(response.headers.location)} instead of ${canonicalPath}.`,
      );
    }

    const search = await app.inject({ method: 'GET', url: '/search?q=audit' });
    const searchPage = load(search.body);
    assert(
      searchPage('meta[name="robots"]').attr('content') === 'noindex,follow',
      'Search results must be noindex,follow.',
    );

    const robots = await app.inject({ method: 'GET', url: '/robots.txt' });
    assert(robots.statusCode === 200, 'robots.txt is unavailable.');
    assert(
      robots.body.includes('Allow: /'),
      'robots.txt does not allow public crawling.',
    );
    assert(
      robots.body.includes('Disallow: /admin'),
      'robots.txt does not disallow admin routes.',
    );
    assert(
      robots.body.includes(`Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`),
      'robots.txt has an incorrect sitemap URL.',
    );
    assertNoUrlLeak(robots.body, 'robots.txt');

    const sitemapIndex = await app.inject({
      method: 'GET',
      url: '/sitemap.xml',
    });
    assert(sitemapIndex.statusCode === 200, 'Sitemap index is unavailable.');
    assert(
      sitemapIndex.body.includes(`${CANONICAL_ORIGIN}/sitemaps/models.xml`),
      'Sitemap index is missing the model sitemap.',
    );
    assertNoUrlLeak(sitemapIndex.body, 'sitemap index');

    const home = await app.inject({ method: 'GET', url: '/' });
    const faviconPath = load(home.body)('link[rel="icon"]').attr('href');
    assert(
      faviconPath?.startsWith('/public/favicon.') === true &&
        faviconPath.endsWith('.svg'),
      `Home page has an invalid production favicon URL: ${faviconPath ?? 'missing'}`,
    );

    const [
      pagesSitemap,
      modelSitemap,
      benchmarkSitemap,
      recordSitemap,
      favicon,
    ] = await Promise.all([
      app.inject({ method: 'GET', url: '/sitemaps/pages.xml' }),
      app.inject({ method: 'GET', url: '/sitemaps/models.xml' }),
      app.inject({ method: 'GET', url: '/sitemaps/benchmarks.xml' }),
      app.inject({ method: 'GET', url: '/sitemaps/records-1.xml' }),
      app.inject({ method: 'GET', url: faviconPath }),
    ]);
    assertNoUrlLeak(pagesSitemap.body, 'public pages sitemap');
    for (const [label, response, expectedPath] of [
      ['model sitemap', modelSitemap, paths.model],
      ['benchmark sitemap', benchmarkSitemap, paths.benchmark],
      ['record sitemap', recordSitemap, paths.record],
    ] as const) {
      assert(response.statusCode === 200, `${label} is unavailable.`);
      assert(
        response.body.includes(`${CANONICAL_ORIGIN}${expectedPath}`),
        `${label} is missing its representative canonical URL.`,
      );
      assert(
        response.body.includes('<lastmod>'),
        `${label} is missing database-grounded lastModified values.`,
      );
      assertNoUrlLeak(response.body, label);
    }
    assert(favicon.statusCode === 200, 'Favicon is unavailable.');

    process.stdout.write(
      `SEO audit passed for ${paths.model}, ${paths.benchmark}, and ${paths.record}.\n`,
    );
  } finally {
    await app.close();
    await database.destroy();
  }
}

await run();
