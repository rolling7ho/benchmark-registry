import { PageContainer, PageHeader } from "./ui/components";
import { DATA_LICENSE } from "./data-license";
import { RESULTS_CSV_PATH } from "../worker/downloads";
export function AboutPage() {
  return <PageContainer className="registry-page legal-page"><PageHeader title="About" />
    <p>Benchmark Registry tracks AI models, benchmark versions, reported scores, evaluators and primary source links.</p>
    <p>The registry accepts results from primary sources only: benchmark or evaluator publications, followed by official model developer sources. Results retain their original metrics and evaluation context.</p>
    <p><a href={`/${RESULTS_CSV_PATH}`} download>Download every published result (CSV)</a>. The data is licensed under <a href={DATA_LICENSE.url} rel="noopener noreferrer">{DATA_LICENSE.name}</a>: credit Benchmark Registry and link the record you cite.</p>
    <p><a href="https://github.com/rolling7ho/benchmark-registry" rel="noopener noreferrer">Registry on GitHub</a></p>
    {/* TODO owner: add a verified "Neutrality and funding" heading and statement.
        Funding and neutrality statement to be added by the owner.
        This placeholder is intentionally absent from rendered HTML. */}
  </PageContainer>;
}
