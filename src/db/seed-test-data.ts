import type { Selectable } from 'kysely';

import { commitPreparedRecord, prepareRecord } from '../registry/admin.js';
import { compactSearchText, normalizeSearchText } from '../search/normalize.js';
import type { Database } from './database.js';
import { createModel } from './models.js';
import { seedOrganizations } from './seed-organizations.js';
import type { ModelsTable } from './types.js';

async function ensureModel(
  db: Database,
  input: Parameters<typeof createModel>[1],
  modelId: string,
): Promise<Selectable<ModelsTable>> {
  const existing = await db
    .selectFrom('models')
    .selectAll()
    .where('model_id', '=', modelId)
    .executeTakeFirst();
  return existing ?? createModel(db, input);
}

export async function seedTestData(db: Database): Promise<void> {
  await seedOrganizations(db);
  const gpt = await ensureModel(
    db,
    {
      organizationSlug: 'openai',
      officialName: 'GPT-5.5',
      family: 'GPT',
      modelNumber: '55',
      releaseDate: '2026-06-01',
    },
    'OPNAI-55',
  );
  const claude = await ensureModel(
    db,
    {
      organizationSlug: 'anthropic',
      officialName: 'Claude Opus 4.8',
      family: 'Claude',
      modelNumber: '48',
      tierCode: 'O',
    },
    'ANTHR-O48',
  );
  const gemini = await ensureModel(
    db,
    {
      organizationSlug: 'google',
      officialName: 'Gemini 3.5 Flash',
      family: 'Gemini',
      modelNumber: '35',
      tierCode: 'F',
    },
    'GOOGL-G35F',
  );

  for (const alias of ['GPT 5.5', 'gpt_5.5']) {
    await db
      .insertInto('model_aliases')
      .values({
        model_id: gpt.id,
        alias,
        normalized_alias: normalizeSearchText(alias),
        compact_alias: compactSearchText(alias),
        alias_type: 'KNOWN_NAME',
      })
      .onConflict((conflict) =>
        conflict.columns(['model_id', 'alias']).doNothing(),
      )
      .execute();
  }

  const benchmarkInputs = [
    ['deepswe', 'DeepSWE'],
    ['gpqa-diamond', 'GPQA Diamond'],
    ['swe-bench-verified', 'SWE-bench Verified'],
  ] as const;
  const benchmarks = new Map<string, string>();
  for (const [slug, name] of benchmarkInputs) {
    const row = await db
      .insertInto('benchmarks')
      .values({ slug, name, organization_name: null, version: null })
      .onConflict((conflict) => conflict.column('slug').doUpdateSet({ name }))
      .returning('id')
      .executeTakeFirstOrThrow();
    benchmarks.set(slug, row.id);
    await db
      .insertInto('benchmark_versions')
      .values({
        benchmark_id: row.id,
        version_label: null,
        variant_name: null,
        canonical_reference: `${slug}/default`,
        status: 'ACTIVE',
        release_date: null,
        notes: null,
      })
      .onConflict((conflict) =>
        conflict.column('canonical_reference').doNothing(),
      )
      .execute();
  }

  const metricInputs = [
    ['overall', 'Overall'],
    ['accuracy', 'Accuracy'],
    ['resolved', 'Resolved'],
  ] as const;
  const metrics = new Map<string, string>();
  for (const [slug, name] of metricInputs) {
    const row = await db
      .insertInto('metrics')
      .values({ slug, name, unit: null, higher_is_better: true })
      .onConflict((conflict) => conflict.column('slug').doUpdateSet({ name }))
      .returning('id')
      .executeTakeFirstOrThrow();
    metrics.set(slug, row.id);
  }

  const source = await db
    .insertInto('sources')
    .values({
      url: 'https://example.com/benchmark-registry-test-source',
      title: 'Benchmark Registry test fixture source',
      source_type: 'OTHER',
      publisher: 'Example',
      published_date: '2026-06-20',
      accessed_at: new Date('2026-07-11T09:42:00Z'),
    })
    .onConflict((conflict) =>
      conflict.column('url').doUpdateSet({
        title: 'Benchmark Registry test fixture source',
      }),
    )
    .returning(['id', 'url'])
    .executeTakeFirstOrThrow();

  const fixtures = [
    [gpt, 'deepswe', 'overall', '72.4', '2026-06-18'],
    [gpt, 'gpqa-diamond', 'accuracy', '88.1%', '2026-06-19'],
    [gpt, 'swe-bench-verified', 'resolved', '74.0%', '2026-06-20'],
    [claude, 'deepswe', 'overall', '69.2', '2026-06-17'],
    [gemini, 'gpqa-diamond', 'accuracy', '85.0%', '2026-06-16'],
  ] as const;
  for (const [
    model,
    benchmarkSlug,
    metricSlug,
    scoreDisplay,
    date,
  ] of fixtures) {
    const existing = await db
      .selectFrom('benchmark_records')
      .select('id')
      .where('model_id', '=', model.id)
      .where('benchmark_id', '=', benchmarks.get(benchmarkSlug)!)
      .where('metric_id', '=', metrics.get(metricSlug)!)
      .executeTakeFirst();
    if (existing === undefined) {
      const prepared = await prepareRecord(db, {
        modelIdentifier: model.model_id,
        benchmarkSlug,
        metricSlug,
        scoreDisplay,
        scoreValue: Number(scoreDisplay.replace('%', '')),
        evaluationDate: date,
        sourceUrl: source.url,
      });
      await commitPreparedRecord(db, prepared);
    }
  }
}
