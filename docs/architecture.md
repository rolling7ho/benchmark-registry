# Architecture

```text
BROWSER
  ↓
FASTIFY
  ↓
SECURITY HEADERS
  ↓
COMPRESSION
  ↓
SERVER-RENDERED ETA
  ↓
MINIFIED HASHED STATIC ASSETS
```

Registry data requests continue from the Eta-rendering route through Kysely to PostgreSQL.

Fastify owns HTTP behavior and renders complete HTML responses. Public search, browsing, and pagination require no client-side JavaScript. Kysely provides typed, explicit and parameterized PostgreSQL access.

Development renders the source Eta templates and serves readable source CSS directly. The complete production build copies templates into `dist/views`, generates minified content-hashed CSS in `dist/public`, and writes a small manifest outside the public static root. The layout resolves the logical stylesheet name through one asset helper, so generated hashes are never hard-coded in a template.

Production compression and security headers are registered centrally before public routes and static delivery. Dynamic HTML is revalidation-oriented and is never immutable; content-hashed static assets use long-lived immutable caching. Server source maps may remain beside compiled operator code for debugging, but the static mount is restricted to `dist/public`, so server source maps and repository files are not public.

Mobile responsiveness is CSS-driven and has no client-rendered application runtime. Narrow layouts preserve the same search-to-table information architecture. Wide registry and browse tables retain every column and use deliberate native horizontal scrolling inside a keyboard-reachable container; document-level horizontal overflow is a defect.

## Core boundaries

- `routes`: validation, HTTP status behavior, and response selection.
- `views`: reusable server-rendered registry-table, search, navigation, and pagination partials.
- `db`: connection lifecycle, typed schema, joined public record projection, metadata, and browse queries.
- `identifiers`: canonical provider configuration, provider-specific identifier generation and validation, and transactional record-sequence allocation.
- `search`: normalization and deterministic resolution.
- `ingestion`: internal source retrieval, content normalization, candidate extraction, exact canonical resolution, validation, and review lifecycle.

The reusable public registry projection joins benchmark records, models, benchmarks, metrics, sources, and organizations in one query per result page. It contains only the fields required by the standard table. Counts and result pages remain in PostgreSQL; the application never loads the full registry for pagination.

## Evaluation context and provenance

```text
MODEL → MODEL SNAPSHOT ┐
                      │
BENCHMARK FAMILY → BENCHMARK VERSION ─┐
                                     │
EVALUATION CONFIGURATION ────────────┼→ BENCHMARK RECORD
EVALUATOR ───────────────────────────┘          ↓
                                      PRIMARY + SUPPORTING SOURCES
                                                ↓
                                        PROVENANCE EVENTS
```

The benchmark record is the central reported evaluation result. `benchmark_records → benchmark_versions → benchmarks` is the long-term benchmark identity path; the direct `benchmark_id` remains as a compatibility and validation field during this schema transition. Model snapshots remain subordinate to canonical models. Evaluation configurations are exact canonical structures deduplicated by SHA-256 fingerprints. One seeded unspecified configuration means only that the registry lacks sufficient configuration evidence.

Every canonical creation transaction allocates the unchanged public Benchmark Record Identifier, inserts the primary-source relationship, and creates a provenance event. Additional sources and later status events do not change public identifiers.

## Search resolution

```text
QUERY
  ↓
NORMALIZE
  ↓
EXACT RECORD
  ↓
RECORD PREFIX
  ↓
MODEL ID
  ↓
MODEL NAME
  ↓
MODEL ALIAS
  ↓
BENCHMARK VERSION
  ↓
BENCHMARK
  ↓
ORGANIZATION
  ↓
METRIC
  ↓
GENERAL SEARCH
```

This order is deliberate and product-defined. Exact identifiers and exact entity matches short-circuit broader search. Normalized aliases are checked before compact aliases; ambiguous aliases do not silently select a model. General search uses PostgreSQL case-insensitive matching and deterministic record ordering.

The standard page size is 100. Exact record results do not render pagination controls. Default and recent pages show only active records ordered by creation time, then record identifier. Entity and general results order by evaluation date descending with null dates last, then record identifier.

## Identifier subsystem

Provider configuration in `src/identifiers/providers.ts` remains the canonical source for provider slugs, names, prefixes, Benchmark Record namespaces, and strategies. Full record identifiers append a three-digit sequence allocated under a model-row lock in the same transaction as insertion. Published identifiers are stored and never reconstructed during reads.

## Administrative write path

```text
OPERATOR
  ↓
REGISTRY CLI
  ↓
ZOD VALIDATION
  ↓
REGISTRY SERVICES
  ↓
IDENTIFIER SYSTEM
  ↓
KYSELY TRANSACTION
  ↓
SUPABASE POSTGRESQL
```

Supabase is treated as hosted PostgreSQL. The application and CLI continue to use `pg`, Kysely, and `DATABASE_URL`; the Supabase SDK is not required. Web routes and CLI commands share the canonical database, registry, validation, and identifier services.

CLI previews are read-only and never allocate identifiers. Record sequence allocation occurs under a model-row lock only inside the committed creation transaction. Structured batch imports validate all exact canonical references first and commit all records atomically. Every benchmark record requires a source reference.

## Source-assisted ingestion

```text
SOURCE
  ↓
RETRIEVER
  ↓
NORMALIZER
  ↓
EXTRACTOR
  ↓
CANDIDATE
  ↓
VALIDATOR
  ↓
OPERATOR REVIEW
  ↓
CANONICAL RECORD CREATION
  ↓
SUPABASE POSTGRESQL
```

Ingestion is internal CLI infrastructure. Public web requests never retrieve sources, execute extraction, expose candidates, or publish records. Candidates remain temporary operational proposals with their own internal references. Approval enters the same canonical record creation path used by manual CLI creation; identifier allocation and candidate linkage occur in one PostgreSQL transaction.

Supabase remains ordinary hosted PostgreSQL. Ingestion uses Kysely and `pg` through `DATABASE_URL`, not the Supabase SDK.
