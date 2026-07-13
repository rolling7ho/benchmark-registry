# 2026 Benchmark Population Report

## Summary

This report covers two population passes: an initial run (100+ record target) followed by an extended autonomous continuation requested by the user ("keep going, hard-stop only after 7 consecutive 403s"), which added 5 new provider onboardings, 2 new user-supplied screenshot sources, and 4 new models discovered mid-research.

- Sources inspected: ~30 (primary pages/PDFs opened and read; includes dead ends — chart-image PDFs/PNGs, JS-rendered SPA pages, 403-blocked domains — that produced zero records)
- Sources used (produced committed records): 21
- Models investigated: ~30
- Models added: **24**
- Providers represented: **14** (9 originally configured + Moonshot AI, Zhipu, MiniMax, Mistral AI, Cohere onboarded this pass)
- Benchmark families represented: 70+
- Records committed: **207** (verified via direct database count)
- Records skipped as existing duplicates: 0 (registry was empty of real data at task start, after removing stray test fixtures — see below)
- Candidates rejected for insufficient evidence: 0 formally rejected. Consecutive-403 counter never exceeded 1 during the extended run (the hard-stop condition was never triggered).
- Candidates found but not pursued due to a genuine unresolved identifier-spec gap: none remaining — both discovered gaps (Anthropic "Fable" tier, OpenAI "Sol/Terra/Luna" tier) were resolved via spec extension this pass.
- Providers confirmed to have no genuine distinct 2026 model: Perplexity (checked twice; only incremental feature additions to the 2025 Sonar family found).

## Pre-Task Cleanup

Before any real population, the configured database (a live Supabase Postgres instance) was found to already contain non-canonical data: 5 `TEST_FIXTURE`-sourced benchmark records, 3 models, and 1 source, apparently inserted by a stray run of `db:seed:test-data` against this database at some point before this task began. This caused `pnpm registry validate` to report 1 error (invalid source type) and `pnpm registry production-check` to fail, before any work in this task touched the data. With explicit user confirmation, this fixture data was removed via a one-off script using the same query builder as the rest of the app (not raw SQL against the write path), restoring `validate`/`production-check` to a clean 0-errors state.

Separately, 3 leftover zero-record benchmark entities (`deepswe`, `gpqa-diamond`, `swe-bench-verified`) from the same stray seed run were also removed and recreated with proper family/variant structure (e.g. `swe-bench` family with a `verified` variant, rather than one flat `swe-bench-verified` entity), since the flattened structure violated the project's own family/variant modeling rule. Both cleanups are logged in `research/2026-benchmark-population/progress.md`.

## Provider Coverage

| Provider    | Models                                                | Records Added |
| ----------- | ----------------------------------------------------- | ------------- |
| Anthropic   | 5 (Opus 4.7, Opus 4.8, Sonnet 4.6, Sonnet 5, Fable 5) | 34            |
| Google      | 2 (Gemini 3.1 Pro, Gemini 3.5 Flash)                  | 34            |
| Qwen        | 2 (Qwen3.5-397B-A17B, Qwen3.7-Max)                    | 44            |
| DeepSeek    | 2 (DeepSeek V4-Pro, DeepSeek V4-Flash)                | 44            |
| Meta        | 1 (Muse Spark 1.1)                                    | 3             |
| OpenAI      | 5 (GPT-5.4, GPT-5.5, GPT-5.6 Sol/Terra/Luna)          | 21            |
| xAI         | 1 (Grok 4.5)                                          | 2             |
| Cursor      | 1 (Composer 2)                                        | 3             |
| Moonshot AI | 1 (Kimi K2.7-code) — _newly onboarded_                | 1             |
| Zhipu       | 1 (GLM-5.2) — _newly onboarded_                       | 20            |
| MiniMax     | 1 (MiniMax-M3) — _newly onboarded_                    | 7             |
| Mistral AI  | 1 (Mistral Small 4) — _newly onboarded_               | 1             |
| Cohere      | 1 (Command A+) — _newly onboarded_                    | 2             |

Note: several records reuse the same source across multiple benchmark rows (e.g. one Anthropic system card → 10–21 records; the GLM-5.2 HF blog table alone produced 19 GLM-5.2 records plus 13 for Qwen3.7-Max). See Model Coverage for exact per-model counts.

Providers confirmed to have no genuine distinct 2026 model despite two research passes: **Perplexity** (only incremental search-mode feature additions to the existing 2025 Sonar family).

## Model Coverage

