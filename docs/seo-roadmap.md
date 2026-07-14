# Benchmark Registry SEO Roadmap

## Objective

Improve qualified non-brand discovery, total organic traffic, and branded search presentation while preserving Benchmark Registry as a server-rendered institutional records system.

Measurement uses Google Search Console as the SEO source of truth and the existing Vercel Insights integration for aggregate site behavior. No GA4 or additional analytics JavaScript is planned.

## Ten phases

1. **Baseline and repairs:** repair the homepage heading invariant and production SEO audit; verify Search Console ownership; submit the sitemap; capture a dated baseline.
2. **Crawl and indexing policy:** centralize indexability, canonical, redirect, and not-found behavior; keep search and filter variants out of the index and sitemaps.
3. **Information architecture:** add visible breadcrumbs and deterministic internal links between organizations, models, benchmarks, versions, sources, and records.
4. **Search intent and templates:** improve unique titles, descriptions, headings, and visible summaries using stored facts only.
5. **Structured data:** publish accurate `WebSite`, `Organization`, registry-level `Dataset`, `WebPage`, and `BreadcrumbList` JSON-LD.
6. **Registry-first content:** add focused About and Methodology pages and expand documentation with a data dictionary and record-reading guidance.
7. **Page experience:** measure and improve LCP, INP, and CLS without changing the registry table information architecture or adding unnecessary JavaScript.
8. **Search appearance:** provide a stable favicon, organization logo, social preview, consistent site name, and complete Open Graph metadata.
9. **Quality gates:** expand deterministic, integration, and live SEO audits for headings, metadata, canonicals, robots, structured data, links, sitemaps, assets, and URL leakage.
10. **Rollout and iteration:** deploy in controlled groups, inspect representative URLs, annotate changes, and review performance weekly for four weeks, biweekly through day 90, then monthly.

## Ninety-day scorecard

- Increase qualified non-brand impressions to entity and record pages by at least 30% and clicks by at least 20%.
- Increase total Google organic clicks by at least 20%.
- Maintain the correct site name and favicon and improve branded-query CTR by at least 0.5 percentage points where sufficient impressions exist.
- Maintain zero critical canonical, indexing, sitemap, structured-data, or crawl errors.
- Achieve good Core Web Vitals for at least 75% of measured visits: LCP at or below 2.5 seconds, INP below 200 milliseconds, and CLS below 0.1.
- Preserve identifier, exact-search, mobile table, and no-JavaScript invariants.

## Constraints

- No frontend framework, blog platform, dedicated search engine, AI feature, or architecture expansion.
- No speculative comparison or ranking content.
- Unknown metadata remains unknown.
- Published identifiers remain stable.
- Dynamic registry HTML is never cached as immutable.
- Tables remain tables on mobile, and Model ID remains visible.

## Primary references

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google Search Console guidance](https://developers.google.com/search/docs/monitor-debug/search-console-start)
- [Canonicalization guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Faceted navigation guidance](https://developers.google.com/crawling/docs/faceted-navigation)
- [Structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals)
- [Helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
