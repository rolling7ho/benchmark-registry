import { sql } from 'kysely';

import type { Database } from '../db/database.js';
import { compactSearchText, normalizeSearchText } from '../search/normalize.js';
import {
  configurationFingerprint,
  normalizeEvaluationConfiguration,
} from '../registry/evaluation-configurations.js';

export interface CandidateResolution {
  modelId: string | null;
  benchmarkSlug: string | null;
  metricSlug: string | null;
  benchmarkVersionReference: string | null;
  configurationReference: string | null;
  snapshotReference: string | null;
  evaluatorSlug: string | null;
  warnings: string[];
}

function uniqueValue<T>(rows: T[]): T | null {
  return rows.length === 1 ? rows[0]! : null;
}

export async function resolveCandidate(
  db: Database,
  input: {
    modelText: string;
    benchmarkText: string;
    metricText: string;
    benchmarkVersionText?: string | null;
    configurationProposal?: Record<string, unknown> | null;
    providerModelIdentifier?: string | null;
    evaluatorText?: string | null;
  },
): Promise<CandidateResolution> {
  const warnings: string[] = [];
  const normalizedModel = normalizeSearchText(input.modelText);
  const identifier = input.modelText.trim().toUpperCase();
  let model = await db
    .selectFrom('models')
    .select(['id', 'model_id as modelId'])
    .where('model_id', '=', identifier)
    .executeTakeFirst();
  if (model === undefined) {
    model = await db
      .selectFrom('models')
      .select(['id', 'model_id as modelId'])
      .where(sql`lower(official_name)`, '=', normalizedModel)
      .executeTakeFirst();
  }
  if (model === undefined) {
    const matches = await db
      .selectFrom('model_aliases')
      .innerJoin('models', 'models.id', 'model_aliases.model_id')
      .select(['models.id', 'models.model_id as modelId'])
      .distinct()
      .where('model_aliases.normalized_alias', '=', normalizedModel)
      .limit(2)
      .execute();
    model = uniqueValue(matches) ?? undefined;
  }
  if (model === undefined) {
    const matches = await db
      .selectFrom('model_aliases')
      .innerJoin('models', 'models.id', 'model_aliases.model_id')
      .select(['models.id', 'models.model_id as modelId'])
      .distinct()
      .where(
        'model_aliases.compact_alias',
        '=',
        compactSearchText(input.modelText),
      )
      .limit(2)
      .execute();
    model = uniqueValue(matches) ?? undefined;
    if (model !== undefined)
      warnings.push('Model resolved through compact alias.');
  }

  const normalizedBenchmark = normalizeSearchText(input.benchmarkText);
  let benchmark = await db
    .selectFrom('benchmarks')
    .select(['id', 'slug', 'name'])
    .where((eb) =>
      eb.or([
        eb(sql`lower(slug)`, '=', normalizedBenchmark),
        eb(sql`lower(name)`, '=', normalizedBenchmark),
      ]),
    )
    .executeTakeFirst();
  if (benchmark === undefined) {
    const aliases = await db
      .selectFrom('benchmark_aliases')
      .innerJoin(
        'benchmarks',
        'benchmarks.id',
        'benchmark_aliases.benchmark_id',
      )
      .select(['benchmarks.id', 'benchmarks.slug', 'benchmarks.name'])
      .distinct()
      .where((eb) =>
        eb.or([
          eb('benchmark_aliases.normalized_alias', '=', normalizedBenchmark),
          eb(
            'benchmark_aliases.compact_alias',
            '=',
            compactSearchText(input.benchmarkText),
          ),
        ]),
      )
      .limit(2)
      .execute();
    benchmark = uniqueValue(aliases) ?? undefined;
    if (benchmark !== undefined)
      warnings.push('Benchmark resolved through alias.');
  }

  const normalizedMetric = normalizeSearchText(input.metricText);
  const metric = await db
    .selectFrom('metrics')
    .select(['id', 'slug'])
    .where((eb) =>
      eb.or([
        eb(sql`lower(slug)`, '=', normalizedMetric),
        eb(sql`lower(name)`, '=', normalizedMetric),
      ]),
    )
    .executeTakeFirst();

  const versionText = input.benchmarkVersionText ?? input.benchmarkText;
  const normalizedVersion = normalizeSearchText(versionText);
  const versions = await db
    .selectFrom('benchmark_versions')
    .innerJoin('benchmarks', 'benchmarks.id', 'benchmark_versions.benchmark_id')
    .select(['benchmark_versions.canonical_reference as reference'])
    .where((eb) =>
      eb.or([
        eb(
          sql`lower(benchmark_versions.canonical_reference)`,
          '=',
          normalizedVersion,
        ),
        eb(
          sql`lower(benchmarks.name || ' ' || coalesce(benchmark_versions.variant_name, benchmark_versions.version_label, ''))`,
          '=',
          normalizedVersion,
        ),
      ]),
    )
    .limit(2)
    .execute();
  let benchmarkVersionReference = uniqueValue(versions)?.reference ?? null;
  if (
    benchmarkVersionReference === null &&
    benchmark !== undefined &&
    (normalizedVersion === normalizeSearchText(benchmark.slug) ||
      normalizedVersion === normalizeSearchText(benchmark.name))
  ) {
    const defaultVersion = await db
      .selectFrom('benchmark_versions')
      .select('canonical_reference as reference')
      .where('benchmark_id', '=', benchmark.id)
      .where('canonical_reference', '=', `${benchmark.slug}/default`)
      .executeTakeFirst();
    benchmarkVersionReference = defaultVersion?.reference ?? null;
  }

  let configurationReference: string | null = null;
  if (
    input.configurationProposal !== null &&
    input.configurationProposal !== undefined
  ) {
    try {
      const proposal = normalizeEvaluationConfiguration(
        input.configurationProposal,
      );
      const existing = await db
        .selectFrom('evaluation_configurations')
        .select('configuration_reference')
        .where(
          'configuration_fingerprint',
          '=',
          configurationFingerprint(proposal),
        )
        .executeTakeFirst();
      configurationReference = existing?.configuration_reference ?? null;
    } catch {
      warnings.push(
        'Evaluation configuration proposal is structurally invalid.',
      );
    }
  }
  let snapshot: { reference: string; modelId: string } | null | undefined;
  if (
    input.providerModelIdentifier === null ||
    input.providerModelIdentifier === undefined ||
    model === undefined
  ) {
    snapshot = undefined;
  } else {
    const matches = await db
      .selectFrom('model_snapshots')
      .select(['snapshot_reference as reference', 'model_id as modelId'])
      .where('provider_model_identifier', '=', input.providerModelIdentifier)
      .where('model_id', '=', model.id)
      .limit(2)
      .execute();
    snapshot = uniqueValue(matches);
  }
  const evaluatorText = input.evaluatorText?.trim().toLowerCase();
  const evaluatorMatches =
    evaluatorText === undefined
      ? []
      : await db
          .selectFrom('evaluators')
          .select('slug')
          .where((eb) =>
            eb.or([
              eb(sql`lower(slug)`, '=', evaluatorText),
              eb(sql`lower(name)`, '=', evaluatorText),
            ]),
          )
          .limit(2)
          .execute();
  const evaluator = uniqueValue(evaluatorMatches);

  return {
    modelId: model?.modelId ?? null,
    benchmarkSlug: benchmark?.slug ?? null,
    metricSlug: metric?.slug ?? null,
    benchmarkVersionReference,
    configurationReference,
    snapshotReference:
      snapshot !== undefined && snapshot !== null ? snapshot.reference : null,
    evaluatorSlug: evaluator?.slug ?? null,
    warnings,
  };
}
