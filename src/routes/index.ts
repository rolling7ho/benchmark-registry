import type { FastifyPluginCallback, FastifyReply } from 'fastify';

import {
  getBenchmarkBySlug,
  getBenchmarkVersionByReference,
  getModelByIdentifier,
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
  type RegistryRecordFilter,
  type RegistryRecordPage,
} from '../db/registry-records.js';
import { PROVIDER_DOCUMENTATION } from '../identifiers/provider-documentation.js';
import { resolveSearch } from '../search/resolve-search.js';

interface RouteOptions {
  database: Database | undefined;
}

interface PageQuery {
  page?: string;
}

interface LeaderboardQuery extends PageQuery {
  benchmark?: string;
  metric?: string;
  order?: string;
}

interface SearchQuery extends PageQuery {
  q?: string;
}

interface PaginationView {
  start: number;
  end: number;
  total: number;
  previousUrl: string | null;
  nextUrl: string | null;
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
  const url = (page: number): string => {
    const parameters = new URLSearchParams();
    if (query !== undefined) parameters.set('q', query);
    for (const [key, value] of Object.entries(additionalParameters)) {
      if (value !== '') parameters.set(key, value);
    }
    parameters.set('page', page.toString());
    return `${pathname}?${parameters.toString()}`;
  };
  return {
    start,
    end,
    total: result.total,
    previousUrl: result.page > 1 ? url(result.page - 1) : null,
    nextUrl: end < result.total ? url(result.page + 1) : null,
  };
}

function renderError(
  reply: FastifyReply,
  statusCode: number,
  message: string,
): FastifyReply {
  return reply.status(statusCode).view('error.eta', {
    title: `${statusCode} — Benchmark Registry`,
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
    const page = parsePage(request.query.page);
    const benchmarkSlug = request.query.benchmark?.trim().toLowerCase() || null;
    const metricSlug = request.query.metric?.trim().toLowerCase() || null;
    const order: LeaderboardOrder =
      request.query.order === 'asc' ? 'asc' : 'desc';
    const [result, update, options] = await Promise.all([
      registryPage(
        database,
        { kind: 'LEADERBOARD', benchmarkSlug, metricSlug, order },
        page,
      ),
      database === undefined
        ? Promise.resolve(null)
        : getLastDatabaseUpdate(database),
      database === undefined
        ? Promise.resolve({ benchmarks: [], metrics: [] })
        : getLeaderboardOptions(database),
    ]);
    return reply.view('registry-page.eta', {
      title: 'Benchmark Registry',
      query: '',
      heading: 'Benchmark Records Leaderboard',
      databaseUpdate: formatDatabaseUpdate(update),
      records: result.records,
      emptyMessage: 'No benchmark records are currently available.',
      statusNotice: null,
      leaderboard: {
        ...options,
        selectedBenchmark: benchmarkSlug ?? '',
        selectedMetric: metricSlug ?? '',
        order,
        rankOffset: (result.page - 1) * result.pageSize,
      },
      pagination: pagination(result, '/', undefined, {
        benchmark: benchmarkSlug ?? '',
        metric: metricSlug ?? '',
        order,
      }),
    });
  });

  app.get<{ Querystring: SearchQuery }>('/search', async (request, reply) => {
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
        query: displayQuery,
        heading: `Search results for “${displayQuery}”`,
        databaseUpdate: null,
        records: [],
        emptyMessage: `No records found for “${displayQuery}”.`,
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
      query: resolution.displayQuery,
      heading: `Search results for “${resolution.displayQuery}”`,
      databaseUpdate: null,
      records: result.records,
      emptyMessage: `No records found for “${resolution.displayQuery}”.`,
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
        query: '',
        record: {
          ...record,
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

  app.get<{ Params: { modelId: string }; Querystring: PageQuery }>(
    '/models/:modelId',
    async (request, reply) => {
      if (database === undefined)
        return renderError(reply, 404, 'Record or page not found');
      const model = await getModelByIdentifier(
        database,
        request.params.modelId,
      );
      if (model === undefined)
        return renderError(reply, 404, 'Record or page not found');
      const page = parsePage(request.query.page);
      const result = await getRegistryRecords(
        database,
        { kind: 'MODEL', modelInternalId: model.id },
        page,
      );
      return reply.view('model.eta', {
        title: `${model.officialName} — Benchmark Registry`,
        query: '',
        model,
        records: result.records,
        emptyMessage:
          'No benchmark records are currently associated with this model.',
        pagination: pagination(
          result,
          `/models/${encodeURIComponent(model.modelId)}`,
        ),
      });
    },
  );

  app.get('/benchmarks', async (_request, reply) =>
    reply.view('benchmarks.eta', {
      title: 'Benchmarks — Benchmark Registry',
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
      const page = parsePage(request.query.page);
      const result = await getRegistryRecords(
        database,
        { kind: 'BENCHMARK', benchmarkInternalId: benchmark.id },
        page,
      );
      return reply.view('benchmark.eta', {
        title: `${benchmark.name} — Benchmark Registry`,
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
    const page = parsePage(request.query.page);
    const result = await getRegistryRecords(
      database,
      { kind: 'BENCHMARK_VERSION', benchmarkVersionInternalId: version.id },
      page,
    );
    return reply.view('benchmark-version.eta', {
      title: `${benchmark.name} — Benchmark Registry`,
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
      const page = parsePage(request.query.page);
      const result = await getRegistryRecords(
        database,
        { kind: 'ORGANIZATION', organizationInternalId: organization.id },
        page,
      );
      return reply.view('organization.eta', {
        title: `${organization.name} — Benchmark Registry`,
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
      query: '',
      sources: database === undefined ? [] : await listSources(database),
    }),
  );

  app.get('/docs', (_request, reply) =>
    reply.view('docs.eta', {
      title: 'Registry Documentation — Benchmark Registry',
      query: '',
      providers: PROVIDER_DOCUMENTATION,
    }),
  );

  app.get('/health', () => ({ status: 'ok' }));

  app.setNotFoundHandler((_request, reply) =>
    renderError(reply, 404, 'Record or page not found'),
  );
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error, 'Registry request failed');
    return renderError(reply, 500, 'Registry request failed');
  });

  done();
};

export default indexRoutes;
