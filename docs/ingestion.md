# Source-assisted ingestion

**Extraction is not publication.**

Source-assisted ingestion retrieves or reads source material and produces internal temporary proposals. An ingestion candidate is not a public benchmark record, is absent from public search and routes, and receives no Benchmark Record Identifier. Only explicit operator approval may publish one candidate through canonical record creation.

## Pipeline

```text
SOURCE → RETRIEVE → NORMALIZE → EXTRACT CANDIDATES → VALIDATE
       → OPERATOR REVIEW → APPROVE → CANONICAL RECORD CREATION → BENCHMARK RECORD
```

Retrieval or extraction infrastructure failures mark the job `FAILED`. Successfully processed sources with no candidates complete with zero candidates. One candidate's validation errors do not discard other candidates.

## Sources and retrieval

URL and file ingestion require an existing exact canonical source URL and never create sources automatically. Supported content types are HTML, plain text, Markdown, and text-extractable PDF. OCR, browser or login automation, paywall bypass, and anti-bot circumvention are unsupported.

URL retrieval has a 30-second timeout, five-redirect limit, 25 MB response limit, registry-specific user agent, and strict content-type checks. Initial and redirected destinations are resolved and checked. Connection-time DNS is checked again to reject loopback, private, carrier-grade NAT, link-local, multicast, reserved, IPv4-mapped IPv6, and cloud-metadata destinations. URL credentials and non-HTTP protocols are rejected.

Files are limited to 25 MB and `.pdf`, `.txt`, `.md`, `.html`, or `.htm`. PDF signatures and obvious binary text files are checked. Files are never copied into `public`.

## Normalization, extraction, and evidence

HTML normalization removes executable and common navigation content while preserving headings, paragraphs, captions, table headers, rows, nearby context, and locations. Markdown preserves headings and tables. Plain text normalizes newlines. PDF extraction retains page numbers; image-only PDFs require manual handling because OCR is absent.

Tables are first-class structures. The deterministic extractor recognizes a controlled model, benchmark, metric, and score header vocabulary and conservatively inherits benchmark context from headings such as `GPQA Diamond` or `SWE-bench Verified Results`. Rows without sufficient structure are skipped. PDF cell relationships are never fabricated when only page text is available.

Content is chunked by sections or PDF pages for optional extractors, keeping structured tables intact. Every candidate stores concise evidence and a location. Exact proposals within one job are deduplicated using a SHA-256 fingerprint of source, extracted fields, score, and evidence location; distinct evidence locations remain distinct.

## Optional LLM boundary

A small provider-neutral adapter exists, but no concrete LLM provider is configured. The application and normal tests need no API key. The adapter explicitly instructs a provider to use only supplied evidence, infer no dates, versions, or canonical identifiers, preserve score text, and return nothing when evidence is insufficient. All output is untrusted and must pass a strict Zod schema. LLM extraction never publishes records and is not a public-registry dependency.

## Hashing and idempotency

Source bytes receive a SHA-256 hash. A successful prior job for the same source and content blocks a new job by default and reports its `IJ-` reference; `--force` explicitly permits reprocessing. Content idempotency, within-job candidate deduplication, and probable public-record duplicate detection are separate safeguards.

## Canonical resolution and validation

Models resolve by exact Model Identifier, exact official name, exact normalized alias, then exact compact alias. Benchmarks resolve by exact slug, exact name, then controlled exact alias. Metrics resolve by exact slug or name. Ambiguous and unknown identities remain unresolved. General public search, fuzzy matching, and automatic entity creation are forbidden.

Errors cover unresolved entities, missing score display, source or evidence, and invalid values or report types. Warnings cover unknown evaluation dates, absent numeric scores, low extraction confidence, probable duplicates, compact model alias resolution, benchmark alias resolution, and `UNKNOWN` report type. Confidence is extraction confidence only, never truth or credibility confidence, and cannot authorize publication.

Provider reports, system cards, model cards, and provider pages map deterministically to `PROVIDER`; independent evaluations map to `INDEPENDENT`; leaderboards map to `BENCHMARK_OWNER`. Papers and ambiguous sources remain `UNKNOWN`.

## Candidate lifecycle and publication

- `PENDING_REVIEW` — extracted and ready for review.
- `VALIDATION_FAILED` — preserved but blocked until explicit corrections resolve errors.
- `APPROVED` — operator-reviewed transition inside publication.
- `REJECTED` — preserved with evidence and a required reason.
- `PUBLISHED` — linked to the record created by committed publication.

Jobs use internal `IJ-` references and candidates use internal `IC-` references. They are operational references, do not encode provider/model identity, and are not public identifiers.

Approval displays extracted fields, canonical proposals, evidence, warnings, validation errors, and duplicates. Explicit overrides may correct model, benchmark version, evaluation configuration, model snapshot, evaluator, metric, score display/value, evaluation date, reported date, report type, and notes. Exact canonical references are revalidated; changed final values are stored while original evidence remains unchanged.

Candidates may preserve proposed benchmark version, evaluation configuration, provider model identifier, snapshot date, evaluator text, and reported date. These remain proposals. Exact existing canonical context may be resolved, but extraction never creates benchmark versions, configurations, snapshots, or evaluators. An operator must create or select missing context before publication. Source publication date never becomes evaluation date.

Preview and cancellation allocate no public identifier. On confirmation, canonical record creation locks the model, allocates the next sequence, inserts the benchmark record, links the candidate, marks it `PUBLISHED`, and updates registry metadata in one transaction. Rollback consumes no sequence. There is no approve-all, confidence threshold, scheduled publication, or direct candidate insert into `benchmark_records`.

Rejection requires a reason, preserves evidence, and does not update public registry metadata.

## CLI

```sh
pnpm registry ingest source --source "https://example.com/report"
pnpm registry ingest file --file ./report.pdf --source "https://example.com/report.pdf"
pnpm registry ingest list --status REVIEW_REQUIRED --limit 100
pnpm registry ingest show --job IJ-000001
pnpm registry ingest candidates --status PENDING_REVIEW --limit 100
pnpm registry ingest candidate --candidate IC-000001
pnpm registry ingest approve --candidate IC-000001
pnpm registry ingest reject --candidate IC-000001 --reason "Not a model result"
pnpm registry ingest validate
```

Use `--force` only for deliberate identical reprocessing. Probable duplicates require `--allow-possible-duplicate` after review. `registry ingest validate` is read-only and checks reference uniqueness, statuses, source agreement, publication linkage, confidence bounds, rejection reasons, override structure, and published validation state.
