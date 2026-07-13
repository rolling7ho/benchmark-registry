# Benchmark Registry

Benchmark Registry is a public, server-rendered database for traceable AI benchmark results. Benchmark results are records of reported evaluations, not universal model scores. The registry preserves benchmark versions and variants, evaluation configurations, explicitly reported model snapshots, evaluator attribution, sources, and provenance without turning the public table into a leaderboard.

**The database is the product.**

## Stack and prerequisites

- Node.js 22 or newer and pnpm 11
- Supabase PostgreSQL in production; any ordinary PostgreSQL instance locally
- Fastify, Eta, Kysely, strict TypeScript, and Vitest

## Local setup

```sh
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`DATABASE_URL` must identify an existing PostgreSQL database whose role may create and alter tables. `pnpm db:seed` inserts or verifies only the canonical provider organizations.

Supabase is used strictly as a managed PostgreSQL provider. Database access remains ordinary PostgreSQL through `pg` and Kysely; the application does not require the Supabase JavaScript SDK.

The connection pool uses TLS with full certificate verification for any non-local host, trusting the system CA bundle plus Supabase's published root CA (Supabase's pooler chains to a private root, not a publicly cross-signed one). Connections to `localhost`/`127.0.0.1`/`::1` skip TLS, since a local development Postgres has no certificate configured. The pool is bounded (`max: 10`, `idleTimeoutMillis: 30_000`, `connectionTimeoutMillis: 10_000`).

Optional deterministic development/test fixtures are separate from the provider seed and are rejected when `NODE_ENV=production`:

```sh
pnpm db:seed:test-data
```

`pnpm db:seed` loads only canonical provider organizations. `pnpm db:seed:test-data` is separate development/test fixture loading and must never be used as production ingestion.

## Internal registry CLI

The administrative CLI is an internal operator tool and is not publicly exposed. It uses `DATABASE_URL` and closes its database pool after every command.

```sh
pnpm registry --help
pnpm registry organization add --provider openai --yes
pnpm registry model add --organization openai --name "GPT-5.5" --family GPT --model-number 55
pnpm registry source add --url "https://example.com/report" --type PROVIDER_REPORT --title "Model Report"
pnpm registry record add --model OPNAI-55 --benchmark deepswe --metric overall --score-display "72.4" --score-value 72.4 --evaluation-date 2026-06-18 --source "https://example.com/report" --report-type PROVIDER
pnpm registry record show --record BR-00155-001
pnpm registry benchmark version add --benchmark gpqa --variant Diamond --reference gpqa/diamond
pnpm registry configuration add --shots 0 --pass-count 1
pnpm registry snapshot add --model OPNAI-55 --provider-model-id "gpt-5.5-2026-06-18"
pnpm registry evaluator add --name OpenAI --slug openai --type MODEL_PROVIDER
pnpm registry validate
pnpm registry production-check
```

`pnpm registry production-check` is a read-only pre-deploy gate: it confirms the environment parses, the database is reachable, migrations are current, canonical provider organizations exist, and `validate`/`ingest validate` report no errors. It never mutates data and exits non-zero if any check fails.

Data-entry commands preview changes and require confirmation; use `--yes` for reviewed non-interactive writes. Probable duplicate records additionally require `--allow-possible-duplicate`. Record targets and entity references are exact canonical values, never public fuzzy search results.

## Source-assisted ingestion

The internal CLI can retrieve or read HTML, plain text, Markdown, and text-extractable PDF sources, preserve structured evidence, and create a human review queue.

**Extracted benchmark results are candidates only. An operator must explicitly approve a candidate before it becomes a public Benchmark Record.**

```sh
pnpm registry ingest source --source "https://example.com/report"
pnpm registry ingest file --file ./report.pdf --source "https://example.com/report.pdf"
pnpm registry ingest list
pnpm registry ingest show --job IJ-000001
pnpm registry ingest candidates
pnpm registry ingest candidate --candidate IC-000001
pnpm registry ingest approve --candidate IC-000001
pnpm registry ingest reject --candidate IC-000001 --reason "Not a model result"
pnpm registry ingest validate
```

Both URL and file ingestion require an existing exact canonical source; ingestion does not create missing entities. Identical source content is blocked by default through SHA-256 hashing and may be deliberately reprocessed with `--force`. Approval supports explicit field corrections and still uses exact canonical resolution, probable duplicate protection, confirmation, and the existing transactional record allocator. Rejection preserves the candidate and its evidence without changing public registry metadata. See [source-assisted ingestion](docs/ingestion.md).

Structured imports validate the entire file before committing it atomically:

```sh
pnpm registry import --file ./records.json
```

See [the import format](docs/import-format.md). Published records support withdrawal and supersession, not generic editing; a formal correction workflow remains future work.

## Public search

Search uses `GET /search?q=...`, is case-insensitive, and resolves in a fixed order. Examples:

- `BR-00155-001` returns that one exact record.
- `BR-00155` returns active records for the model owning that exact prefix.
- `OPNAI-55` returns active records for the canonical model.
- `GPT-5.5` returns the same canonical model record set.

Exact identifiers short-circuit broader search. Unresolved queries use parameterized PostgreSQL text matching. Results use server-side pagination with 100 records per page. Invalid page values normalize to page 1; queries over 256 characters return HTTP 400.

## Public routes

- `/` — recent active registry records
- `/search` — deterministic registry search
- `/models` and `/models/:modelId`
- `/benchmarks` and `/benchmarks/:slug`
- `/benchmarks/:slug/versions/:version` — a specific known version or variant
- `/records/:recordId` — complete evaluation context, sources, and provenance
- `/organizations` and `/organizations/:slug`
- `/recent`
- `/sources`
- `/docs`
- `/feedback` — public feedback and correction submission form
- `/health`

Public feedback is validated and written only by the server; browsers never receive database credentials. Configure both `ADMIN_USERNAME` and `ADMIN_PASSWORD` (minimum 12 characters) to enable the HTTP Basic-protected `/admin/feedback` review queue. Leave both unset to keep web administration disabled. The database migration enables row-level security and gives Supabase `anon` and `authenticated` roles no direct privileges or policies on feedback submissions.

Exact record search and record detail are deliberately separate. `/search?q=BR-00155-001` returns one standard registry row; `/records/BR-00155-001` displays the complete record context and provenance. Unknown context remains unknown and never implies provider defaults.

## Production web build

Build and start the complete production application with:

```sh
pnpm build
NODE_ENV=production pnpm start
```

The build cleans `dist`, compiles the server, copies the Eta views, minifies the public CSS, writes a content-hashed stylesheet, and generates the asset manifest used by the server-rendered layout. Production serves only `dist/public` under `/public/`; hashed assets receive a one-year immutable cache policy, while dynamic HTML uses `Cache-Control: no-cache`. Textual responses of at least 1 KiB negotiate Brotli or gzip compression. Supabase remains the PostgreSQL host rather than an application SDK or frontend architecture.

No public client-side JavaScript is currently shipped. Responsive behavior is CSS-driven. On narrow displays the same registry tables and all columns remain present; tables scroll horizontally inside their own native scroll containers rather than becoming cards or widening the document body.

See [production web behavior](docs/production.md) for the delivery, security-header, source-map, and responsive policies.

## Verification

```sh
pnpm verify
```

`pnpm verify` runs the deterministic, database-free release gate: format check, lint, typecheck, the unit/application test suite, and a full production build. It is equivalent to running `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` in sequence.

PostgreSQL-backed tests use a dedicated database. They migrate and clear registry-domain fixture data; never point them at a shared or production database.

```sh
INTEGRATION_DATABASE_URL=postgresql://... pnpm verify:integration
```

`pnpm verify:integration` runs the PostgreSQL integration suite (`pnpm test:integration`) against `INTEGRATION_DATABASE_URL`. It never falls back to `DATABASE_URL`.
