import type { Kysely, Selectable, Transaction } from 'kysely';

import {
  REGISTRY_STATUSES,
  REPORT_TYPES,
  SOURCE_TYPES,
  EVALUATOR_TYPES,
  PROVENANCE_EVENT_TYPES,
  type RegistryStatus,
  type ReportType,
  type SourceType,
  type SourceRole,
} from '../db/constants.js';
import type { Database } from '../db/database.js';
import { RegistryEntityNotFoundError } from '../db/errors.js';
import { markRegistryUpdated } from '../db/registry-metadata.js';
import type {
  BenchmarkRecordsTable,
  BenchmarksTable,
  BenchmarkAliasesTable,
  DatabaseSchema,
  MetricsTable,
  ModelAliasesTable,
  OrganizationsTable,
  SourcesTable,
} from '../db/types.js';
import { allocateBenchmarkRecordIdentifierInTransaction } from '../identifiers/allocate-record-id.js';
import { formatBenchmarkRecordIdentifier } from '../identifiers/record-id.js';
import {
  generateModelIdentifier,
  validateModelIdentifier,
} from '../identifiers/model-id.js';
import {
  getProviderBySlug,
  IDENTIFIER_STRATEGIES,
  PROVIDERS,
  type IdentifierStrategy,
} from '../identifiers/providers.js';
import {
  assertModelIdentifierMatchesRecordPrefix,
  generateRecordPrefix,
  validateRecordPrefix,
} from '../identifiers/record-prefix.js';
import { compactSearchText, normalizeSearchText } from '../search/normalize.js';
import { formatBenchmarkDisplay } from './benchmark-display.js';
import { configurationFingerprint } from './evaluation-configurations.js';

export interface OrganizationInput {
  provider?: string | undefined;
  slug?: string | undefined;
  name?: string | undefined;
  providerPrefix?: string | undefined;
  brNamespace?: string | undefined;
  identifierStrategy?: string | undefined;
}

export function prepareOrganization(input: OrganizationInput): {
  slug: string;
  name: string;
  providerPrefix: string;
  brNamespace: string;
  identifierStrategy: IdentifierStrategy;
} {
  const providerSlug = input.provider?.trim().toLowerCase();
  const configured = PROVIDERS.find(
    (provider) => provider.slug === providerSlug,
  );
  if (configured !== undefined) {
    const conflicts = [
      input.slug !== undefined && input.slug.toLowerCase() !== configured.slug,
      input.name !== undefined && input.name !== configured.displayName,
      input.providerPrefix !== undefined &&
        input.providerPrefix.toUpperCase() !== configured.providerPrefix,
      input.brNamespace !== undefined &&
        input.brNamespace !== configured.brNamespace,
      input.identifierStrategy !== undefined &&
        input.identifierStrategy.toUpperCase() !==
          configured.identifierStrategy,
    ];
    if (conflicts.some(Boolean)) {
      throw new Error(
        `Provider ${configured.slug} cannot override canonical provider configuration.`,
      );
    }
    return {
      slug: configured.slug,
      name: configured.displayName,
      providerPrefix: configured.providerPrefix,
      brNamespace: configured.brNamespace,
      identifierStrategy: configured.identifierStrategy,
    };
  }

  const slug = input.slug?.trim().toLowerCase();
  const name = input.name?.trim();
  const providerPrefix = input.providerPrefix?.trim().toUpperCase();
  const brNamespace = input.brNamespace?.trim();
  const strategy = input.identifierStrategy?.trim().toUpperCase();
  if (
    !slug ||
    !name ||
    !providerPrefix ||
    !brNamespace ||
    !strategy ||
    !IDENTIFIER_STRATEGIES.includes(strategy as IdentifierStrategy)
  ) {
    throw new Error(
      'Unconfigured organizations require --slug, --name, --provider-prefix, --br-namespace, and --identifier-strategy.',
    );
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Invalid organization slug.');
  }
  if (!/^[A-Z0-9]+$/.test(providerPrefix) || !/^\d{3}$/.test(brNamespace)) {
    throw new Error('Invalid provider prefix or BR namespace.');
  }
  return {
    slug,
    name,
    providerPrefix,
    brNamespace,
    identifierStrategy: strategy as IdentifierStrategy,
  };
}

