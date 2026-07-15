import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import type {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from 'fastify';

import type { AdminAuthConfig } from '../admin/auth.js';
import { requireAdmin } from '../admin/require-admin.js';
import type { Database } from '../db/database.js';
import { REPORT_TYPES, type ReportType } from '../db/constants.js';
import { RegistryEntityNotFoundError } from '../db/errors.js';
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
import type { RequestRateLimiter } from '../security/request-rate-limit.js';
import { hasSameOrigin } from '../web/same-origin.js';
import { createPageSeo } from '../web/seo.js';

interface AdminIngestRouteOptions {
  database: Database | undefined;
  adminAuth: AdminAuthConfig | undefined;
  requestRateLimiter: RequestRateLimiter | undefined;
}

type FormBody = Record<string, unknown>;

const UPLOAD_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.html', '.htm']);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const OVERRIDE_FIELDS = [
  'model',
  'benchmark',
  'metric',
  'score_display',
  'score_value',
  'evaluation_date',
  'reported_date',
  'benchmark_version',
  'configuration',
  'snapshot',
  'evaluator',
  'report_type',
  'notes',
] as const;

function formString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function describeError(error: unknown): string {
  if (error instanceof RegistryEntityNotFoundError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unexpected error.';
}

function isNotFound(error: unknown): boolean {
  return error instanceof RegistryEntityNotFoundError;
}

function overridesFromBody(body: FormBody): {
  overrides: ApprovalOverrides;
  raw: Record<(typeof OVERRIDE_FIELDS)[number], string>;
} {
  const raw = Object.fromEntries(
    OVERRIDE_FIELDS.map((field) => [field, formString(body[field])]),
  ) as Record<(typeof OVERRIDE_FIELDS)[number], string>;
  const overrides: ApprovalOverrides = {};
  if (raw.model !== '') overrides.model = raw.model;
  if (raw.benchmark !== '') overrides.benchmark = raw.benchmark;
  if (raw.metric !== '') overrides.metric = raw.metric;
  if (raw.score_display !== '') overrides.scoreDisplay = raw.score_display;
  if (raw.score_value !== '') {
    const parsed = Number(raw.score_value);
    overrides.scoreValue = parsed;
  }
  if (raw.evaluation_date !== '')
    overrides.evaluationDate = raw.evaluation_date;
  if (raw.reported_date !== '') overrides.reportedDate = raw.reported_date;
  if (raw.benchmark_version !== '')
    overrides.benchmarkVersion = raw.benchmark_version;
  if (raw.configuration !== '') overrides.configuration = raw.configuration;
  if (raw.snapshot !== '') overrides.snapshot = raw.snapshot;
  if (raw.evaluator !== '') overrides.evaluator = raw.evaluator;
  if (
    raw.report_type !== '' &&
    REPORT_TYPES.includes(raw.report_type as ReportType)
  )
    overrides.reportType = raw.report_type as ReportType;
  if (raw.notes !== '') overrides.notes = raw.notes;
  return { overrides, raw };
}

function requireDatabase(
  reply: FastifyReply,
  options: AdminIngestRouteOptions,
): Database | undefined {
  if (options.database === undefined) {
    void reply.status(503).send('Ingestion storage is unavailable.');
    return undefined;
  }
  return options.database;
}

const adminIngestRoutes: FastifyPluginCallback<AdminIngestRouteOptions> = (
  app,
  options,
  done,
) => {
  app.get('/admin', async (request, reply) => {
    if (!(await requireAdmin(request, reply, options))) return reply;
    return reply.view('admin-dashboard.eta', {
      title: 'Administration — Benchmark Registry',
      seo: createPageSeo({
        title: 'Administration | Benchmark Registry',
        description: 'Internal administration tools.',
        policy: 'NON_INDEXABLE',
      }),
      query: '',
    });
  });

  app.get('/admin/ingest', async (request, reply) => {
    if (!(await requireAdmin(request, reply, options))) return reply;
    const database = requireDatabase(reply, options);
    if (database === undefined) return reply;
    const [jobs, candidates] = await Promise.all([
      listIngestionJobs(database, { limit: 50 }),
      listCandidates(database, { limit: 50 }),
    ]);
    return reply.view('admin-ingest.eta', {
      title: 'Source-Assisted Ingestion — Benchmark Registry Administration',
      seo: createPageSeo({
        title: 'Source-Assisted Ingestion | Benchmark Registry Administration',
        description: 'Retrieve, extract, and review ingestion candidates.',
        policy: 'NON_INDEXABLE',
      }),
      query: '',
      jobs,
      candidates,
      error: null,
      values: { source: '', force: false },
    });
  });

  app.post<{ Body: FormBody }>(
    '/admin/ingest/source',
    { bodyLimit: 4096 },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, options))) return reply;
      const database = requireDatabase(reply, options);
      if (database === undefined) return reply;
      if (!hasSameOrigin(request)) {
        return reply.status(400).send('Unable to start ingestion.');
      }
      const sourceUrl = formString(request.body.source);
      const force = formString(request.body.force) !== '';
      try {
        const result = await ingestUrl(database, sourceUrl, { force });
        return reply
          .status(303)
          .header('Location', `/admin/ingest/jobs/${result.jobReference}`)
          .send();
      } catch (error) {
        const [jobs, candidates] = await Promise.all([
          listIngestionJobs(database, { limit: 50 }),
          listCandidates(database, { limit: 50 }),
        ]);
        return reply.status(400).view('admin-ingest.eta', {
          title:
            'Source-Assisted Ingestion — Benchmark Registry Administration',
          seo: createPageSeo({
            title:
              'Source-Assisted Ingestion | Benchmark Registry Administration',
            description: 'Retrieve, extract, and review ingestion candidates.',
            policy: 'NON_INDEXABLE',
          }),
          query: '',
          jobs,
          candidates,
          error: describeError(error),
          values: { source: sourceUrl, force },
        });
      }
    },
  );

  app.post(
    '/admin/ingest/file',
    { bodyLimit: MAX_UPLOAD_BYTES + 65_536 },
    async (request: FastifyRequest, reply) => {
      if (!(await requireAdmin(request, reply, options))) return reply;
      const database = requireDatabase(reply, options);
      if (database === undefined) return reply;
      if (!hasSameOrigin(request)) {
        return reply.status(400).send('Unable to start ingestion.');
      }
      let directory: string | undefined;
      try {
        let sourceUrl = '';
        let force = false;
        let savedPath: string | undefined;
        let uploadError: string | undefined;
        directory = await mkdtemp(join(tmpdir(), 'admin-ingest-'));
        for await (const part of request.parts()) {
          if (part.type === 'file') {
            const extension = extname(part.filename).toLowerCase();
            if (!UPLOAD_EXTENSIONS.has(extension)) {
              uploadError ??= `Unsupported upload extension: ${extension || '(none)'}`;
              part.file.resume();
              continue;
            }
            const destination = join(directory, `upload${extension}`);
            await pipeline(part.file, createWriteStream(destination));
            if (part.file.truncated) {
              uploadError ??= 'Uploaded file exceeds the maximum size.';
              continue;
            }
            savedPath = destination;
          } else if (part.fieldname === 'source') {
            sourceUrl = formString(part.value);
          } else if (part.fieldname === 'force') {
            force = formString(part.value) !== '';
          }
        }
        if (uploadError !== undefined) {
          throw new Error(uploadError);
        }
        if (savedPath === undefined) {
          throw new Error('A file is required.');
        }
        const result = await ingestFile(database, savedPath, sourceUrl, {
          force,
        });
        return reply
          .status(303)
          .header('Location', `/admin/ingest/jobs/${result.jobReference}`)
          .send();
      } catch (error) {
        const [jobs, candidates] = await Promise.all([
          listIngestionJobs(database, { limit: 50 }),
          listCandidates(database, { limit: 50 }),
        ]);
        return reply.status(400).view('admin-ingest.eta', {
          title:
            'Source-Assisted Ingestion — Benchmark Registry Administration',
          seo: createPageSeo({
            title:
              'Source-Assisted Ingestion | Benchmark Registry Administration',
            description: 'Retrieve, extract, and review ingestion candidates.',
            policy: 'NON_INDEXABLE',
          }),
          query: '',
          jobs,
          candidates,
          error: describeError(error),
          values: { source: '', force: false },
        });
      } finally {
        if (directory !== undefined) {
          await rm(directory, { recursive: true, force: true });
        }
      }
    },
  );

  app.get('/admin/ingest/validate', async (request, reply) => {
    if (!(await requireAdmin(request, reply, options))) return reply;
    const database = requireDatabase(reply, options);
    if (database === undefined) return reply;
    const issues = await validateIngestion(database);
    return reply.view('admin-ingest-validate.eta', {
      title: 'Ingestion Validation — Benchmark Registry Administration',
      seo: createPageSeo({
        title: 'Ingestion Validation | Benchmark Registry Administration',
        description: 'Ingestion data integrity checks.',
        policy: 'NON_INDEXABLE',
      }),
      query: '',
      issues,
    });
  });

  app.get<{ Params: { job: string } }>(
    '/admin/ingest/jobs/:job',
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, options))) return reply;
      const database = requireDatabase(reply, options);
      if (database === undefined) return reply;
      try {
        const result = await getIngestionJob(database, request.params.job);
        return reply.view('admin-ingest-job.eta', {
          title: `Ingestion Job ${result.job.job_reference} — Benchmark Registry Administration`,
          seo: createPageSeo({
            title: `Ingestion Job ${result.job.job_reference} | Benchmark Registry Administration`,
            description: 'Ingestion job detail.',
            policy: 'NON_INDEXABLE',
          }),
          query: '',
          job: result.job,
          candidates: result.candidates,
        });
      } catch (error) {
        if (isNotFound(error)) {
          return reply.status(404).send('Ingestion job not found.');
        }
        throw error;
      }
    },
  );

  app.get<{
    Params: { candidate: string };
    Querystring: { published?: string };
  }>('/admin/ingest/candidates/:candidate', async (request, reply) => {
    if (!(await requireAdmin(request, reply, options))) return reply;
    const database = requireDatabase(reply, options);
    if (database === undefined) return reply;
    try {
      const candidate = await getCandidate(database, request.params.candidate);
      const reviewable = ['PENDING_REVIEW', 'VALIDATION_FAILED'].includes(
        candidate.candidate_status,
      );
      return reply.view('admin-ingest-candidate.eta', {
        title: `Ingestion Candidate ${candidate.candidate_reference} — Benchmark Registry Administration`,
        seo: createPageSeo({
          title: `Ingestion Candidate ${candidate.candidate_reference} | Benchmark Registry Administration`,
          description: 'Ingestion candidate detail and review.',
          policy: 'NON_INDEXABLE',
        }),
        query: '',
        candidate,
        reviewable,
        reportTypes: REPORT_TYPES,
        error: null,
        values: Object.fromEntries(OVERRIDE_FIELDS.map((field) => [field, ''])),
        publishedRecordId: request.query.published ?? null,
      });
    } catch (error) {
      if (isNotFound(error)) {
        return reply.status(404).send('Ingestion candidate not found.');
      }
      throw error;
    }
  });

  app.post<{ Params: { candidate: string }; Body: FormBody }>(
    '/admin/ingest/candidates/:candidate/preview',
    { bodyLimit: 16_384 },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, options))) return reply;
      const database = requireDatabase(reply, options);
      if (database === undefined) return reply;
      if (!hasSameOrigin(request)) {
        return reply.status(400).send('Unable to preview candidate.');
      }
      const { overrides, raw } = overridesFromBody(request.body);
      try {
        const approval = await prepareCandidateApproval(
          database,
          request.params.candidate,
          overrides,
        );
        return reply.view('admin-ingest-preview.eta', {
          title: `Publication Preview ${approval.candidate.candidate_reference} — Benchmark Registry Administration`,
          seo: createPageSeo({
            title: `Publication Preview | Benchmark Registry Administration`,
            description: 'Ingestion candidate publication preview.',
            policy: 'NON_INDEXABLE',
          }),
          query: '',
          candidate: approval.candidate,
          prepared: approval.prepared,
          raw,
        });
      } catch (error) {
        if (isNotFound(error)) {
          return reply.status(404).send('Ingestion candidate not found.');
        }
        const candidate = await getCandidate(
          database,
          request.params.candidate,
        );
        const reviewable = ['PENDING_REVIEW', 'VALIDATION_FAILED'].includes(
          candidate.candidate_status,
        );
        return reply.status(422).view('admin-ingest-candidate.eta', {
          title: `Ingestion Candidate ${candidate.candidate_reference} — Benchmark Registry Administration`,
          seo: createPageSeo({
            title: `Ingestion Candidate ${candidate.candidate_reference} | Benchmark Registry Administration`,
            description: 'Ingestion candidate detail and review.',
            policy: 'NON_INDEXABLE',
          }),
          query: '',
          candidate,
          reviewable,
          reportTypes: REPORT_TYPES,
          error: describeError(error),
          values: raw,
        });
      }
    },
  );

  app.post<{ Params: { candidate: string }; Body: FormBody }>(
    '/admin/ingest/candidates/:candidate/publish',
    { bodyLimit: 16_384 },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, options))) return reply;
      const database = requireDatabase(reply, options);
      if (database === undefined) return reply;
      if (!hasSameOrigin(request)) {
        return reply.status(400).send('Unable to publish candidate.');
      }
      const { overrides, raw } = overridesFromBody(request.body);
      const allowPossibleDuplicate =
        formString(request.body.allow_possible_duplicate) !== '';
      try {
        const approval = await prepareCandidateApproval(
          database,
          request.params.candidate,
          overrides,
        );
        if (
          approval.prepared.possibleDuplicates.length > 0 &&
          !allowPossibleDuplicate
        ) {
          return reply.status(422).view('admin-ingest-preview.eta', {
            title: `Publication Preview ${approval.candidate.candidate_reference} — Benchmark Registry Administration`,
            seo: createPageSeo({
              title: `Publication Preview | Benchmark Registry Administration`,
              description: 'Ingestion candidate publication preview.',
              policy: 'NON_INDEXABLE',
            }),
            query: '',
            candidate: approval.candidate,
            prepared: approval.prepared,
            raw,
            error:
              'Possible duplicate records were found. Review them and confirm explicitly before publishing.',
          });
        }
        const record = await publishCandidate(database, approval);
        return reply
          .status(303)
          .header(
            'Location',
            `/admin/ingest/candidates/${approval.candidate.candidate_reference}?published=${encodeURIComponent(record.record_id)}`,
          )
          .send();
      } catch (error) {
        if (isNotFound(error)) {
          return reply.status(404).send('Ingestion candidate not found.');
        }
        const candidate = await getCandidate(
          database,
          request.params.candidate,
        );
        const reviewable = ['PENDING_REVIEW', 'VALIDATION_FAILED'].includes(
          candidate.candidate_status,
        );
        return reply.status(422).view('admin-ingest-candidate.eta', {
          title: `Ingestion Candidate ${candidate.candidate_reference} — Benchmark Registry Administration`,
          seo: createPageSeo({
            title: `Ingestion Candidate ${candidate.candidate_reference} | Benchmark Registry Administration`,
            description: 'Ingestion candidate detail and review.',
            policy: 'NON_INDEXABLE',
          }),
          query: '',
          candidate,
          reviewable,
          reportTypes: REPORT_TYPES,
          error: describeError(error),
          values: raw,
        });
      }
    },
  );

  app.post<{ Params: { candidate: string }; Body: FormBody }>(
    '/admin/ingest/candidates/:candidate/reject',
    { bodyLimit: 4096 },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, options))) return reply;
      const database = requireDatabase(reply, options);
      if (database === undefined) return reply;
      if (!hasSameOrigin(request)) {
        return reply.status(400).send('Unable to reject candidate.');
      }
      const reason = formString(request.body.reason);
      try {
        await rejectCandidate(database, request.params.candidate, reason);
        return reply
          .status(303)
          .header(
            'Location',
            `/admin/ingest/candidates/${request.params.candidate}`,
          )
          .send();
      } catch (error) {
        if (isNotFound(error)) {
          return reply.status(404).send('Ingestion candidate not found.');
        }
        const candidate = await getCandidate(
          database,
          request.params.candidate,
        );
        const reviewable = ['PENDING_REVIEW', 'VALIDATION_FAILED'].includes(
          candidate.candidate_status,
        );
        return reply.status(422).view('admin-ingest-candidate.eta', {
          title: `Ingestion Candidate ${candidate.candidate_reference} — Benchmark Registry Administration`,
          seo: createPageSeo({
            title: `Ingestion Candidate ${candidate.candidate_reference} | Benchmark Registry Administration`,
            description: 'Ingestion candidate detail and review.',
            policy: 'NON_INDEXABLE',
          }),
          query: '',
          candidate,
          reviewable,
          reportTypes: REPORT_TYPES,
          error: describeError(error),
          values: Object.fromEntries(
            OVERRIDE_FIELDS.map((field) => [field, '']),
          ),
        });
      }
    },
  );

  done();
};

export default adminIngestRoutes;
