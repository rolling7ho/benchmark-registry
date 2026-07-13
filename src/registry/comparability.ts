export type ComparabilityAssessment =
  | 'COMPARABLE'
  | 'POTENTIALLY_COMPARABLE'
  | 'NOT_COMPARABLE'
  | 'INSUFFICIENT_CONTEXT';

export interface ComparableRecordContext {
  benchmarkVersionId: string | null;
  metricId: string | null;
  configurationFingerprint: string | null;
  configurationUnspecified?: boolean;
  knownConfiguration?: Record<string, unknown>;
}

export function assessRecordComparability(
  left: ComparableRecordContext,
  right: ComparableRecordContext,
): { assessment: ComparabilityAssessment; reasons: string[] } {
  if (left.benchmarkVersionId === null || right.benchmarkVersionId === null)
    return {
      assessment: 'INSUFFICIENT_CONTEXT',
      reasons: ['Benchmark version is unknown.'],
    };
  if (left.metricId === null || right.metricId === null)
    return {
      assessment: 'INSUFFICIENT_CONTEXT',
      reasons: ['Metric is unknown.'],
    };
  if (left.benchmarkVersionId !== right.benchmarkVersionId)
    return {
      assessment: 'NOT_COMPARABLE',
      reasons: ['Benchmark versions differ.'],
    };
  if (left.metricId !== right.metricId)
    return { assessment: 'NOT_COMPARABLE', reasons: ['Metrics differ.'] };
  if (
    left.configurationFingerprint !== null &&
    right.configurationFingerprint !== null &&
    !left.configurationUnspecified &&
    !right.configurationUnspecified
  ) {
    return left.configurationFingerprint === right.configurationFingerprint
      ? {
          assessment: 'COMPARABLE',
          reasons: [
            'Benchmark version, metric, and evaluation configuration match structurally.',
          ],
        }
      : {
          assessment: 'NOT_COMPARABLE',
          reasons: ['Known evaluation configurations differ.'],
        };
  }
  const leftKnown = left.knownConfiguration ?? {};
  const rightKnown = right.knownConfiguration ?? {};
  for (const key of Object.keys(leftKnown))
    if (key in rightKnown && leftKnown[key] !== rightKnown[key])
      return {
        assessment: 'NOT_COMPARABLE',
        reasons: [`Known configuration field ${key} differs.`],
      };
  if (Object.keys(leftKnown).length > 0 || Object.keys(rightKnown).length > 0)
    return {
      assessment: 'POTENTIALLY_COMPARABLE',
      reasons: [
        'Known context has no conflict, but configuration is incomplete.',
      ],
    };
  return {
    assessment: 'INSUFFICIENT_CONTEXT',
    reasons: ['Evaluation configuration is insufficiently documented.'],
  };
}
