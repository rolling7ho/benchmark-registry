import fs from 'node:fs';

import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/db/database.js';
import { configurationFingerprint } from '../src/registry/evaluation-configurations.js';
import { commitPreparedBatch, type PreparedRecord } from '../src/registry/admin.js';
import { formatBenchmarkDisplay } from '../src/registry/benchmark-display.js';

const SCRATCH =
  '/private/tmp/claude-501/-Users-ivanuy-Desktop-Projects-active-projects-benchmark-registry/5a4b2356-b0e9-4428-9150-daf94c0e1a3c/scratchpad';
const LEADERBOARD_URL = 'https://artificialanalysis.ai/leaderboards/models';
const DRY_RUN = process.argv.includes('--dry-run');

interface FieldMapping {
  benchmarkSlug: string;
  versionRef: string;
  metricSlug: string;
  isFraction: boolean; // multiply by 100 and append % if true
}

const FIELD_MAP: Record<string, FieldMapping> = {
  intelligenceIndex: { benchmarkSlug: 'aa-intelligence-index', versionRef: 'aa-intelligence-index/default', metricSlug: 'overall', isFraction: false },
  gpqa: { benchmarkSlug: 'gpqa', versionRef: 'gpqa/diamond', metricSlug: 'accuracy', isFraction: true },
  hle: { benchmarkSlug: 'humanitys-last-exam', versionRef: 'humanitys-last-exam/no-tools', metricSlug: 'overall', isFraction: true },
  scicode: { benchmarkSlug: 'scicode', versionRef: 'scicode/default', metricSlug: 'overall', isFraction: true },
  tau2: { benchmarkSlug: 'tau2-bench', versionRef: 'tau2-bench/default', metricSlug: 'overall', isFraction: true },
  tauBanking: { benchmarkSlug: 'tau3-banking', versionRef: 'tau3-banking/default', metricSlug: 'overall', isFraction: true },
  terminalbenchHard: { benchmarkSlug: 'terminal-bench-hard', versionRef: 'terminal-bench-hard/default', metricSlug: 'overall', isFraction: true },
  terminalbenchV21: { benchmarkSlug: 'terminal-bench', versionRef: 'terminal-bench/2-1', metricSlug: 'overall', isFraction: true },
  critpt: { benchmarkSlug: 'critpt', versionRef: 'critpt/default', metricSlug: 'overall', isFraction: true },
  omniscience: { benchmarkSlug: 'aa-omniscience', versionRef: 'aa-omniscience/default', metricSlug: 'overall', isFraction: false },
  omniscienceAccuracy: { benchmarkSlug: 'aa-omniscience', versionRef: 'aa-omniscience/default', metricSlug: 'accuracy', isFraction: true },
  ifbench: { benchmarkSlug: 'ifbench', versionRef: 'ifbench/default', metricSlug: 'overall', isFraction: true },
  apexAgents: { benchmarkSlug: 'apex-agents', versionRef: 'apex-agents/default', metricSlug: 'overall', isFraction: true },
  itbenchSre: { benchmarkSlug: 'itbench-sre', versionRef: 'itbench-sre/default', metricSlug: 'overall', isFraction: true },
  gdpvalNormalized: { benchmarkSlug: 'gdpval-aa', versionRef: 'gdpval-aa/default', metricSlug: 'avg-normalized-score', isFraction: true },
  mmmuPro: { benchmarkSlug: 'mmmu-pro', versionRef: 'mmmu-pro/default', metricSlug: 'overall', isFraction: true },
  lcr: { benchmarkSlug: 'aa-lcr', versionRef: 'aa-lcr/default', metricSlug: 'overall', isFraction: true },
};

const groups = JSON.parse(fs.readFileSync(`${SCRATCH}/stage2-parsed.json`, 'utf8'));
const modelIdByGroupKey = new Map<string, string>(
  JSON.parse(fs.readFileSync(`${SCRATCH}/stage3-model-ids.json`, 'utf8')),
);
const configData = JSON.parse(fs.readFileSync(`${SCRATCH}/stage4-config-refs.json`, 'utf8'));
const configRefByFingerprint = new Map<string, string>(configData.byFingerprint);
const unspecifiedReference: string = configData.unspecifiedReference;

const env = loadEnvironment();
const db = createDatabase(env.DATABASE_URL);

// ---- bulk-load reference entities ----
const orgs = await db.selectFrom('organizations').selectAll().execute();
const orgById = new Map(orgs.map((o) => [o.id, o]));

