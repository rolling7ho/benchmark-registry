import type {
  CandidateExtractor,
  CandidateProposal,
  NormalizedSourceDocument,
  NormalizedTable,
} from '../types.js';

type Field = 'model' | 'benchmark' | 'metric' | 'score';

const HEADER_FIELDS: Readonly<Record<string, Field>> = {
  model: 'model',
  'model name': 'model',
  system: 'model',
  benchmark: 'benchmark',
  evaluation: 'benchmark',
  dataset: 'benchmark',
  metric: 'metric',
  measure: 'metric',
  score: 'score',
  result: 'score',
  accuracy: 'score',
  resolved: 'score',
  'pass@1': 'score',
};

function normalizeHeader(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function fieldIndexes(headers: string[]): Map<Field, number> {
  const indexes = new Map<Field, number>();
  headers.forEach((header, index) => {
    const field = HEADER_FIELDS[normalizeHeader(header)];
    if (field !== undefined && !indexes.has(field)) indexes.set(field, index);
  });
  return indexes;
}

function inheritedBenchmark(table: NormalizedTable): string | null {
  const context = table.caption ?? table.sectionHeading;
  if (context === null) return null;
  const cleaned = context
    .replace(/\s+(benchmark\s+)?results?\s*$/i, '')
    .replace(/^evaluation\s+results?\s*[:—-]?\s*/i, '')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function parseScore(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '').replace(/%$/, '');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const score = Number(normalized);
  return Number.isFinite(score) ? score : null;
}

function extractTable(table: NormalizedTable): CandidateProposal[] {
  const indexes = fieldIndexes(table.headers);
  const modelIndex = indexes.get('model');
  const scoreIndex = indexes.get('score');
  if (modelIndex === undefined || scoreIndex === undefined) return [];
  const benchmarkIndex = indexes.get('benchmark');
  const metricIndex = indexes.get('metric');
  const benchmarkContext = inheritedBenchmark(table);
  if (benchmarkIndex === undefined && benchmarkContext === null) return [];
  const metricFromScoreHeader = table.headers[scoreIndex]?.trim() ?? '';
  const scoreHeaderField = normalizeHeader(metricFromScoreHeader);
  const implicitMetric = ['accuracy', 'resolved', 'pass@1'].includes(
    scoreHeaderField,
  )
    ? metricFromScoreHeader
    : null;
  if (metricIndex === undefined && implicitMetric === null) return [];

  return table.rows.flatMap((row, rowIndex) => {
    const modelText = row[modelIndex]?.trim() ?? '';
    const benchmarkText =
      benchmarkIndex === undefined
        ? (benchmarkContext ?? '')
        : (row[benchmarkIndex]?.trim() ?? '');
    const metricText =
      metricIndex === undefined
        ? (implicitMetric ?? '')
        : (row[metricIndex]?.trim() ?? '');
    const scoreDisplay = row[scoreIndex]?.trim() ?? '';
    if (
      [modelText, benchmarkText, metricText, scoreDisplay].some(
        (value) => value.length === 0,
      )
    )
      return [];
    return [
      {
        modelText,
        benchmarkText,
        metricText,
        scoreDisplay,
        scoreValue: parseScore(scoreDisplay),
        evaluationDate: null,
        benchmarkVersionText: benchmarkText,
        configurationProposal:
          scoreHeaderField === 'pass@1' ? { passCount: 1 } : null,
        providerModelIdentifier: null,
        snapshotDate: null,
        evaluatorText: null,
        reportedDate: null,
        evidenceText: row.join(' | '),
        evidenceLocation: `${table.location}, row ${rowIndex + 1}`,
        confidence: 0.9,
      },
    ];
  });
}

export const tableExtractor: CandidateExtractor = {
  name: 'deterministic-table',
  extract(document: NormalizedSourceDocument): Promise<CandidateProposal[]> {
    return Promise.resolve(document.tables.flatMap(extractTable));
  },
};
