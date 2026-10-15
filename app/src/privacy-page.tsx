import { SUPPORT_EMAIL } from "./legal-content";
export function PrivacyContent({analyticsEnabled=false}:{analyticsEnabled?:boolean}) {
  return <>
    <p className="legal-updated">Last updated October 5, 2026</p>
    <p>Benchmark Registry is a public reference of AI benchmark results. You can use it without an account, and it does not ask for personal information.</p>
    <h2>What the site stores in your browser</h2><p>If you choose a colour theme, the site remembers it in your browser's local storage. Your browser may also cache pages and published data files. The registry itself does not set cookies.</p>
    <h2>Search and filters</h2><p>Searches, filters, sorting and paging run in your browser against the published data files. Their terms appear in the page address so that a view can be shared. The registry does not keep search logs.</p>
    <h2>Hosting and security</h2><p>Cloudflare hosts and delivers the site. To deliver pages and protect the service, Cloudflare processes request information such as IP addresses and browser details, and its security features may set cookies or session storage that keep the site available. See <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener noreferrer">Cloudflare's privacy policy</a>.</p>
    <h2>Analytics</h2><p>benchmarkregistry.org uses Cloudflare Web Analytics to count page views and measure page performance in aggregate. Its script does not set cookies or use browser storage, Cloudflare discards the source IP address at the data center that receives the report, and page addresses are recorded without their query strings. Visits that reach Cloudflare data centers in the EU, the EEA, Switzerland or the United Kingdom are excluded from collection. Ad blockers may stop the script from loading.{analyticsEnabled ? " This deployment also loads an analytics script configured in the application." : ""}</p>
    <h2>External services</h2><p>Source links, GitHub and email open services with their own privacy practices. The registry displays public model and benchmark data.</p>
    <h2>Contact</h2><p>For questions about this policy, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. For data errors, see <a href="/corrections">Corrections</a>.</p>
  </>;
}
