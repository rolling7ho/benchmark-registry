import type { ResultRow } from "../worker/api";
import { CANONICAL_ORIGIN } from "./seo-config";
export const CORRECTION_ISSUE_URL = "https://github.com/rolling7ho/benchmark-registry/issues/new?template=correct-a-result.yml";
export function issueHref({ result, page, model, benchmark, source }: { result?: ResultRow; page: string; model?: string; benchmark?: string; source?: string }): string {
  const title = result ? `Correct result ${result.result_key}: ${result.model.name} — ${result.benchmark.name}` : `Report an issue: ${model ?? benchmark ?? page}`;
  const body = ["Please describe the issue and link to primary evidence.", "", `Record number: ${result?.result_key ?? "(page-level report)"}`,
    `Model: ${result?.model.name ?? model ?? ""}`, `Benchmark: ${result ? result.benchmark.name + " " + result.benchmark_version : benchmark ?? ""}`,
    `Score: ${result?.score.display ?? ""}`, `Source URL: ${result?.primary_source_url ?? source ?? ""}`, `Page URL: ${CANONICAL_ORIGIN}${page}`, "", "What should change and why:"] .join("\n");
  return `https://github.com/rolling7ho/benchmark-registry/issues/new?${new URLSearchParams({title,body})}`;
}
export function resultPage(row: ResultRow): string {
  return `/benchmarks/${row.benchmark.slug}/${row.benchmark_version_slug}?view=history&result=${row.result_key}`;
}
