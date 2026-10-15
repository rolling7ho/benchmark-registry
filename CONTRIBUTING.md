# Contributing to Benchmark Registry

Benchmark Registry is a curated, source-backed registry. Accuracy and
provenance come before coverage, so every change goes through review, and data
reaches the live site only through the maintainers' ingestion and deploy steps.

## Report a wrong or missing result

Most contributions are evidence, not code. Open an issue with one of the
templates:

- [Correct a result](https://github.com/rolling7ho/benchmark-registry/issues/new?template=correct-a-result.yml)
- [Submit a missing result](https://github.com/rolling7ho/benchmark-registry/issues/new?template=submit-a-missing-result.yml)

Link a primary source: the benchmark or evaluator's own results, or the model
developer's model card, system card, technical report or blog. Search snippets,
news articles and social posts are not accepted when a primary source exists.
Include the benchmark version, metric, reasoning or effort setting and reported
date when the source states them. If you can't find a primary source, say so in
the issue rather than guessing.

You can also email support@benchmarkregistry.org.

## Before changing code or data

Read [AGENTS.md](AGENTS.md) and the `AGENTS.md` in the directory you are
changing. They apply to people as well as coding agents. The essential rules
for pages, data and Registry numbering are in section 2 of the root
[AGENTS.md](AGENTS.md).

A change that would alter one of these rules needs the maintainer's
approval first. Open an issue describing the change before writing it.

The project is not a leaderboard. Rankings, composite scores, sortable scores
and "top models" features are out of scope.

## Repository layout

```text
app/          site pages (React), build-time renderer, static build and deploy scripts
ingestor/     Python ingestion CLI, the only write path into the database
data/         tracked batches, corrections and research evidence
migrations/   D1 schema migrations
scripts/      data validation, replay and SEO checks
```

The public site is static files built from a Cloudflare D1 database. See
[app/STATIC-SITE.md](app/STATIC-SITE.md) for how it is built and served.

## Set up and run the checks

You need Node.js 22.12+ or 24+, Python 3.12 and [uv](https://docs.astral.sh/uv/).

```sh
cd app
npm ci
npm run typecheck
npm run lint
npm test
npm run build && npm run test:seo
npm run db:migrate:local     # migrations apply to a local database

cd ../ingestor
uv sync --locked --all-groups
uv run pytest
uv run pytest ../scripts
uv run python ../scripts/validate_data.py
uv run python ../scripts/check_replay.py
cd ..
uv run --project ingestor ruff check ingestor scripts app/scripts data/evidence
```

CI runs the same checks on every push and pull request
([.github/workflows/ci.yml](.github/workflows/ci.yml)). Building the full site
and deploying need access to the project's Cloudflare account, so maintainers
do those steps.

## Changing data

Data enters through ingestor batch files in `data/batches/`, listed in order in
`data/batches/manifest.json`. Never edit an applied batch; add a correction
batch instead so the history replays. [data/AGENTS.md](data/AGENTS.md) has the
evidence rules and stop conditions. When sources disagree or numbering is
unclear, stop and raise it in the pull request instead of choosing a value.

## Pull requests

- Keep each pull request to one complete change, with tests for new behavior.
- Use [Conventional Commits](https://www.conventionalcommits.org/) messages, for
  example `feat(ui): add result page-size selector` or
  `fix(ingestor): reject unknown metrics`.
- Say in the description what you checked and anything left unresolved.

## Licensing

By contributing, you agree that code is licensed under the
[Apache License 2.0](LICENSE) and data under [CC BY 4.0](LICENSE-DATA).

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md),
not in a public issue.
