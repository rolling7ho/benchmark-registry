import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import { sql } from 'kysely';

import {
  getBenchmarkBySlug,
  getBenchmarkVersionByReference,
  getModelBySlug,
  getOrganizationBySlug,
  listBenchmarks,
  listModels,
  listOrganizations,
  listSources,
} from '../db/registry-browse.js';
import type { Database } from '../db/database.js';
import { getLastDatabaseUpdate } from '../db/registry-metadata.js';
import { getPublicRecordDetail } from '../db/record-detail.js';
import {
  getLeaderboardOptions,
  getRegistryRecords,
  REGISTRY_PAGE_SIZE,
  type LeaderboardOrder,
  type RegistrySort,
  type RegistryRecordFilter,
  type RegistryRecordPage,
} from '../db/registry-records.js';
import {
  countRecordSitemapBatches,
  listBenchmarkSitemapEntries,
  listModelSitemapEntries,
  listRecordSitemapEntries,
} from '../db/sitemaps.js';
import { PROVIDER_DOCUMENTATION } from '../identifiers/provider-documentation.js';
import { resolveSearch } from '../search/resolve-search.js';
import {
  CANONICAL_ORIGIN,
  canonicalPagePath,
  createPageSeo,
  modelSlug,
} from '../web/seo.js';
import { renderSitemapIndex, renderUrlSet } from '../web/sitemap-xml.js';

interface RouteOptions {
  database: Database | undefined;
}

interface PageQuery {
  page?: string;
}

interface LeaderboardQuery extends PageQuery {
  model?: string;
  benchmark?: string;
  metric?: string;
  sort?: string;
  order?: string;
}

interface SearchQuery extends PageQuery {
  q?: string;
}

interface PaginationView {
  start: number;
  end: number;
  total: number;
  page: number;
  pageCount: number;
  previousUrl: string | null;
  nextUrl: string | null;
  formAction: string;
  formParameters: Array<{ name: string; value: string }>;
}

const EMPTY_PAGE: RegistryRecordPage = {
  records: [],
  page: 1,
  pageSize: REGISTRY_PAGE_SIZE,
  total: 0,
};

function parsePage(value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function hasNonScalarQueryValue(value: unknown): boolean {
  return value !== undefined && typeof value !== 'string';
}

const REGISTRY_SORTS = new Set<RegistrySort>([
  'record',
  'model',
  'benchmark',
  'metric',
  'score',
  'evaluation-date',
  'model-id',
]);

function parseRegistrySort(value: string | undefined): RegistrySort {
  return REGISTRY_SORTS.has(value as RegistrySort)
    ? (value as RegistrySort)
    : 'score';
}

function registrySortUrls(
  selected: { model: string; benchmark: string; metric: string },
  currentSort: RegistrySort,
  currentOrder: LeaderboardOrder,
): Record<RegistrySort, string> {
  const result = {} as Record<RegistrySort, string>;
  for (const sort of REGISTRY_SORTS) {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(selected)) {
      if (value !== '') parameters.set(key, value);
    }
    parameters.set('sort', sort);
    const defaultOrder: LeaderboardOrder = [
      'score',
      'evaluation-date',
    ].includes(sort)
      ? 'desc'
      : 'asc';
    parameters.set(
      'order',
      sort === currentSort
        ? currentOrder === 'asc'
          ? 'desc'
          : 'asc'
        : defaultOrder,
    );
    result[sort] = `/?${parameters.toString()}`;
  }
  return result;
}