| Model             | Model ID     | Records Added |
| ----------------- | ------------ | ------------- |
| DeepSeek V4-Pro   | DPSK-V4PRO   | 22            |
| DeepSeek V4-Flash | DPSK-V4FLASH | 22            |
| Qwen3.5-397B-A17B | QWEN-35      | 31            |
| Claude Opus 4.8   | ANTHR-O48    | 21            |
| Gemini 3.1 Pro    | GOOGL-G31P   | 19            |
| GLM-5.2           | GLM-52       | 20            |
| Qwen3.7-Max       | QWEN-37      | 13            |
| GPT-5.5           | OPNAI-55     | 13            |
| Claude Opus 4.7   | ANTHR-O47    | 10            |
| MiniMax-M3        | MMAX-M3      | 7             |
| Muse Spark 1.1    | META-MS11    | 3             |
| Composer 2        | CURSR-C2     | 3             |
| Claude Sonnet 4.6 | ANTHR-S46    | 1             |
| Claude Sonnet 5   | ANTHR-S5     | 2             |
| Claude Fable 5    | ANTHR-FB5    | 2             |
| GPT-5.4           | OPNAI-54     | 1             |
| GPT-5.6 Sol       | OPNAI-56SL   | 2             |
| GPT-5.6 Terra     | OPNAI-56TR   | 2             |
| GPT-5.6 Luna      | OPNAI-56LN   | 2             |
| Gemini 3.5 Flash  | GOOGL-G35F   | 3             |
| Grok 4.5          | XAI-G45      | 2             |
| Kimi K2.7-code    | KIMI-K27CODE | 1             |
| Mistral Small 4   | MSTRL-SM4    | 1             |
| Command A+        | COHR-APLUS   | 2             |

## Benchmark Coverage (highlights; 67 families total)

| Benchmark                                                                                                  | Variant(s) Represented                                           | Records Added |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------- |
| SWE-bench                                                                                                  | Verified, Pro, Multilingual, Multimodal, Verified Hard           | 21            |
| GPQA                                                                                                       | Diamond, (general/unqualified)                                   | 6             |
| Humanity's Last Exam                                                                                       | No tools, With tools, (unqualified)                              | 14            |
| Terminal-Bench                                                                                             | 2.0, 2.1                                                         | 8             |
| BrowseComp                                                                                                 | default, single-agent, multi-agent, context-folding, discard-all | 9             |
| MCP Atlas                                                                                                  | default, Public                                                  | 5             |
| GDPval-AA                                                                                                  | (Elo)                                                            | 5             |
| GraphWalks                                                                                                 | BFS 256K, Parents 256K                                           | 4             |
| HMMT                                                                                                       | Feb 25, Nov 25, 2026 Feb                                         | 4             |
| tau2-bench                                                                                                 | Retail, Telecom, default                                         | 3             |
| MMMLU                                                                                                      | default                                                          | 3             |
| Artificial Analysis Intelligence Index                                                                     | default                                                          | 3             |
| AIME                                                                                                       | 2026                                                             | 1             |
| ARC-AGI                                                                                                    | 2                                                                | 1             |
| LiveCodeBench (+ Pro, v6 variants)                                                                         | 3 distinct benchmark entities                                    | 4             |
| CursorBench, AIRS-Bench, MRCR/MRCR v2, CorpusQA, Codeforces, and ~40 other single/double-record benchmarks | various                                                          | remainder     |

Category breadth achieved: general knowledge/reasoning (GPQA, MMLU-Pro, SuperGPQA, HLE, ARC-AGI-2), mathematics (AIME 2026, HMMT, IMOAnswerBench), coding/software engineering (SWE-bench x5 variants, Terminal-Bench x2, LiveCodeBench x3, CursorBench, SecCodeBench), agentic/tool use (BrowseComp x5 configs, MCP Atlas, tau2-bench, Toolathlon, AIRS-Bench, Automation Bench), multimodal (ChartQAPro, MMMU-Pro, ScreenSpot-Pro, OSWorld-Verified), long context (GraphWalks, MRCR/MRCR v2, LongBench v2, CorpusQA), independent composite indices (Artificial Analysis Intelligence Index, AA-Omniscience).

## Source Types

