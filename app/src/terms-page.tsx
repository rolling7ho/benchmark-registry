import { DATA_LICENSE } from "./data-license";
import { SUPPORT_EMAIL } from "./legal-content";
export function TermsContent() {
  return <>
    <p className="legal-updated">Last updated October 5, 2026</p>
    <p>Benchmark Registry is a free public reference for reported AI benchmark results. By using the site you agree to these terms.</p>
    <h2>Results and sources</h2><p>Records come from third-party primary sources and are provided as-is, without warranty of any kind. Check each source, metric, version and evaluator before citing a number. Records can be incomplete and may be corrected. The registry does not rank models.</p>
    <p>Use the <a href="/corrections">corrections log</a> and <a href="/contact">contact page</a> to report errors.</p>
    <h2>Licensing</h2><p>Registry data is licensed under <a href={DATA_LICENSE.url} rel="noopener noreferrer">{DATA_LICENSE.name}</a>. Attribution: {DATA_LICENSE.attribution}</p>
    <p>Repository code is licensed under <a href="https://github.com/rolling7ho/benchmark-registry/blob/main/LICENSE" rel="noopener noreferrer">Apache-2.0</a>. Linked third-party publications have their own terms.</p>
    <h2>Fair use of the service</h2><p>Please access the site at a reasonable rate and do not interfere with its operation. The full dataset is available in the <a href="https://github.com/rolling7ho/benchmark-registry" rel="noopener noreferrer">GitHub repository</a> for bulk use.</p>
    <h2>Liability</h2><p>Benchmark Registry and its maintainers are not liable for decisions made or losses incurred from using the registry or the sources it links to.</p>
    <h2>Changes</h2><p>These terms may be updated; the date above shows the latest revision.</p>
    <h2>Contact</h2><p>Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
  </>;
}