function formatDatabaseUpdate(value: string | null): string {
  if (value === null) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${parts} PHT`;
}

function formatStructuredValue(
  value: Record<string, unknown>,
  indentation = '',
): string {
  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, child]) => {
      if (child !== null && typeof child === 'object' && !Array.isArray(child))
        return [
          `${indentation}${key}:`,
          formatStructuredValue(
            child as Record<string, unknown>,
            `${indentation}  `,
          ),
        ];
      return [
        `${indentation}${key}: ${Array.isArray(child) ? child.map(String).join(', ') : String(child)}`,
      ];
    })
    .join('\n');
}

function pagination(
  result: RegistryRecordPage,
  pathname: string,
  query?: string,
  additionalParameters: Record<string, string> = {},
): PaginationView {
  const start =
    result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const end = Math.min(result.page * result.pageSize, result.total);
  const formParameters = new URLSearchParams();
  if (query !== undefined) formParameters.set('q', query);
  for (const [key, value] of Object.entries(additionalParameters)) {
    if (value !== '') formParameters.set(key, value);
  }
  const url = (page: number): string => {
    const parameters = new URLSearchParams(formParameters);
    parameters.set('page', page.toString());
    return `${pathname}?${parameters.toString()}`;
  };
  return {
    start,
    end,
    total: result.total,
    page: result.page,
    pageCount: Math.max(1, Math.ceil(result.total / result.pageSize)),
    previousUrl: result.page > 1 ? url(result.page - 1) : null,
    nextUrl: end < result.total ? url(result.page + 1) : null,
    formAction: pathname,
    formParameters: Array.from(formParameters, ([name, value]) => ({
      name,
      value,
    })),
  };
}

function renderError(
  reply: FastifyReply,
  statusCode: number,
  message: string,
): FastifyReply {
  return reply.status(statusCode).view('error.eta', {
    title: `${statusCode} — Benchmark Registry`,
    seo: createPageSeo({
      title: `${statusCode} — Benchmark Registry`,
      description: message,
      index: false,
    }),
    statusCode,
    message,
    query: '',
  });
}

async function registryPage(
  database: Database | undefined,
  filter: RegistryRecordFilter,
  page: number,
): Promise<RegistryRecordPage> {
  return database === undefined
    ? { ...EMPTY_PAGE, page }
    : getRegistryRecords(database, filter, page);
}

const indexRoutes: FastifyPluginCallback<RouteOptions> = (
  app,
  options,
  done,
) => {
  const database = options.database;

  app.get<{ Querystring: LeaderboardQuery }>('/', async (request, reply) => {
    if (
      Object.values(request.query).some((value) =>
        hasNonScalarQueryValue(value),
      )
    ) {
      return renderError(reply, 400, 'Query parameters must have one value.');
    }
    const page = parsePage(request.query.page);
    const selectedModelSlug = request.query.model?.trim().toLowerCase() || null;
    const benchmarkSlug = request.query.benchmark?.trim().toLowerCase() || null;
    const metricSlug = request.query.metric?.trim().toLowerCase() || null;
    const sort = parseRegistrySort(request.query.sort);
    const order: LeaderboardOrder =
      request.query.order === 'asc' ? 'asc' : 'desc';
    const [result, update, options] = await Promise.all([
      registryPage(
        database,
        {
          kind: 'LEADERBOARD',
          modelSlug: selectedModelSlug,
          benchmarkSlug,
          metricSlug,
          sort,
          order,
        },
        page,
      ),
      database === undefined
        ? Promise.resolve(null)
        : getLastDatabaseUpdate(database),
      database === undefined
        ? Promise.resolve({ models: [], benchmarks: [], metrics: [] })
        : getLeaderboardOptions(database),
    ]);
    return reply.view('registry-page.eta', {
      title: 'Benchmark Registry',
      seo: createPageSeo({
        title: 'Benchmark Registry',
        description:
          'Public registry of reported artificial intelligence benchmark evaluations, scores, sources, model identifiers, and evaluation context.',
        path: '/',
        includeSiteIdentity: true,
      }),
      query: '',
      heading: 'Benchmark Records',
      databaseUpdate: formatDatabaseUpdate(update),
      records: result.records,
      emptyMessage:
        selectedModelSlug !== null ||
        benchmarkSlug !== null ||
        metricSlug !== null
          ? 'No records match the selected filters.'
          : 'No benchmark records are currently available.',
      emptyDescription:
        selectedModelSlug !== null ||
        benchmarkSlug !== null ||
        metricSlug !== null
          ? 'Clear the filters to return to the complete registry.'
          : 'Records will appear here after they have been published.',
      emptyAction:
        selectedModelSlug !== null ||
        benchmarkSlug !== null ||
        metricSlug !== null
          ? { url: '/', label: 'Clear all filters' }
          : null,
      statusNotice: null,
      leaderboard: {
        ...options,
        selectedModel: selectedModelSlug ?? '',
        selectedBenchmark: benchmarkSlug ?? '',
        selectedMetric: metricSlug ?? '',
        sort,
        order,
        sortUrls: registrySortUrls(
          {
            model: selectedModelSlug ?? '',
            benchmark: benchmarkSlug ?? '',
            metric: metricSlug ?? '',
          },
          sort,
          order,
        ),
      },
      pagination: pagination(result, '/', undefined, {
        model: selectedModelSlug ?? '',
        benchmark: benchmarkSlug ?? '',
        metric: metricSlug ?? '',
        sort,
        order,
      }),
    });
  });

  app.get<{ Querystring: SearchQuery }>('/search', async (request, reply) => {
    if (
      hasNonScalarQueryValue(request.query.q) ||
      hasNonScalarQueryValue(request.query.page)
    ) {
      return renderError(reply, 400, 'Query parameters must have one value.');
    }
    const rawQuery = request.query.q ?? '';
    if (rawQuery.length > 256) {
      return renderError(
        reply,
        400,
        'Search queries must be 256 characters or fewer.',
      );
    }
    const page = parsePage(request.query.page);
    if (database === undefined) {
      const displayQuery = rawQuery.trim();
      return reply.view('registry-page.eta', {
        title: 'Search — Benchmark Registry',
        seo: createPageSeo({
          title: 'Search — Benchmark Registry',
          description:
            'Search Benchmark Registry by exact record identifier, model identifier, model name, benchmark, organization, or metric.',
          path: '/search',
          index: false,
        }),
        query: displayQuery,
        heading: `Search results for “${displayQuery}”`,
        databaseUpdate: null,
        records: [],
        emptyMessage: `No records found for “${displayQuery}”.`,
        emptyDescription:
          'Check the identifier or try a broader model, benchmark, or metric search.',
        emptyAction: { url: '/', label: 'Browse all records' },
        statusNotice: null,
        pagination: pagination(
          { ...EMPTY_PAGE, page },
          '/search',
          displayQuery,
        ),
      });
    }

    const resolution = await resolveSearch(database, rawQuery);
    const filter: RegistryRecordFilter = (() => {
      switch (resolution.kind) {
        case 'EXACT_RECORD':
          return { kind: 'EXACT_RECORD', recordId: resolution.recordId };
        case 'RECORD_PREFIX':
          return {
            kind: 'RECORD_PREFIX',
            recordPrefix: resolution.recordPrefix,
          };
        case 'MODEL':
          return { kind: 'MODEL', modelInternalId: resolution.modelInternalId };
        case 'BENCHMARK':
          return {
            kind: 'BENCHMARK',
            benchmarkInternalId: resolution.benchmarkInternalId,
          };
        case 'BENCHMARK_VERSION':
          return {
            kind: 'BENCHMARK_VERSION',
            benchmarkVersionInternalId: resolution.benchmarkVersionInternalId,
          };
        case 'ORGANIZATION':
          return {
            kind: 'ORGANIZATION',
            organizationInternalId: resolution.organizationInternalId,
          };
        case 'METRIC':
          return {
            kind: 'METRIC',
            metricInternalId: resolution.metricInternalId,
          };
        case 'QUERY':
          return { kind: 'QUERY', query: resolution.query };
        case 'GENERAL':
          return { kind: 'GENERAL', query: resolution.normalizedQuery };
        case 'EMPTY':
          return { kind: 'GENERAL', query: '' };
      }
    })();
    const result =
      resolution.kind === 'EMPTY'
        ? { ...EMPTY_PAGE, page }
        : await getRegistryRecords(database, filter, page);
    const statusNotice =
      resolution.kind === 'EXACT_RECORD' &&
      result.records[0] !== undefined &&
      result.records[0].recordStatus !== 'ACTIVE'
        ? `Record status: ${result.records[0].recordStatus}`
        : null;
    return reply.view('registry-page.eta', {
      title: 'Search — Benchmark Registry',
      seo: createPageSeo({
        title: `Search results for “${resolution.displayQuery}” | Benchmark Registry`,
        description: `Benchmark Registry search results for “${resolution.displayQuery}”.`,
        path: '/search',
        index: false,
      }),
      query: resolution.displayQuery,
      heading: `Search results for “${resolution.displayQuery}”`,
      databaseUpdate: null,
      records: result.records,
      emptyMessage: `No records found for “${resolution.displayQuery}”.`,
      emptyDescription:
        'Check the identifier or try a broader model, benchmark, or metric search.',
      emptyAction: { url: '/', label: 'Browse all records' },
      statusNotice,
      pagination:
        resolution.kind === 'EXACT_RECORD'
          ? null
          : pagination(result, '/search', resolution.displayQuery),
    });
  });

  app.get('/models', async (_request, reply) =>
    reply.view('models.eta', {
      title: 'Models — Benchmark Registry',
      seo: createPageSeo({
        title: 'AI Models | Benchmark Registry',
        description:
          'Browse canonical AI models with stable Model Identifiers and links to their reported benchmark records.',
        path: '/models',
      }),
      query: '',
      models: database === undefined ? [] : await listModels(database),
    }),
  );

  app.get<{ Params: { recordId: string } }>(
    '/records/:recordId',
    async (request, reply) => {
      if (database === undefined)
        return renderError(reply, 404, 'Record or page not found');
      const record = await getPublicRecordDetail(
        database,
        request.params.recordId,
      );
      if (record === undefined)
        return renderError(reply, 404, 'Record or page not found');
      if (request.params.recordId !== record.recordId) {
        return reply
          .code(308)
          .header('Location', `/records/${encodeURIComponent(record.recordId)}`)
          .send();
      }
      const eventLabels: Record<string, string> = {
        CREATED_MANUALLY: 'Record created manually',
        CREATED_FROM_INGESTION:
          'Record created through reviewed source ingestion',
        WITHDRAWN: 'Record withdrawn',
        SUPERSEDED: 'Record superseded',
        CORRECTION_NOTED: 'Correction noted',
        SOURCE_ADDED: 'Source added',
        CONFIGURATION_ATTRIBUTED: 'Evaluation configuration attributed',
        SNAPSHOT_ATTRIBUTED: 'Model snapshot attributed',
      };
      return reply.view('record.eta', {
        title: `${record.recordId} — Benchmark Registry`,
        seo: createPageSeo({
          title: `${record.modelName} on ${record.benchmarkDisplay}: ${record.scoreDisplay} ${record.metricName} | Benchmark Registry`,
          description: `Reported ${record.metricName} result of ${record.scoreDisplay} for ${record.modelName} on ${record.benchmarkDisplay}. Benchmark Registry record ${record.recordId}.`,
          path: `/records/${encodeURIComponent(record.recordId)}`,
        }),
        query: '',
        record: {
          ...record,
          canonicalUrl: `${CANONICAL_ORIGIN}/records/${encodeURIComponent(record.recordId)}`,
          correctionUrl: `/feedback?record=${encodeURIComponent(record.recordId)}&type=incorrect-record`,
          modelSlug: modelSlug(record.modelIdentifier),
          additionalConfigurationDisplay:
            Object.keys(record.additionalConfiguration).length === 0
              ? 'None reported'
              : formatStructuredValue(record.additionalConfiguration),
          provenance: record.provenance.map((event) => ({
            ...event,
            label: eventLabels[event.eventType] ?? event.eventType,
          })),
        },
      });
    },
  );

  app.get<{ Params: { slug: string }; Querystring: PageQuery }>(
    '/models/:slug',
    async (request, reply) => {
      if (database === undefined)
        return renderError(reply, 404, 'Record or page not found');
      const model = await getModelBySlug(database, request.params.slug);
      if (model === undefined)
        return renderError(reply, 404, 'Record or page not found');
      if (request.params.slug !== model.slug) {
        return reply
          .code(308)
          .header('Location', `/models/${encodeURIComponent(model.slug)}`)
          .send();
      }
      const page = parsePage(request.query.page);
      const result = await getRegistryRecords(
        database,
        { kind: 'MODEL', modelInternalId: model.id },
        page,
      );
      return reply.view('model.eta', {
        title: `${model.officialName} — Benchmark Registry`,
        seo: createPageSeo({
          title: `${model.officialName} Benchmark Results & Scores | Benchmark Registry`,
          description: `${model.officialName} benchmark results and reported scores in Benchmark Registry. Model Identifier ${model.modelId}; ${result.total} associated benchmark records.`,
          path: canonicalPagePath(
            `/models/${encodeURIComponent(model.slug)}`,
            result.page,
          ),
        }),
        query: '',
        model,
        records: result.records,
        emptyMessage:
          'No benchmark records are currently associated with this model.',
        pagination: pagination(
          result,
          `/models/${encodeURIComponent(model.slug)}`,
        ),
      });
    },
  );

  app.get('/benchmarks', async (_request, reply) =>
    reply.view('benchmarks.eta', {
      title: 'Benchmarks — Benchmark Registry',
      seo: createPageSeo({
        title: 'AI Benchmarks | Benchmark Registry',
        description:
          'Browse canonical AI benchmarks, versions, variants, and their associated reported evaluation records.',
        path: '/benchmarks',
      }),
      query: '',
      benchmarks: database === undefined ? [] : await listBenchmarks(database),
    }),
  );

  app.get<{ Params: { slug: string }; Querystring: PageQuery }>(
    '/benchmarks/:slug',
    async (request, reply) => {
      if (database === undefined)
        return renderError(reply, 404, 'Record or page not found');
      const benchmark = await getBenchmarkBySlug(database, request.params.slug);
      if (benchmark === undefined)
        return renderError(reply, 404, 'Record or page not found');
      if (request.params.slug !== benchmark.slug) {
        return reply
          .code(308)
          .header(
            'Location',
            `/benchmarks/${encodeURIComponent(benchmark.slug)}`,
          )
          .send();
      }
      const page = parsePage(request.query.page);
      const result = await getRegistryRecords(
        database,
        { kind: 'BENCHMARK', benchmarkInternalId: benchmark.id },
        page,
      );
      return reply.view('benchmark.eta', {
        title: `${benchmark.name} — Benchmark Registry`,
        seo: createPageSeo({
          title: `${benchmark.name} AI Benchmark Results | Benchmark Registry`,
          description: `${benchmark.name} reported AI benchmark results in Benchmark Registry, with ${result.total} associated records across canonical models.`,
          path: canonicalPagePath(
            `/benchmarks/${encodeURIComponent(benchmark.slug)}`,
            result.page,
          ),
        }),
        query: '',
        benchmark,
        records: result.records,
        emptyMessage:
          'No benchmark records are currently associated with this benchmark.',
        pagination: pagination(
          result,
          `/benchmarks/${encodeURIComponent(benchmark.slug)}`,
        ),
      });
    },
  );

  app.get<{
    Params: { slug: string; version: string };
    Querystring: PageQuery;
  }>('/benchmarks/:slug/versions/:version', async (request, reply) => {
    if (database === undefined)
      return renderError(reply, 404, 'Record or page not found');
    const reference =
      `${request.params.slug}/${request.params.version}`.toLowerCase();
    const [benchmark, version] = await Promise.all([
      getBenchmarkBySlug(database, request.params.slug),
      getBenchmarkVersionByReference(database, reference),
    ]);
    if (benchmark === undefined || version === undefined)
      return renderError(reply, 404, 'Record or page not found');
    const versionSegment = version.canonicalReference
      .split('/')
      .slice(1)
      .join('/');
    const canonicalPath = `/benchmarks/${encodeURIComponent(benchmark.slug)}/versions/${encodeURIComponent(versionSegment)}`;
    if (
      request.params.slug !== benchmark.slug ||
      request.params.version !== versionSegment
    ) {
      return reply.code(308).header('Location', canonicalPath).send();
    }
    const page = parsePage(request.query.page);
    const result = await getRegistryRecords(
      database,
      { kind: 'BENCHMARK_VERSION', benchmarkVersionInternalId: version.id },
      page,
    );
    return reply.view('benchmark-version.eta', {
      title: `${benchmark.name} — Benchmark Registry`,
      seo: createPageSeo({
        title: `${benchmark.name}: ${version.variantName ?? version.versionLabel ?? 'Unspecified'} Results | Benchmark Registry`,
        description: `Reported ${benchmark.name} results for the ${version.variantName ?? version.versionLabel ?? 'unspecified'} version or variant in Benchmark Registry.`,
        path: canonicalPagePath(canonicalPath, result.page),
      }),
      query: '',
      benchmark,
      version,
      records: result.records,
      emptyMessage: 'No benchmark records are associated with this version.',
      pagination: pagination(
        result,
        `/benchmarks/${encodeURIComponent(benchmark.slug)}/versions/${encodeURIComponent(request.params.version)}`,
      ),
    });
  });

  app.get('/organizations', async (_request, reply) =>
    reply.view('organizations.eta', {
      title: 'Organizations — Benchmark Registry',
      seo: createPageSeo({
        title: 'Organizations | Benchmark Registry',
        description:
          'Browse organizations represented in Benchmark Registry and their associated model benchmark records.',
        path: '/organizations',
      }),
      query: '',
      organizations:
        database === undefined ? [] : await listOrganizations(database),
    }),
  );

  app.get<{ Params: { slug: string }; Querystring: PageQuery }>(
    '/organizations/:slug',
    async (request, reply) => {
      if (database === undefined)
        return renderError(reply, 404, 'Record or page not found');
      const organization = await getOrganizationBySlug(
        database,
        request.params.slug,
      );
      if (organization === undefined)
        return renderError(reply, 404, 'Record or page not found');
      if (request.params.slug !== organization.slug) {
        return reply
          .code(308)
          .header(
            'Location',
            `/organizations/${encodeURIComponent(organization.slug)}`,
          )
          .send();
      }
      const page = parsePage(request.query.page);
      const result = await getRegistryRecords(
        database,
        { kind: 'ORGANIZATION', organizationInternalId: organization.id },
        page,
      );
      return reply.view('organization.eta', {
        title: `${organization.name} — Benchmark Registry`,
        seo: createPageSeo({
          title: `${organization.name} Models and Benchmark Records | Benchmark Registry`,
          description: `${organization.name} models and ${result.total} associated reported benchmark records in Benchmark Registry.`,
          path: canonicalPagePath(
            `/organizations/${encodeURIComponent(organization.slug)}`,
            result.page,
          ),
        }),
        query: '',
        organization,
        records: result.records,
        emptyMessage:
          'No benchmark records are currently associated with this organization.',
        pagination: pagination(
          result,
          `/organizations/${encodeURIComponent(organization.slug)}`,
        ),
      });
    },
  );

  app.get<{ Querystring: PageQuery }>('/recent', async (request, reply) => {
    const page = parsePage(request.query.page);
    const result = await registryPage(database, { kind: 'RECENT' }, page);
    return reply.view('registry-page.eta', {
      title: 'Recent Records — Benchmark Registry',
      seo: createPageSeo({
        title: 'Recent Benchmark Records | Benchmark Registry',
        description:
          'Recently added reported AI benchmark evaluation records with model, benchmark, metric, score, date, and source.',
        path: canonicalPagePath('/recent', result.page),
      }),
      query: '',
      heading: 'Recent Records',
      databaseUpdate: null,
      records: result.records,
      emptyMessage: 'No benchmark records are currently available.',
      statusNotice: null,
      pagination: pagination(result, '/recent'),
    });
  });

  app.get('/sources', async (_request, reply) =>
    reply.view('sources.eta', {
      title: 'Sources — Benchmark Registry',
      seo: createPageSeo({
        title: 'Sources | Benchmark Registry',
        description:
          'Primary, supporting, correction, and archive sources referenced by public Benchmark Registry records.',
        path: '/sources',
      }),
      query: '',
      sources: database === undefined ? [] : await listSources(database),
    }),
  );

  app.get('/docs', (_request, reply) =>
    reply.view('docs.eta', {
      title: 'Registry Documentation — Benchmark Registry',
      seo: createPageSeo({
        title: 'Registry Documentation | Benchmark Registry',
        description:
          'Documentation for Benchmark Registry identifiers, search behavior, evaluation context, sources, statuses, and comparability.',
        path: '/docs',
      }),
      query: '',
      providers: PROVIDER_DOCUMENTATION,
    }),
  );

  app.get('/privacy', (_request, reply) =>
    reply.view('privacy.eta', {
      title: 'Privacy Policy — Benchmark Registry',
      seo: createPageSeo({
        title: 'Privacy Policy | Benchmark Registry',
        description:
          'How Benchmark Registry processes technical visitor information, correspondence, and infrastructure data.',
        path: '/privacy',
      }),
      query: '',
    }),
  );

  app.get('/terms', (_request, reply) =>
    reply.view('terms.eta', {
      title: 'Terms of Use — Benchmark Registry',
      seo: createPageSeo({
        title: 'Terms of Use | Benchmark Registry',
        description:
          'Terms governing use of Benchmark Registry and its archival records of publicly reported benchmark measurements.',
        path: '/terms',
      }),
      query: '',
    }),
  );

  app.get('/robots.txt', (_request, reply) =>
    reply
      .type('text/plain; charset=utf-8')
      .send(
        [
          'User-agent: *',
          'Allow: /',
          'Disallow: /admin',
          'Disallow: /api',
          'Disallow: /auth',
          'Disallow: /health',
          'Disallow: /internal',
          'Disallow: /login',
          'Disallow: /logout',
          '',
          `Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`,
          '',
        ].join('\n'),
      ),
  );

  app.get('/sitemap.xml', async (_request, reply) => {
    const recordBatchCount =
      database === undefined ? 1 : await countRecordSitemapBatches(database);
    const paths = [
      '/sitemaps/pages.xml',
      '/sitemaps/models.xml',
      '/sitemaps/benchmarks.xml',
      ...Array.from(
        { length: recordBatchCount },
        (_, index) => `/sitemaps/records-${index + 1}.xml`,
      ),
    ];
    return reply
      .type('application/xml; charset=utf-8')
      .send(renderSitemapIndex(paths));
  });

  app.get('/sitemaps/pages.xml', (_request, reply) =>
    reply
      .type('application/xml; charset=utf-8')
      .send(
        renderUrlSet(
          [
            '/',
            '/models',
            '/benchmarks',
            '/organizations',
            '/recent',
            '/sources',
            '/docs',
            '/privacy',
            '/terms',
            '/feedback',
          ].map((path) => ({ path })),
        ),
      ),
  );

  app.get('/sitemaps/models.xml', async (_request, reply) =>
    reply
      .type('application/xml; charset=utf-8')
      .send(
        renderUrlSet(
          database === undefined ? [] : await listModelSitemapEntries(database),
        ),
      ),
  );

  app.get('/sitemaps/benchmarks.xml', async (_request, reply) =>
    reply
      .type('application/xml; charset=utf-8')
      .send(
        renderUrlSet(
          database === undefined
            ? []
            : await listBenchmarkSitemapEntries(database),
        ),
      ),
  );

  app.get<{ Params: { batch: string } }>(
    '/sitemaps/records-:batch.xml',
    async (request, reply) => {
      if (!/^\d+$/.test(request.params.batch))
        return reply.status(404).type('text/plain').send('Sitemap not found');
      const batch = Number(request.params.batch);
      const batchCount =
        database === undefined ? 1 : await countRecordSitemapBatches(database);
      if (!Number.isSafeInteger(batch) || batch < 1 || batch > batchCount)
        return reply.status(404).type('text/plain').send('Sitemap not found');
      return reply
        .type('application/xml; charset=utf-8')
        .send(
          renderUrlSet(
            database === undefined
              ? []
              : await listRecordSitemapEntries(database, batch),
          ),
        );
    },
  );

  app.get('/health', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (database === undefined) {
      return reply.status(503).send({ status: 'unavailable' });
    }
    try {
      await sql`select 1`.execute(database);
      return { status: 'ok' };
    } catch (error) {
      app.log.error(error, 'Database readiness check failed');
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  app.setNotFoundHandler((_request, reply) =>
    renderError(reply, 404, 'Record or page not found'),
  );
  done();
};

export default indexRoutes;
