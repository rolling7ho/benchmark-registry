# Benchmark Registry Identifier Specification — BEIS v1

BEIS v1 defines provider-specific public identifiers. Provider prefixes and Benchmark Record namespaces are permanent after publication.

Model Identifiers identify canonical models; they do not identify dated or provider-specific model snapshots. Benchmark Record Identifiers identify individual reported metric result records. They deliberately do not encode benchmark version, evaluation configuration, model snapshot, or evaluator. A record identifier remains stable if additional source-supported context is attributed later.

## Providers

| Provider    | Slug         | Provider prefix | BR namespace | Strategy           |
| ----------- | ------------ | --------------- | ------------ | ------------------ |
| OpenAI      | `openai`     | `OPNAI`         | `001`        | `OPENAI`           |
| Anthropic   | `anthropic`  | `ANTHR`         | `002`        | `ANTHROPIC`        |
| Google      | `google`     | `GOOGL`         | `003`        | `GOOGLE_GEMINI`    |
| xAI         | `xai`        | `XAI`           | `004`        | `XAI_GROK`         |
| Cursor      | `cursor`     | `CURSR`         | `005`        | `CURSOR_COMPOSER`  |
| Perplexity  | `perplexity` | `PPLX`          | `006`        | `PERPLEXITY_SONAR` |
| Qwen        | `qwen`       | `QWEN`          | `007`        | `QWEN`             |
| DeepSeek    | `deepseek`   | `DPSK`          | `008`        | `DEEPSEEK`         |
| Meta        | `meta`       | `META`          | `009`        | `META_FAMILY`      |
| Moonshot AI | `moonshot`   | `KIMI`          | `010`        | `MOONSHOT_KIMI`    |
| Zhipu       | `zhipu`      | `GLM`           | `011`        | `ZHIPU_GLM`        |
| MiniMax     | `minimax`    | `MMAX`          | `012`        | `MINIMAX_FAMILY`   |
| Mistral AI  | `mistral`    | `MSTRL`         | `013`        | `MISTRAL_TIER`     |
| Cohere      | `cohere`     | `COHR`          | `014`        | `COHERE_FAMILY`    |

## Standard tier codes

| Tier       | Code |
| ---------- | ---- |
| Opus       | `O`  |
| Sonnet     | `S`  |
| Haiku      | `H`  |
| Fable      | `FB` |
| Muse Spark | `MS` |
| Composer   | `C`  |
| Pro        | `P`  |
| Flash      | `F`  |
| Sol        | `SL` |
| Terra      | `TR` |
| Luna       | `LN` |
| Small      | `SM` |
| Large      | `LG` |

Providers use only the tier codes approved by their strategy. The existence of a standard code does not authorize it for every provider. `Fable` is approved only for Anthropic (alongside Opus/Sonnet/Haiku); `Sol`/`Terra`/`Luna` are approved only for OpenAI (alongside `Pro`); `Small`/`Large` are approved only for Mistral AI.

## Model Identifiers and record prefixes

| Provider         | Model Identifier format | Example        | Record prefix format  | Example         |
| ---------------- | ----------------------- | -------------- | --------------------- | --------------- |
| OpenAI           | `OPNAI-[MN][TIER?]`     | `OPNAI-56SL`   | `BR-001[MN][TIER?]`   | `BR-00156SL`    |
| Anthropic        | `ANTHR-[TIER][MN]`      | `ANTHR-FB5`    | `BR-002[TIER][MN]`    | `BR-002FB5`     |
| Google Gemini    | `GOOGL-G[MN][TIER]`     | `GOOGL-G35F`   | `BR-003[MN][TIER]`    | `BR-00335F`     |
| xAI Grok         | `XAI-G[MN]`             | `XAI-G45`      | `BR-004[MN]`          | `BR-00445`      |
| Cursor Composer  | `CURSR-C[MN]`           | `CURSR-C1`     | `BR-005C[MN]`         | `BR-005C1`      |
| Perplexity Sonar | `PPLX-S[MN]`            | `PPLX-S4`      | `BR-006[MN]`          | `BR-0064`       |
| Qwen             | `QWEN-[MN]`             | `QWEN-35`      | `BR-007[MN]`          | `BR-00735`      |
| DeepSeek         | `DPSK-[FAMILY]`         | `DPSK-R1`      | `BR-008[FAMILY]`      | `BR-008R1`      |
| Meta             | `META-[FAMILY CODE]`    | `META-MS`      | `BR-009[FAMILY CODE]` | `BR-009MS`      |
| Moonshot AI      | `KIMI-[FAMILY CODE]`    | `KIMI-K27CODE` | `BR-010[FAMILY CODE]` | `BR-010K27CODE` |
| Zhipu            | `GLM-[MN]`              | `GLM-52`       | `BR-011[MN]`          | `BR-01152`      |
| MiniMax          | `MMAX-[FAMILY CODE]`    | `MMAX-M3`      | `BR-012[FAMILY CODE]` | `BR-012M3`      |
| Mistral AI       | `MSTRL-[TIER][MN]`      | `MSTRL-SM4`    | `BR-013[TIER][MN]`    | `BR-013SM4`     |
| Cohere           | `COHR-[FAMILY CODE]`    | `COHR-APLUS`   | `BR-014[FAMILY CODE]` | `BR-014APLUS`   |

`MN` is an explicitly approved numeric model encoding, not a value guessed from a display name. DeepSeek, Meta, Moonshot AI, MiniMax, and Cohere family codes are explicitly supplied alphanumeric encodings.

## Full Benchmark Record Identifiers

A full identifier has the form:

```text
[MODEL-SPECIFIC RECORD PREFIX]-[THREE-DIGIT SEQUENCE]
```

For example, sequence 17 for `BR-002O48` is `BR-002O48-017`. Sequences are positive, scoped to a model prefix, and limited to `001` through `999` in BEIS v1. Capacity exhaustion is an error; the format must not expand silently.

## Immutability

Identifier generators are used when creating new records. Existing published identifiers must be treated as stored public data. Future identifier rule changes must not cause old Model Identifiers, record prefixes, or Benchmark Record Identifiers to be recomputed. Format changes require an explicit specification change and migration review.

## Operational assignment

Identifiers are assigned only when a creation transaction commits. Administrative previews do not reserve identifiers, and failed transactions do not consume sequence numbers. Withdrawn and superseded records retain their original identifiers. Sequence numbers are never deliberately reused after successful publication.
