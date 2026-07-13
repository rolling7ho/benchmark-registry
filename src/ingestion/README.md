# Ingestion

This directory owns source-assisted ingestion: secure retrieval, content normalization, deterministic extraction, the provider-neutral optional LLM boundary, exact canonical resolution, validation, and internal candidate persistence. Publication delegates to canonical registry record creation and never inserts directly into `benchmark_records`.

Structured JSON batch imports remain a separate atomic workflow documented in `docs/import-format.md`. See `docs/ingestion.md` for the source-assisted candidate lifecycle.
