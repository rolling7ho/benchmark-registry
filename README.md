<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/Benchmark-Registry-Logo-Full-White.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/Benchmark-Registry-Logo-Full-Dark.png">
  <img alt="Benchmark Registry" src="assets/Benchmark-Registry-Logo-Full-Dark.png">
</picture>

# Benchmark Registry

<p>
  <a href="https://benchmarkregistry.org"><img alt="Website" src="https://img.shields.io/website?url=https%3A%2F%2Fbenchmarkregistry.org&label=benchmarkregistry.org"></a>
  <a href="https://github.com/rolling7ho/benchmark-registry/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/rolling7ho/benchmark-registry/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <img alt="Models" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fbenchmarkregistry.org%2Fversion.json&query=%24.counts.models&label=models&color=2563eb">
  <img alt="Results" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fbenchmarkregistry.org%2Fversion.json&query=%24.counts.results&label=results&color=2563eb">
  <img alt="Benchmarks" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fbenchmarkregistry.org%2Fversion.json&query=%24.counts.benchmarks&label=benchmarks&color=2563eb">
  <a href="LICENSE"><img alt="Code license: Apache 2.0" src="https://img.shields.io/badge/code-Apache%202.0-informational"></a>
  <a href="LICENSE-DATA"><img alt="Data license: CC BY 4.0" src="https://img.shields.io/badge/data-CC%20BY%204.0-informational"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-React-3178c6?logo=typescript&logoColor=white">
  <img alt="Python" src="https://img.shields.io/badge/Python-ingestor-3776ab?logo=python&logoColor=white">
  <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-static%20assets%20%2B%20D1-f38020?logo=cloudflare&logoColor=white">
</p>

[Benchmark Registry](https://benchmarkregistry.org) puts AI models and their benchmark results in one place. It solves a simple, common problem: benchmark results are scattered across model announcements, benchmark sites, companies and evaluators.

## What is Benchmark Registry?

Benchmark Registry is an ever-updating, open-source, free-to-use public registry of AI models and their benchmark results. Every result links to its primary source.

It tracks:

- **Companies and model developers**
- **Models and model families**
- **Reasoning or effort settings** recorded with each result
- **Benchmark versions and metrics**
- **Evaluators**
- **Sources and reported dates**

Benchmark results are sourced from primary sources:

- **Official benchmark or evaluator results**
- **Official model developer system cards, technical reports, or blogs**

## Registry numbers

Models receive stable Registry numbers based on their provider namespace and the order in which they are added to the Registry. ***(Ex. 10006 GPT-5.3-Codex)***

### Namespace allocation

```text
00  = Stealth models
10  = OpenAI
15  = OpenAI OSS
20  = Anthropic
30  = Google
35  = Google Gemma
40  = SpaceXAI
50  = Cursor
60  = NVIDIA
70  = Microsoft
80  = Meta
90  = Mistral
100 = reserved; intentionally unallocated
110 = DeepSeek
120 = Moonshot AI
130 = Alibaba
140 = MiniMax
150 = Z.ai
160 = Thinking Machines
170 = SSI
```

### Numbering rules

- A Registry No. is the namespace prefix followed by a three-digit sequence (001–999).
- Published numbers never change and are never reused.
- A new model takes the next free sequence in its namespace. A model released before already-numbered ones is added at the end as a late backfill.
- A new number means a separately released model; renames and API aliases stay aliases of the existing number.
- Namespace 00 holds stealth models, which may later redirect to their confirmed number.
- A namespace can be allocated before its company has any models in the Registry; SSI's is.

## Corrections and missing results

Found a wrong score or a missing result? Open an issue with the [correction](https://github.com/rolling7ho/benchmark-registry/issues/new?template=correct-a-result.yml) or [missing result](https://github.com/rolling7ho/benchmark-registry/issues/new?template=submit-a-missing-result.yml) template and link the primary source, or email support@benchmarkregistry.org.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the repository is laid out, how to run the checks, and how data changes are reviewed. Security issues go through [SECURITY.md](SECURITY.md), not public issues.

## License

- Code: [Apache License 2.0](LICENSE)
- Data: [CC BY 4.0](LICENSE-DATA)