const modelIdentifiers = [...new Set(modelIdByGroupKey.values())];
const modelRows = await db
  .selectFrom('models')
  .select(['id', 'model_id', 'official_name', 'record_prefix', 'organization_id'])
  .where('model_id', 'in', modelIdentifiers)
  .execute();
const modelByIdentifier = new Map(modelRows.map((m) => [m.model_id, m]));

const neededBenchmarkSlugs = [...new Set(Object.values(FIELD_MAP).map((f) => f.benchmarkSlug))];
const benchmarkRows = await db
  .selectFrom('benchmarks')
  .select(['id', 'slug', 'name'])
  .where('slug', 'in', neededBenchmarkSlugs)
  .execute();
const benchmarkBySlug = new Map(benchmarkRows.map((b) => [b.slug, b]));

const neededVersionRefs = [...new Set(Object.values(FIELD_MAP).map((f) => f.versionRef))];
const versionRows = await db
  .selectFrom('benchmark_versions')
  .select(['id', 'benchmark_id', 'canonical_reference', 'version_label', 'variant_name'])
  .where('canonical_reference', 'in', neededVersionRefs)
  .execute();
const versionByRef = new Map(versionRows.map((v) => [v.canonical_reference, v]));

const neededMetricSlugs = [...new Set(Object.values(FIELD_MAP).map((f) => f.metricSlug))];
const metricRows = await db
  .selectFrom('metrics')
  .select(['id', 'slug', 'name'])
  .where('slug', 'in', neededMetricSlugs)
  .execute();
const metricBySlug = new Map(metricRows.map((m) => [m.slug, m]));

const evaluatorRow = await db
  .selectFrom('evaluators')
  .select(['id', 'slug', 'name', 'evaluator_type'])
  .where('slug', '=', 'artificial-analysis')
  .executeTakeFirstOrThrow();

const sourceRow = await db
  .selectFrom('sources')
  .select(['id', 'url', 'title', 'source_type'])
  .where('url', '=', LEADERBOARD_URL)
  .executeTakeFirstOrThrow();

const allConfigRows = await db
  .selectFrom('evaluation_configurations')
  .select(['id', 'configuration_reference', 'configuration_fingerprint', 'is_unspecified'])
  .execute();
const configByReference = new Map(allConfigRows.map((c) => [c.configuration_reference, c]));

// sanity: everything we need must exist
for (const slug of neededBenchmarkSlugs) {
  if (!benchmarkBySlug.has(slug)) throw new Error(`missing benchmark ${slug}`);
}
for (const ref of neededVersionRefs) {
  if (!versionByRef.has(ref)) throw new Error(`missing benchmark version ${ref}`);
}
for (const slug of neededMetricSlugs) {
  if (!metricBySlug.has(slug)) throw new Error(`missing metric ${slug}`);
}

// ---- pre-check: existing ACTIVE records per (model, benchmark, metric) to avoid duplicating prior session's data ----
const existingActive = await db
  .selectFrom('benchmark_records')
  .select(['model_id', 'benchmark_id', 'metric_id'])
  .where('status', '=', 'ACTIVE')
  .execute();
const existingKeySet = new Set(
  existingActive.map((r) => `${r.model_id}|${r.benchmark_id}|${r.metric_id}`),
);

const REPORTED_DATE = '2026-07-13';

function formatScore(raw: number, isFraction: boolean): { display: string; value: number | null } {
  const scaled = isFraction ? raw * 100 : raw;
  const rounded = Math.round(scaled * 10) / 10;
  const display = isFraction ? `${rounded}%` : `${rounded}`;
  const value = rounded > 0 ? rounded : null; // validOptionalScore rejects <= 0
  return { display, value };
}

const prepared: PreparedRecord[] = [];
const skippedExisting: string[] = [];
const skippedMissingModel: string[] = [];
let candidateCount = 0;

