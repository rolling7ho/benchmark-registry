import { readdir, readFile } from 'node:fs/promises';

import { sql } from 'kysely';
import { z } from 'zod';

import { loadEnvironment } from '../config/env.js';
import {
  REGISTRY_STATUSES,
  REPORT_TYPES,
  SOURCE_TYPES,
  EVALUATOR_TYPES,
} from '../db/constants.js';
import { createDatabase, type Database } from '../db/database.js';
import { createModel } from '../db/models.js';
import {
  addAlias,
  addBenchmarkAlias,
  commitPreparedBatch,
  commitPreparedRecord,
  createBenchmark,
  createMetric,
  createOrganization,
  getRecordDetails,
  listAdministrativeBenchmarks,
  listAdministrativeMetrics,
  listAdministrativeModels,
  listAdministrativeOrganizations,
  listAdministrativeSources,
  prepareModel,
  prepareBenchmark,
  prepareMetric,
  prepareOrganization,
  prepareRecord,
  prepareSource,
  supersedeRecord,
  validateRegistry,
  withdrawRecord,
  type PreparedRecord,
  type RecordWriteInput,
} from '../registry/admin.js';
import {
  getCandidate,
  getIngestionJob,
  ingestFile,
  ingestUrl,
  listCandidates,
  listIngestionJobs,
  prepareCandidateApproval,
  publishCandidate,
  rejectCandidate,
  validateIngestion,
  type ApprovalOverrides,
} from '../ingestion/service.js';
import type {
  IngestionCandidateStatus,
  IngestionJobStatus,
} from '../db/types.js';
import { PROVIDERS } from '../identifiers/providers.js';
import {
  assertAllowedFlags,
  booleanValue,
  optionalFlag,
  parseArguments,
  requiredFlag,
} from './arguments.js';
import { confirm } from './confirm.js';
import {
  heading,
  keyValues,
  table,
  terminalOutput,
  type Output,
} from './output.js';
import {
  createBenchmarkVersion,
  createEvaluator,
  createModelSnapshot,
} from '../registry/context.js';
import {
  configurationFingerprint,
  createOrReuseEvaluationConfiguration,
  normalizeEvaluationConfiguration,
  type EvaluationConfigurationInput,
} from '../registry/evaluation-configurations.js';

