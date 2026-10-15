import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import template from "../index.html?raw";
import { handleRequest, type Env } from "./index";
import type { RegistryReader } from "./materialized-repository";
import { loadRegistryRoute, resolveRegistryRoute } from "../src/registry";

const pages = [
  ["legal", "Legal", "Privacy, terms, and support information for Benchmark Registry."],
  ["privacy", "Privacy Policy", "How Benchmark Registry processes visitor information."],
  ["terms", "Terms", "Terms for using Benchmark Registry."],
] as const;

function fixture() {
  const reads = vi.fn(() => { throw new Error("LEGAL MUST NOT READ KV OR D1"); });
  const env = {
    DB: { prepare: reads }, ASSETS: { fetch: async () => new Response(template, { headers: { "Content-Type": "text/html" } }) },
  } as unknown as Env;
  return { env, reads };
}

it.each(pages)("serves %s as meaningful static initial HTML with production metadata and no data reads", async (kind, title, description) => {
  const { env, reads } = fixture();
  const response = await handleRequest(new Request(`https://benchmarkregistry.org/${kind}`), env);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toMatch(new RegExp(`<h1\\b[^>]*>${title}</h1>`, "u"));
  expect(html).toContain(`<title>${title} | Benchmark Registry</title>`);
  expect(html).toContain(`<meta name="description" content="${description}">`);
  expect(html).toContain(`<meta property="og:title" content="${title} | Benchmark Registry">`);
  expect(html).toContain(`rel="canonical" href="https://benchmarkregistry.org/${kind}"`);
  expect(html).not.toContain('name="robots"');
  expect(html).toContain('href="/legal">Legal</a>');
  expect(html).toContain('href="/contact"');
  expect(html).toContain(`"loaded":{"kind":"${kind}"}`);
  expect(reads).not.toHaveBeenCalled();
  const fetcher = vi.fn();
  expect(await loadRegistryRoute(resolveRegistryRoute(`/${kind}`), "", fetcher)).toEqual({ kind });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(pages)("keeps the canonical and marks query variants noindex on %s", async (kind) => {
  const { env } = fixture();
  const queried = await handleRequest(new Request(`https://benchmarkregistry.org/${kind}?q=private`), env);
  const html = await queried.text();
  expect(html).toContain(`rel="canonical" href="https://benchmarkregistry.org/${kind}"`);
  expect(html).toContain('name="robots" content="noindex, follow"');
});

it("serves final legal text with the official contact and keeps funding placeholders out of public HTML", async () => {
  const {env}=fixture();
  const about=await (await handleRequest(new Request("https://benchmarkregistry.org/about"),env)).text();
  expect(about).not.toContain("Densa");expect(about).not.toContain("Funding and neutrality statement");
  const privacy=await (await handleRequest(new Request("https://benchmarkregistry.org/privacy"),env)).text();
  expect(privacy).toContain("Cloudflare Web Analytics");
  expect(privacy).toContain("does not keep search logs");
  expect(privacy).toContain('href="mailto:support@benchmarkregistry.org"');
  expect(privacy).not.toMatch(/draft|owner review|GDPR compliant|retention period/iu);
  const terms=await (await handleRequest(new Request("https://benchmarkregistry.org/terms"),env)).text();
  expect(terms).toContain("provided as-is");expect(terms).toContain("CC BY 4.0");expect(terms).toContain('href="/corrections"');
  expect(terms).toContain('href="mailto:support@benchmarkregistry.org"');expect(terms).not.toMatch(/draft|owner review/iu);
  const contact=await (await handleRequest(new Request("https://benchmarkregistry.org/contact"),env)).text();
  expect(contact).toContain('href="mailto:support@benchmarkregistry.org"');
});

it.each(["/legal/arbitrary", "/privacy/arbitrary", "/terms/arbitrary"])("returns an independent static 404 for %s", async (path) => {
  const { env, reads } = fixture();
  expect((await handleRequest(new Request(`https://benchmarkregistry.org${path}`), env)).status).toBe(404);
  expect(reads).not.toHaveBeenCalled();
});

it("canonicalizes trailing slash and supports HEAD with no body or Registry reads", async () => {
  const { env, reads } = fixture();
  const redirect = await handleRequest(new Request("https://benchmarkregistry.org/legal/"), env);
  expect(redirect.status).toBe(308);
  expect(redirect.headers.get("Location")).toBe("https://benchmarkregistry.org/legal");
  const head = await handleRequest(new Request("https://benchmarkregistry.org/privacy", { method: "HEAD" }), env);
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  expect(reads).not.toHaveBeenCalled();
});

it("adds static legal sitemap paths exactly once to an existing materialized inventory", async () => {
  const { env } = fixture();
  const repository = { seoSnapshot:async()=>({pages:{"/recent":{kind:"recent"}},comparisons:[]}), sitemapPaths: async () => ["/", "/models", "/legal"] } as unknown as RegistryReader;
  const response = await handleRequest(new Request("https://benchmarkregistry.org/sitemap.xml"), env, repository);
  const xml = await response.text();
  expect([...xml.matchAll(/<loc>/gu)]).toHaveLength(11);
  expect([...xml.matchAll(/https:\/\/benchmarkregistry.org\/compare</gu)]).toHaveLength(1);
  for (const [kind] of pages) expect([...xml.matchAll(new RegExp(`https://benchmarkregistry.org/${kind}<`, "g"))]).toHaveLength(1);
  expect(xml).not.toMatch(/mailto:|staging\./u);
});

it("deploys static assets only, so no request runs code or is logged", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  const maintenance = JSON.parse(readFileSync(new URL("../wrangler.maintenance.jsonc", import.meta.url), "utf8"));
  expect(config.main).toBeUndefined();
  for (const environment of ["staging", "production"]) {
    const deployment = { ...config, ...config.env[environment] };
    expect(deployment.main).toBeUndefined();
    expect(deployment.assets).toEqual({ directory: "./dist/client", html_handling: "auto-trailing-slash", not_found_handling: "404-page" });
    for (const binding of ["d1_databases", "kv_namespaces", "vars", "observability"]) expect(deployment[binding]).toBeUndefined();
  }
  for (const environment of ["staging", "production"]) expect(maintenance.env[environment].kv_namespaces).toBeUndefined();
  expect(maintenance.env.staging.d1_databases[0].database_id).not.toBe(maintenance.env.production.d1_databases[0].database_id);
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/console\.|__p1111_probe|request\.cf/u);
});