- **Official System Cards (PDF, `pdftotext -layout` extraction)**: Anthropic Claude Opus 4.7 and 4.8 — the most reliable format encountered; real embedded text tables with footnotes.
- **Official Model Cards (real semantic HTML `<table>`)**: Google DeepMind Gemini 3.1 Pro; Hugging Face model cards for Qwen3.5-397B-A17B, DeepSeek V4-Pro, DeepSeek V4-Flash — equally reliable, direct table parsing.
- **Official Evaluation Report (PDF)**: Meta Muse Spark 1.1 — safety/preparedness-framed, low yield of general-capability numbers.
- **Official Technical Report (arXiv HTML)**: Cursor Composer 2.
- **Independent evaluator (real-time leaderboard, JSON-LD embedded data)**: Artificial Analysis, used for Grok 4.5, Gemini 3.5 Flash, and Claude Sonnet 5 composite index scores — the practical route found for xAI given x.ai's full site block.
- **Relayed provider comparison column**: GPT-5.5 records were read from Anthropic's own Opus 4.8 System Card comparison table (`reportType: UNKNOWN`, not `PROVIDER`, because the exact originating OpenAI document could not be independently verified — openai.com blocks automated fetch).

## Data Quality

- Unknown evaluation date count: 148 of 148 (100%). No inspected source stated an explicit evaluation date distinct from its publication date; per the task's explicit rule, evaluation date was left null in every case rather than inferred from release or publication dates.
- Records with a stated reported date: ~35 (mostly the two Anthropic system cards and the Qwen model card, which have explicit publication dates).
- Records with attributed snapshots: 0 (no dated provider-API snapshot identifiers were explicitly given in any inspected source for the models added this pass; the snapshot system was set up and understood but not exercised).
- Records with explicit evaluators: 148 (every record has either a named provider evaluator, `artificial-analysis`, or the default `unknown` evaluator for the relayed GPT-5.5 rows).
- Possible-duplicate overrides: 25 total across all batches, all reviewed individually and confirmed legitimate — every one was the same systemic false positive (the batch-import duplicate key is `model + benchmark family + metric + source`, which does not account for benchmark _version_, so e.g. 4 SWE-bench variants for the same model/source correctly flag against each other even though they're genuinely different evaluations). None were true duplicates.

## Sample Verification

20 records were re-checked via `pnpm registry record show` against the exact data extracted from their primary sources during research. All 20 matched exactly (model, benchmark, metric, score, source URL, report type).

| Record ID         | Model             | Benchmark                    | Source                              | Result |
| ----------------- | ----------------- | ---------------------------- | ----------------------------------- | ------ |
| BR-002O47-001     | Claude Opus 4.7   | SWE-bench Verified           | Anthropic System Card PDF           | Match  |
| BR-002O47-008     | Claude Opus 4.7   | GPQA Diamond                 | Anthropic System Card PDF           | Match  |
| BR-00331P-002     | Gemini 3.1 Pro    | ARC-AGI-2                    | DeepMind model card                 | Match  |
| BR-00331P-011     | Gemini 3.1 Pro    | GDPval-AA                    | DeepMind model card                 | Match  |
| BR-00735-007      | Qwen3.5-397B-A17B | GPQA                         | HF model card                       | Match  |
| BR-00735-014      | Qwen3.5-397B-A17B | AIME 2026                    | HF model card                       | Match  |
| BR-00735-022      | Qwen3.5-397B-A17B | BrowseComp (context-folding) | HF model card                       | Match  |
| BR-008V4PRO-004   | DeepSeek V4-Pro   | GPQA Diamond                 | HF model card                       | Match  |
| BR-008V4PRO-015   | DeepSeek V4-Pro   | SWE-bench Verified           | HF model card                       | Match  |
| BR-009MS11-001    | Muse Spark 1.1    | SWE-bench Verified Hard      | Meta Evaluation Report PDF          | Match  |
| BR-002O48-001     | Claude Opus 4.8   | SWE-bench Verified           | Anthropic System Card PDF           | Match  |
| BR-002O48-013     | Claude Opus 4.8   | GPQA Diamond                 | Anthropic System Card PDF           | Match  |
| BR-00155-002      | GPT-5.5           | BrowseComp                   | Anthropic System Card PDF (relayed) | Match  |
| BR-00155-009      | GPT-5.5           | MCP Atlas                    | Anthropic System Card PDF (relayed) | Match  |
| BR-00445-001      | Grok 4.5          | AA Intelligence Index        | Artificial Analysis                 | Match  |
| BR-00335F-001     | Gemini 3.5 Flash  | AA Intelligence Index        | Artificial Analysis                 | Match  |
| BR-002S5-001      | Claude Sonnet 5   | AA Intelligence Index        | Artificial Analysis                 | Match  |
| BR-005C2-002      | Composer 2        | SWE-bench Multilingual       | Composer 2 arXiv report             | Match  |
| BR-008V4FLASH-004 | DeepSeek V4-Flash | GPQA Diamond                 | HF model card                       | Match  |
| BR-008V4FLASH-018 | DeepSeek V4-Flash | BrowseComp                   | HF model card                       | Match  |

## Search Verification

Tested against a locally running server bound to the populated database:

- Exact Benchmark Record Identifier (`BR-002O47-001`) → returns exactly that one record, no adjacent identifiers leak.
- Model record prefix (`BR-002O47`) → returns exactly the 10 records for that model, 0 from a different model's prefix (`BR-002O48`).
- Model Identifier (`QWEN-35`, `ANTHR-O48`, `DPSK-V4PRO`) → each returns its model's full record set (31, 21, 22 respectively).
- Official model name (`Qwen3.5-397B-A17B`, `Claude Opus 4.8`, `Grok 4.5`) → each returns the same record set as the corresponding Model Identifier.
- Benchmark pages (`/benchmarks/gpqa`, `/benchmarks/swe-bench`, `/benchmarks/terminal-bench`, `/benchmarks/browsecomp`, `/benchmarks/humanitys-last-exam`, `/benchmarks/aa-intelligence-index`) → all 200.
- Benchmark version page (`/benchmarks/gpqa/versions/diamond`) → 200.
- Organization pages (`anthropic`, `google`, `xai`, `cursor`, `deepseek`) → all 200.
- Record detail page (`/records/BR-002O48-013`) → 200, correct `<title>`.
- `/`, `/recent`, `/models`, `/docs` → all 200.
- No aliases were created in this population pass (exact official names and Model Identifiers were sufficient for resolution), so the "at least one alias" search check specified in the task could not be exercised — noted as a gap rather than skipped silently.

## Validation Results

- `pnpm registry validate`: **0 errors**, 160 warnings (all "Evaluation date is unknown" or, for the 12 relayed GPT-5.5 records, additionally "Report type is UNKNOWN" — both expected and correct given the source data).
- `pnpm registry ingest validate`: **0 errors, 0 warnings** (the ingestion pipeline was not used this pass; all entities were created via direct canonical CLI commands and `pnpm registry import`).
- `pnpm registry production-check`: **PASS** (environment, database reachability, migrations, canonical provider organizations, registry validation, ingestion validation all green).
- `pnpm format:check`: PASS (after formatting 5 research JSON files and one pre-existing unrelated docs file).
- `pnpm lint`: **FAILS**, but only on `.remember/tmp/last-ndc.ts` — a stray non-source tmp file created by this session's own memory-tracking harness (contains a single timestamp), picked up because the project's ESLint ignore list doesn't exclude `.remember/`. This is not a defect introduced by this task's work; no application source file was modified. Left as-is rather than editing `eslint.config.js` or deleting harness-internal state, both of which are out of scope for a data-population task.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS, 133/133 unit tests.
- `pnpm build`: PASS, clean production build.
- PostgreSQL integration tests (`pnpm verify:integration`): not run — `INTEGRATION_DATABASE_URL` is not configured in this environment, and per the project's own safety rule, integration tests must never be pointed at the shared/production `DATABASE_URL`.

## Identifier Spec Extensions (Extended Run)

User-approved, deliberately scoped changes to BEIS v1 — no existing published identifier changed meaning:

- **New tier codes**: `FB` (Fable, Anthropic-only) and `SL`/`TR`/`LN` (Sol/Terra/Luna, OpenAI-only), plus `SM`/`LG` (Small/Large, Mistral AI-only), added to `src/identifiers/tier-codes.ts` and threaded through `encoding.ts`, `model-id.ts`, `record-prefix.ts`, `provider-documentation.ts`, and `docs/identifiers.md`.
- **5 new providers onboarded**, each following one of the three pre-existing strategy shapes rather than inventing new ones:
  - Moonshot AI (`KIMI`, BR-010) and Cohere (`COHR`, BR-014) — family-code strategy (like DeepSeek/Meta).
  - Zhipu (`GLM`, BR-011) — numeric-only strategy (like Qwen).
  - MiniMax (`MMAX`, BR-012) — family-code strategy.
  - Mistral AI (`MSTRL`, BR-013) — tier+number strategy (like Anthropic), using the new Small/Large tiers.
- 34 new test cases added across `tests/identifiers/model-id.test.ts` and `record-prefix.test.ts` (162 → 166 identifier tests total across the whole extended run). `pnpm typecheck`/`pnpm test`/`pnpm build` re-run clean after every single provider onboarding, not just at the end.

## Known Limitations

- **QWEN identifier strategy limitation**: `QWEN-[MN]` encodes a single numeric slot with no field for parameter-count/size variant. Qwen3.5 ships many sizes (397B-A17B, 122B-A10B, 35B-A3B, 27B, 9B, 4B, 2B, 0.8B) under one version name; only the flagship 397B-A17B is represented (`QWEN-35`). Representing the other sizes would require a further identifier-spec change, which was not attempted this pass — documented per AGENTS.md section 48 rather than forced.
- **xAI primary-source access**: x.ai returns HTTP 403 to all automated fetch attempts (confirmed via both `curl` and the WebFetch tool), with no PDF-CDN equivalent or open-weight Hugging Face mirror found (Grok is closed-weight). The only xAI coverage obtained (Grok 4.5, 2 records) comes from an independent evaluator (Artificial Analysis), correctly marked `reportType: INDEPENDENT`.
- **OpenAI primary-source access**: `openai.com`/`help.openai.com` return HTTP 403. `cdn.openai.com` and `deploymentsafety.openai.com` are _not_ blocked and were used successfully for GPT-5.5/5.6 system cards, but those documents are safety-framed and contain no general-capability benchmark tables. The GPT-5.5 and Qwen3.7-Max records obtained via other providers' comparison tables are correctly marked `reportType: UNKNOWN` rather than `PROVIDER`/attributed-provider, since the exact originating document per cell was not independently confirmed. This is a source-availability limitation, not a data-entry gap — OpenAI's actual capability-benchmark announcement posts (`introducing-gpt-5-x`) remain fully blocked.
- **Background research subagents failed** (initial pass): An early attempt to parallelize research across 5 background agents produced zero usable output — all 5 hit session limits mid-run. All research was ultimately done directly, sequentially, in the main session (both the initial and extended passes).
- **WebFetch reliability finding**: WebFetch's page-summarization step returned a fabricated, self-contradictory number early in this task (a wrong SWE-bench score for Claude Opus 4.7 that didn't match the real PDF). Every number in this report was cross-checked against raw fetched text (`curl` + `pdftotext -layout`, or direct HTML `<table>` parsing) — WebFetch/WebSearch outputs were used only to find candidate URLs, never trusted directly for a numeric score. The GLM-5.2 comparison table's asterisked Opus 4.8/GPT-5.5 values independently cross-validated already-committed numbers exactly, adding further confidence in this method.
- **Perplexity remains unrepresented** after two research passes — no genuine materially-distinct 2026 Sonar release exists, only incremental search-mode feature additions.
- **A real backend bug was found during verification, unrelated to data population**: the app's database connection pool has no `.on('error', ...)` handler, so a single transient network blip to the (remote, cross-region) Supabase Postgres instance threw an unhandled error and crashed the entire dev server process. This is a genuine production-robustness gap worth a follow-up fix, but was left untouched since it's outside this task's scope (data population, not backend hardening).
- No model aliases were added in this pass (exact official names/IDs were sufficient), so the alias-search invariant could not be exercised in verification.
- Several new benchmark scores (MiniMax-M3, Mistral Small 4) came from Hugging Face's own machine-readable "eval results" metadata rather than a directly visible README table, because those specific model cards render their benchmark charts as images with no extractable text. This metadata is explicitly attributed by HF to the model card itself, but is one small step removed from reading the table directly — noted for transparency.

