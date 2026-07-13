# Source Inventory — 2026 Benchmark Population

For each inspected source: title, provider/publisher, URL, source type, publication date, models in scope, tables/sections used, whether it produced records, notes.

## System Card: Claude Opus 4.7

- Publisher: Anthropic
- URL: https://www-cdn.anthropic.com/037f06850df7fbe871e206dad004c3db5fd50340/Claude%20Opus%204.7%20System%20Card.pdf
- Source type: SYSTEM_CARD
- Published date: 2026-04-16
- Models in scope: Claude Opus 4.7 (ANTHR-O47)
- Section used: 8.1 Evaluation summary table (p.190), footnotes 38-39
- Produced records: yes (10)
- Notes: Real embedded text, extracted via `pdftotext -layout`. Also contains Opus 4.6/GPT-5.4/GPT-5.4 Pro/Gemini 3.1 Pro comparison columns (not used — those models' own primary sources are preferred). Marketing announcement page (anthropic.com/news/claude-opus-4-7) was tried first but renders its benchmark chart client-side with no extractable text/JSON in raw HTML — do not rely on it for numbers; the PDF system card is the reliable source.

## Gemini 3.1 Pro - Model Card

- Publisher: Google DeepMind
- URL: https://deepmind.google/models/model-cards/gemini-3-1-pro/
- Source type: MODEL_CARD
- Published date: unknown (PDF version states "February 2026" only, no exact day; left null rather than guessed)
- Models in scope: Gemini 3.1 Pro (GOOGL-G31P)
- Section used: benchmark comparison `<table>` (real semantic HTML, not the PDF version — the PDF at storage.googleapis.com/deepmind-media/Model-Cards/Gemini-3-1-Pro-Model-Card.pdf renders its results table as an embedded image with no extractable text)
- Produced records: yes (5 of 19 available candidates; remaining 14 — ARC-AGI-2 supporting benchmarks, LiveCodeBench Pro, SciCode, APEX-Agents, GDPval-AA, tau2-bench, MCP Atlas, BrowseComp, MMMU-Pro, MMMLU, MRCR v2 — staged for a later batch)
- Notes: Table columns are Gemini 3.1 Pro / Gemini 3 Pro / Sonnet 4.6 / Opus 4.6 / GPT-5.2 / GPT-5.3-Codex, each at a specific thinking-effort level; only the Gemini 3.1 Pro column was used for records.
