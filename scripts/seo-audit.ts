import path from 'node:path';

import { load, type CheerioAPI } from 'cheerio';

import { createApp } from '../src/application.js';
import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/db/database.js';
import { getPublicRecordDetail } from '../src/db/record-detail.js';
import {
  CANONICAL_ORIGIN,
  SOCIAL_IMAGE_PATH,
  modelSlug,
} from '../src/web/seo.js';

const FORBIDDEN_URL_PATTERN =
  /(?:localhost|127\.0\.0\.1|vercel\.app|supabase|\bstaging\b|\bpreview\b)/i;
const SOCIAL_IMAGE_URL = `${CANONICAL_ORIGIN}${SOCIAL_IMAGE_PATH}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertNoUrlLeak(value: string, surface: string): void {
  assert(
    !FORBIDDEN_URL_PATTERN.test(value),
    `${surface} contains a non-production URL: ${value}`,
  );
}

function jsonLdTypes($: CheerioAPI, label: string): Set<string> {
  const scripts = $('script[type="application/ld+json"]');
  assert(scripts.length === 1, `${label} must contain one JSON-LD graph.`);
  let document: unknown;
  try {
    document = JSON.parse(scripts.text());
  } catch (error) {
    throw new Error(`${label} contains invalid JSON-LD: ${String(error)}`, {
      cause: error,
    });
  }
  assert(
    typeof document === 'object' && document !== null && '@graph' in document,
    `${label} JSON-LD must contain an @graph.`,
  );
  const graph = document['@graph'];
  assert(Array.isArray(graph), `${label} JSON-LD @graph must be an array.`);
  const graphNodes: unknown[] = graph;
  return new Set(
    graphNodes.flatMap((node) => {
      if (typeof node !== 'object' || node === null || !('@type' in node))
        return [];
      const type = node['@type'];
      return Array.isArray(type)
        ? type.filter((value): value is string => typeof value === 'string')
        : typeof type === 'string'
          ? [type]
          : [];
    }),
  );
}

function pngDimensions(payload: Buffer): { width: number; height: number } {
  assert(
    payload.length >= 24 &&
      payload.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'Asset is not a valid PNG.',
  );
  return { width: payload.readUInt32BE(16), height: payload.readUInt32BE(20) };
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
      .innerJoin('organizations', 'organizations.id', 'models.organization_id')
      .innerJoin(
        'benchmarks',
        'benchmarks.id',
        'benchmark_records.benchmark_id',
      )
      .innerJoin(
        'benchmark_versions',
        'benchmark_versions.id',
        'benchmark_records.benchmark_version_id',
      )
      .select([
        'benchmark_records.record_id as recordIdentifier',
        'models.model_id as modelIdentifier',
        'organizations.slug as organizationSlug',
        'benchmarks.slug as benchmarkSlug',
        'benchmark_versions.canonical_reference as versionReference',
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
    const versionSegment = representative.versionReference
      .split('/')
      .slice(1)
      .join('/');
    assert(versionSegment.length > 0, 'Representative version is malformed.');
    const paths = {
      home: '/',
      model: `/models/${encodeURIComponent(representativeModelSlug)}`,
      benchmark: `/benchmarks/${encodeURIComponent(representative.benchmarkSlug)}`,
      version: `/benchmarks/${encodeURIComponent(representative.benchmarkSlug)}/versions/${encodeURIComponent(versionSegment)}`,
      organization: `/organizations/${encodeURIComponent(representative.organizationSlug)}`,
      record: `/records/${encodeURIComponent(representative.recordIdentifier)}`,
    };

    const seenTitles = new Map<string, string>();
    const seenDescriptions = new Map<string, string>();
    const auditHtmlPage = async (
      label: string,
      pagePath: string,
      expectedTitle: string,
      expectedLinkPrefixes: string[],
      options: {
        breadcrumbs?: boolean;
        expectedJsonLdTypes?: string[];
        recordActions?: boolean;
      } = {},
    ): Promise<void> => {
      const response = await app.inject({ method: 'GET', url: pagePath });
      assert(
        response.statusCode === 200,
        `${label} returned ${response.statusCode}.`,
      );
      const $ = load(response.body);
      const title = $('title').text().trim();
      const description = $('meta[name="description"]').attr('content')?.trim();
      const canonicalElements = $('link[rel="canonical"]');
      const canonical = canonicalElements.attr('href');
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
        canonicalElements.length === 1 &&
          canonical === `${CANONICAL_ORIGIN}${pagePath}`,
        `${label} has an incorrect canonical URL: ${canonical ?? 'missing'}`,
      );
      assert(
        robots === 'index,follow',
        `${label} is not indexable: ${robots ?? 'missing'}`,
      );
      assert($('h1').length === 1, `${label} must contain exactly one h1.`);

      const duplicateTitle = seenTitles.get(title);
      assert(
        duplicateTitle === undefined,
        `${label} duplicates the title used by ${duplicateTitle ?? 'another page'}.`,
      );
      seenTitles.set(title, label);
      const duplicateDescription = seenDescriptions.get(description);
      assert(
        duplicateDescription === undefined,
        `${label} duplicates the description used by ${duplicateDescription ?? 'another page'}.`,
      );
      seenDescriptions.set(description, label);

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
      for (const link of links) {
        assert(
          link !== undefined && link.length > 0,
          `${label} has an empty link.`,
        );
        assert(
          link.startsWith('/') ||
            link.startsWith('#') ||
            link.startsWith('https://') ||
            link.startsWith('mailto:'),
          `${label} has a non-crawlable link: ${link}`,
        );
        assertNoUrlLeak(link, `${label} link`);
      }

      for (const [surface, value] of [
        ['canonical', canonical],
        ['Open Graph URL', $('meta[property="og:url"]').attr('content')],
        ['Open Graph image', $('meta[property="og:image"]').attr('content')],
        ['Twitter image', $('meta[name="twitter:image"]').attr('content')],
      ] as const) {
        if (value !== undefined) assertNoUrlLeak(value, `${label} ${surface}`);
      }
      assert(
        $('meta[property="og:title"]').attr('content') === title,
        `${label} Open Graph title does not match.`,
      );
      assert(
        $('meta[name="twitter:title"]').attr('content') === title,
        `${label} Twitter title does not match.`,
      );
      assert(
        $('meta[property="og:image"]').attr('content') === SOCIAL_IMAGE_URL &&
          $('meta[property="og:image:width"]').attr('content') === '1200' &&
          $('meta[property="og:image:height"]').attr('content') === '630',
        `${label} has incomplete Open Graph image metadata.`,
      );
      assert(
        $('meta[name="twitter:card"]').attr('content') ===
          'summary_large_image' &&
          $('meta[name="twitter:image"]').attr('content') === SOCIAL_IMAGE_URL,
        `${label} has incomplete Twitter image metadata.`,
      );

      const types = jsonLdTypes($, label);
      for (const expectedType of [
        'WebPage',
        'ImageObject',
        ...(options.expectedJsonLdTypes ?? []),
      ]) {
        assert(
          types.has(expectedType),
          `${label} is missing ${expectedType} JSON-LD.`,
        );
      }
      if (options.breadcrumbs === true) {
        assert(
          $('[aria-label="Breadcrumb"]').length === 1,
          `${label} is missing visible breadcrumbs.`,
        );
        assert(
          types.has('BreadcrumbList'),
          `${label} is missing BreadcrumbList JSON-LD.`,
        );
      }
      assert(
        $('script[src*="record-actions"]').length ===
          (options.recordActions === true ? 1 : 0),
        `${label} has an incorrect record-actions script scope.`,
      );
    };

    await auditHtmlPage(
      'home page',
      paths.home,
      'Benchmark Registry',
      ['/models', '/benchmarks'],
      {
        expectedJsonLdTypes: ['Organization', 'WebSite', 'Dataset'],
        recordActions: true,
      },
    );
    await auditHtmlPage(
      'model page',
      paths.model,
      `${detail.modelName} Benchmark Results & Scores | Benchmark Registry`,
      ['/records/', '/benchmarks/', paths.organization],
      { breadcrumbs: true, recordActions: true },
    );
    await auditHtmlPage(
      'benchmark page',
      paths.benchmark,
      `${detail.benchmarkFamily} AI Benchmark Results | Benchmark Registry`,
      ['/records/', '/models/', `${paths.benchmark}/versions/`],
      { breadcrumbs: true, recordActions: true },
    );
    const versionName =
      detail.benchmarkVariantName ??
      detail.benchmarkVersionLabel ??
      'Unspecified';
    await auditHtmlPage(
      'benchmark version page',
      paths.version,
      `${detail.benchmarkFamily}: ${versionName} Results | Benchmark Registry`,
      ['/records/', '/models/', paths.benchmark],
      { breadcrumbs: true, recordActions: true },
    );
    await auditHtmlPage(
      'organization page',
      paths.organization,
      `${detail.modelOrganization} Models and Benchmark Records | Benchmark Registry`,
      ['/records/', '/models/'],
      { breadcrumbs: true, recordActions: true },
    );
    await auditHtmlPage(
      'record page',
      paths.record,
      `${detail.modelName} on ${detail.benchmarkDisplay}: ${detail.scoreDisplay} ${detail.metricName} | Benchmark Registry`,
      [paths.model, paths.benchmark, paths.organization],
      { breadcrumbs: true, recordActions: true },
    );
    await auditHtmlPage(
      'about page',
      '/about',
      'About Benchmark Registry | Public AI Benchmark Database',
      ['/methodology', '/feedback'],
    );
    await auditHtmlPage(
      'methodology page',
      '/methodology',
      'Methodology | Benchmark Registry',
      ['/docs', '/feedback'],
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
      const destination = await app.inject({
        method: 'GET',
        url: canonicalPath,
      });
      assert(
        destination.statusCode === 200,
        `${label} destination is unavailable.`,
      );
    }

    const search = await app.inject({ method: 'GET', url: '/search?q=audit' });
    const searchPage = load(search.body);
    assert(search.statusCode === 200, 'Search results are unavailable.');
    assert(
      searchPage('meta[name="robots"]').attr('content') === 'noindex,follow',
      'Search results must be noindex,follow.',
    );
    const filteredHome = await app.inject({
      method: 'GET',
      url: '/?sort=model&order=asc',
    });
    const filteredPage = load(filteredHome.body);
    assert(
      filteredHome.statusCode === 200,
      'Filtered homepage is unavailable.',
    );
    assert(
      filteredPage('meta[name="robots"]').attr('content') ===
        'noindex,follow' &&
        filteredPage('link[rel="canonical"]').attr('href') ===
          `${CANONICAL_ORIGIN}/`,
      'Filtered homepage has conflicting robots or canonical signals.',
    );
    assert(
      filteredPage('a.sort-link')
        .toArray()
        .every((element) =>
          filteredPage(element).attr('rel')?.split(/\s+/u).includes('nofollow'),
        ),
      'Generated sort links must be nofollow.',
    );
    const parameterizedIndex = await app.inject({
      method: 'GET',
      url: '/models?unexpected=1',
    });
    const parameterizedIndexPage = load(parameterizedIndex.body);
    assert(
      parameterizedIndex.statusCode === 200 &&
        parameterizedIndexPage('meta[name="robots"]').attr('content') ===
          'noindex,follow' &&
        parameterizedIndexPage('link[rel="canonical"]').attr('href') ===
          `${CANONICAL_ORIGIN}/models`,
      'Parameterized entity index has conflicting robots or canonical signals.',
    );
    for (const invalidPath of [
      '/?page=0',
      '/?page=999999999',
      '/?model=seo-audit-unknown-model',
      '/sitemaps/records-0.xml',
    ]) {
      const response = await app.inject({ method: 'GET', url: invalidPath });
      assert(response.statusCode === 404, `${invalidPath} must return 404.`);
    }

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
    assert(
      sitemapIndex.body.includes(
        `${CANONICAL_ORIGIN}/sitemaps/organizations.xml`,
      ),
      'Sitemap index is missing the organization sitemap.',
    );
    assertNoUrlLeak(sitemapIndex.body, 'sitemap index');

    const home = await app.inject({ method: 'GET', url: '/' });
    const faviconPath = load(home.body)('link[rel="icon"]').attr('href');
    assert(
      faviconPath === '/favicon.png',
      `Home page has an invalid production favicon URL: ${faviconPath ?? 'missing'}`,
    );

    const [
      pagesSitemap,
      modelSitemap,
      organizationSitemap,
      benchmarkSitemap,
      recordSitemap,
      favicon,
      logo,
      socialImage,
    ] = await Promise.all([
      app.inject({ method: 'GET', url: '/sitemaps/pages.xml' }),
      app.inject({ method: 'GET', url: '/sitemaps/models.xml' }),
      app.inject({ method: 'GET', url: '/sitemaps/organizations.xml' }),
      app.inject({ method: 'GET', url: '/sitemaps/benchmarks.xml' }),
      app.inject({ method: 'GET', url: '/sitemaps/records-1.xml' }),
      app.inject({ method: 'GET', url: faviconPath }),
      app.inject({ method: 'GET', url: '/logo.png' }),
      app.inject({ method: 'GET', url: SOCIAL_IMAGE_PATH }),
    ]);
    assert(
      pagesSitemap.statusCode === 200,
      'Public pages sitemap is unavailable.',
    );
    assertNoUrlLeak(pagesSitemap.body, 'public pages sitemap');
    for (const expectedPath of ['/about', '/methodology']) {
      assert(
        pagesSitemap.body.includes(
          `<loc>${CANONICAL_ORIGIN}${expectedPath}</loc>`,
        ),
        `Public pages sitemap is missing ${expectedPath}.`,
      );
    }
    assert(
      !/<loc>[^<]*(?:\?|\/search|\/admin|\/api)/u.test(pagesSitemap.body),
      'Public pages sitemap contains a non-canonical or private URL.',
    );
    for (const [label, response, expectedPath] of [
      ['model sitemap', modelSitemap, paths.model],
      ['organization sitemap', organizationSitemap, paths.organization],
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
      assert(
        !/<loc>[^<]*\?/u.test(response.body),
        `${label} contains a query URL.`,
      );
      assertNoUrlLeak(response.body, label);
    }

    for (const [label, response, dimensions] of [
      ['favicon', favicon, { width: 96, height: 96 }],
      ['logo', logo, { width: 512, height: 512 }],
      ['social image', socialImage, { width: 1200, height: 630 }],
    ] as const) {
      assert(response.statusCode === 200, `${label} is unavailable.`);
      assert(
        response.headers['content-type']?.startsWith('image/png') === true,
        `${label} has an incorrect content type.`,
      );
      assert(
        !response.headers['cache-control']?.includes('immutable'),
        `Stable ${label} URL must not use immutable caching.`,
      );
      const actual = pngDimensions(response.rawPayload);
      assert(
        actual.width === dimensions.width &&
          actual.height === dimensions.height,
        `${label} dimensions are ${actual.width}x${actual.height}.`,
      );
    }

    process.stdout.write(
      `SEO audit passed for all public route classes, sitemaps, and brand assets (representative record ${representative.recordIdentifier}).\n`,
    );
  } finally {
    await app.close();
    await database.destroy();
  }
}

await run();