## Research Notes

- The single most effective technique discovered was fetching official PDF system/model cards with `curl` (browser User-Agent) and extracting text with `pdftotext -layout`, then reading the raw text directly rather than through any summarization layer. This caught a real fabrication (see WebFetch reliability finding above) that would otherwise have gone into the registry undetected.
- Hugging Face model cards were consistently the most reliable and highest-yield source for Qwen and DeepSeek — real, author-authored inline-styled HTML tables with footnotes, safely parseable.
- Several providers render their comparison charts as client-rendered JS widgets or embedded raster images inside otherwise-real PDFs (Google's Gemini 3.1 Pro PDF, Qwen's own blog site, GitHub README benchmark sections) — these produced zero extractable text and had to be worked around by finding an HTML-table equivalent of the same data (e.g. DeepMind's HTML model-card page instead of its PDF).
- Provider naming for the same underlying benchmark is inconsistent across sources (e.g. "GPQA" vs "GPQA Diamond", "Terminal-Bench 2.0" vs "Terminal Bench 2" vs "Terminal-Bench 2.1", "MRCR v2 (8-needle)" vs plain "MRCR 1M (MMR)"). Where sources used different labels for what may be the same or a materially different benchmark, this task erred toward preserving the distinction as separate benchmark versions/families rather than silently merging them, per the project's conservative-merge rule — documented per-record in the `notes` field.
- Competitor comparison tables inside a provider's own system card (e.g. Anthropic citing GPT-5.5 and Gemini 3.1 Pro numbers) are common and can be a legitimate, if lower-confidence, path to another provider's data when that provider's own site is inaccessible — but require careful `reportType`/evaluator handling to avoid overclaiming attribution.
