# Structured batch import format

The internal registry CLI accepts controlled JSON imports:

```sh
pnpm registry import --file ./records.json
```

```json
{
  "records": [
    {
      "modelId": "OPNAI-55",
      "benchmarkSlug": "deepswe",
      "benchmarkVersionReference": "deepswe/default",
      "configurationReference": "CFG-000001",
      "snapshotReference": null,
      "evaluatorSlug": "unknown",
      "metricSlug": "overall",
      "scoreDisplay": "72.4",
      "scoreValue": 72.4,
      "evaluationDate": "2026-06-18",
      "reportedDate": "2026-06-20",
      "sourceUrl": "https://example.com/report",
      "reportType": "PROVIDER",
      "notes": null
    }
  ]
}
```

`modelId`, `benchmarkSlug`, `metricSlug`, `scoreDisplay`, and `sourceUrl` are required. References are exact: model identifiers, benchmark slugs, metric slugs, and canonical source URLs must already exist. **Batch import does not create missing registry entities.**

`scoreValue`, `evaluationDate`, `reportType`, and `notes` are optional. A missing numeric score is stored as null while `scoreDisplay` preserves the source's reported representation. Dates use `YYYY-MM-DD`; a missing evaluation date remains null and is never inferred from source publication metadata. Accepted report types are `PROVIDER`, `INDEPENDENT`, `BENCHMARK_OWNER`, `REPRODUCED`, and `UNKNOWN` (the default).

Import uses `VALIDATE → COMMIT`. Any invalid record blocks the entire batch. Probable duplicates share model, benchmark, metric, and source; they require explicit review and `--allow-possible-duplicate`. Non-interactive commits also require `--yes`. All records are inserted in one transaction, with model-scoped sequences allocated in input order. A rollback consumes no sequence numbers.
