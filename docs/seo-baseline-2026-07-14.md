# SEO Baseline — 2026-07-14

## Status

This is the pre-rollout technical baseline for the SEO changes in `docs/seo-roadmap.md`. Production was probed on 2026-07-14 from the Philippines timezone before these changes were deployed.

Google Search Console metrics are intentionally marked pending. The automated browser connection failed before Search Console could be opened, so domain ownership, sitemap submission, index coverage, search performance, manual actions, security issues, and Core Web Vitals were not verified. Do not treat those account-level tasks as complete until the confirmations below are recorded.

## Verified production transport and crawl surfaces

| Surface                              | Baseline result                     |
| ------------------------------------ | ----------------------------------- |
| `https://www.benchmarkregistry.org/` | `200`                               |
| `https://benchmarkregistry.org/`     | `308` to the canonical `www` origin |
| `/robots.txt`                        | `200`, `text/plain`                 |
| `/sitemap.xml`                       | `200`, `application/xml`            |

## Pre-rollout search presentation sample

| Route class  | Route                                                | Status | Title                                                                             | H1 count | Canonical                            |
| ------------ | ---------------------------------------------------- | -----: | --------------------------------------------------------------------------------- | -------: | ------------------------------------ |
| Homepage     | `/`                                                  |    200 | Benchmark Registry                                                                |        0 | `https://www.benchmarkregistry.org/` |
| Model        | `/models/opnai-4`                                    |    200 | GPT-4 Benchmark Results & Scores \| Benchmark Registry                            |        1 | self                                 |
| Benchmark    | `/benchmarks/aa-intelligence-index`                  |    200 | Artificial Analysis Intelligence Index AI Benchmark Results \| Benchmark Registry |        1 | self                                 |
| Version      | `/benchmarks/aa-intelligence-index/versions/default` |    200 | Artificial Analysis Intelligence Index: Unspecified Results \| Benchmark Registry |        1 | self                                 |
| Organization | `/organizations/openai`                              |    200 | OpenAI Models and Benchmark Records \| Benchmark Registry                         |        1 | self                                 |
| Record       | `/records/BR-0014-001`                               |    200 | GPT-4 on Artificial Analysis Intelligence Index: 7 Overall \| Benchmark Registry  |        1 | self                                 |

All sampled pages returned `index,follow`. The missing homepage H1 was the known failing invariant repaired by this rollout.

## Search Console baseline

Use the full 90-day period immediately before the completed rollout as the comparison window. Export both the Search results report and Page indexing report before recording values here.

| Metric                      | Baseline | Source/export                  |
| --------------------------- | -------: | ------------------------------ |
| Total Google clicks         |  Pending | Search results                 |
| Total Google impressions    |  Pending | Search results                 |
| Overall CTR                 |  Pending | Search results                 |
| Average position            |  Pending | Search results                 |
| Non-brand clicks            |  Pending | Query export, classified below |
| Non-brand impressions       |  Pending | Query export, classified below |
| Brand clicks                |  Pending | Query export, classified below |
| Brand impressions           |  Pending | Query export, classified below |
| Valid indexed pages         |  Pending | Page indexing                  |
| Excluded/not-indexed pages  |  Pending | Page indexing                  |
| Good Core Web Vitals visits |  Pending | Core Web Vitals                |

Classify a query as branded when it clearly refers to Benchmark Registry or its domain, including spelling and spacing variants of `benchmark registry` and `benchmarkregistry.org`. Keep the raw export and classification column so the split is auditable. Everything else remains non-brand; do not classify model, benchmark, organization, or metric names as brand terms.

Break down the export by:

- Query and branded/non-brand class.
- Page and route class: homepage, model, benchmark, version, organization, record, index, documentation/trust, other.
- Country.
- Device.

## Search Console completion checklist

1. Create a Domain property for `benchmarkregistry.org`.
2. Add the exact TXT verification record supplied by Search Console at the domain DNS provider.
3. Confirm ownership in Search Console and record the verifying Google account and confirmation date in the private operations log. Do not store account details or DNS secrets in this repository.
4. Submit `https://www.benchmarkregistry.org/sitemap.xml` after this rollout is deployed.
5. Confirm the sitemap status is successful and record the discovered URL count.
6. Inspect the homepage plus one model, benchmark, version, organization, and record URL.
7. Review Page indexing, canonical selection, Manual actions, Security issues, Crawl stats, and Core Web Vitals.
8. Export the baseline tables above and retain the original CSV files outside the public repository if they contain account-specific data.
9. Annotate the deployment date in the 90-day scorecard.

## Performance baseline

No verified field Core Web Vitals baseline was available during implementation. The PageSpeed Insights API returned a quota response during the initial check, and local request timing is not a substitute for CrUX field data or a controlled Lighthouse run.

After deployment, collect:

- Search Console Core Web Vitals at the 75th percentile.
- PageSpeed Insights or CrUX field data when available.
- Controlled mobile and desktop Lighthouse runs for the sampled routes above.
- Server response and database query profiles for the homepage and representative detail pages.

Targets remain LCP at or below 2.5 seconds, INP below 200 milliseconds, and CLS below 0.1.

## Release annotations

| Date    | Release group                                                                                                | Deployment | Search Console checks | Notes                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------ | ---------- | --------------------- | ------------------------------------------------------------------- |
| Pending | Heading, crawl policy, linking, templates, structured data, trust pages, performance scope, and brand assets | Pending    | Pending               | Local implementation and automated validation completed 2026-07-14. |
