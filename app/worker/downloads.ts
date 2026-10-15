// Build-time downloads: the CSV of every published result and /llms.txt. Both
// are generated from the same snapshot as the pages and carry only fields the
// pages already publish.
import type { ResultRow } from "./api";
import { CANONICAL_ORIGIN } from "../src/seo-config";
import { DATA_LICENSE } from "../src/data-license";

export const RESULTS_CSV_PATH = "downloads/benchmark-registry-results.csv";
export const LLMS_TXT_PATH = "llms.txt";

export const RESULTS_CSV_COLUMNS = [
  "registry_no", "model", "company", "benchmark", "benchmark_slug", "benchmark_version", "benchmark_version_slug",
  "configuration", "metric", "metric_unit", "score", "score_display", "score_as_reported", "effort", "provider_effort_label",
  "reporting_basis", "publisher", "source_type", "evaluators", "reported_at", "evaluated_at", "primary_source_url", "record_url",
  "score_setting",
] as const;

function csvField(value: string | null | undefined): string {
  const text = value ?? "";
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function csvRow(row: ResultRow): string[] {
  return [
    row.model.registry_no, row.model.name, row.model.company.name, row.benchmark.name, row.benchmark.slug,
    row.benchmark_version, row.benchmark_version_slug, row.configuration?.label, row.metric.name, row.metric.unit,
    row.score.value, row.score.display, row.score.raw, row.effort, row.reasoning_level,
    row.reporting_basis, row.publisher, row.source_type, row.evaluator_names.join("; "), row.reported_at, row.evaluated_at,
    row.primary_source_url, row.exact_result_href ? CANONICAL_ORIGIN + row.exact_result_href : `${CANONICAL_ORIGIN}/models/${row.model.registry_no}`,
    row.score_setting?.label,
  ].map((value) => csvField(value ?? null));
}

/** One row per published result, ordered by Registry No., benchmark, version and result key. */
export function resultsCsv(rows: ResultRow[]): string {
  const sorted = [...rows].sort((a, b) => Number(a.model.registry_no) - Number(b.model.registry_no)
    || a.benchmark.slug.localeCompare(b.benchmark.slug, "en") || a.benchmark_version_slug.localeCompare(b.benchmark_version_slug, "en")
    || a.result_key.localeCompare(b.result_key, "en"));
  return [RESULTS_CSV_COLUMNS.join(","), ...sorted.map((row) => csvRow(row).join(","))].join("\r\n") + "\r\n";
}

export function llmsText(counts: { models: number; benchmarks: number; versions: number; results: number }): string {
  const number = (value: number) => value.toLocaleString("en-US");
  return `# Benchmark Registry

> A free, open registry of AI models and their benchmark results. Every result links to its primary source and records the benchmark version, metric, reasoning or effort setting, who reported it and when. It is not a leaderboard: there is no ranking and no composite score.

Currently ${number(counts.results)} results across ${number(counts.models)} models, ${number(counts.benchmarks)} benchmarks and ${number(counts.versions)} benchmark versions.

## Sourcing

Results come from primary sources only: the benchmark's or evaluator's own publication first, then the model developer's official model card, technical report or blog. Each result says whether it is self-reported by the developer or independent. When primary sources disagree, both results are kept. Corrections and retractions are logged publicly.

## Pages

- [Models](${CANONICAL_ORIGIN}/models): every model; each model has a stable Registry No. at /models/{registry_no}, e.g. ${CANONICAL_ORIGIN}/models/20012
- [Benchmarks](${CANONICAL_ORIGIN}/benchmarks): benchmark families at /benchmarks/{slug} and versions at /benchmarks/{slug}/{version}
- [Organizations](${CANONICAL_ORIGIN}/companies): model developers at /companies/{slug}
- [Compare](${CANONICAL_ORIGIN}/compare): side-by-side results for two models; popular pairs at /compare/{model}-vs-{model}
- [Recently added](${CANONICAL_ORIGIN}/recent) and the [Atom feed](${CANONICAL_ORIGIN}/feed.xml)
- [Corrections](${CANONICAL_ORIGIN}/corrections): every correction and retraction, with the reason
- [Coverage](${CANONICAL_ORIGIN}/coverage) and [About](${CANONICAL_ORIGIN}/about)

## Data

- [All published results as CSV](${CANONICAL_ORIGIN}/${RESULTS_CSV_PATH}): one row per result with its source URL and record URL
- Licence: [${DATA_LICENSE.name}](${DATA_LICENSE.url}). Credit "Benchmark Registry (benchmarkregistry.org)" and link the record you cite.
- Code (Apache 2.0): https://github.com/rolling7ho/benchmark-registry

## Citing

Cite the model page or the record URL together with the original primary source it links to. Model pages offer plain-text and BibTeX citations.

## Contact

Corrections and missing results: support@benchmarkregistry.org or a GitHub issue.
`;
}
