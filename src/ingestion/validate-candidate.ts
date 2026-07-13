import type { ReportType } from '../db/constants.js';
import { REPORT_TYPES } from '../db/constants.js';
import type { Database } from '../db/database.js';
import { prepareRecord } from '../registry/admin.js';

export interface CandidateValidationInput {
  sourceUrl: string | null;
  proposedModelId: string | null;
  proposedBenchmarkSlug: string | null;
  proposedMetricSlug: string | null;
  proposedBenchmarkVersionReference?: string | null;
  proposedConfigurationReference?: string | null;
  proposedSnapshotReference?: string | null;
  proposedEvaluatorSlug?: string | null;
  scoreDisplay: string | null;
  scoreValue: number | null;
  evaluationDate: string | null;
  reportType: ReportType;
  evidenceText: string | null;
  evidenceLocation: string | null;
  confidence: number | null;
  resolutionWarnings?: string[];
}

export interface CandidateValidationResult {
  errors: string[];
  warnings: string[];
}

export async function validateCandidate(
  db: Database,
  input: CandidateValidationInput,
): Promise<CandidateValidationResult> {
  const errors: string[] = [];
  const warnings = [...(input.resolutionWarnings ?? [])];
  if (input.proposedModelId === null) errors.push('Unresolved model.');
  if (input.proposedBenchmarkSlug === null)
    errors.push('Unresolved benchmark.');
  if (input.proposedMetricSlug === null) errors.push('Unresolved metric.');
  if (input.scoreDisplay === null || input.scoreDisplay.trim() === '')
    errors.push('Missing score display.');
  if (input.sourceUrl === null) errors.push('Missing source.');
  if (input.evidenceText === null || input.evidenceText.trim() === '')
    errors.push('Missing evidence.');
  if (input.evidenceLocation === null || input.evidenceLocation.trim() === '')
    errors.push('Missing evidence location.');
  if (!REPORT_TYPES.includes(input.reportType))
    errors.push('Invalid report type.');
  if (
    input.scoreValue !== null &&
    (!Number.isFinite(input.scoreValue) || input.scoreValue <= 0)
  )
    errors.push('Invalid score value.');
  if (input.evaluationDate === null) warnings.push('Evaluation date unknown.');
  if (input.scoreValue === null) warnings.push('Numeric score absent.');
  if (input.confidence !== null && input.confidence < 0.5)
    warnings.push('Low extraction confidence.');
  if (input.reportType === 'UNKNOWN') warnings.push('Report type UNKNOWN.');

  if (
    errors.length === 0 &&
    input.proposedModelId !== null &&
    input.proposedBenchmarkSlug !== null &&
    input.proposedMetricSlug !== null &&
    input.scoreDisplay !== null &&
    input.sourceUrl !== null
  ) {
    const prepared = await prepareRecord(db, {
      modelIdentifier: input.proposedModelId,
      benchmarkSlug: input.proposedBenchmarkSlug,
      benchmarkVersionReference:
        input.proposedBenchmarkVersionReference ?? undefined,
      configurationReference: input.proposedConfigurationReference ?? undefined,
      snapshotReference: input.proposedSnapshotReference ?? undefined,
      evaluatorSlug: input.proposedEvaluatorSlug ?? undefined,
      metricSlug: input.proposedMetricSlug,
      scoreDisplay: input.scoreDisplay,
      scoreValue: input.scoreValue,
      evaluationDate: input.evaluationDate,
      sourceUrl: input.sourceUrl,
      reportType: input.reportType,
    });
    if (prepared.possibleDuplicates.length > 0)
      warnings.push('Possible duplicate benchmark record.');
  }
  return { errors, warnings: [...new Set(warnings)] };
}
