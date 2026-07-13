import { sql, type RawBuilder, type Selectable } from 'kysely';
import { z } from 'zod';

import type { ReportType, SourceType } from '../db/constants.js';
import type { Database } from '../db/database.js';
import { RegistryEntityNotFoundError } from '../db/errors.js';
import { markRegistryUpdated } from '../db/registry-metadata.js';
import type {
  BenchmarkRecordsTable,
  IngestionCandidatesTable,
  IngestionCandidateStatus,
  IngestionInputType,
  IngestionJobsTable,
  IngestionJobStatus,
  SourcesTable,
} from '../db/types.js';
import {
  canonicalHttpUrl,
  commitPreparedRecordInTransaction,
  prepareRecord,
  type PreparedRecord,
} from '../registry/admin.js';
import { candidateFingerprint, sha256 } from './hash.js';
import { chunkDocument } from './chunk.js';
import { normalizeContent } from './normalize.js';
import { readSourceFile } from './read-file.js';
import { resolveCandidate } from './resolve-candidate.js';
import { retrieveUrl, type RetrievalDependencies } from './retrieve-url.js';
import { tableExtractor } from './extractors/table-extractor.js';
import type {
  CandidateExtractor,
  CandidateProposal,
  SupportedContentType,
} from './types.js';
import { validateCandidate } from './validate-candidate.js';

export interface IngestionLogger {
  info(event: Record<string, unknown>): void;
  error(event: Record<string, unknown>): void;
}

const defaultLogger: IngestionLogger = {
  info: (event) => console.info(JSON.stringify(event)),
  error: (event) => console.error(JSON.stringify(event)),
};

