import {
  sql,
  type Expression,
  type ExpressionBuilder,
  type SelectQueryBuilder,
  type SqlBool,
} from 'kysely';

import type { RegistryStatus } from './constants.js';
import type { Database } from './database.js';
import type { DatabaseSchema } from './types.js';
import { formatBenchmarkDisplay } from '../registry/benchmark-display.js';
import type {
  ParsedSearchQuery,
  SearchField,
} from '../search/query-language.js';
import { modelSlug } from '../web/seo.js';

export const REGISTRY_PAGE_SIZE = 100;

export interface PublicRegistryRecord {
  rank: number;
  recordId: string;
  modelId: string;
  modelSlug: string;
  modelName: string;
  benchmarkSlug: string;
  benchmarkName: string;
  metricName: string;
  scoreDisplay: string;
  evaluationDate: string | null;
  sourceUrl: string | null;
  recordStatus: RegistryStatus;
}

export interface RegistryRecordPage {
  records: PublicRegistryRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export type LeaderboardOrder = 'asc' | 'desc';
export type RegistrySort =
  | 'record'
  | 'model'
  | 'benchmark'
  | 'metric'
  | 'score'
  | 'evaluation-date'
  | 'model-id';

export interface LeaderboardOption {
  value: string;
  label: string;
}

export interface LeaderboardOptions {
  recordCount: number;
  models: LeaderboardOption[];
  benchmarks: LeaderboardOption[];
  metrics: LeaderboardOption[];
}

export type RegistryRecordFilter =
  | { kind: 'RECENT' }
  | {
      kind: 'LEADERBOARD';
      modelSlug: string | null;
      benchmarkSlug: string | null;
      metricSlug: string | null;
      sort: RegistrySort;
      order: LeaderboardOrder;
    }
  | { kind: 'EXACT_RECORD'; recordId: string }
  | { kind: 'RECORD_PREFIX'; recordPrefix: string }
  | { kind: 'MODEL'; modelInternalId: string }
  | { kind: 'BENCHMARK'; benchmarkInternalId: string }
  | { kind: 'BENCHMARK_VERSION'; benchmarkVersionInternalId: string }
  | { kind: 'ORGANIZATION'; organizationInternalId: string }
  | { kind: 'METRIC'; metricInternalId: string }
  | { kind: 'QUERY'; query: ParsedSearchQuery }
  | { kind: 'GENERAL'; query: string };

type JoinedTable =
  | 'benchmark_records'
  | 'models'
  | 'benchmarks'
  | 'benchmark_versions'
  | 'metrics'
  | 'sources'
  | 'organizations';

type JoinedQuery = SelectQueryBuilder<DatabaseSchema, JoinedTable, object>;

function joinedRecords(db: Database): JoinedQuery {
  return db
    .selectFrom('benchmark_records')
    .innerJoin('models', 'models.id', 'benchmark_records.model_id')
    .innerJoin('benchmarks', 'benchmarks.id', 'benchmark_records.benchmark_id')
    .innerJoin(
      'benchmark_versions',
      'benchmark_versions.id',
      'benchmark_records.benchmark_version_id',
    )
    .innerJoin('metrics', 'metrics.id', 'benchmark_records.metric_id')
    .innerJoin('sources', 'sources.id', 'benchmark_records.source_id')
    .innerJoin('organizations', 'organizations.id', 'models.organization_id');
}

function escapedLikePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, '\\$&')}%`;
}

function generalSearchExpression(
  eb: ExpressionBuilder<DatabaseSchema, JoinedTable>,
  query: string,
): Expression<SqlBool> {
  const pattern = escapedLikePattern(query);
  const matches = (column: string): Expression<SqlBool> =>
    sql<boolean>`${sql.ref(column)} ilike ${pattern} escape '\\'`;

  return eb.or([
    matches('benchmark_records.record_id'),
    matches('models.model_id'),
    matches('models.official_name'),
    matches('benchmarks.name'),
    matches('benchmark_versions.canonical_reference'),
    matches('benchmark_versions.version_label'),
    matches('benchmark_versions.variant_name'),
    matches('organizations.name'),
    matches('metrics.name'),
    eb.exists(
      eb
        .selectFrom('model_aliases')
        .select('model_aliases.id')
        .whereRef('model_aliases.model_id', '=', 'models.id')
        .where((aliasEb) =>
          aliasEb.or([
            sql<boolean>`model_aliases.alias ilike ${pattern} escape '\\'`,
            sql<boolean>`model_aliases.normalized_alias ilike ${pattern} escape '\\'`,
            sql<boolean>`model_aliases.compact_alias ilike ${pattern} escape '\\'`,
          ]),
        ),
    ),
  ]);
}

function fieldSearchExpression(
  eb: ExpressionBuilder<DatabaseSchema, JoinedTable>,
  field: SearchField | null,
  value: string,
): Expression<SqlBool> {
  if (field === null) return generalSearchExpression(eb, value);

  const pattern = escapedLikePattern(value);
  const matches = (column: string): Expression<SqlBool> =>
    sql<boolean>`${sql.ref(column)} ilike ${pattern} escape '\\'`;

  switch (field) {
    case 'brand':
      return eb.or([
        matches('organizations.name'),
        matches('organizations.slug'),
        matches('organizations.provider_prefix'),
      ]);
    case 'benchmark':
      return eb.or([
        matches('benchmarks.name'),
        matches('benchmarks.slug'),
        matches('benchmark_versions.canonical_reference'),
        matches('benchmark_versions.version_label'),
        matches('benchmark_versions.variant_name'),
        eb.exists(
          eb
            .selectFrom('benchmark_aliases')
            .select('benchmark_aliases.id')
            .whereRef('benchmark_aliases.benchmark_id', '=', 'benchmarks.id')
            .where((aliasEb) =>
              aliasEb.or([
                sql<boolean>`benchmark_aliases.alias ilike ${pattern} escape '\\'`,
                sql<boolean>`benchmark_aliases.normalized_alias ilike ${pattern} escape '\\'`,
                sql<boolean>`benchmark_aliases.compact_alias ilike ${pattern} escape '\\'`,
              ]),
            ),
        ),
      ]);
    case 'record': {
      const numericValue = /^\d+$/.test(value) ? Number(value) : null;
      return numericValue !== null && Number.isSafeInteger(numericValue)
        ? eb('benchmark_records.sequence_number', '=', numericValue)
        : matches('benchmark_records.record_id');
    }
    case 'model':
      return eb.or([
        matches('models.model_id'),
        matches('models.official_name'),
        matches('models.family'),
        eb.exists(
          eb
            .selectFrom('model_aliases')
            .select('model_aliases.id')
            .whereRef('model_aliases.model_id', '=', 'models.id')
            .where((aliasEb) =>
              aliasEb.or([
                sql<boolean>`model_aliases.alias ilike ${pattern} escape '\\'`,
                sql<boolean>`model_aliases.normalized_alias ilike ${pattern} escape '\\'`,
                sql<boolean>`model_aliases.compact_alias ilike ${pattern} escape '\\'`,
              ]),
            ),
        ),
      ]);
    case 'metric':
      return eb.or([matches('metrics.name'), matches('metrics.slug')]);
    case 'date':
      return /^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(value)
        ? sql<boolean>`benchmark_records.evaluation_date::text like ${`${value}%`}`
        : sql<boolean>`false`;
    case 'org':
      return eb.or([
        matches('organizations.name'),
        matches('organizations.slug'),
        matches('benchmarks.organization_name'),
        matches('sources.publisher'),
        eb.exists(
          eb
            .selectFrom('evaluators')
            .select('evaluators.id')
            .whereRef('evaluators.id', '=', 'benchmark_records.evaluator_id')
            .where((evaluatorEb) =>
              evaluatorEb.or([
                sql<boolean>`evaluators.name ilike ${pattern} escape '\\'`,
                sql<boolean>`evaluators.slug ilike ${pattern} escape '\\'`,
              ]),
            ),
        ),
      ]);
  }
}

function parsedSearchExpression(
  eb: ExpressionBuilder<DatabaseSchema, JoinedTable>,
  query: ParsedSearchQuery,
): Expression<SqlBool> {
  if (query.alternatives.length === 0) return sql<boolean>`false`;
  return eb.or(
    query.alternatives.map((alternative) =>
      eb.and(
        alternative.terms.map((term) =>
          eb.or(
            term.values.map((value) =>
              fieldSearchExpression(eb, term.field, value),
            ),
          ),
        ),
      ),
    ),
  );
}

function applyFilter(
  query: JoinedQuery,
  filter: RegistryRecordFilter,
): JoinedQuery {
  switch (filter.kind) {
    case 'RECENT':
      return query.where('benchmark_records.status', '=', 'ACTIVE');
    case 'LEADERBOARD': {
      let leaderboardQuery = query.where(
        'benchmark_records.status',
        '=',
        'ACTIVE',
      );
      if (filter.benchmarkSlug !== null) {
        leaderboardQuery = leaderboardQuery.where(
          'benchmarks.slug',
          '=',
          filter.benchmarkSlug,
        );
      }
      if (filter.modelSlug !== null) {
        leaderboardQuery = leaderboardQuery.where(
          sql<boolean>`lower(models.model_id) = ${filter.modelSlug}`,
        );
      }
      if (filter.metricSlug !== null) {
        leaderboardQuery = leaderboardQuery.where(
          'metrics.slug',
          '=',
          filter.metricSlug,
        );
      }
      return leaderboardQuery;
    }
    case 'EXACT_RECORD':
      return query.where('benchmark_records.record_id', '=', filter.recordId);
    case 'RECORD_PREFIX':
      return query.where(
        'benchmark_records.record_id',
        'like',
        `${filter.recordPrefix}-%`,
      );
    case 'MODEL':
      return query
        .where('benchmark_records.model_id', '=', filter.modelInternalId)
        .where('benchmark_records.status', '=', 'ACTIVE');
    case 'BENCHMARK':
      return query
        .where(
          'benchmark_records.benchmark_id',
          '=',
          filter.benchmarkInternalId,
        )
        .where('benchmark_records.status', '=', 'ACTIVE');
    case 'BENCHMARK_VERSION':
      return query
        .where(
          'benchmark_records.benchmark_version_id',
          '=',
          filter.benchmarkVersionInternalId,
        )
        .where('benchmark_records.status', '=', 'ACTIVE');
    case 'ORGANIZATION':
      return query
        .where('models.organization_id', '=', filter.organizationInternalId)
        .where('benchmark_records.status', '=', 'ACTIVE');
    case 'METRIC':
      return query
        .where('benchmark_records.metric_id', '=', filter.metricInternalId)
        .where('benchmark_records.status', '=', 'ACTIVE');
    case 'QUERY':
      return query
        .where('benchmark_records.status', '=', 'ACTIVE')
        .where((eb) => parsedSearchExpression(eb, filter.query));
    case 'GENERAL':
      return query
        .where('benchmark_records.status', '=', 'ACTIVE')
        .where((eb) => generalSearchExpression(eb, filter.query));
  }
}

function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  if (value === null) return null;
  if (value instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(value)
      .reduce<Record<string, string>>((result, part) => {
        result[part.type] = part.value;
        return result;
      }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  if (typeof value === 'string') return value.slice(0, 10);
  return null;
}

export async function getRegistryRecords(
  db: Database,
  filter: RegistryRecordFilter,
  page = 1,
  pageSize: number | null = REGISTRY_PAGE_SIZE,
): Promise<RegistryRecordPage> {
  const filtered = applyFilter(joinedRecords(db), filter);
  let total: number;
  let effectivePage: number;

  if (pageSize === null || page === 1) {
    total = 0;
    effectivePage = 1;
  } else {
    const countRow = await filtered
      .clearSelect()
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();
    total = Number(countRow.count);
    effectivePage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  }
  const offset = (effectivePage - 1) * (pageSize ?? 0);

  let resultQuery = filtered.clearSelect().select([
    'benchmark_records.record_id as recordId',
    'models.model_id as modelId',
    'models.official_name as modelName',
    'benchmarks.slug as benchmarkSlug',
    'benchmarks.name as benchmarkName',
    'benchmark_versions.version_label as benchmarkVersionLabel',
    'benchmark_versions.variant_name as benchmarkVariantName',
    'metrics.name as metricName',
    'benchmark_records.score_display as scoreDisplay',
    sql<number>`row_number() over (
      order by benchmark_records.score_value desc nulls last,
               benchmark_records.record_id asc
    )::integer`.as('rank'),
    'benchmark_records.evaluation_date as evaluationDate',
    'sources.url as sourceUrl',
    'benchmark_records.status as recordStatus',
    sql<string>`count(*) over ()`.as('totalCount'),
  ]);

  if (filter.kind === 'RECENT') {
    resultQuery = resultQuery
      .orderBy('benchmark_records.created_at', 'desc')
      .orderBy('benchmark_records.record_id', 'asc');
  } else if (filter.kind === 'LEADERBOARD') {
    switch (filter.sort) {
      case 'record':
        resultQuery = resultQuery.orderBy(
          'benchmark_records.record_id',
          filter.order,
        );
        break;
      case 'model':
        resultQuery = resultQuery.orderBy('models.official_name', filter.order);
        break;
      case 'benchmark':
        resultQuery = resultQuery
          .orderBy('benchmarks.name', filter.order)
          .orderBy('benchmark_versions.version_label', filter.order)
          .orderBy('benchmark_versions.variant_name', filter.order);
        break;
      case 'metric':
        resultQuery = resultQuery.orderBy('metrics.name', filter.order);
        break;
      case 'score':
        resultQuery = resultQuery.orderBy(
          sql`benchmark_records.score_value ${sql.raw(filter.order)} nulls last`,
        );
        break;
      case 'evaluation-date':
        resultQuery = resultQuery.orderBy(
          sql`benchmark_records.evaluation_date ${sql.raw(filter.order)} nulls last`,
        );
        break;
      case 'model-id':
        resultQuery = resultQuery.orderBy('models.model_id', filter.order);
        break;
    }
    resultQuery = resultQuery.orderBy('benchmark_records.record_id', 'asc');
  } else {
    resultQuery = resultQuery
      .orderBy(sql`benchmark_records.evaluation_date desc nulls last`)
      .orderBy('benchmark_records.record_id', 'asc');
  }

  const rows = await (
    pageSize === null ? resultQuery : resultQuery.limit(pageSize).offset(offset)
  ).execute();

  if (pageSize === null || page === 1) {
    total = rows[0] === undefined ? 0 : Number(rows[0].totalCount);
  }

  return {
    records: rows.map((row) => ({
      rank: row.rank,
      recordId: row.recordId,
      modelId: row.modelId,
      modelSlug: modelSlug(row.modelId),
      modelName: row.modelName,
      benchmarkSlug: row.benchmarkSlug,
      benchmarkName: formatBenchmarkDisplay({
        familyName: row.benchmarkName,
        versionLabel: row.benchmarkVersionLabel,
        variantName: row.benchmarkVariantName,
      }),
      metricName: row.metricName,
      scoreDisplay: row.scoreDisplay,
      evaluationDate: isoDate(row.evaluationDate),
      sourceUrl: safeSourceUrl(row.sourceUrl),
      recordStatus: row.recordStatus,
    })),
    page: effectivePage,
    pageSize: pageSize ?? Math.max(total, 1),
    total,
  };
}

export async function getLeaderboardOptions(
  db: Database,
): Promise<LeaderboardOptions> {
  const [recordCountRow, models, benchmarks, metrics] = await Promise.all([
    db
      .selectFrom('benchmark_records')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('benchmark_records.status', '=', 'ACTIVE')
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('benchmark_records')
      .innerJoin('models', 'models.id', 'benchmark_records.model_id')
      .select(['models.model_id as value', 'models.official_name as label'])
      .distinct()
      .where('benchmark_records.status', '=', 'ACTIVE')
      .orderBy('models.official_name', 'asc')
      .execute()
      .then((rows) =>
        rows.map((row) => ({ ...row, value: modelSlug(row.value) })),
      ),
    db
      .selectFrom('benchmark_records')
      .innerJoin(
        'benchmarks',
        'benchmarks.id',
        'benchmark_records.benchmark_id',
      )
      .select(['benchmarks.slug as value', 'benchmarks.name as label'])
      .distinct()
      .where('benchmark_records.status', '=', 'ACTIVE')
      .orderBy('benchmarks.name', 'asc')
      .execute(),
    db
      .selectFrom('benchmark_records')
      .innerJoin('metrics', 'metrics.id', 'benchmark_records.metric_id')
      .select(['metrics.slug as value', 'metrics.name as label'])
      .distinct()
      .where('benchmark_records.status', '=', 'ACTIVE')
      .orderBy('metrics.name', 'asc')
      .execute(),
  ]);
  return {
    recordCount: Number(recordCountRow.count),
    models,
    benchmarks,
    metrics,
  };
}
