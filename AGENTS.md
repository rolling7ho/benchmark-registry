# Benchmark Registry Agent Rules

Benchmark Registry is intentionally simple. Its intended visual character is:

> Government database / scientific registry / institutional records system

It is explicitly not a:

> Modern AI SaaS dashboard

Permanent project rules:

1. Benchmark Registry is intentionally simple.
2. Prefer server-rendered HTML.
3. Minimize client-side JavaScript.
4. Do not introduce frontend frameworks without an explicit product requirement.
5. Do not introduce microservices.
6. Do not introduce a dedicated search engine until PostgreSQL search has been measured and proven insufficient.
7. Do not introduce AI features simply because the product concerns AI.
8. Identifiers are public stable references and must be treated carefully.
9. Published identifiers must never be silently regenerated or reassigned.
10. Provider-specific identifier formats must remain provider-specific.
11. Unknown benchmark metadata must remain unknown rather than being inferred.
12. Source publication date must not automatically become evaluation date.
13. Prefer explicit SQL and clear relational data modeling.
14. One benchmark record will eventually represent one reported metric result.
15. Exact benchmark record search behavior will eventually be a product-critical invariant.
16. Keep dependencies limited and justified.
17. Avoid speculative abstraction.
18. Tests are required for identifier and search invariants when those systems are implemented.
19. The public product should remain fast and usable without unnecessary JavaScript.
20. The database is the product.
21. Same benchmark name does not imply same evaluation.
22. Benchmark records represent reported evaluations, not universal model scores.
23. Preserve benchmark version or variant and evaluation configuration where known.
24. Unknown configuration must remain unknown; unknown does not mean provider default.
25. Reported date and evaluation date are separate; never populate evaluation date from source publication date.
26. A Model Identifier identifies a canonical model, not a model snapshot. Do not create a new Model Identifier solely because a dated snapshot exists.
27. Evaluation configuration fingerprints use canonical structured data. Never silently merge materially different configurations.
28. Every new benchmark record requires exactly one primary source. Supporting and correction sources may be attached separately.
29. Record creation and status changes create provenance events.
30. Public Benchmark Record Identifiers do not encode all evaluation context and remain stable when context is later attributed.
31. Record detail pages expose evaluation context; the main registry table remains dense and Record No. links to the canonical detail route.
32. Comparability assessment is structural and conservative. It must never rank models or inspect score superiority.

Public search invariants:

- Exact Benchmark Record Identifier search must short-circuit all broader search.
- A full exact record search returns one row.
- A known record prefix returns records for exactly one model prefix.
- Model Identifier, official model name, and exact aliases resolve to the same canonical model.
- Do not introduce fuzzy model identity matching without a specification change.
- The Model ID column remains the final primary table column.
- The public registry table is the core UI. Do not replace it with cards.
- Do not add a dashboard layer over the registry.
- Registry Documentation must reflect actual search behavior.
- Public search must remain usable without client-side JavaScript.

Identifier implementation rules:

- Provider configuration has one canonical source.
- Never reconstruct published identifiers during reads.
- Never update a Model Identifier because generation logic changed.
- Never update a Benchmark Record Identifier because generation logic changed.
- Identifier generation rules apply only when assigning new identifiers.
- Record sequences are allocated transactionally.
- Never use `MAX(sequence) + 1`.
- Never reuse sequence numbers.
- Do not create a universal provider identifier template.
- Identifier format changes require explicit specification changes and migration review.

Administrative ingestion rules:

- Supabase is currently a managed PostgreSQL provider, not the application architecture.
- Do not replace Kysely with Supabase SDK queries without an explicit architecture decision.
- Public registry data is written through controlled internal services.
- Every benchmark record requires a source.
- Administrative writes require exact canonical references.
- Public fuzzy/general search must not be reused to resolve administrative write targets.
- Preview operations must not allocate Benchmark Record Identifiers.
- Record IDs are allocated only inside committed creation transactions.

Source-assisted ingestion rules:

- Extraction is not publication.
- Ingestion candidates are not public benchmark records.
- Candidates never receive Benchmark Record Identifiers before committed publication.
- Extractors must preserve source evidence.
- LLM output is untrusted structured input.
- LLM extractors must not use outside knowledge.
- Publication always uses canonical benchmark record creation services.
- Ingestion must never insert directly into `benchmark_records`.
- Canonical registry entities are resolved deterministically.
- Do not use public general search for administrative canonical resolution.
- Do not fuzzy-match models during publication.
- Do not automatically create models, benchmarks, metrics, or sources from extracted candidates.
- Confidence is extraction confidence, not truth confidence.
- Confidence never permits automatic publication.
- No approve-all command exists in v1.
- Source retrieval must protect against SSRF.
- Identical source content should be detected through content hashing.
- Candidate deduplication and registry duplicate detection are separate systems.
- Public web requests must not trigger ingestion.

Production and mobile rules:

- Production CSS must be minified through the build pipeline.
- Do not manually edit generated production assets.
- Static asset caching requires reliable cache busting.
- Dynamic registry HTML must not receive immutable cache headers.
- Public JavaScript must not be introduced without a product requirement.
- Mobile preserves the same registry information architecture.
- Benchmark records remain HTML table rows on mobile.
- Never convert registry records into cards solely for responsiveness.
- Never hide Model ID solely for mobile.
- Never remove registry table columns solely to fit a narrow viewport.
- Horizontal table scrolling is intentional.
- Body-level accidental horizontal overflow is a bug.
- Documentation `<pre>` identifier diagrams must preserve whitespace.
- Responsive behavior should remain CSS-driven.
- Do not add hamburger navigation without an explicit product specification change.
- Do not add a mobile app-style navigation layer.
- Production security headers are centralized.
- Production build output must be complete after `pnpm build`.