const approvalOverridesSchema = z
  .object({
    model: z.string().trim().min(1).optional(),
    benchmark: z.string().trim().min(1).optional(),
    metric: z.string().trim().min(1).optional(),
    scoreDisplay: z.string().trim().min(1).optional(),
    scoreValue: z.number().finite().positive().nullable().optional(),
    evaluationDate: z.iso.date().nullable().optional(),
    reportedDate: z.iso.date().nullable().optional(),
    benchmarkVersion: z.string().trim().min(1).optional(),
    configuration: z.string().trim().min(1).optional(),
    snapshot: z.string().trim().min(1).optional(),
    evaluator: z.string().trim().min(1).optional(),
    reportType: z
      .enum([
        'PROVIDER',
        'INDEPENDENT',
        'BENCHMARK_OWNER',
        'REPRODUCED',
        'UNKNOWN',
      ])
      .optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

/**
 * `pg` only auto-serializes plain objects to JSON for jsonb columns; a bare
 * JS array is instead sent using Postgres array-literal syntax, which the
 * jsonb parser then rejects. Explicitly stringify arrays destined for a
 * jsonb column so validation_errors/validation_warnings insert correctly.
 */
function jsonbArray(value: readonly unknown[]): RawBuilder<unknown[]> {
  return sql`${JSON.stringify(value)}::jsonb`;
}

function reportTypeForSource(sourceType: SourceType): ReportType {
  switch (sourceType) {
    case 'PROVIDER_REPORT':
    case 'SYSTEM_CARD':
    case 'MODEL_CARD':
    case 'PROVIDER_PAGE':
      return 'PROVIDER';
    case 'INDEPENDENT_EVALUATION':
      return 'INDEPENDENT';
    case 'LEADERBOARD':
      return 'BENCHMARK_OWNER';
    case 'TECHNICAL_REPORT':
    case 'PAPER':
    case 'OTHER':
      return 'UNKNOWN';
  }
}

async function exactSource(
  db: Database,
  url: string,
): Promise<Selectable<SourcesTable>> {
  const canonical = canonicalHttpUrl(url);
  const source = await db
    .selectFrom('sources')
    .selectAll()
    .where('url', '=', canonical)
    .executeTakeFirst();
  if (source === undefined)
    throw new RegistryEntityNotFoundError('Source', canonical);
  return source;
}

async function createJob(
  db: Database,
  sourceId: string,
  inputType: IngestionInputType,
  inputReference: string,
): Promise<Selectable<IngestionJobsTable>> {
  return db
    .insertInto('ingestion_jobs')
    .values({
      source_id: sourceId,
      input_type: inputType,
      input_reference: inputReference,
      status: inputType === 'URL' ? 'RETRIEVING' : 'EXTRACTING',
      content_hash: null,
      retrieved_at: null,
      started_at: new Date(),
      completed_at: null,
      error_message: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function failJob(
  db: Database,
  jobId: string,
  error: unknown,
): Promise<void> {
  await db
    .updateTable('ingestion_jobs')
    .set({
      status: 'FAILED',
      error_message: error instanceof Error ? error.message : String(error),
      completed_at: new Date(),
      updated_at: new Date(),
    })
    .where('id', '=', jobId)
    .execute();
}

async function completeJobIfReviewed(
  db: Database,
  jobId: string,
): Promise<void> {
  const remaining = await db
    .selectFrom('ingestion_candidates')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('ingestion_job_id', '=', jobId)
    .where('candidate_status', 'in', [
      'PENDING_REVIEW',
      'VALIDATION_FAILED',
      'APPROVED',
    ])
    .executeTakeFirstOrThrow();
  if (Number(remaining.count) === 0) {
    await db
      .updateTable('ingestion_jobs')
      .set({
        status: 'COMPLETED',
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', jobId)
      .execute();
  }
}

async function identicalJob(
  db: Database,
  sourceId: string,
  contentHash: string,
  excludeId: string,
): Promise<string | null> {
  const existing = await db
    .selectFrom('ingestion_jobs')
    .select('job_reference')
    .where('source_id', '=', sourceId)
    .where('content_hash', '=', contentHash)
    .where('id', '!=', excludeId)
    .where('status', 'in', ['REVIEW_REQUIRED', 'COMPLETED'])
    .orderBy('id', 'desc')
    .executeTakeFirst();
  return existing?.job_reference ?? null;
}

async function storeProposals(
  db: Database,
  job: Selectable<IngestionJobsTable>,
  source: Awaited<ReturnType<typeof exactSource>>,
  proposals: CandidateProposal[],
  extractionWarnings: string[],
): Promise<{ candidates: number; errors: number; warnings: number }> {
  let candidates = 0;
  let errors = 0;
  let warnings = 0;
  const seen = new Set<string>();
  for (const proposal of proposals) {
    const fingerprint = candidateFingerprint({
      sourceId: source.id,
      ...proposal,
    });
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const resolution = await resolveCandidate(db, proposal);
    const validation = await validateCandidate(db, {
      sourceUrl: source.url,
      proposedModelId: resolution.modelId,
      proposedBenchmarkSlug: resolution.benchmarkSlug,
      proposedMetricSlug: resolution.metricSlug,
      proposedBenchmarkVersionReference: resolution.benchmarkVersionReference,
      proposedConfigurationReference: resolution.configurationReference,
      proposedSnapshotReference: resolution.snapshotReference,
      proposedEvaluatorSlug: resolution.evaluatorSlug,
      scoreDisplay: proposal.scoreDisplay,
      scoreValue: proposal.scoreValue,
      evaluationDate: proposal.evaluationDate,
      reportType: reportTypeForSource(source.source_type),
      evidenceText: proposal.evidenceText,
      evidenceLocation: proposal.evidenceLocation,
      confidence: proposal.confidence,
      resolutionWarnings: [...resolution.warnings, ...extractionWarnings],
    });
    await db
      .insertInto('ingestion_candidates')
      .values({
        ingestion_job_id: job.id,
        source_id: source.id,
        candidate_status:
          validation.errors.length > 0 ? 'VALIDATION_FAILED' : 'PENDING_REVIEW',
        model_text: proposal.modelText,
        benchmark_text: proposal.benchmarkText,
        metric_text: proposal.metricText,
        score_display: proposal.scoreDisplay,
        score_value: proposal.scoreValue,
        evaluation_date: proposal.evaluationDate,
        report_type: reportTypeForSource(source.source_type),
        notes: null,
        evidence_text: proposal.evidenceText,
        evidence_location: proposal.evidenceLocation,
        proposed_model_id: resolution.modelId,
        proposed_benchmark_slug: resolution.benchmarkSlug,
        proposed_metric_slug: resolution.metricSlug,
        benchmark_version_text: proposal.benchmarkVersionText,
        proposed_benchmark_version_reference:
          resolution.benchmarkVersionReference,
        configuration_proposal: proposal.configurationProposal,
        proposed_configuration_reference: resolution.configurationReference,
        provider_model_identifier: proposal.providerModelIdentifier,
        snapshot_date: proposal.snapshotDate,
        proposed_snapshot_reference: resolution.snapshotReference,
        evaluator_text: proposal.evaluatorText,
        proposed_evaluator_slug: resolution.evaluatorSlug,
        reported_date: proposal.reportedDate,
        confidence: proposal.confidence,
        validation_errors: jsonbArray(validation.errors),
        validation_warnings: jsonbArray(validation.warnings),
        candidate_fingerprint: fingerprint,
        approval_overrides: {},
        rejection_reason: null,
        created_record_id: null,
      })
      .execute();
    candidates += 1;
    errors += validation.errors.length;
    warnings += validation.warnings.length;
  }
  return { candidates, errors, warnings };
}

async function processContent(
  db: Database,
  job: Selectable<IngestionJobsTable>,
  source: Awaited<ReturnType<typeof exactSource>>,
  contentType: SupportedContentType,
  content: Uint8Array,
  force: boolean,
  extractors: CandidateExtractor[],
  logger: IngestionLogger,
): Promise<{
  jobReference: string;
  candidateCount: number;
  identicalJob: string | null;
}> {
  const contentHash = sha256(content);
  const previous = await identicalJob(db, source.id, contentHash, job.id);
  if (previous !== null && !force) {
    await db.deleteFrom('ingestion_jobs').where('id', '=', job.id).execute();
    return {
      jobReference: previous,
      candidateCount: 0,
      identicalJob: previous,
    };
  }
  await db
    .updateTable('ingestion_jobs')
    .set({
      status: 'EXTRACTING',
      content_hash: contentHash,
      retrieved_at: new Date(),
      updated_at: new Date(),
    })
    .where('id', '=', job.id)
    .execute();
  logger.info({
    event: 'ingestion_extraction_started',
    job: job.job_reference,
    contentType,
    contentSize: content.byteLength,
    contentHash,
  });
  const document = await normalizeContent(source.id, contentType, content);
  const extractionWarnings = [...document.warnings];
  if (chunkDocument(document).some((chunk) => chunk.truncated))
    extractionWarnings.push('Extraction source chunk was truncated.');
  const proposals: CandidateProposal[] = [];
  for (const extractor of extractors) {
    const extracted = await extractor.extract(document);
    proposals.push(...extracted);
    logger.info({
      event: 'ingestion_extractor_completed',
      job: job.job_reference,
      extractor: extractor.name,
      candidateCount: extracted.length,
    });
  }
  const result = await storeProposals(
    db,
    job,
    source,
    proposals,
    extractionWarnings,
  );
  const completedAt = new Date();
  await db
    .updateTable('ingestion_jobs')
    .set({
      status: result.candidates > 0 ? 'REVIEW_REQUIRED' : 'COMPLETED',
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .where('id', '=', job.id)
    .execute();
  logger.info({
    event: 'ingestion_job_completed',
    job: job.job_reference,
    candidateCount: result.candidates,
    validationErrorCount: result.errors,
    validationWarningCount: result.warnings,
  });
  return {
    jobReference: job.job_reference,
    candidateCount: result.candidates,
    identicalJob: null,
  };
}

export interface IngestOptions {
  force?: boolean;
  extractors?: CandidateExtractor[];
  logger?: IngestionLogger;
}

export interface IngestionRunResult {
  jobReference: string;
  candidateCount: number;
  identicalJob: string | null;
}

export interface IngestionJobListRow {
  job: string;
  inputType: IngestionInputType;
  source: string | null;
  status: IngestionJobStatus;
  candidates: number;
  started: Date;
  completed: Date | null;
}

export interface IngestionCandidateListRow {
  candidate: string;
  status: IngestionCandidateStatus;
  modelText: string | null;
  benchmarkText: string | null;
  metricText: string | null;
  score: string | null;
  proposedModel: string | null;
  proposedBenchmark: string | null;
  proposedMetric: string | null;
  confidence: string | null;
}

export type IngestionCandidateDetails = Selectable<IngestionCandidatesTable> & {
  jobReference: string;
  sourceUrl: string;
  sourceTitle: string | null;
};

export async function ingestUrl(
  db: Database,
  sourceUrl: string,
  options: IngestOptions & { retrieval?: RetrievalDependencies } = {},
): Promise<IngestionRunResult> {
  const source = await exactSource(db, sourceUrl);
  const job = await createJob(db, source.id, 'URL', source.url);
  const logger = options.logger ?? defaultLogger;
  logger.info({
    event: 'ingestion_job_started',
    job: job.job_reference,
    inputType: 'URL',
  });
  try {
    const retrieval = await retrieveUrl(source.url, options.retrieval);
    logger.info({
      event: 'ingestion_source_retrieved',
      job: job.job_reference,
      contentType: retrieval.contentType,
      contentSize: retrieval.contentLength,
    });
    return await processContent(
      db,
      job,
      source,
      retrieval.contentType,
      retrieval.content,
      options.force ?? false,
      options.extractors ?? [tableExtractor],
      logger,
    );
  } catch (error) {
    await failJob(db, job.id, error);
    logger.error({
      event: 'ingestion_job_failed',
      job: job.job_reference,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function ingestFile(
  db: Database,
  file: string,
  sourceUrl: string,
  options: IngestOptions = {},
): Promise<IngestionRunResult> {
  const source = await exactSource(db, sourceUrl);
  const job = await createJob(db, source.id, 'FILE', file);
  const logger = options.logger ?? defaultLogger;
  logger.info({
    event: 'ingestion_job_started',
    job: job.job_reference,
    inputType: 'FILE',
  });
  try {
    const sourceFile = await readSourceFile(file);
    return await processContent(
      db,
      job,
      source,
      sourceFile.contentType,
      sourceFile.content,
      options.force ?? false,
      options.extractors ?? [tableExtractor],
      logger,
    );
  } catch (error) {
    await failJob(db, job.id, error);
    logger.error({
      event: 'ingestion_job_failed',
      job: job.job_reference,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function listIngestionJobs(
  db: Database,
  filters: {
    status?: IngestionJobStatus | undefined;
    source?: string | undefined;
    limit: number;
  },
): Promise<IngestionJobListRow[]> {
  let query = db
    .selectFrom('ingestion_jobs')
    .leftJoin('sources', 'sources.id', 'ingestion_jobs.source_id')
    .leftJoin(
      'ingestion_candidates',
      'ingestion_candidates.ingestion_job_id',
      'ingestion_jobs.id',
    )
    .select([
      'ingestion_jobs.job_reference as job',
      'ingestion_jobs.input_type as inputType',
      'sources.url as source',
      'ingestion_jobs.status',
      'ingestion_jobs.started_at as started',
      'ingestion_jobs.completed_at as completed',
    ])
    .select((eb) => eb.fn.count('ingestion_candidates.id').as('candidates'))
    .groupBy(['ingestion_jobs.id', 'sources.url']);
  if (filters.status !== undefined)
    query = query.where('ingestion_jobs.status', '=', filters.status);
  if (filters.source !== undefined)
    query = query.where('sources.url', '=', canonicalHttpUrl(filters.source));
  const rows = await query
    .orderBy('ingestion_jobs.id', 'desc')
    .limit(filters.limit)
    .execute();
  return rows.map((row) => ({ ...row, candidates: Number(row.candidates) }));
}

export async function getIngestionJob(
  db: Database,
  reference: string,
): Promise<{
  job: Selectable<IngestionJobsTable> & {
    sourceUrl: string | null;
    sourceTitle: string | null;
  };
  candidates: Array<{
    reference: string;
    status: IngestionCandidateStatus;
  }>;
}> {
  const job = await db
    .selectFrom('ingestion_jobs')
    .leftJoin('sources', 'sources.id', 'ingestion_jobs.source_id')
    .selectAll('ingestion_jobs')
    .select(['sources.url as sourceUrl', 'sources.title as sourceTitle'])
    .where('ingestion_jobs.job_reference', '=', reference.trim().toUpperCase())
    .executeTakeFirst();
  if (job === undefined)
    throw new RegistryEntityNotFoundError('Ingestion job', reference);
  const candidates = await db
    .selectFrom('ingestion_candidates')
    .select(['candidate_reference as reference', 'candidate_status as status'])
    .where('ingestion_job_id', '=', job.id)
    .orderBy('id')
    .execute();
  return { job, candidates };
}

export async function listCandidates(
  db: Database,
  filters: {
    status?: IngestionCandidateStatus | undefined;
    job?: string | undefined;
    model?: string | undefined;
    benchmark?: string | undefined;
    limit: number;
  },
): Promise<IngestionCandidateListRow[]> {
  let query = db
    .selectFrom('ingestion_candidates')
    .innerJoin(
      'ingestion_jobs',
      'ingestion_jobs.id',
      'ingestion_candidates.ingestion_job_id',
    )
    .select([
      'candidate_reference as candidate',
      'candidate_status as status',
      'model_text as modelText',
      'benchmark_text as benchmarkText',
      'metric_text as metricText',
      'score_display as score',
      'proposed_model_id as proposedModel',
      'proposed_benchmark_slug as proposedBenchmark',
      'proposed_metric_slug as proposedMetric',
      'confidence',
    ]);
  if (filters.status !== undefined)
    query = query.where('candidate_status', '=', filters.status);
  else
    query = query.where('candidate_status', 'in', [
      'PENDING_REVIEW',
      'VALIDATION_FAILED',
    ]);
  if (filters.job !== undefined)
    query = query.where(
      'ingestion_jobs.job_reference',
      '=',
      filters.job.toUpperCase(),
    );
  if (filters.model !== undefined)
    query = query.where('model_text', 'ilike', `%${filters.model}%`);
  if (filters.benchmark !== undefined)
    query = query.where('benchmark_text', 'ilike', `%${filters.benchmark}%`);
  return query
    .orderBy('ingestion_candidates.id', 'desc')
    .limit(filters.limit)
    .execute();
}

export async function getCandidate(
  db: Database,
  reference: string,
): Promise<IngestionCandidateDetails> {
  const candidate = await db
    .selectFrom('ingestion_candidates')
    .innerJoin(
      'ingestion_jobs',
      'ingestion_jobs.id',
      'ingestion_candidates.ingestion_job_id',
    )
    .innerJoin('sources', 'sources.id', 'ingestion_candidates.source_id')
    .selectAll('ingestion_candidates')
    .select([
      'ingestion_jobs.job_reference as jobReference',
      'sources.url as sourceUrl',
      'sources.title as sourceTitle',
    ])
    .where('candidate_reference', '=', reference.trim().toUpperCase())
    .executeTakeFirst();
  if (candidate === undefined)
    throw new RegistryEntityNotFoundError('Ingestion candidate', reference);
  return candidate;
}

export interface ApprovalOverrides {
  model?: string;
  benchmark?: string;
  metric?: string;
  scoreDisplay?: string;
  scoreValue?: number | null;
  evaluationDate?: string | null;
  reportedDate?: string | null;
  benchmarkVersion?: string;
  configuration?: string;
  snapshot?: string;
  evaluator?: string;
  reportType?: ReportType;
  notes?: string | null;
}

export async function prepareCandidateApproval(
  db: Database,
  reference: string,
  overrides: ApprovalOverrides = {},
): Promise<{
  candidate: Awaited<ReturnType<typeof getCandidate>>;
  prepared: PreparedRecord;
  overrideMetadata: Record<string, unknown>;
}> {
  const validatedOverrides = approvalOverridesSchema.parse(overrides);
  const candidate = await getCandidate(db, reference);
  if (
    !['PENDING_REVIEW', 'VALIDATION_FAILED'].includes(
      candidate.candidate_status,
    )
  )
    throw new Error(
      `Candidate ${candidate.candidate_reference} is not reviewable from status ${candidate.candidate_status}.`,
    );
  const final = {
    modelIdentifier: validatedOverrides.model ?? candidate.proposed_model_id,
    benchmarkSlug:
      validatedOverrides.benchmark ?? candidate.proposed_benchmark_slug,
    metricSlug: validatedOverrides.metric ?? candidate.proposed_metric_slug,
    scoreDisplay: validatedOverrides.scoreDisplay ?? candidate.score_display,
    scoreValue:
      validatedOverrides.scoreValue === undefined
        ? candidate.score_value === null
          ? null
          : Number(candidate.score_value)
        : validatedOverrides.scoreValue,
    evaluationDate:
      validatedOverrides.evaluationDate === undefined
        ? candidate.evaluation_date
        : validatedOverrides.evaluationDate,
    reportedDate:
      validatedOverrides.reportedDate === undefined
        ? candidate.reported_date
        : validatedOverrides.reportedDate,
    benchmarkVersion:
      validatedOverrides.benchmarkVersion ??
      candidate.proposed_benchmark_version_reference,
    configuration:
      validatedOverrides.configuration ??
      candidate.proposed_configuration_reference,
    snapshot:
      validatedOverrides.snapshot ?? candidate.proposed_snapshot_reference,
    evaluator:
      validatedOverrides.evaluator ?? candidate.proposed_evaluator_slug,
    reportType: validatedOverrides.reportType ?? candidate.report_type,
    notes:
      validatedOverrides.notes === undefined
        ? candidate.notes
        : validatedOverrides.notes,
  };
  if (
    candidate.configuration_proposal !== null &&
    candidate.proposed_configuration_reference === null &&
    validatedOverrides.configuration === undefined
  )
    throw new Error(
      'Candidate configuration proposal has no canonical match; create or select an evaluation configuration explicitly.',
    );
  if (
    candidate.benchmark_version_text !== null &&
    candidate.proposed_benchmark_version_reference === null &&
    validatedOverrides.benchmarkVersion === undefined
  )
    throw new Error(
      'Candidate benchmark version has no canonical match; create or select a benchmark version explicitly.',
    );
  if (
    candidate.provider_model_identifier !== null &&
    candidate.proposed_snapshot_reference === null &&
    validatedOverrides.snapshot === undefined
  )
    throw new Error(
      'Candidate provider model identifier has no canonical snapshot; create or select a model snapshot explicitly.',
    );
  if (
    candidate.evaluator_text !== null &&
    candidate.proposed_evaluator_slug === null &&
    validatedOverrides.evaluator === undefined
  )
    throw new Error(
      'Candidate evaluator has no canonical match; create or select an evaluator explicitly.',
    );
  if (
    final.modelIdentifier === null ||
    final.benchmarkSlug === null ||
    final.metricSlug === null ||
    final.scoreDisplay === null
  )
    throw new Error(
      'Candidate has unresolved required fields; supply exact approval overrides.',
    );
  const prepared = await prepareRecord(db, {
    modelIdentifier: final.modelIdentifier,
    benchmarkSlug: final.benchmarkSlug,
    benchmarkVersionReference: final.benchmarkVersion ?? undefined,
    configurationReference: final.configuration ?? undefined,
    snapshotReference: final.snapshot ?? undefined,
    evaluatorSlug: final.evaluator ?? undefined,
    metricSlug: final.metricSlug,
    scoreDisplay: final.scoreDisplay,
    scoreValue: final.scoreValue,
    evaluationDate: final.evaluationDate,
    reportedDate: final.reportedDate,
    reportType: final.reportType,
    notes: final.notes,
    sourceUrl: candidate.sourceUrl,
  });
  const validation = await validateCandidate(db, {
    sourceUrl: candidate.sourceUrl,
    proposedModelId: prepared.model.modelId,
    proposedBenchmarkSlug: prepared.benchmark.slug,
    proposedMetricSlug: prepared.metric.slug,
    proposedBenchmarkVersionReference:
      prepared.benchmarkVersion.canonicalReference,
    proposedConfigurationReference: prepared.configuration.reference,
    proposedSnapshotReference: prepared.snapshot?.reference ?? null,
    proposedEvaluatorSlug: prepared.evaluator.slug,
    scoreDisplay: prepared.input.scoreDisplay,
    scoreValue: prepared.input.scoreValue,
    evaluationDate: prepared.input.evaluationDate,
    reportType: prepared.input.reportType,
    evidenceText: candidate.evidence_text,
    evidenceLocation: candidate.evidence_location,
    confidence:
      candidate.confidence === null ? null : Number(candidate.confidence),
  });
  if (validation.errors.length > 0)
    throw new Error(
      `Candidate validation failed: ${validation.errors.join(' ')}`,
    );
  const overrideMetadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(validatedOverrides))
    overrideMetadata[key] = value;
  return { candidate, prepared, overrideMetadata };
}

export async function publishCandidate(
  db: Database,
  approval: Awaited<ReturnType<typeof prepareCandidateApproval>>,
): Promise<Selectable<BenchmarkRecordsTable>> {
  return db.transaction().execute(async (transaction) => {
    const locked = await transaction
      .selectFrom('ingestion_candidates')
      .select(['candidate_status', 'created_record_id'])
      .where('id', '=', approval.candidate.id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (
      !['PENDING_REVIEW', 'VALIDATION_FAILED'].includes(
        locked.candidate_status,
      ) ||
      locked.created_record_id !== null
    )
      throw new Error(
        `Candidate ${approval.candidate.candidate_reference} is no longer reviewable.`,
      );
    await transaction
      .updateTable('ingestion_candidates')
      .set({
        candidate_status: 'APPROVED',
        approval_overrides: approval.overrideMetadata,
        updated_at: new Date(),
      })
      .where('id', '=', approval.candidate.id)
      .execute();
    const record = await commitPreparedRecordInTransaction(
      transaction,
      approval.prepared,
      {
        eventType: 'CREATED_FROM_INGESTION',
        ingestionCandidateId: approval.candidate.id,
      },
    );
    await transaction
      .updateTable('ingestion_candidates')
      .set({
        candidate_status: 'PUBLISHED',
        created_record_id: record.id,
        validation_errors: jsonbArray([]),
        updated_at: new Date(),
      })
      .where('id', '=', approval.candidate.id)
      .execute();
    await completeJobIfReviewed(
      transaction,
      approval.candidate.ingestion_job_id,
    );
    await markRegistryUpdated(transaction);
    return record;
  });
}

export async function rejectCandidate(
  db: Database,
  reference: string,
  reason: string,
): Promise<void> {
  const candidate = await getCandidate(db, reference);
  const normalizedReason = reason.trim();
  if (normalizedReason.length === 0)
    throw new Error('Rejection reason is required.');
  if (
    !['PENDING_REVIEW', 'VALIDATION_FAILED'].includes(
      candidate.candidate_status,
    )
  )
    throw new Error(
      `Candidate ${candidate.candidate_reference} cannot be rejected from status ${candidate.candidate_status}.`,
    );
  await db.transaction().execute(async (transaction) => {
    await transaction
      .updateTable('ingestion_candidates')
      .set({
        candidate_status: 'REJECTED',
        rejection_reason: normalizedReason,
        updated_at: new Date(),
      })
      .where('id', '=', candidate.id)
      .execute();
    await completeJobIfReviewed(transaction, candidate.ingestion_job_id);
  });
}

export async function revalidateCandidates(
  db: Database,
): Promise<{ checked: number; errors: number; warnings: number }> {
  const candidates = await db
    .selectFrom('ingestion_candidates')
    .innerJoin('sources', 'sources.id', 'ingestion_candidates.source_id')
    .selectAll('ingestion_candidates')
    .select('sources.url as sourceUrl')
    .where('candidate_status', 'in', ['PENDING_REVIEW', 'VALIDATION_FAILED'])
    .execute();
  let errors = 0;
  let warnings = 0;
  for (const candidate of candidates) {
    const validation = await validateCandidate(db, {
      sourceUrl: candidate.sourceUrl,
      proposedModelId: candidate.proposed_model_id,
      proposedBenchmarkSlug: candidate.proposed_benchmark_slug,
      proposedMetricSlug: candidate.proposed_metric_slug,
      proposedBenchmarkVersionReference:
        candidate.proposed_benchmark_version_reference,
      proposedConfigurationReference:
        candidate.proposed_configuration_reference,
      proposedSnapshotReference: candidate.proposed_snapshot_reference,
      proposedEvaluatorSlug: candidate.proposed_evaluator_slug,
      scoreDisplay: candidate.score_display,
      scoreValue:
        candidate.score_value === null ? null : Number(candidate.score_value),
      evaluationDate: candidate.evaluation_date,
      reportType: candidate.report_type,
      evidenceText: candidate.evidence_text,
      evidenceLocation: candidate.evidence_location,
      confidence:
        candidate.confidence === null ? null : Number(candidate.confidence),
    });
    errors += validation.errors.length;
    warnings += validation.warnings.length;
    await db
      .updateTable('ingestion_candidates')
      .set({
        candidate_status:
          validation.errors.length > 0 ? 'VALIDATION_FAILED' : 'PENDING_REVIEW',
        validation_errors: jsonbArray(validation.errors),
        validation_warnings: jsonbArray(validation.warnings),
        updated_at: new Date(),
      })
      .where('id', '=', candidate.id)
      .execute();
  }
  return { checked: candidates.length, errors, warnings };
}

export async function validateIngestion(
  db: Database,
): Promise<
  Array<{ severity: 'ERROR' | 'WARNING'; entity: string; message: string }>
> {
  const issues: Array<{
    severity: 'ERROR' | 'WARNING';
    entity: string;
    message: string;
  }> = [];
  for (const table of ['ingestion_jobs', 'ingestion_candidates'] as const) {
    const referenceColumn =
      table === 'ingestion_jobs' ? 'job_reference' : 'candidate_reference';
    const duplicates = await db
      .selectFrom(table)
      .select(referenceColumn)
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .groupBy(referenceColumn)
      .having((eb) => eb.fn.countAll(), '>', 1)
      .execute();
    for (const duplicate of duplicates) {
      issues.push({
        severity: 'ERROR',
        entity: String(duplicate[referenceColumn]),
        message: `${table === 'ingestion_jobs' ? 'Job' : 'Candidate'} reference is not unique.`,
      });
    }
  }
  const jobs = await db.selectFrom('ingestion_jobs').selectAll().execute();
  const validJobStatuses: IngestionJobStatus[] = [
    'PENDING',
    'RETRIEVING',
    'EXTRACTING',
    'REVIEW_REQUIRED',
    'COMPLETED',
    'FAILED',
  ];
  for (const job of jobs)
    if (!validJobStatuses.includes(job.status))
      issues.push({
        severity: 'ERROR',
        entity: job.job_reference,
        message: 'Invalid ingestion job status.',
      });
  const candidates = await db
    .selectFrom('ingestion_candidates')
    .innerJoin(
      'ingestion_jobs',
      'ingestion_jobs.id',
      'ingestion_candidates.ingestion_job_id',
    )
    .selectAll('ingestion_candidates')
    .select('ingestion_jobs.source_id as jobSourceId')
    .execute();
  const validCandidateStatuses: IngestionCandidateStatus[] = [
    'PENDING_REVIEW',
    'VALIDATION_FAILED',
    'APPROVED',
    'REJECTED',
    'PUBLISHED',
  ];
  for (const candidate of candidates) {
    const add = (message: string): void => {
      issues.push({
        severity: 'ERROR',
        entity: candidate.candidate_reference,
        message,
      });
    };
    if (!validCandidateStatuses.includes(candidate.candidate_status))
      add('Invalid candidate status.');
    if (
      candidate.candidate_status === 'PUBLISHED' &&
      candidate.created_record_id === null
    )
      add('Published candidate has no benchmark record.');
    if (
      candidate.candidate_status !== 'PUBLISHED' &&
      candidate.created_record_id !== null
    )
      add('Non-published candidate references a benchmark record.');
    if (candidate.jobSourceId !== candidate.source_id)
      add('Candidate source does not match ingestion job source.');
    const confidence =
      candidate.confidence === null ? null : Number(candidate.confidence);
    if (confidence !== null && (confidence < 0 || confidence > 1))
      add('Extraction confidence is outside 0–1.');
    if (
      candidate.candidate_status === 'REJECTED' &&
      !candidate.rejection_reason?.trim()
    )
      add('Rejected candidate has no rejection reason.');
    if (
      candidate.candidate_status === 'PUBLISHED' &&
      candidate.validation_errors.length > 0
    )
      add('Published candidate retains validation errors.');
    if (
      !approvalOverridesSchema.safeParse(candidate.approval_overrides).success
    )
      add('Approval overrides are structurally invalid.');
  }
  return issues;
}