for (const g of groups) {
  const key = `${g.orgSlug}|||${g.canonicalName}`;
  const modelIdentifier = modelIdByGroupKey.get(key);
  if (modelIdentifier === undefined) {
    skippedMissingModel.push(key);
    continue;
  }
  const model = modelByIdentifier.get(modelIdentifier);
  if (model === undefined) {
    skippedMissingModel.push(key);
    continue;
  }
  const org = orgById.get(model.organization_id)!;

  for (const variant of g.variants) {
    const raw = variant.raw;
    const config = variant.config;

    let configuration;
    let configLabel: string;
    if (config === null) {
      configuration = configByReference.get(unspecifiedReference)!;
      configLabel = 'default';
    } else {
      const fp = configurationFingerprint({
        reasoningMode: config.reasoningMode ?? null,
        reasoningEffort: config.reasoningEffort ?? null,
        additionalConfiguration: config.additional != null ? { note: config.additional } : {},
      });
      const ref = configRefByFingerprint.get(fp);
      if (ref === undefined) throw new Error(`missing config for fingerprint ${fp}`);
      configuration = configByReference.get(ref)!;
      configLabel = config.label;
    }

    for (const [field, mapping] of Object.entries(FIELD_MAP)) {
      const rawValue = raw[field];
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) continue;
      candidateCount++;

      const benchmark = benchmarkBySlug.get(mapping.benchmarkSlug)!;
      const version = versionByRef.get(mapping.versionRef)!;
      const metric = metricBySlug.get(mapping.metricSlug)!;

      const existingKey = `${model.id}|${benchmark.id}|${metric.id}`;
      if (existingKeySet.has(existingKey)) {
        skippedExisting.push(`${model.model_id} ${benchmark.slug} ${metric.slug}`);
        continue;
      }

      const { display, value } = formatScore(rawValue, mapping.isFraction);
      const notes = `${g.canonicalName} (${configLabel}) configuration. Sourced from the Artificial Analysis LLM Leaderboard (${LEADERBOARD_URL}), an independent evaluation, not ${org.name}'s own reporting.`;

      prepared.push({
        input: {
          scoreDisplay: display,
          scoreValue: value,
          evaluationDate: null,
          reportedDate: REPORTED_DATE,
          reportType: 'INDEPENDENT',
          notes,
        },
        model: {
          id: model.id,
          modelId: model.model_id,
          name: model.official_name,
          recordPrefix: model.record_prefix,
        },
        benchmark: { id: benchmark.id, slug: benchmark.slug, name: benchmark.name },
        benchmarkVersion: {
          id: version.id,
          canonicalReference: version.canonical_reference,
          versionLabel: version.version_label,
          variantName: version.variant_name,
          displayName: formatBenchmarkDisplay({
            familyName: benchmark.name,
            versionLabel: version.version_label,
            variantName: version.variant_name,
          }),
        },
        configuration: {
          id: configuration.id,
          reference: configuration.configuration_reference,
          fingerprint: configuration.configuration_fingerprint,
          isUnspecified: configuration.is_unspecified,
        },
        snapshot: null,
        evaluator: {
          id: evaluatorRow.id,
          slug: evaluatorRow.slug,
          name: evaluatorRow.name,
          type: evaluatorRow.evaluator_type,
        },
        metric: { id: metric.id, slug: metric.slug, name: metric.name },
        source: {
          id: sourceRow.id,
          url: sourceRow.url,
          title: sourceRow.title,
          type: sourceRow.source_type,
        },
        possibleDuplicates: [],
      });
    }
  }
}

console.log('candidate field values found:', candidateCount);
console.log('skipped (missing model mapping):', skippedMissingModel.length);
console.log('skipped (already has active record for model+benchmark+metric):', skippedExisting.length);
console.log('prepared records to insert:', prepared.length);

// breakdown by benchmark
const byBenchmark = new Map<string, number>();
for (const p of prepared) {
  byBenchmark.set(p.benchmark.slug, (byBenchmark.get(p.benchmark.slug) ?? 0) + 1);
}
console.log('\nbreakdown by benchmark:');
for (const [slug, count] of [...byBenchmark.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(' ', slug, count);
}

if (DRY_RUN) {
  console.log('\nsample records:');
  for (const p of prepared.slice(0, 3).concat(prepared.slice(2000, 2003))) {
    console.log(
      JSON.stringify(
        {
          model: p.model.modelId,
          benchmark: p.benchmark.slug,
          version: p.benchmarkVersion.canonicalReference,
          metric: p.metric.slug,
          scoreDisplay: p.input.scoreDisplay,
          scoreValue: p.input.scoreValue,
          config: p.configuration.reference,
          notes: p.input.notes,
        },
        null,
        0,
      ),
    );
  }
  console.log('\nDRY RUN — no records written.');
  await db.destroy();
  process.exit(0);
}

const BATCH_SIZE = 150;
let totalCreated = 0;
for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
  const batch = prepared.slice(i, i + BATCH_SIZE);
  const created = await commitPreparedBatch(db, batch);
  totalCreated += created.length;
  console.log(`committed batch ${i / BATCH_SIZE + 1}: ${created.length} records (total ${totalCreated}/${prepared.length})`);
}

console.log('DONE. total records created:', totalCreated);
await db.destroy();
