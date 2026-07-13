# Search

This directory owns conservative query normalization and the product-defined deterministic search resolver. Exact record identifiers short-circuit all other resolution. Exact record prefixes, canonical model identity forms, benchmarks, organizations, and metrics resolve before the PostgreSQL general-search fallback. Fuzzy identity matching is intentionally absent.

The optional public query language supports `brand:`, `benchmark:`, `record:`, `model:`, `metric:`, `date:`, and `org:` fields. Commas mean OR within one field, separate fields are combined with AND, and uppercase `OR` separates complete alternatives. Parsing remains independent from canonical entity resolution, and bare exact record identifiers retain the mandatory short circuit.
