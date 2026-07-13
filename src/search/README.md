# Search

This directory owns conservative query normalization and the product-defined deterministic search resolver. Exact record identifiers short-circuit all other resolution. Exact record prefixes, canonical model identity forms, benchmarks, organizations, and metrics resolve before the PostgreSQL general-search fallback. Fuzzy identity matching is intentionally absent.
