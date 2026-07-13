import { z } from 'zod';

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
export const RETRIEVAL_TIMEOUT_MS = 30_000;
export const MAX_CHUNK_TEXT_LENGTH = 40_000;
export const INGESTION_USER_AGENT =
  'BenchmarkRegistrySourceIngestion/1.0 (+https://benchmarkregistry.org)';

export const SUPPORTED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'text/markdown',
  'application/pdf',
] as const;

export type SupportedContentType = (typeof SUPPORTED_CONTENT_TYPES)[number];

export interface NormalizedSection {
  heading: string | null;
  text: string;
  location: string;
}

export interface NormalizedTable {
  index: number;
  caption: string | null;
  sectionHeading: string | null;
  context: string | null;
  headers: string[];
  rows: string[][];
  location: string;
}

export interface NormalizedPage {
  pageNumber: number;
  text: string;
}

export interface NormalizedSourceDocument {
  sourceId: string;
  contentType: SupportedContentType;
  title: string | null;
  text: string;
  sections: NormalizedSection[];
  tables: NormalizedTable[];
  pages: NormalizedPage[];
  contentHash: string;
  warnings: string[];
}

export const candidateProposalSchema = z
  .object({
    modelText: z.string().trim().min(1),
    benchmarkText: z.string().trim().min(1),
    metricText: z.string().trim().min(1),
    scoreDisplay: z.string().trim().min(1),
    scoreValue: z.number().finite().nullable().default(null),
    evaluationDate: z.iso.date().nullable().default(null),
    benchmarkVersionText: z.string().trim().min(1).nullable().default(null),
    configurationProposal: z
      .record(z.string(), z.unknown())
      .nullable()
      .default(null),
    providerModelIdentifier: z.string().trim().min(1).nullable().default(null),
    snapshotDate: z.iso.date().nullable().default(null),
    evaluatorText: z.string().trim().min(1).nullable().default(null),
    reportedDate: z.iso.date().nullable().default(null),
    evidenceText: z.string().trim().min(1),
    evidenceLocation: z.string().trim().min(1),
    confidence: z.number().min(0).max(1).nullable().default(null),
  })
  .strict();

export type CandidateProposal = z.infer<typeof candidateProposalSchema>;

export interface CandidateExtractor {
  readonly name: string;
  extract(document: NormalizedSourceDocument): Promise<CandidateProposal[]>;
}

export interface ExtractionChunk {
  text: string;
  location: string;
  heading: string | null;
  tables: NormalizedTable[];
  truncated: boolean;
}

export interface LlmCandidateProvider {
  extractCandidates(
    chunk: ExtractionChunk,
    instructions: string,
  ): Promise<unknown>;
}