const batchSchema = z
  .object({
    records: z
      .array(
        z
          .object({
            modelId: z.string().trim().min(1),
            benchmarkSlug: z.string().trim().min(1),
            benchmarkVersionReference: z.string().trim().min(1).optional(),
            configurationReference: z.string().trim().min(1).optional(),
            snapshotReference: z.string().trim().min(1).nullable().optional(),
            evaluatorSlug: z.string().trim().min(1).optional(),
            metricSlug: z.string().trim().min(1),
            scoreDisplay: z.string().trim().min(1),
            scoreValue: z.number().finite().positive().nullable().optional(),
            evaluationDate: z.iso.date().nullable().optional(),
            reportedDate: z.iso.date().nullable().optional(),
            sourceUrl: z.string().trim().min(1),
            reportType: z.enum(REPORT_TYPES).optional(),
            notes: z.string().nullable().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const INGESTION_JOB_STATUSES = [
  'PENDING',
  'RETRIEVING',
  'EXTRACTING',
  'REVIEW_REQUIRED',
  'COMPLETED',
  'FAILED',
] as const satisfies readonly IngestionJobStatus[];
const INGESTION_CANDIDATE_STATUSES = [
  'PENDING_REVIEW',
  'VALIDATION_FAILED',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
] as const satisfies readonly IngestionCandidateStatus[];

function enumValue<T extends string>(
  value: string | undefined,
  values: readonly T[],
  label: string,
): T | undefined {
  if (value === undefined) return undefined;
  const normalized = value.toUpperCase() as T;
  if (!values.includes(normalized))
    throw new Error(`Invalid ${label}: ${value}`);
  return normalized;
}

async function requireConfirmation(
  flags: ReadonlyMap<string, string | true>,
  question: string,
): Promise<boolean> {
  return confirm(question, { yes: flags.has('yes') });
}

function recordPreview(output: Output, prepared: PreparedRecord): void {
  heading(output, 'Benchmark record preview');
  keyValues(output, [
    ['Model', prepared.model.name],
    ['Model ID', prepared.model.modelId],
    ['Model snapshot', prepared.snapshot?.reference],
    ['Provider model identifier', prepared.snapshot?.providerModelIdentifier],
    ['Record prefix', prepared.model.recordPrefix],
    ['Benchmark', prepared.benchmarkVersion.displayName],
    [
      'Benchmark version reference',
      prepared.benchmarkVersion.canonicalReference,
    ],
    ['Metric', prepared.metric.name],
    ['Score', prepared.input.scoreDisplay],
    ['Numeric score', prepared.input.scoreValue],
    ['Evaluation date', prepared.input.evaluationDate],
    ['Reported date', prepared.input.reportedDate],
    [
      'Configuration',
      prepared.configuration.isUnspecified
        ? 'Unspecified'
        : prepared.configuration.reference,
    ],
    ['Evaluator', prepared.evaluator.name],
    ['Source', prepared.source.title ?? 'Untitled source'],
    ['Source URL', prepared.source.url],
    ['Report type', prepared.input.reportType],
    ['Notes', prepared.input.notes ?? '—'],
    ['Record ID', 'assigned on commit'],
  ]);
}

function duplicatePreview(output: Output, prepared: PreparedRecord): void {
  if (prepared.possibleDuplicates.length === 0) return;
  heading(output, 'Possible duplicate records');
  table(
    output,
    prepared.possibleDuplicates.map((row) => ({
      'Record ID': row.recordId,
      Score: row.score,
      'Evaluation Date': row.evaluationDate,
      'Reported Date': row.reportedDate,
      'Benchmark Version': row.benchmarkVersion,
      Configuration: row.configuration,
      Snapshot: row.snapshot,
      Evaluator: row.evaluator,
      Status: row.status,
    })),
  );
}

function positiveLimit(value: string | undefined): number {
  if (value === undefined) return 100;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1000)
    throw new Error('--limit must be an integer from 1 to 1000.');
  return limit;
}

function nullableNumber(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value.toLowerCase() === 'null') return null;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error('Invalid score value.');
  return result;
}

function candidateDetails(
  output: Output,
  candidate: Awaited<ReturnType<typeof getCandidate>>,
  debug: boolean,
): void {
  heading(output, `Ingestion candidate ${candidate.candidate_reference}`);
  keyValues(output, [
    ['Ingestion job', candidate.jobReference],
    ['Candidate status', candidate.candidate_status],
    ['Source', candidate.sourceTitle ?? 'Untitled source'],
    ['Source URL', candidate.sourceUrl],
    ['Model text', candidate.model_text],
    ['Benchmark text', candidate.benchmark_text],
    ['Metric text', candidate.metric_text],
    ['Score display', candidate.score_display],
    ['Score value', candidate.score_value],
    ['Evaluation date', candidate.evaluation_date],
    ['Reported date', candidate.reported_date],
    ['Benchmark version text', candidate.benchmark_version_text],
    [
      'Proposed benchmark version',
      candidate.proposed_benchmark_version_reference,
    ],
    ['Configuration proposal', candidate.configuration_proposal],
    ['Proposed configuration', candidate.proposed_configuration_reference],
    ['Provider model identifier', candidate.provider_model_identifier],
    ['Proposed snapshot', candidate.proposed_snapshot_reference],
    ['Evaluator text', candidate.evaluator_text],
    ['Proposed evaluator', candidate.proposed_evaluator_slug],
    ['Report type', candidate.report_type],
    ['Proposed Model Identifier', candidate.proposed_model_id],
    ['Proposed benchmark slug', candidate.proposed_benchmark_slug],
    ['Proposed metric slug', candidate.proposed_metric_slug],
    ['Extraction confidence', candidate.confidence],
    ['Evidence text', candidate.evidence_text],
    ['Evidence location', candidate.evidence_location],
    [
      'Validation errors',
      candidate.validation_errors.length === 0
        ? 'None'
        : candidate.validation_errors.join('; '),
    ],
    [
      'Validation warnings',
      candidate.validation_warnings.length === 0
        ? 'None'
        : candidate.validation_warnings.join('; '),
    ],
    ['Rejection reason', candidate.rejection_reason],
    ['Created record internal ID', candidate.created_record_id],
  ]);
  if (debug) output.write(JSON.stringify(candidate));
}

async function runCommand(
  db: Database,
  argv: readonly string[],
  output: Output,
): Promise<number> {
  const { command, flags } = parseArguments(argv);
  const key = command.join(' ');
  const yes = flags.has('yes');

  if (key === 'help' || flags.has('help')) {
    output.write('Usage: pnpm registry <command> [flags]');
    output.write('Commands:');
    for (const commandName of [
      'organization add|list',
      'model add|list',
      'alias add',
      'benchmark add|list|alias add',
      'benchmark version add|list',
      'configuration add|show|list',
      'snapshot add|show|list',
      'evaluator add|list',
      'metric add|list',
      'source add|list',
      'record add|show|withdraw|supersede',
      'import',
      'ingest source|file|list|show|candidates|candidate|approve|reject|validate',
      'validate',
      'production-check',
    ])
      output.write(`  ${commandName}`);
    output.write(`Source types: ${SOURCE_TYPES.join(', ')}`);
    output.write(`Report types: ${REPORT_TYPES.join(', ')}`);
    return 0;
  }

  switch (key) {
    case 'organization add': {
      assertAllowedFlags(flags, [
        'provider',
        'slug',
        'name',
        'provider-prefix',
        'br-namespace',
        'identifier-strategy',
      ]);
      const input = {
        provider: optionalFlag(flags, 'provider'),
        slug: optionalFlag(flags, 'slug'),
        name: optionalFlag(flags, 'name'),
        providerPrefix: optionalFlag(flags, 'provider-prefix'),
        brNamespace: optionalFlag(flags, 'br-namespace'),
        identifierStrategy: optionalFlag(flags, 'identifier-strategy'),
      };
      const prepared = prepareOrganization(input);
      keyValues(output, [
        ['Organization', prepared.name],
        ['Provider prefix', prepared.providerPrefix],
        ['BR namespace', prepared.brNamespace],
        ['Identifier strategy', prepared.identifierStrategy],
      ]);
      if (!(await requireConfirmation(flags, 'Create this organization?')))
        return 0;
      await createOrganization(db, input);
      output.write(`Created organization ${prepared.slug}.`);
      return 0;
    }
    case 'organization list':
      assertAllowedFlags(flags, []);
      table(
        output,
        (await listAdministrativeOrganizations(db)).map((row) => ({
          Name: row.name,
          Slug: row.slug,
          'Provider Prefix': row.providerPrefix,
          'BR Namespace': row.brNamespace,
          'Identifier Strategy': row.identifierStrategy,
        })),
      );
      return 0;
    case 'model add': {
      assertAllowedFlags(flags, [
        'organization',
        'name',
        'family',
        'model-number',
        'tier',
        'status',
      ]);
      const input = {
        organizationSlug: requiredFlag(flags, 'organization'),
        officialName: requiredFlag(flags, 'name'),
        family: optionalFlag(flags, 'family'),
        modelNumber: optionalFlag(flags, 'model-number'),
        tierCode: optionalFlag(flags, 'tier'),
        status: enumValue(
          optionalFlag(flags, 'status'),
          REGISTRY_STATUSES,
          'status',
        ),
      };
      const preview = await prepareModel(db, input);
      keyValues(output, [
        ['Organization', preview.organization.name],
        ['Official name', preview.officialName],
        ['Family', preview.family],
        ['Model number', preview.modelNumber],
        ['Tier', preview.tierCode ?? '—'],
        ['Generated Model ID', preview.modelId],
        ['Generated record prefix', preview.recordPrefix],
      ]);
      if (!(await requireConfirmation(flags, 'Create this model?'))) return 0;
      const model = await createModel(db, input);
      output.write(`Created model ${model.model_id}.`);
      return 0;
    }
    case 'model list': {
      assertAllowedFlags(flags, ['organization', 'status']);
      const status = enumValue(
        optionalFlag(flags, 'status'),
        REGISTRY_STATUSES,
        'status',
      );
      const rows = await listAdministrativeModels(db, {
        organization: optionalFlag(flags, 'organization'),
        status,
      });
      table(
        output,
        rows.map((row) => ({
          Model: row.model,
          'Model ID': row.modelId,
          Organization: row.organization,
          Family: row.family,
          'Model Number': row.modelNumber,
          Tier: row.tier ?? '—',
          Status: row.status,
          'Record Prefix': row.recordPrefix,
        })),
      );
      return 0;
    }
    case 'alias add': {
      assertAllowedFlags(flags, ['model', 'alias']);
      const prepared = await addAlias(db, {
        modelIdentifier: requiredFlag(flags, 'model'),
        alias: requiredFlag(flags, 'alias'),
      });
      keyValues(output, [
        ['Model', prepared.model.official_name],
        ['Model ID', prepared.model.model_id],
        ['Alias', prepared.alias],
        ['Normalized', prepared.normalized],
        ['Compact', prepared.compact],
      ]);
      if (!(await requireConfirmation(flags, 'Create this alias?'))) return 0;
      await prepared.commit();
      output.write(`Created alias for ${prepared.model.model_id}.`);
      return 0;
    }
    case 'benchmark add': {
      assertAllowedFlags(flags, [
        'name',
        'slug',
        'organization-name',
        'version',
        'status',
      ]);
      const input = {
        name: requiredFlag(flags, 'name'),
        slug: requiredFlag(flags, 'slug'),
        organizationName: optionalFlag(flags, 'organization-name'),
        version: optionalFlag(flags, 'version'),
        status: enumValue(
          optionalFlag(flags, 'status'),
          REGISTRY_STATUSES,
          'status',
        ),
      };
      const preview = prepareBenchmark(input);
      keyValues(output, [
        ['Benchmark', preview.name],
        ['Slug', preview.slug],
        ['Version', preview.version],
        ['Organization', preview.organization_name],
        ['Status', preview.status],
      ]);
      if (!(await requireConfirmation(flags, 'Create this benchmark?')))
        return 0;
      const benchmark = await createBenchmark(db, input);
      output.write(`Created benchmark ${benchmark.slug}.`);
      return 0;
    }
    case 'benchmark list':
      assertAllowedFlags(flags, []);
      table(
        output,
        (await listAdministrativeBenchmarks(db)).map((row) => ({
          Benchmark: row.benchmark,
          Slug: row.slug,
          Version: row.version,
          Organization: row.organization,
          Status: row.status,
          'Record Count': row.recordCount,
        })),
      );
      return 0;
    case 'benchmark alias add': {
      assertAllowedFlags(flags, ['benchmark', 'alias']);
      const prepared = await addBenchmarkAlias(db, {
        benchmarkSlug: requiredFlag(flags, 'benchmark'),
        alias: requiredFlag(flags, 'alias'),
      });
      keyValues(output, [
        ['Benchmark', prepared.benchmark.name],
        ['Slug', prepared.benchmark.slug],
        ['Alias', prepared.alias],
        ['Normalized', prepared.normalized],
        ['Compact', prepared.compact],
      ]);
      if (!(await requireConfirmation(flags, 'Create this benchmark alias?')))
        return 0;
      await prepared.commit();
      output.write(`Created alias for benchmark ${prepared.benchmark.slug}.`);
      return 0;
    }
    case 'benchmark version add': {
      assertAllowedFlags(flags, [
        'benchmark',
        'benchmark-version',
        'configuration',
        'snapshot',
        'evaluator',
        'reference',
        'version-label',
        'variant',
        'release-date',
        'notes',
        'status',
      ]);
      const input = {
        benchmarkSlug: requiredFlag(flags, 'benchmark'),
        canonicalReference: requiredFlag(flags, 'reference'),
        versionLabel: optionalFlag(flags, 'version-label'),
        variantName: optionalFlag(flags, 'variant'),
        releaseDate: optionalFlag(flags, 'release-date'),
        notes: optionalFlag(flags, 'notes'),
        status: enumValue(
          optionalFlag(flags, 'status'),
          REGISTRY_STATUSES,
          'status',
        ),
      };
      keyValues(output, [
        ['Benchmark', input.benchmarkSlug],
        ['Canonical reference', input.canonicalReference],
        ['Version label', input.versionLabel],
        ['Variant', input.variantName],
        ['Release date', input.releaseDate],
        ['Status', input.status ?? 'ACTIVE'],
      ]);
      if (!(await requireConfirmation(flags, 'Create this benchmark version?')))
        return 0;
      const version = await createBenchmarkVersion(db, input);
      output.write(`Created benchmark version ${version.canonical_reference}.`);
      return 0;
    }
    case 'benchmark version list': {
      assertAllowedFlags(flags, ['benchmark']);
      let query = db
        .selectFrom('benchmark_versions')
        .innerJoin(
          'benchmarks',
          'benchmarks.id',
          'benchmark_versions.benchmark_id',
        )
        .select([
          'benchmarks.name as benchmark',
          'benchmark_versions.canonical_reference as reference',
          'benchmark_versions.version_label as versionLabel',
          'benchmark_versions.variant_name as variant',
          'benchmark_versions.status',
        ]);
      const benchmark = optionalFlag(flags, 'benchmark');
      if (benchmark !== undefined)
        query = query.where('benchmarks.slug', '=', benchmark.toLowerCase());
      table(
        output,
        (
          await query
            .orderBy('benchmark_versions.canonical_reference')
            .execute()
        ).map((row) => ({
          Benchmark: row.benchmark,
          Reference: row.reference,
          'Version Label': row.versionLabel,
          Variant: row.variant,
          Status: row.status,
        })),
      );
      return 0;
    }
    case 'configuration add': {
      assertAllowedFlags(flags, [
        'shots',
        'reasoning-mode',
        'reasoning-effort',
        'pass-count',
        'agent-scaffold',
        'evaluation-harness',
        'temperature',
        'top-p',
        'max-output-tokens',
        'system-prompt-description',
        'additional-config',
      ]);
      let additionalConfiguration: Record<string, unknown> = {};
      const file = optionalFlag(flags, 'additional-config');
      if (file !== undefined) {
        const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
        if (
          parsed === null ||
          typeof parsed !== 'object' ||
          Array.isArray(parsed)
        )
          throw new Error(
            'Additional configuration JSON must contain an object.',
          );
        additionalConfiguration = parsed as Record<string, unknown>;
      }
      const integer = (name: string): number | undefined => {
        const raw = optionalFlag(flags, name);
        if (raw === undefined) return undefined;
        const value = Number(raw);
        if (!Number.isInteger(value))
          throw new Error(`--${name} must be an integer.`);
        return value;
      };
      const numeric = (name: string): number | undefined => {
        const raw = optionalFlag(flags, name);
        if (raw === undefined) return undefined;
        const value = Number(raw);
        if (!Number.isFinite(value))
          throw new Error(`--${name} must be numeric.`);
        return value;
      };
      const input: EvaluationConfigurationInput = {
        shots: integer('shots'),
        reasoningMode: optionalFlag(flags, 'reasoning-mode'),
        reasoningEffort: optionalFlag(flags, 'reasoning-effort'),
        passCount: integer('pass-count'),
        agentScaffold: optionalFlag(flags, 'agent-scaffold'),
        evaluationHarness: optionalFlag(flags, 'evaluation-harness'),
        temperature: numeric('temperature'),
        topP: numeric('top-p'),
        maxOutputTokens: integer('max-output-tokens'),
        systemPromptDescription: optionalFlag(
          flags,
          'system-prompt-description',
        ),
        additionalConfiguration,
      };
      const normalized = normalizeEvaluationConfiguration(input);
      heading(output, 'Evaluation configuration preview');
      keyValues(output, [
        ...Object.entries(normalized),
        ['Configuration fingerprint', configurationFingerprint(normalized)],
      ]);
      const existing = await db
        .selectFrom('evaluation_configurations')
        .select('configuration_reference')
        .where(
          'configuration_fingerprint',
          '=',
          configurationFingerprint(normalized),
        )
        .executeTakeFirst();
      if (existing !== undefined) {
        output.write(
          `Equivalent evaluation configuration already exists as ${existing.configuration_reference}.`,
        );
        return 0;
      }
      if (
        !(await requireConfirmation(
          flags,
          'Create this evaluation configuration?',
        ))
      )
        return 0;
      const result = await createOrReuseEvaluationConfiguration(db, input);
      output.write(
        `Created evaluation configuration ${result.configuration.configuration_reference}.`,
      );
      return 0;
    }
    case 'configuration show': {
      assertAllowedFlags(flags, ['configuration']);
      const reference = requiredFlag(flags, 'configuration').toUpperCase();
      const row = await db
        .selectFrom('evaluation_configurations')
        .selectAll()
        .where('configuration_reference', '=', reference)
        .executeTakeFirst();
      if (row === undefined)
        throw new Error(
          `Evaluation configuration ${reference} does not exist.`,
        );
      keyValues(output, Object.entries(row));
      return 0;
    }
    case 'configuration list': {
      assertAllowedFlags(flags, []);
      table(
        output,
        (
          await db
            .selectFrom('evaluation_configurations')
            .select([
              'configuration_reference as reference',
              'configuration_fingerprint as fingerprint',
              'is_unspecified as unspecified',
              'shots',
              'pass_count as passCount',
              'evaluation_harness as harness',
            ])
            .orderBy('id')
            .execute()
        ).map((row) => ({
          Reference: row.reference,
          Fingerprint: row.fingerprint,
          Unspecified: row.unspecified,
          Shots: row.shots,
          'Pass Count': row.passCount,
          Harness: row.harness,
        })),
      );
      return 0;
    }
    case 'snapshot add': {
      assertAllowedFlags(flags, [
        'model',
        'provider-model-id',
        'label',
        'snapshot-date',
        'notes',
        'status',
      ]);
      const input = {
        modelIdentifier: requiredFlag(flags, 'model'),
        providerModelIdentifier: optionalFlag(flags, 'provider-model-id'),
        snapshotLabel: optionalFlag(flags, 'label'),
        snapshotDate: optionalFlag(flags, 'snapshot-date'),
        notes: optionalFlag(flags, 'notes'),
        status: enumValue(
          optionalFlag(flags, 'status'),
          REGISTRY_STATUSES,
          'status',
        ),
      };
      keyValues(output, [
        ['Model ID', input.modelIdentifier],
        ['Provider model identifier', input.providerModelIdentifier],
        ['Snapshot label', input.snapshotLabel],
        ['Snapshot date', input.snapshotDate],
      ]);
      if (!(await requireConfirmation(flags, 'Create this model snapshot?')))
        return 0;
      const snapshot = await createModelSnapshot(db, input);
      output.write(`Created model snapshot ${snapshot.snapshot_reference}.`);
      return 0;
    }
    case 'snapshot show': {
      assertAllowedFlags(flags, ['snapshot']);
      const reference = requiredFlag(flags, 'snapshot').toUpperCase();
      const row = await db
        .selectFrom('model_snapshots')
        .innerJoin('models', 'models.id', 'model_snapshots.model_id')
        .selectAll('model_snapshots')
        .select('models.model_id as modelIdentifier')
        .where('snapshot_reference', '=', reference)
        .executeTakeFirst();
      if (row === undefined)
        throw new Error(`Model snapshot ${reference} does not exist.`);
      keyValues(output, Object.entries(row));
      return 0;
    }
    case 'snapshot list': {
      assertAllowedFlags(flags, ['model']);
      let query = db
        .selectFrom('model_snapshots')
        .innerJoin('models', 'models.id', 'model_snapshots.model_id')
        .select([
          'snapshot_reference as reference',
          'models.model_id as modelId',
          'provider_model_identifier as providerModelId',
          'snapshot_label as label',
          'snapshot_date as date',
          'model_snapshots.status',
        ]);
      const model = optionalFlag(flags, 'model');
      if (model !== undefined)
        query = query.where('models.model_id', '=', model.toUpperCase());
      table(
        output,
        (await query.orderBy('model_snapshots.id').execute()).map((row) => ({
          Reference: row.reference,
          'Model ID': row.modelId,
          'Provider Model ID': row.providerModelId,
          Label: row.label,
          Date: row.date,
          Status: row.status,
        })),
      );
      return 0;
    }
    case 'evaluator add': {
      assertAllowedFlags(flags, ['name', 'slug', 'type']);
      const evaluatorType = enumValue(
        requiredFlag(flags, 'type'),
        EVALUATOR_TYPES,
        'evaluator type',
      )!;
      const input = {
        name: requiredFlag(flags, 'name'),
        slug: requiredFlag(flags, 'slug'),
        evaluatorType,
      };
      keyValues(output, [
        ['Evaluator', input.name],
        ['Slug', input.slug],
        ['Type', input.evaluatorType],
      ]);
      if (!(await requireConfirmation(flags, 'Create this evaluator?')))
        return 0;
      const evaluator = await createEvaluator(db, input);
      output.write(`Created evaluator ${evaluator.slug}.`);
      return 0;
    }
    case 'evaluator list': {
      assertAllowedFlags(flags, []);
      table(
        output,
        (
          await db
            .selectFrom('evaluators')
            .select(['name', 'slug', 'evaluator_type as type'])
            .orderBy('name')
            .execute()
        ).map((row) => ({ Name: row.name, Slug: row.slug, Type: row.type })),
      );
      return 0;
    }
    case 'metric add': {
      assertAllowedFlags(flags, ['name', 'slug', 'unit', 'higher-is-better']);
      const input = {
        name: requiredFlag(flags, 'name'),
        slug: requiredFlag(flags, 'slug'),
        unit: optionalFlag(flags, 'unit'),
        higherIsBetter: booleanValue(
          optionalFlag(flags, 'higher-is-better'),
          '--higher-is-better',
        ),
      };
      const preview = prepareMetric(input);
      keyValues(output, [
        ['Metric', preview.name],
        ['Slug', preview.slug],
        ['Unit', preview.unit],
        ['Higher is better', preview.higher_is_better],
      ]);
      if (!(await requireConfirmation(flags, 'Create this metric?'))) return 0;
      const metric = await createMetric(db, input);
      output.write(`Created metric ${metric.slug}.`);
      return 0;
    }
    case 'metric list':
      assertAllowedFlags(flags, []);
      table(
        output,
        (await listAdministrativeMetrics(db)).map((row) => ({
          Metric: row.metric,
          Slug: row.slug,
          Unit: row.unit,
          'Higher Is Better': row.higherIsBetter,
        })),
      );
      return 0;
    case 'source add': {
      assertAllowedFlags(flags, [
        'url',
        'type',
        'title',
        'publisher',
        'published-date',
      ]);
      const sourceType = enumValue(
        requiredFlag(flags, 'type'),
        SOURCE_TYPES,
        'source type',
      )!;
      const input = {
        url: requiredFlag(flags, 'url'),
        sourceType,
        title: optionalFlag(flags, 'title'),
        publisher: optionalFlag(flags, 'publisher'),
        publishedDate: optionalFlag(flags, 'published-date'),
      };
      const prepared = await prepareSource(db, input);
      if (prepared.existing !== undefined) {
        output.write(`Source already exists: ${prepared.existing.url}`);
        keyValues(output, [
          ['Title', prepared.existing.title ?? 'Untitled source'],
          ['Type', prepared.existing.source_type],
          ['Publisher', prepared.existing.publisher],
        ]);
        return 0;
      }
      keyValues(output, [
        ['Title', prepared.values.title ?? 'Untitled source'],
        ['Type', prepared.values.source_type],
        ['Publisher', prepared.values.publisher],
        ['Published date', prepared.values.published_date],
        ['URL', prepared.values.url],
      ]);
      if (!(await requireConfirmation(flags, 'Create this source?'))) return 0;
      const source = await prepared.commit();
      output.write(`Created source ${source.url}.`);
      return 0;
    }
    case 'source list': {
      assertAllowedFlags(flags, ['type', 'publisher']);
      const sourceType = enumValue(
        optionalFlag(flags, 'type'),
        SOURCE_TYPES,
        'source type',
      );
      const rows = await listAdministrativeSources(db, {
        sourceType,
        publisher: optionalFlag(flags, 'publisher'),
      });
      table(
        output,
        rows.map((row) => ({
          Title: row.title ?? 'Untitled source',
          Type: row.type,
          Publisher: row.publisher,
          'Published Date': row.publishedDate,
          'Accessed At': row.accessedAt,
          URL: row.url,
        })),
      );
      return 0;
    }
    case 'record add': {
      assertAllowedFlags(flags, [
        'model',
        'benchmark',
        'metric',
        'score-display',
        'score-value',
        'evaluation-date',
        'reported-date',
        'benchmark-version',
        'configuration',
        'snapshot',
        'evaluator',
        'reported-date',
        'source',
        'report-type',
        'notes',
        'allow-possible-duplicate',
      ]);
      const prepared = await prepareRecord(db, recordInput(flags));
      recordPreview(output, prepared);
      duplicatePreview(output, prepared);
      if (
        prepared.possibleDuplicates.length > 0 &&
        !flags.has('allow-possible-duplicate')
      ) {
        if (yes || !process.stdin.isTTY)
          throw new Error(
            'Possible duplicate detected. Use --allow-possible-duplicate for non-interactive creation.',
          );
        if (
          !(await confirm(
            'Possible duplicate detected. Create a separate record?',
            { yes: false },
          ))
        )
          return 0;
      }
      if (!(await requireConfirmation(flags, 'Create this benchmark record?')))
        return 0;
      const record = await commitPreparedRecord(db, prepared);
      output.write(`Created benchmark record ${record.record_id}.`);
      keyValues(output, [
        ['Model', prepared.model.name],
        ['Benchmark', prepared.benchmark.name],
        ['Metric', prepared.metric.name],
        ['Score', prepared.input.scoreDisplay],
      ]);
      return 0;
    }
    case 'record show': {
      assertAllowedFlags(flags, ['record']);
      const row = await getRecordDetails(db, requiredFlag(flags, 'record'));
      keyValues(output, [
        ['Record ID', row.recordId],
        ['Status', row.status],
        ['Model', row.model],
        ['Model ID', row.modelId],
        ['Record prefix', row.recordPrefix],
        ['Benchmark', row.benchmark],
        ['Metric', row.metric],
        ['Score display', row.scoreDisplay],
        ['Score value', row.scoreValue],
        ['Evaluation date', row.evaluationDate],
        ['Reported date', row.reportedDate],
        ['Source title', row.sourceTitle ?? 'Untitled source'],
        ['Source URL', row.sourceUrl],
        ['Source type', row.sourceType],
        ['Report type', row.reportType],
        ['Notes', row.notes ?? '—'],
        ['Created at', row.createdAt],
        ['Updated at', row.updatedAt],
      ]);
      return 0;
    }
    case 'record withdraw': {
      assertAllowedFlags(flags, ['record']);
      const identifier = requiredFlag(flags, 'record');
      const row = await getRecordDetails(db, identifier);
      keyValues(output, [
        ['Record ID', row.recordId],
        ['Model', row.model],
        ['Benchmark', row.benchmark],
        ['Metric', row.metric],
        ['Current status', row.status],
      ]);
      if (row.status === 'WITHDRAWN') {
        output.write(`${row.recordId} is already withdrawn.`);
        return 0;
      }
      if (!(await requireConfirmation(flags, 'Withdraw this record?')))
        return 0;
      await withdrawRecord(db, identifier);
      output.write(`Withdrew benchmark record ${row.recordId}.`);
      return 0;
    }
    case 'record supersede': {
      assertAllowedFlags(flags, ['record', 'replacement']);
      const original = await getRecordDetails(
        db,
        requiredFlag(flags, 'record'),
      );
      const replacement = await getRecordDetails(
        db,
        requiredFlag(flags, 'replacement'),
      );
      heading(output, 'Supersession preview');
      keyValues(output, [
        ['Original record', original.recordId],
        ['Original model', original.model],
        ['Replacement record', replacement.recordId],
        ['Replacement model', replacement.model],
      ]);
      if (!(await requireConfirmation(flags, 'Supersede the original record?')))
        return 0;
      await supersedeRecord(db, original.recordId, replacement.recordId);
      output.write(
        `Superseded ${original.recordId} with ${replacement.recordId}.`,
      );
      return 0;
    }
    case 'validate': {
      assertAllowedFlags(flags, []);
      const issues = await validateRegistry(db);
      for (const issue of issues)
        output.write(`${issue.severity}: ${issue.entity}: ${issue.message}`);
      const errors = issues.filter(
        (issue) => issue.severity === 'ERROR',
      ).length;
      const warnings = issues.length - errors;
      output.write('Registry validation complete.');
      output.write(`Errors: ${errors}`);
      output.write(`Warnings: ${warnings}`);
      return errors > 0 ? 1 : 0;
    }
    case 'import': {
      assertAllowedFlags(flags, ['file', 'allow-possible-duplicate']);
      const file = requiredFlag(flags, 'file');
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, 'utf8')) as unknown;
      } catch (error) {
        throw new Error(
          `Invalid import JSON: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      const batch = batchSchema.parse(raw);
      const prepared: PreparedRecord[] = [];
      const errors: string[] = [];
      for (const [index, record] of batch.records.entries()) {
        try {
          prepared.push(
            await prepareRecord(db, {
              modelIdentifier: record.modelId,
              benchmarkSlug: record.benchmarkSlug,
              benchmarkVersionReference: record.benchmarkVersionReference,
              configurationReference: record.configurationReference,
              snapshotReference: record.snapshotReference ?? undefined,
              evaluatorSlug: record.evaluatorSlug,
              metricSlug: record.metricSlug,
              scoreDisplay: record.scoreDisplay,
              scoreValue: record.scoreValue,
              evaluationDate: record.evaluationDate,
              reportedDate: record.reportedDate,
              sourceUrl: record.sourceUrl,
              reportType: record.reportType,
              notes: record.notes,
            }),
          );
        } catch (error) {
          errors.push(
            `records[${index}]: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (errors.length > 0) {
        for (const error of errors) output.write(error);
        throw new Error('Batch validation failed; no records were committed.');
      }
      const seenBatchKeys = new Set<string>();
      let duplicates = prepared.reduce(
        (count, record) => count + record.possibleDuplicates.length,
        0,
      );
      for (const record of prepared) {
        const duplicateKey = [
          record.model.id,
          record.benchmark.id,
          record.metric.id,
          record.source.id,
        ].join(':');
        if (seenBatchKeys.has(duplicateKey)) duplicates += 1;
        seenBatchKeys.add(duplicateKey);
      }
      heading(output, 'Batch import preview');
      keyValues(output, [
        ['Records', prepared.length],
        [
          'Models referenced',
          new Set(prepared.map((record) => record.model.id)).size,
        ],
        [
          'Benchmarks referenced',
          new Set(prepared.map((record) => record.benchmark.id)).size,
        ],
        [
          'Sources referenced',
          new Set(prepared.map((record) => record.source.id)).size,
        ],
        ['Possible duplicates', duplicates],
      ]);
      if (duplicates > 0 && !flags.has('allow-possible-duplicate'))
        throw new Error(
          'Possible duplicates detected. Use --allow-possible-duplicate after review.',
        );
      if (
        !(await requireConfirmation(
          flags,
          `Commit ${prepared.length} benchmark records?`,
        ))
      )
        return 0;
      const created = await commitPreparedBatch(db, prepared);
      output.write('Batch import complete.');
      output.write(`Records created: ${created.length}`);
      const groups = new Map<string, string[]>();
      for (const row of created)
        groups.set(row.modelId, [
          ...(groups.get(row.modelId) ?? []),
          row.recordId,
        ]);
      for (const [modelId, identifiers] of groups) {
        output.write(modelId);
        for (const identifier of identifiers) output.write(`  ${identifier}`);
      }
      return 0;
    }
    case 'ingest source': {
      assertAllowedFlags(flags, ['source', 'force']);
      const result = await ingestUrl(db, requiredFlag(flags, 'source'), {
        force: flags.has('force'),
      });
      if (result.identicalJob !== null) {
        output.write(
          `Identical source content was previously ingested as ${result.identicalJob}.`,
        );
      } else {
        output.write(`Ingestion job ${result.jobReference} completed.`);
        output.write(`Candidates created: ${result.candidateCount}`);
      }
      return 0;
    }
    case 'ingest file': {
      assertAllowedFlags(flags, ['file', 'source', 'force']);
      const result = await ingestFile(
        db,
        requiredFlag(flags, 'file'),
        requiredFlag(flags, 'source'),
        { force: flags.has('force') },
      );
      if (result.identicalJob !== null)
        output.write(
          `Identical source content was previously ingested as ${result.identicalJob}.`,
        );
      else {
        output.write(`Ingestion job ${result.jobReference} completed.`);
        output.write(`Candidates created: ${result.candidateCount}`);
      }
      return 0;
    }
    case 'ingest list': {
      assertAllowedFlags(flags, ['status', 'source', 'limit']);
      const rows = await listIngestionJobs(db, {
        status: enumValue(
          optionalFlag(flags, 'status'),
          INGESTION_JOB_STATUSES,
          'ingestion status',
        ),
        source: optionalFlag(flags, 'source'),
        limit: positiveLimit(optionalFlag(flags, 'limit')),
      });
      table(
        output,
        rows.map((row) => ({
          Job: row.job,
          'Input Type': row.inputType,
          Source: row.source,
          Status: row.status,
          Candidates: row.candidates,
          Started: row.started,
          Completed: row.completed,
        })),
      );
      return 0;
    }
    case 'ingest show': {
      assertAllowedFlags(flags, ['job']);
      const result = await getIngestionJob(db, requiredFlag(flags, 'job'));
      const counts = result.candidates.reduce<Record<string, number>>(
        (accumulator, candidate) => {
          accumulator[candidate.status] =
            (accumulator[candidate.status] ?? 0) + 1;
          return accumulator;
        },
        {},
      );
      heading(output, `Ingestion job ${result.job.job_reference}`);
      keyValues(output, [
        ['Source', result.job.sourceTitle ?? 'Untitled source'],
        ['Source URL', result.job.sourceUrl],
        ['Input type', result.job.input_type],
        ['Input reference', result.job.input_reference],
        ['Content hash', result.job.content_hash],
        ['Status', result.job.status],
        ['Retrieved at', result.job.retrieved_at],
        ['Started at', result.job.started_at],
        ['Completed at', result.job.completed_at],
        ['Candidate count', result.candidates.length],
        ['Pending review', counts.PENDING_REVIEW ?? 0],
        ['Published', counts.PUBLISHED ?? 0],
        ['Rejected', counts.REJECTED ?? 0],
        ['Failure message', result.job.error_message],
      ]);
      table(
        output,
        result.candidates.map((candidate) => ({
          Candidate: candidate.reference,
          Status: candidate.status,
        })),
      );
      return 0;
    }
    case 'ingest candidates': {
      assertAllowedFlags(flags, [
        'status',
        'job',
        'model',
        'benchmark',
        'limit',
      ]);
      const rows = await listCandidates(db, {
        status: enumValue(
          optionalFlag(flags, 'status'),
          INGESTION_CANDIDATE_STATUSES,
          'candidate status',
        ),
        job: optionalFlag(flags, 'job'),
        model: optionalFlag(flags, 'model'),
        benchmark: optionalFlag(flags, 'benchmark'),
        limit: positiveLimit(optionalFlag(flags, 'limit')),
      });
      table(
        output,
        rows.map((row) => ({
          Candidate: row.candidate,
          Status: row.status,
          'Model Text': row.modelText,
          'Benchmark Text': row.benchmarkText,
          'Metric Text': row.metricText,
          Score: row.score,
          'Proposed Model': row.proposedModel,
          'Proposed Benchmark': row.proposedBenchmark,
          'Proposed Metric': row.proposedMetric,
          Confidence: row.confidence,
        })),
      );
      return 0;
    }
    case 'ingest candidate': {
      assertAllowedFlags(flags, ['candidate']);
      candidateDetails(
        output,
        await getCandidate(db, requiredFlag(flags, 'candidate')),
        flags.has('debug'),
      );
      return 0;
    }
    case 'ingest approve': {
      assertAllowedFlags(flags, [
        'candidate',
        'model',
        'benchmark',
        'metric',
        'score-display',
        'score-value',
        'evaluation-date',
        'report-type',
        'notes',
        'allow-possible-duplicate',
      ]);
      const overrides: ApprovalOverrides = {};
      const assign = <K extends keyof ApprovalOverrides>(
        key: K,
        value: ApprovalOverrides[K] | undefined,
      ): void => {
        if (value !== undefined) overrides[key] = value;
      };
      assign('model', optionalFlag(flags, 'model'));
      assign('benchmark', optionalFlag(flags, 'benchmark'));
      assign('metric', optionalFlag(flags, 'metric'));
      assign('scoreDisplay', optionalFlag(flags, 'score-display'));
      assign('scoreValue', nullableNumber(optionalFlag(flags, 'score-value')));
      assign('evaluationDate', optionalFlag(flags, 'evaluation-date'));
      assign('reportedDate', optionalFlag(flags, 'reported-date'));
      assign('benchmarkVersion', optionalFlag(flags, 'benchmark-version'));
      assign('configuration', optionalFlag(flags, 'configuration'));
      assign('snapshot', optionalFlag(flags, 'snapshot'));
      assign('evaluator', optionalFlag(flags, 'evaluator'));
      assign(
        'reportType',
        enumValue(
          optionalFlag(flags, 'report-type'),
          REPORT_TYPES,
          'report type',
        ),
      );
      assign('notes', optionalFlag(flags, 'notes'));
      const approval = await prepareCandidateApproval(
        db,
        requiredFlag(flags, 'candidate'),
        overrides,
      );
      heading(output, 'Publication preview');
      keyValues(output, [
        ['Candidate', approval.candidate.candidate_reference],
        ['Model', approval.prepared.model.name],
        ['Model ID', approval.prepared.model.modelId],
        ['Benchmark', approval.prepared.benchmark.name],
        [
          'Benchmark version',
          approval.prepared.benchmarkVersion.canonicalReference,
        ],
        ['Configuration', approval.prepared.configuration.reference],
        ['Model snapshot', approval.prepared.snapshot?.reference],
        ['Evaluator', approval.prepared.evaluator.name],
        ['Metric', approval.prepared.metric.name],
        ['Score', approval.prepared.input.scoreDisplay],
        ['Evaluation date', approval.prepared.input.evaluationDate],
        ['Reported date', approval.prepared.input.reportedDate],
        ['Source', approval.prepared.source.title ?? 'Untitled source'],
        ['Report type', approval.prepared.input.reportType],
        ['Evidence', approval.candidate.evidence_text],
        ['Evidence location', approval.candidate.evidence_location],
        [
          'Overrides',
          Object.keys(approval.overrideMetadata).length === 0
            ? 'None'
            : approval.overrideMetadata,
        ],
        ['Record ID', 'assigned on commit'],
      ]);
      duplicatePreview(output, approval.prepared);
      if (
        approval.prepared.possibleDuplicates.length > 0 &&
        !flags.has('allow-possible-duplicate')
      )
        throw new Error(
          'Possible duplicate detected. Use --allow-possible-duplicate after review.',
        );
      if (
        !(await requireConfirmation(
          flags,
          'Publish this candidate as a benchmark record?',
        ))
      )
        return 0;
      const record = await publishCandidate(db, approval);
      output.write(
        `Published ${approval.candidate.candidate_reference} as ${record.record_id}.`,
      );
      return 0;
    }
    case 'ingest reject': {
      assertAllowedFlags(flags, ['candidate', 'reason']);
      const candidate = await getCandidate(
        db,
        requiredFlag(flags, 'candidate'),
      );
      const reason = requiredFlag(flags, 'reason');
      candidateDetails(output, candidate, false);
      keyValues(output, [['Rejection reason', reason]]);
      if (
        !(await requireConfirmation(flags, 'Reject this ingestion candidate?'))
      )
        return 0;
      await rejectCandidate(db, candidate.candidate_reference, reason);
      output.write(
        `Rejected ingestion candidate ${candidate.candidate_reference}.`,
      );
      return 0;
    }
    case 'ingest validate': {
      assertAllowedFlags(flags, []);
      const issues = await validateIngestion(db);
      for (const issue of issues)
        output.write(`${issue.severity}: ${issue.entity}: ${issue.message}`);
      const errors = issues.filter(
        (issue) => issue.severity === 'ERROR',
      ).length;
      output.write('Ingestion validation complete.');
      output.write(`Errors: ${errors}`);
      output.write(`Warnings: ${issues.length - errors}`);
      return errors > 0 ? 1 : 0;
    }
    case 'production-check': {
      assertAllowedFlags(flags, []);
      let ok = true;
      const pass = (label: string): void => output.write(`PASS: ${label}`);
      const fail = (label: string, detail: string): void => {
        ok = false;
        output.write(`FAIL: ${label}: ${detail}`);
      };

      pass('Environment configuration parses');

      try {
        await sql`SELECT 1`.execute(db);
        pass('Database is reachable');
      } catch (error) {
        fail(
          'Database is reachable',
          error instanceof Error ? error.message : String(error),
        );
      }

      try {
        const applied = new Set(
          (
            await sql<{ name: string }>`SELECT name FROM pgmigrations`.execute(
              db,
            )
          ).rows.map((row) => row.name),
        );
        const files = (await readdir('migrations'))
          .filter((file) => file.endsWith('.ts'))
          .map((file) => file.replace(/\.ts$/, ''));
        const pending = files.filter((file) => !applied.has(file));
        if (pending.length === 0) {
          pass(`Migrations are current (${files.length} applied)`);
        } else {
          fail('Migrations are current', `pending: ${pending.join(', ')}`);
        }
      } catch (error) {
        output.write(
          `SKIPPED: Migration-current check could not run (${error instanceof Error ? error.message : String(error)})`,
        );
      }

      try {
        const organizations = await listAdministrativeOrganizations(db);
        const bySlug = new Map(
          organizations.map((organization) => [
            organization.slug,
            organization,
          ]),
        );
        const missing = PROVIDERS.filter(
          (provider) => !bySlug.has(provider.slug),
        );
        if (missing.length === 0) {
          pass(`Canonical provider organizations exist (${PROVIDERS.length})`);
        } else {
          fail(
            'Canonical provider organizations exist',
            `missing: ${missing.map((provider) => provider.slug).join(', ')}`,
          );
        }
      } catch (error) {
        fail(
          'Canonical provider organizations exist',
          error instanceof Error ? error.message : String(error),
        );
      }

      try {
        const issues = await validateRegistry(db);
        const errors = issues.filter(
          (issue) => issue.severity === 'ERROR',
        ).length;
        if (errors === 0) {
          pass(`Registry validation has no errors (${issues.length} warnings)`);
        } else {
          fail('Registry validation has no errors', `${errors} errors`);
        }
      } catch (error) {
        fail(
          'Registry validation has no errors',
          error instanceof Error ? error.message : String(error),
        );
      }

      try {
        const issues = await validateIngestion(db);
        const errors = issues.filter(
          (issue) => issue.severity === 'ERROR',
        ).length;
        if (errors === 0) {
          pass(
            `Ingestion validation has no errors (${issues.length} warnings)`,
          );
        } else {
          fail('Ingestion validation has no errors', `${errors} errors`);
        }
      } catch (error) {
        fail(
          'Ingestion validation has no errors',
          error instanceof Error ? error.message : String(error),
        );
      }

      output.write(
        ok ? 'Production check passed.' : 'Production check failed.',
      );
      return ok ? 0 : 1;
    }
    default:
      throw new Error(
        key.length === 0
          ? 'Missing command. Use: pnpm registry <command>'
          : `Unknown command: ${key}`,
      );
  }
}

function recordInput(
  flags: ReadonlyMap<string, string | true>,
): RecordWriteInput {
  const rawScore = optionalFlag(flags, 'score-value');
  const scoreValue = rawScore === undefined ? null : Number(rawScore);
  if (rawScore !== undefined && !Number.isFinite(scoreValue))
    throw new Error('Invalid score value.');
  return {
    modelIdentifier: requiredFlag(flags, 'model'),
    benchmarkSlug: requiredFlag(flags, 'benchmark'),
    benchmarkVersionReference: optionalFlag(flags, 'benchmark-version'),
    configurationReference: optionalFlag(flags, 'configuration'),
    snapshotReference: optionalFlag(flags, 'snapshot'),
    evaluatorSlug: optionalFlag(flags, 'evaluator'),
    metricSlug: requiredFlag(flags, 'metric'),
    scoreDisplay: requiredFlag(flags, 'score-display'),
    scoreValue,
    evaluationDate: optionalFlag(flags, 'evaluation-date'),
    reportedDate: optionalFlag(flags, 'reported-date'),
    sourceUrl: requiredFlag(flags, 'source'),
    reportType: enumValue(
      optionalFlag(flags, 'report-type'),
      REPORT_TYPES,
      'report type',
    ),
    notes: optionalFlag(flags, 'notes'),
  };
}

export async function main(
  argv = process.argv.slice(2),
  output: Output = terminalOutput,
): Promise<number> {
  const environment = loadEnvironment();
  const database = createDatabase(environment.DATABASE_URL);
  try {
    return await runCommand(database, argv, output);
  } finally {
    await database.destroy();
  }
}

void main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const debug = process.argv.includes('--debug');
    console.error(
      debug ? error : error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  });