export async function createOrganization(
  db: Database,
  input: OrganizationInput,
): Promise<Selectable<OrganizationsTable>> {
  const organization = prepareOrganization(input);
  return db
    .insertInto('organizations')
    .values({
      slug: organization.slug,
      name: organization.name,
      provider_prefix: organization.providerPrefix,
      br_namespace: organization.brNamespace,
      identifier_strategy: organization.identifierStrategy,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listAdministrativeOrganizations(db: Database): Promise<
  Array<{
    name: string;
    slug: string;
    providerPrefix: string;
    brNamespace: string;
    identifierStrategy: IdentifierStrategy;
  }>
> {
  return db
    .selectFrom('organizations')
    .select([
      'name',
      'slug',
      'provider_prefix as providerPrefix',
      'br_namespace as brNamespace',
      'identifier_strategy as identifierStrategy',
    ])
    .orderBy('name')
    .execute();
}

export interface ModelInput {
  organizationSlug: string;
  officialName: string;
  family?: string | null | undefined;
  modelNumber?: string | null | undefined;
  tierCode?: string | null | undefined;
  status?: RegistryStatus | undefined;
}

export async function prepareModel(
  db: Database,
  input: ModelInput,
): Promise<{
  organization: Selectable<OrganizationsTable>;
  officialName: string;
  family: string | null;
  modelNumber: string | null;
  tierCode: string | null;
  status: RegistryStatus;
  modelId: string;
  recordPrefix: string;
}> {
  const organization = await db
    .selectFrom('organizations')
    .selectAll()
    .where('slug', '=', input.organizationSlug.trim().toLowerCase())
    .executeTakeFirst();
  if (organization === undefined) {
    throw new RegistryEntityNotFoundError(
      'Organization',
      input.organizationSlug,
    );
  }
  const provider = getProviderBySlug(organization.slug);
  if (
    organization.provider_prefix !== provider.providerPrefix ||
    organization.br_namespace !== provider.brNamespace ||
    organization.identifier_strategy !== provider.identifierStrategy
  ) {
    throw new Error(
      `Organization ${organization.slug} does not match the canonical provider configuration.`,
    );
  }
  const identifierInput = {
    provider: provider.slug,
    family: input.family ?? null,
    modelNumber: input.modelNumber ?? null,
    tierCode: input.tierCode ?? null,
  };
  return {
    organization,
    officialName: requiredText(input.officialName, 'Official name'),
    family: nullableText(input.family),
    modelNumber: nullableText(input.modelNumber),
    tierCode: nullableText(input.tierCode)?.toUpperCase() ?? null,
    status: input.status ?? 'ACTIVE',
    modelId: generateModelIdentifier(identifierInput),
    recordPrefix: generateRecordPrefix(identifierInput),
  };
}

export async function listAdministrativeModels(
  db: Database,
  filters: {
    organization?: string | undefined;
    status?: RegistryStatus | undefined;
  },
): Promise<
  Array<{
    model: string;
    modelId: string;
    organization: string;
    family: string | null;
    modelNumber: string | null;
    tier: string | null;
    status: RegistryStatus;
    recordPrefix: string;
  }>
> {
  let query = db
    .selectFrom('models')
    .innerJoin('organizations', 'organizations.id', 'models.organization_id')
    .select([
      'models.official_name as model',
      'models.model_id as modelId',
      'organizations.name as organization',
      'models.family as family',
      'models.model_number as modelNumber',
      'models.tier_code as tier',
      'models.status as status',
      'models.record_prefix as recordPrefix',
    ]);
  if (filters.organization !== undefined) {
    query = query.where(
      'organizations.slug',
      '=',
      filters.organization.toLowerCase(),
    );
  }
  if (filters.status !== undefined)
    query = query.where('models.status', '=', filters.status);
  return query.orderBy('models.official_name').execute();
}

export async function addAlias(
  db: Database,
  input: { modelIdentifier: string; alias: string },
): Promise<{
  model: { id: string; official_name: string; model_id: string };
  alias: string;
  normalized: string;
  compact: string;
  commit: () => Promise<Selectable<ModelAliasesTable>>;
}> {
  const modelIdentifier = input.modelIdentifier.trim().toUpperCase();
  const model = await db
    .selectFrom('models')
    .select(['id', 'official_name', 'model_id'])
    .where('model_id', '=', modelIdentifier)
    .executeTakeFirst();
  if (model === undefined)
    throw new RegistryEntityNotFoundError('Model', modelIdentifier);
  const alias = requiredText(input.alias, 'Alias');
  const normalized = normalizeSearchText(alias);
  const compact = compactSearchText(alias);
  const conflicts = await db
    .selectFrom('model_aliases')
    .innerJoin('models', 'models.id', 'model_aliases.model_id')
    .select([
      'model_aliases.alias',
      'model_aliases.model_id',
      'models.model_id',
    ])
    .where((eb) =>
      eb.or([
        eb('model_aliases.alias', '=', alias),
        eb('model_aliases.normalized_alias', '=', normalized),
        eb('model_aliases.compact_alias', '=', compact),
      ]),
    )
    .execute();
  const canonicalModels = await db
    .selectFrom('models')
    .select(['id', 'model_id', 'official_name'])
    .where('id', '!=', model.id)
    .execute();
  if (
    conflicts.some((row) => row.model_id === model.id && row.alias === alias)
  ) {
    throw new Error(`Alias already exists for ${model.model_id}: ${alias}`);
  }
  const crossModel = conflicts.find((row) => row.model_id !== model.id);
  if (crossModel !== undefined) {
    throw new Error(
      `Alias conflicts with canonical model ${crossModel.model_id}.`,
    );
  }
  const canonicalIdentityConflict = canonicalModels.find(
    (candidate) =>
      normalizeSearchText(candidate.official_name) === normalized ||
      compactSearchText(candidate.official_name) === compact ||
      normalizeSearchText(candidate.model_id) === normalized ||
      compactSearchText(candidate.model_id) === compact,
  );
  if (canonicalIdentityConflict !== undefined) {
    throw new Error(
      `Alias conflicts with canonical model ${canonicalIdentityConflict.model_id}.`,
    );
  }
  return {
    model,
    alias,
    normalized,
    compact,
    commit: () =>
      db
        .insertInto('model_aliases')
        .values({
          model_id: model.id,
          alias,
          normalized_alias: normalized,
          compact_alias: compact,
          alias_type: 'OPERATOR',
        })
        .returningAll()
        .executeTakeFirstOrThrow(),
  };
}

export async function createBenchmark(
  db: Database,
  input: {
    name: string;
    slug: string;
    organizationName?: string | null | undefined;
    version?: string | null | undefined;
    status?: RegistryStatus | undefined;
  },
): Promise<Selectable<BenchmarksTable>> {
  const values = prepareBenchmark(input);
  return db.transaction().execute(async (transaction) => {
    const row = await transaction
      .insertInto('benchmarks')
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow();
    await transaction
      .insertInto('benchmark_versions')
      .values({
        benchmark_id: row.id,
        version_label: values.version,
        variant_name: null,
        canonical_reference: `${row.slug}/default`,
        status: values.status,
        release_date: null,
        notes: null,
      })
      .execute();
    await markRegistryUpdated(transaction);
    return row;
  });
}

export function prepareBenchmark(input: {
  name: string;
  slug: string;
  organizationName?: string | null | undefined;
  version?: string | null | undefined;
  status?: RegistryStatus | undefined;
}): {
  name: string;
  slug: string;
  organization_name: string | null;
  version: string | null;
  status: RegistryStatus;
} {
  return {
    name: requiredText(input.name, 'Benchmark name'),
    slug: validSlug(input.slug, 'Benchmark'),
    organization_name: nullableText(input.organizationName),
    version: nullableText(input.version),
    status: input.status ?? 'ACTIVE',
  };
}

export async function listAdministrativeBenchmarks(db: Database): Promise<
  Array<{
    benchmark: string;
    slug: string;
    version: string | null;
    organization: string | null;
    status: RegistryStatus;
    recordCount: number;
  }>
> {
  const rows = await db
    .selectFrom('benchmarks')
    .leftJoin(
      'benchmark_records',
      'benchmark_records.benchmark_id',
      'benchmarks.id',
    )
    .select([
      'benchmarks.name as benchmark',
      'benchmarks.slug as slug',
      'benchmarks.version as version',
      'benchmarks.organization_name as organization',
      'benchmarks.status as status',
    ])
    .select((eb) => eb.fn.count('benchmark_records.id').as('recordCount'))
    .groupBy('benchmarks.id')
    .orderBy('benchmarks.name')
    .execute();
  return rows.map((row) => ({ ...row, recordCount: Number(row.recordCount) }));
}

export async function addBenchmarkAlias(
  db: Database,
  input: { benchmarkSlug: string; alias: string },
): Promise<{
  benchmark: { id: string; slug: string; name: string };
  alias: string;
  normalized: string;
  compact: string;
  commit: () => Promise<Selectable<BenchmarkAliasesTable>>;
}> {
  const benchmarkSlug = input.benchmarkSlug.trim().toLowerCase();
  const benchmark = await db
    .selectFrom('benchmarks')
    .select(['id', 'slug', 'name'])
    .where('slug', '=', benchmarkSlug)
    .executeTakeFirst();
  if (benchmark === undefined)
    throw new RegistryEntityNotFoundError('Benchmark', benchmarkSlug);
  const alias = requiredText(input.alias, 'Alias');
  const normalized = normalizeSearchText(alias);
  const compact = compactSearchText(alias);
  const conflicts = await db
    .selectFrom('benchmark_aliases')
    .innerJoin('benchmarks', 'benchmarks.id', 'benchmark_aliases.benchmark_id')
    .select([
      'benchmark_aliases.benchmark_id',
      'benchmark_aliases.alias',
      'benchmarks.slug',
    ])
    .where((eb) =>
      eb.or([
        eb('benchmark_aliases.normalized_alias', '=', normalized),
        eb('benchmark_aliases.compact_alias', '=', compact),
      ]),
    )
    .execute();
  if (
    conflicts.some(
      (row) => row.benchmark_id === benchmark.id && row.alias === alias,
    )
  )
    throw new Error(`Alias already exists for ${benchmark.slug}: ${alias}`);
  const crossBenchmark = conflicts.find(
    (row) => row.benchmark_id !== benchmark.id,
  );
  if (crossBenchmark !== undefined)
    throw new Error(
      `Alias conflicts with canonical benchmark ${crossBenchmark.slug}.`,
    );
  const canonical = await db
    .selectFrom('benchmarks')
    .select(['id', 'slug', 'name'])
    .where('id', '!=', benchmark.id)
    .execute();
  const identityConflict = canonical.find(
    (row) =>
      normalizeSearchText(row.slug) === normalized ||
      normalizeSearchText(row.name) === normalized ||
      compactSearchText(row.slug) === compact ||
      compactSearchText(row.name) === compact,
  );
  if (identityConflict !== undefined)
    throw new Error(
      `Alias conflicts with canonical benchmark ${identityConflict.slug}.`,
    );
  return {
    benchmark,
    alias,
    normalized,
    compact,
    commit: () =>
      db
        .insertInto('benchmark_aliases')
        .values({
          benchmark_id: benchmark.id,
          alias,
          normalized_alias: normalized,
          compact_alias: compact,
        })
        .returningAll()
        .executeTakeFirstOrThrow(),
  };
}

export async function createMetric(
  db: Database,
  input: {
    name: string;
    slug: string;
    unit?: string | null | undefined;
    higherIsBetter?: boolean | null | undefined;
  },
): Promise<Selectable<MetricsTable>> {
  const values = prepareMetric(input);
  return db
    .insertInto('metrics')
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function prepareMetric(input: {
  name: string;
  slug: string;
  unit?: string | null | undefined;
  higherIsBetter?: boolean | null | undefined;
}): {
  name: string;
  slug: string;
  unit: string | null;
  higher_is_better: boolean | null;
} {
  return {
    name: requiredText(input.name, 'Metric name'),
    slug: validSlug(input.slug, 'Metric'),
    unit: nullableText(input.unit),
    higher_is_better: input.higherIsBetter ?? null,
  };
}

export async function listAdministrativeMetrics(db: Database): Promise<
  Array<{
    metric: string;
    slug: string;
    unit: string | null;
    higherIsBetter: boolean | null;
  }>
> {
  return db
    .selectFrom('metrics')
    .select([
      'name as metric',
      'slug',
      'unit',
      'higher_is_better as higherIsBetter',
    ])
    .orderBy('name')
    .execute();
}

export function canonicalHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== ''
    )
      throw new Error();
    return url.toString();
  } catch {
    throw new Error('Invalid source URL.');
  }
}

export async function createSource(
  db: Database,
  input: {
    url: string;
    sourceType: SourceType;
    title?: string | null | undefined;
    publisher?: string | null | undefined;
    publishedDate?: string | null | undefined;
  },
): Promise<{
  created: boolean;
  source: Selectable<SourcesTable>;
}> {
  const prepared = await prepareSource(db, input);
  if (prepared.existing !== undefined) {
    return { created: false, source: prepared.existing };
  }
  return { created: true, source: await prepared.commit() };
}

export async function prepareSource(
  db: Database,
  input: {
    url: string;
    sourceType: SourceType;
    title?: string | null | undefined;
    publisher?: string | null | undefined;
    publishedDate?: string | null | undefined;
  },
): Promise<{
  values: {
    url: string;
    source_type: SourceType;
    title: string | null;
    publisher: string | null;
    published_date: string | null;
  };
  existing: Selectable<SourcesTable> | undefined;
  commit: () => Promise<Selectable<SourcesTable>>;
}> {
  const values = {
    url: canonicalHttpUrl(input.url),
    source_type: input.sourceType,
    title: nullableText(input.title),
    publisher: nullableText(input.publisher),
    published_date: validOptionalDate(input.publishedDate),
  };
  const existing = await db
    .selectFrom('sources')
    .selectAll()
    .where('url', '=', values.url)
    .executeTakeFirst();
  return {
    values,
    existing,
    commit: () =>
      db
        .insertInto('sources')
        .values({ ...values, accessed_at: new Date() })
        .returningAll()
        .executeTakeFirstOrThrow(),
  };
}

export async function listAdministrativeSources(
  db: Database,
  filters: {
    sourceType?: SourceType | undefined;
    publisher?: string | undefined;
  },
): Promise<
  Array<{
    title: string | null;
    type: SourceType;
    publisher: string | null;
    publishedDate: string | null;
    accessedAt: Date;
    url: string;
  }>
> {
  let query = db
    .selectFrom('sources')
    .select([
      'title',
      'source_type as type',
      'publisher',
      'published_date as publishedDate',
      'accessed_at as accessedAt',
      'url',
    ]);
  if (filters.sourceType !== undefined)
    query = query.where('source_type', '=', filters.sourceType);
  if (filters.publisher !== undefined)
    query = query.where('publisher', '=', filters.publisher);
  return query.orderBy('id', 'desc').execute();
}

export async function addBenchmarkRecordSource(
  db: Database,
  input: { recordIdentifier: string; sourceUrl: string; role: SourceRole },
): Promise<void> {
  if (input.role === 'PRIMARY')
    throw new Error(
      'The canonical primary source cannot be replaced through the additional-source path.',
    );
  const [record, source] = await Promise.all([
    db
      .selectFrom('benchmark_records')
      .select('id')
      .where('record_id', '=', input.recordIdentifier.trim().toUpperCase())
      .executeTakeFirst(),
    db
      .selectFrom('sources')
      .select('id')
      .where('url', '=', canonicalHttpUrl(input.sourceUrl))
      .executeTakeFirst(),
  ]);
  if (record === undefined)
    throw new RegistryEntityNotFoundError('Record', input.recordIdentifier);
  if (source === undefined)
    throw new RegistryEntityNotFoundError('Source', input.sourceUrl);
  await db.transaction().execute(async (transaction) => {
    await transaction
      .insertInto('benchmark_record_sources')
      .values({
        benchmark_record_id: record.id,
        source_id: source.id,
        source_role: input.role,
      })
      .execute();
    await transaction
      .insertInto('record_provenance_events')
      .values({
        benchmark_record_id: record.id,
        event_type: 'SOURCE_ADDED',
        source_id: source.id,
        ingestion_candidate_id: null,
        details: { sourceRole: input.role },
      })
      .execute();
    await markRegistryUpdated(transaction);
  });
}

export interface RecordWriteInput {
  modelIdentifier: string;
  benchmarkSlug: string;
  benchmarkVersionReference?: string | undefined;
  configurationReference?: string | undefined;
  snapshotReference?: string | undefined;
  evaluatorSlug?: string | undefined;
  metricSlug: string;
  scoreDisplay: string;
  scoreValue?: number | null | undefined;
  evaluationDate?: string | null | undefined;
  reportedDate?: string | null | undefined;
  sourceUrl: string;
  reportType?: ReportType | undefined;
  notes?: string | null | undefined;
}

export interface PreparedRecord {
  input: {
    scoreDisplay: string;
    scoreValue: number | null;
    evaluationDate: string | null;
    reportedDate: string | null;
    reportType: ReportType;
    notes: string | null;
  };
  model: { id: string; modelId: string; name: string; recordPrefix: string };
  benchmark: { id: string; slug: string; name: string };
  benchmarkVersion: {
    id: string;
    canonicalReference: string;
    versionLabel: string | null;
    variantName: string | null;
    displayName: string;
  };
  configuration: {
    id: string;
    reference: string;
    fingerprint: string;
    isUnspecified: boolean;
  };
  snapshot: {
    id: string;
    reference: string;
    providerModelIdentifier: string | null;
  } | null;
  evaluator: { id: string; slug: string; name: string; type: string };
  metric: { id: string; slug: string; name: string };
  source: { id: string; url: string; title: string | null; type: SourceType };
  possibleDuplicates: Array<{
    recordId: string;
    score: string;
    evaluationDate: string | null;
    reportedDate: string | null;
    benchmarkVersion: string;
    configuration: string;
    snapshot: string | null;
    evaluator: string;
    status: RegistryStatus;
  }>;
}

export async function prepareRecord(
  db: Kysely<DatabaseSchema>,
  input: RecordWriteInput,
): Promise<PreparedRecord> {
  const validatedInput = {
    scoreDisplay: requiredText(input.scoreDisplay, 'Score display'),
    scoreValue: validOptionalScore(input.scoreValue),
    evaluationDate: validOptionalDate(input.evaluationDate),
    reportedDate: validOptionalDate(input.reportedDate),
    reportType: input.reportType ?? ('UNKNOWN' as const),
    notes: nullableText(input.notes),
  };
  const modelIdentifier = input.modelIdentifier.trim().toUpperCase();
  const benchmarkSlug = input.benchmarkSlug.trim().toLowerCase();
  const metricSlug = input.metricSlug.trim().toLowerCase();
  const sourceUrl = canonicalHttpUrl(input.sourceUrl);
  const [model, benchmark, metric, source] = await Promise.all([
    db
      .selectFrom('models')
      .select([
        'id',
        'model_id as modelId',
        'official_name as name',
        'record_prefix as recordPrefix',
      ])
      .where('model_id', '=', modelIdentifier)
      .executeTakeFirst(),
    db
      .selectFrom('benchmarks')
      .select(['id', 'slug', 'name'])
      .where('slug', '=', benchmarkSlug)
      .executeTakeFirst(),
    db
      .selectFrom('metrics')
      .select(['id', 'slug', 'name'])
      .where('slug', '=', metricSlug)
      .executeTakeFirst(),
    db
      .selectFrom('sources')
      .select(['id', 'url', 'title', 'source_type as type'])
      .where('url', '=', sourceUrl)
      .executeTakeFirst(),
  ]);
  if (model === undefined)
    throw new RegistryEntityNotFoundError('Model', modelIdentifier);
  if (benchmark === undefined)
    throw new RegistryEntityNotFoundError('Benchmark', benchmarkSlug);
  if (metric === undefined)
    throw new RegistryEntityNotFoundError('Metric', metricSlug);
  if (source === undefined)
    throw new RegistryEntityNotFoundError('Source', sourceUrl);

  const benchmarkVersionReference =
    input.benchmarkVersionReference?.trim().toLowerCase() ??
    `${benchmark.slug}/default`;
  const configurationReference = input.configurationReference
    ?.trim()
    .toUpperCase();
  const snapshotReference = input.snapshotReference?.trim().toUpperCase();
  const evaluatorSlug = input.evaluatorSlug?.trim().toLowerCase() ?? 'unknown';
  const [benchmarkVersion, configuration, snapshot, evaluator] =
    await Promise.all([
      db
        .selectFrom('benchmark_versions')
        .select([
          'id',
          'benchmark_id as benchmarkId',
          'canonical_reference as canonicalReference',
          'version_label as versionLabel',
          'variant_name as variantName',
        ])
        .where('canonical_reference', '=', benchmarkVersionReference)
        .executeTakeFirst(),
      configurationReference === undefined
        ? db
            .selectFrom('evaluation_configurations')
            .select([
              'id',
              'configuration_reference as reference',
              'configuration_fingerprint as fingerprint',
              'is_unspecified as isUnspecified',
            ])
            .where('is_unspecified', '=', true)
            .executeTakeFirst()
        : db
            .selectFrom('evaluation_configurations')
            .select([
              'id',
              'configuration_reference as reference',
              'configuration_fingerprint as fingerprint',
              'is_unspecified as isUnspecified',
            ])
            .where('configuration_reference', '=', configurationReference)
            .executeTakeFirst(),
      snapshotReference === undefined
        ? Promise.resolve(undefined)
        : db
            .selectFrom('model_snapshots')
            .select([
              'id',
              'model_id as modelId',
              'snapshot_reference as reference',
              'provider_model_identifier as providerModelIdentifier',
            ])
            .where('snapshot_reference', '=', snapshotReference)
            .executeTakeFirst(),
      db
        .selectFrom('evaluators')
        .select(['id', 'slug', 'name', 'evaluator_type as type'])
        .where('slug', '=', evaluatorSlug)
        .executeTakeFirst(),
    ]);
  if (benchmarkVersion === undefined)
    throw new RegistryEntityNotFoundError(
      'Benchmark version',
      benchmarkVersionReference,
    );
  if (benchmarkVersion.benchmarkId !== benchmark.id)
    throw new Error(
      `Benchmark version ${benchmarkVersionReference} does not belong to benchmark ${benchmark.slug}.`,
    );
  if (configuration === undefined)
    throw new RegistryEntityNotFoundError(
      'Evaluation configuration',
      configurationReference ?? 'unspecified',
    );
  if (snapshotReference !== undefined && snapshot === undefined)
    throw new RegistryEntityNotFoundError('Model snapshot', snapshotReference);
  if (snapshot !== undefined && snapshot.modelId !== model.id)
    throw new Error(
      `Model snapshot ${snapshot.reference} does not belong to ${model.modelId}.`,
    );
  if (evaluator === undefined)
    throw new RegistryEntityNotFoundError('Evaluator', evaluatorSlug);

  const possibleDuplicates = await db
    .selectFrom('benchmark_records')
    .innerJoin(
      'benchmark_versions',
      'benchmark_versions.id',
      'benchmark_records.benchmark_version_id',
    )
    .innerJoin(
      'evaluation_configurations',
      'evaluation_configurations.id',
      'benchmark_records.evaluation_configuration_id',
    )
    .innerJoin('evaluators', 'evaluators.id', 'benchmark_records.evaluator_id')
    .leftJoin(
      'model_snapshots',
      'model_snapshots.id',
      'benchmark_records.model_snapshot_id',
    )
    .select([
      'benchmark_records.record_id as recordId',
      'benchmark_records.score_display as score',
      'benchmark_records.evaluation_date as evaluationDate',
      'benchmark_records.reported_date as reportedDate',
      'benchmark_versions.canonical_reference as benchmarkVersion',
      'evaluation_configurations.configuration_reference as configuration',
      'model_snapshots.snapshot_reference as snapshot',
      'evaluators.slug as evaluator',
      'benchmark_records.status as status',
    ])
    .where('benchmark_records.model_id', '=', model.id)
    .where('benchmark_records.benchmark_id', '=', benchmark.id)
    .where('benchmark_records.metric_id', '=', metric.id)
    .where('benchmark_records.source_id', '=', source.id)
    .orderBy('benchmark_records.record_id')
    .execute();

  return {
    input: {
      ...validatedInput,
    },
    model,
    benchmark,
    benchmarkVersion: {
      id: benchmarkVersion.id,
      canonicalReference: benchmarkVersion.canonicalReference,
      versionLabel: benchmarkVersion.versionLabel,
      variantName: benchmarkVersion.variantName,
      displayName: formatBenchmarkDisplay({
        familyName: benchmark.name,
        versionLabel: benchmarkVersion.versionLabel,
        variantName: benchmarkVersion.variantName,
      }),
    },
    configuration,
    snapshot:
      snapshot === undefined
        ? null
        : {
            id: snapshot.id,
            reference: snapshot.reference,
            providerModelIdentifier: snapshot.providerModelIdentifier,
          },
    evaluator,
    metric,
    source,
    possibleDuplicates,
  };
}

export async function commitPreparedRecordInTransaction(
  transaction: Transaction<DatabaseSchema>,
  prepared: PreparedRecord,
  provenance: {
    eventType?: 'CREATED_MANUALLY' | 'CREATED_FROM_INGESTION';
    ingestionCandidateId?: string | null;
  } = {},
): Promise<Selectable<BenchmarkRecordsTable>> {
  const allocation = await allocateBenchmarkRecordIdentifierInTransaction(
    transaction,
    prepared.model.id,
  );
  const record = await transaction
    .insertInto('benchmark_records')
    .values({
      record_id: allocation.recordId,
      model_id: prepared.model.id,
      benchmark_id: prepared.benchmark.id,
      benchmark_version_id: prepared.benchmarkVersion.id,
      evaluation_configuration_id: prepared.configuration.id,
      model_snapshot_id: prepared.snapshot?.id ?? null,
      evaluator_id: prepared.evaluator.id,
      metric_id: prepared.metric.id,
      source_id: prepared.source.id,
      score_display: prepared.input.scoreDisplay,
      score_value: prepared.input.scoreValue,
      evaluation_date: prepared.input.evaluationDate,
      reported_date: prepared.input.reportedDate,
      report_type: prepared.input.reportType,
      status: 'ACTIVE',
      sequence_number: allocation.sequenceNumber,
      notes: prepared.input.notes,
      superseded_by_record_id: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await transaction
    .insertInto('benchmark_record_sources')
    .values({
      benchmark_record_id: record.id,
      source_id: prepared.source.id,
      source_role: 'PRIMARY',
    })
    .execute();
  await transaction
    .insertInto('record_provenance_events')
    .values({
      benchmark_record_id: record.id,
      event_type: provenance.eventType ?? 'CREATED_MANUALLY',
      source_id: prepared.source.id,
      ingestion_candidate_id: provenance.ingestionCandidateId ?? null,
      details: {},
    })
    .execute();
  return record;
}

export async function commitPreparedRecord(
  db: Database,
  prepared: PreparedRecord,
): Promise<Selectable<BenchmarkRecordsTable>> {
  return db.transaction().execute(async (transaction) => {
    const record = await commitPreparedRecordInTransaction(
      transaction,
      prepared,
    );
    await markRegistryUpdated(transaction);
    return record;
  });
}

export async function commitPreparedBatch(
  db: Database,
  records: PreparedRecord[],
): Promise<Array<{ modelId: string; recordId: string }>> {
  return db.transaction().execute(async (transaction) => {
    const created: Array<{ modelId: string; recordId: string }> = [];
    for (const prepared of records) {
      const record = await commitPreparedRecordInTransaction(
        transaction,
        prepared,
      );
      created.push({
        modelId: prepared.model.modelId,
        recordId: record.record_id,
      });
    }
    if (created.length > 0) await markRegistryUpdated(transaction);
    return created;
  });
}

export interface RecordDetails {
  internalId: string;
  recordId: string;
  status: RegistryStatus;
  model: string;
  modelId: string;
  recordPrefix: string;
  benchmark: string;
  metric: string;
  scoreDisplay: string;
  scoreValue: string | null;
  evaluationDate: string | null;
  reportedDate: string | null;
  sourceTitle: string | null;
  sourceUrl: string;
  sourceType: SourceType;
  reportType: ReportType;
  notes: string | null;
  sequenceNumber: number;
  supersededByInternalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getRecordDetails(
  db: Database,
  recordIdentifier: string,
): Promise<RecordDetails> {
  const recordId = recordIdentifier.trim().toUpperCase();
  const row = await db
    .selectFrom('benchmark_records')
    .innerJoin('models', 'models.id', 'benchmark_records.model_id')
    .innerJoin('benchmarks', 'benchmarks.id', 'benchmark_records.benchmark_id')
    .innerJoin('metrics', 'metrics.id', 'benchmark_records.metric_id')
    .innerJoin('sources', 'sources.id', 'benchmark_records.source_id')
    .select([
      'benchmark_records.id as internalId',
      'benchmark_records.record_id as recordId',
      'benchmark_records.status',
      'models.official_name as model',
      'models.model_id as modelId',
      'models.record_prefix as recordPrefix',
      'benchmarks.name as benchmark',
      'metrics.name as metric',
      'benchmark_records.score_display as scoreDisplay',
      'benchmark_records.score_value as scoreValue',
      'benchmark_records.evaluation_date as evaluationDate',
      'benchmark_records.reported_date as reportedDate',
      'sources.title as sourceTitle',
      'sources.url as sourceUrl',
      'sources.source_type as sourceType',
      'benchmark_records.report_type as reportType',
      'benchmark_records.notes',
      'benchmark_records.sequence_number as sequenceNumber',
      'benchmark_records.superseded_by_record_id as supersededByInternalId',
      'benchmark_records.created_at as createdAt',
      'benchmark_records.updated_at as updatedAt',
    ])
    .where('benchmark_records.record_id', '=', recordId)
    .executeTakeFirst();
  if (row === undefined)
    throw new RegistryEntityNotFoundError('Record', recordId);
  return row;
}

export async function withdrawRecord(
  db: Database,
  recordIdentifier: string,
): Promise<{
  changed: boolean;
  record: RecordDetails | Selectable<BenchmarkRecordsTable>;
}> {
  const current = await getRecordDetails(db, recordIdentifier);
  if (current.status === 'WITHDRAWN')
    return { changed: false as const, record: current };
  const record = await db.transaction().execute(async (transaction) => {
    const updated = await transaction
      .updateTable('benchmark_records')
      .set({ status: 'WITHDRAWN', updated_at: new Date() })
      .where('id', '=', current.internalId)
      .returningAll()
      .executeTakeFirstOrThrow();
    await transaction
      .insertInto('record_provenance_events')
      .values({
        benchmark_record_id: current.internalId,
        event_type: 'WITHDRAWN',
        source_id: null,
        ingestion_candidate_id: null,
        details: {},
      })
      .execute();
    await markRegistryUpdated(transaction);
    return updated;
  });
  return { changed: true as const, record };
}

export async function supersedeRecord(
  db: Database,
  originalIdentifier: string,
  replacementIdentifier: string,
): Promise<{ original: RecordDetails; replacement: RecordDetails }> {
  const [original, replacement] = await Promise.all([
    getRecordDetails(db, originalIdentifier),
    getRecordDetails(db, replacementIdentifier),
  ]);
  if (original.internalId === replacement.internalId)
    throw new Error('A record cannot supersede itself.');
  if (original.supersededByInternalId !== null)
    throw new Error(`${original.recordId} is already superseded.`);
  await db.transaction().execute(async (transaction) => {
    await transaction
      .updateTable('benchmark_records')
      .set({
        status: 'SUPERSEDED',
        superseded_by_record_id: replacement.internalId,
        updated_at: new Date(),
      })
      .where('id', '=', original.internalId)
      .executeTakeFirstOrThrow();
    await transaction
      .insertInto('record_provenance_events')
      .values({
        benchmark_record_id: original.internalId,
        event_type: 'SUPERSEDED',
        source_id: null,
        ingestion_candidate_id: null,
        details: { replacementRecordId: replacement.recordId },
      })
      .execute();
    await markRegistryUpdated(transaction);
  });
  return { original, replacement };
}

export type ValidationSeverity = 'ERROR' | 'WARNING';
export interface ValidationIssue {
  severity: ValidationSeverity;
  entity: string;
  message: string;
}

export async function validateRegistry(
  db: Database,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const add = (
    severity: ValidationSeverity,
    entity: string,
    message: string,
  ): void => {
    issues.push({ severity, entity, message });
  };
  const organizations = await db
    .selectFrom('organizations')
    .selectAll()
    .execute();
  for (const organization of organizations) {
    const configured = PROVIDERS.find(
      (provider) => provider.slug === organization.slug,
    );
    if (
      configured !== undefined &&
      (configured.providerPrefix !== organization.provider_prefix ||
        configured.brNamespace !== organization.br_namespace ||
        configured.identifierStrategy !== organization.identifier_strategy)
    )
      add(
        'ERROR',
        organization.slug,
        'Canonical provider configuration mismatch.',
      );
  }
  for (const field of ['provider_prefix', 'br_namespace'] as const) {
    const duplicates = await db
      .selectFrom('organizations')
      .select(field)
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .groupBy(field)
      .having((eb) => eb.fn.countAll(), '>', 1)
      .execute();
    for (const duplicate of duplicates)
      add('ERROR', 'organizations', `Duplicate ${field}: ${duplicate[field]}`);
  }
  const models = await db
    .selectFrom('models')
    .innerJoin('organizations', 'organizations.id', 'models.organization_id')
    .selectAll('models')
    .select([
      'organizations.slug as organizationSlug',
      'organizations.provider_prefix as providerPrefix',
      'organizations.br_namespace as brNamespace',
    ])
    .execute();
  const modelIdsByOfficialName = new Map<string, string[]>();
  for (const model of models) {
    const key = model.official_name.trim().toLowerCase();
    const identifiers = modelIdsByOfficialName.get(key) ?? [];
    identifiers.push(model.model_id);
    modelIdsByOfficialName.set(key, identifiers);
  }
  for (const [officialName, identifiers] of modelIdsByOfficialName) {
    if (identifiers.length > 1) {
      add(
        'ERROR',
        `models:${officialName}`,
        `Official model name resolves to multiple Model Identifiers: ${identifiers.sort().join(', ')}.`,
      );
    }
  }
  for (const model of models) {
    try {
      const parsed = validateModelIdentifier(model.model_id);
      if (parsed.providerPrefix !== model.providerPrefix)
        add(
          'ERROR',
          model.model_id,
          'Model Identifier provider does not match organization.',
        );
      assertModelIdentifierMatchesRecordPrefix(
        model.model_id,
        model.record_prefix,
      );
      const prefix = validateRecordPrefix(model.record_prefix);
      if (prefix.brNamespace !== model.brNamespace)
        add(
          'ERROR',
          model.model_id,
          'Record prefix namespace does not match organization.',
        );
      try {
        const expectedModel = generateModelIdentifier({
          provider: model.organizationSlug,
          family: model.family,
          modelNumber: model.model_number,
          tierCode: model.tier_code,
        });
        const expectedPrefix = generateRecordPrefix({
          provider: model.organizationSlug,
          family: model.family,
          modelNumber: model.model_number,
          tierCode: model.tier_code,
        });
        if (expectedModel !== model.model_id)
          add(
            'WARNING',
            model.model_id,
            `Stored Model Identifier differs from current generation result ${expectedModel}.`,
          );
        if (expectedPrefix !== model.record_prefix)
          add(
            'WARNING',
            model.model_id,
            `Stored record prefix differs from current generation result ${expectedPrefix}.`,
          );
      } catch (error) {
        add(
          'WARNING',
          model.model_id,
          `Current generation inputs cannot reproduce the stored identifier: ${errorMessage(error)}`,
        );
      }
    } catch (error) {
      add('ERROR', model.model_id, errorMessage(error));
    }
    if (model.next_record_sequence <= 0)
      add('ERROR', model.model_id, 'Next record sequence is not positive.');
  }
  const sources = await db.selectFrom('sources').selectAll().execute();
  for (const source of sources) {
    try {
      canonicalHttpUrl(source.url);
    } catch {
      add('ERROR', source.url, 'Invalid HTTP/HTTPS source URL.');
    }
    if (!SOURCE_TYPES.includes(source.source_type))
      add(
        'ERROR',
        source.url,
        `Invalid source type: ${String(source.source_type)}`,
      );
    if (source.title === null)
      add('WARNING', source.url, 'Source title is unknown.');
  }
  const records = await db
    .selectFrom('benchmark_records')
    .leftJoin('models', 'models.id', 'benchmark_records.model_id')
    .leftJoin('benchmarks', 'benchmarks.id', 'benchmark_records.benchmark_id')
    .leftJoin('metrics', 'metrics.id', 'benchmark_records.metric_id')
    .leftJoin('sources', 'sources.id', 'benchmark_records.source_id')
    .select([
      'benchmark_records.record_id as recordId',
      'benchmark_records.sequence_number as sequenceNumber',
      'benchmark_records.status',
      'benchmark_records.report_type as reportType',
      'benchmark_records.evaluation_date as evaluationDate',
      'benchmark_records.score_value as scoreValue',
      'benchmark_records.superseded_by_record_id as supersededBy',
      'benchmark_records.id as internalId',
      'models.record_prefix as recordPrefix',
      'models.id as modelExists',
      'benchmarks.id as benchmarkExists',
      'metrics.id as metricExists',
      'sources.id as sourceExists',
    ])
    .execute();
  const duplicateRecordIdentifiers = await db
    .selectFrom('benchmark_records')
    .select('record_id')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .groupBy('record_id')
    .having((eb) => eb.fn.countAll(), '>', 1)
    .execute();
  for (const duplicate of duplicateRecordIdentifiers) {
    add(
      'ERROR',
      duplicate.record_id,
      'Benchmark Record Identifier is not unique.',
    );
  }
  const recordIds = new Set(records.map((record) => record.internalId));
  for (const record of records) {
    if (
      record.modelExists === null ||
      record.recordPrefix === null ||
      record.benchmarkExists === null ||
      record.metricExists === null ||
      record.sourceExists === null
    ) {
      add('ERROR', record.recordId, 'Broken required foreign relationship.');
      continue;
    }
    const identifierMatch = /^(BR-\d{3}[A-Z0-9]+)-(\d{3})$/.exec(
      record.recordId,
    );
    let identifierValid = identifierMatch !== null;
    if (identifierMatch !== null) {
      try {
        const allocatedPrefix = validateRecordPrefix(identifierMatch[1]!);
        const canonicalPrefix = validateRecordPrefix(record.recordPrefix);
        identifierValid =
          allocatedPrefix.providerSlug === canonicalPrefix.providerSlug &&
          Number(identifierMatch[2]) === record.sequenceNumber &&
          formatBenchmarkRecordIdentifier(
            identifierMatch[1]!,
            record.sequenceNumber,
          ) === record.recordId;
      } catch {
        identifierValid = false;
      }
    }
    if (!identifierValid)
      add(
        'ERROR',
        record.recordId,
        'Record identifier, sequence, or provider namespace is inconsistent.',
      );
    if (record.sequenceNumber <= 0 || record.sequenceNumber > 999)
      add(
        'ERROR',
        record.recordId,
        'Sequence number is outside the BEIS v1 range 1–999.',
      );
    if (!REGISTRY_STATUSES.includes(record.status))
      add('ERROR', record.recordId, `Invalid status: ${String(record.status)}`);
    if (!REPORT_TYPES.includes(record.reportType))
      add(
        'ERROR',
        record.recordId,
        `Invalid report type: ${String(record.reportType)}`,
      );
    if (
      record.status === 'SUPERSEDED' &&
      (record.supersededBy === null || !recordIds.has(record.supersededBy))
    )
      add(
        'ERROR',
        record.recordId,
        'Superseded record has no valid replacement.',
      );
    if (record.supersededBy === record.internalId)
      add('ERROR', record.recordId, 'Record supersedes itself.');
    if (record.evaluationDate === null)
      add('WARNING', record.recordId, 'Evaluation date is unknown.');
    if (record.reportType === 'UNKNOWN')
      add('WARNING', record.recordId, 'Report type is UNKNOWN.');
    if (record.scoreValue === null)
      add('WARNING', record.recordId, 'Numeric score is absent.');
  }

  const versions = await db
    .selectFrom('benchmark_versions')
    .leftJoin('benchmarks', 'benchmarks.id', 'benchmark_versions.benchmark_id')
    .selectAll('benchmark_versions')
    .select('benchmarks.id as benchmarkExists')
    .execute();
  for (const version of versions) {
    if (version.benchmarkExists === null)
      add(
        'ERROR',
        version.canonical_reference,
        'Benchmark family does not exist.',
      );
    if (!REGISTRY_STATUSES.includes(version.status))
      add(
        'ERROR',
        version.canonical_reference,
        'Invalid benchmark version status.',
      );
  }
  const configurations = await db
    .selectFrom('evaluation_configurations')
    .selectAll()
    .execute();
  for (const configuration of configurations) {
    const fingerprint = configurationFingerprint({
      additional_configuration: configuration.additional_configuration,
      agent_scaffold: configuration.agent_scaffold,
      evaluation_harness: configuration.evaluation_harness,
      max_output_tokens: configuration.max_output_tokens,
      pass_count: configuration.pass_count,
      reasoning_effort: configuration.reasoning_effort,
      reasoning_mode: configuration.reasoning_mode,
      shots: configuration.shots,
      system_prompt_description: configuration.system_prompt_description,
      temperature:
        configuration.temperature === null
          ? null
          : Number(configuration.temperature),
      top_p: configuration.top_p === null ? null : Number(configuration.top_p),
    });
    if (fingerprint !== configuration.configuration_fingerprint)
      add(
        'ERROR',
        configuration.configuration_reference,
        'Configuration fingerprint does not match canonical content.',
      );
    if (configuration.shots !== null && configuration.shots < 0)
      add(
        'ERROR',
        configuration.configuration_reference,
        'Shots must be non-negative.',
      );
    if (configuration.pass_count !== null && configuration.pass_count <= 0)
      add(
        'ERROR',
        configuration.configuration_reference,
        'Pass count must be positive.',
      );
  }
  const snapshots = await db
    .selectFrom('model_snapshots')
    .leftJoin('models', 'models.id', 'model_snapshots.model_id')
    .selectAll('model_snapshots')
    .select('models.id as modelExists')
    .execute();
  for (const snapshot of snapshots) {
    if (snapshot.modelExists === null)
      add(
        'ERROR',
        snapshot.snapshot_reference,
        'Canonical model does not exist.',
      );
    if (
      snapshot.provider_model_identifier !== null &&
      snapshot.provider_model_identifier.trim() === ''
    )
      add(
        'ERROR',
        snapshot.snapshot_reference,
        'Provider model identifier is blank.',
      );
    if (!REGISTRY_STATUSES.includes(snapshot.status))
      add(
        'ERROR',
        snapshot.snapshot_reference,
        'Invalid model snapshot status.',
      );
  }
  for (const evaluator of await db
    .selectFrom('evaluators')
    .selectAll()
    .execute())
    if (!EVALUATOR_TYPES.includes(evaluator.evaluator_type))
      add('ERROR', evaluator.slug, 'Invalid evaluator type.');

  const [contextualRecords, primarySourceRows, creationEventRows] =
    await Promise.all([
      db
        .selectFrom('benchmark_records')
        .innerJoin(
          'benchmark_versions',
          'benchmark_versions.id',
          'benchmark_records.benchmark_version_id',
        )
        .leftJoin(
          'model_snapshots',
          'model_snapshots.id',
          'benchmark_records.model_snapshot_id',
        )
        .select([
          'benchmark_records.id',
          'benchmark_records.record_id as recordId',
          'benchmark_records.model_id as modelId',
          'benchmark_records.benchmark_id as benchmarkId',
          'benchmark_records.source_id as sourceId',
          'benchmark_versions.benchmark_id as versionBenchmarkId',
          'model_snapshots.model_id as snapshotModelId',
        ])
        .execute(),
      db
        .selectFrom('benchmark_record_sources')
        .select(['benchmark_record_id as recordId', 'source_id as sourceId'])
        .where('source_role', '=', 'PRIMARY')
        .execute(),
      db
        .selectFrom('record_provenance_events')
        .select('benchmark_record_id as recordId')
        .where('event_type', 'in', [
          'CREATED_MANUALLY',
          'CREATED_FROM_INGESTION',
        ])
        .execute(),
    ]);
  const primarySourcesByRecord = new Map<string, string[]>();
  for (const source of primarySourceRows) {
    const sources = primarySourcesByRecord.get(source.recordId) ?? [];
    sources.push(source.sourceId);
    primarySourcesByRecord.set(source.recordId, sources);
  }
  const creationEventCountByRecord = new Map<string, number>();
  for (const event of creationEventRows) {
    creationEventCountByRecord.set(
      event.recordId,
      (creationEventCountByRecord.get(event.recordId) ?? 0) + 1,
    );
  }
  for (const record of contextualRecords) {
    if (record.benchmarkId !== record.versionBenchmarkId)
      add(
        'ERROR',
        record.recordId,
        'Benchmark family does not match benchmark version.',
      );
    if (
      record.snapshotModelId !== null &&
      record.snapshotModelId !== record.modelId
    )
      add(
        'ERROR',
        record.recordId,
        'Model snapshot belongs to a different canonical model.',
      );
    const primarySources = primarySourcesByRecord.get(record.id) ?? [];
    if (primarySources.length !== 1 || primarySources[0] !== record.sourceId)
      add(
        'ERROR',
        record.recordId,
        'Record must have exactly one primary source relationship matching source_id.',
      );
    if ((creationEventCountByRecord.get(record.id) ?? 0) < 1)
      add('ERROR', record.recordId, 'Record has no provenance creation event.');
  }
  for (const event of await db
    .selectFrom('record_provenance_events')
    .select(['id', 'event_type'])
    .execute())
    if (!PROVENANCE_EVENT_TYPES.includes(event.event_type))
      add('ERROR', `provenance:${event.id}`, 'Invalid provenance event type.');
  return issues;
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${label} is required.`);
  return normalized;
}

function nullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function validSlug(value: string, label: string): string {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error(`Invalid ${label.toLowerCase()} slug.`);
  return slug;
}

function validOptionalDate(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Invalid date; expected YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('Invalid date; expected YYYY-MM-DD.');
  return value;
}

function validOptionalScore(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) throw new Error('Invalid score value.');
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
