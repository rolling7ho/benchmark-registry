/** The official contact address. */
export const SUPPORT_EMAIL = "support@benchmarkregistry.org";

export const LEGAL_KINDS = ["legal", "privacy", "terms", "about", "contact"] as const;
export type LegalKind = typeof LEGAL_KINDS[number];
export const LEGAL_PATHS = LEGAL_KINDS.map((kind) => `/${kind}`);
export const LEGAL_METADATA = {
  about: {title:"About",description:"About Benchmark Registry, a project tracking AI model benchmark results from primary sources."},
  contact: {title:"Contact",description:"Contact Benchmark Registry by email or through GitHub issues."},
  legal: { title: "Legal", description: "Privacy, terms, and support information for Benchmark Registry." },
  privacy: { title: "Privacy Policy", description: "How Benchmark Registry processes visitor information." },
  terms: { title: "Terms", description: "Terms for using Benchmark Registry." },
} as const;

export function isLegalKind(kind: string): kind is LegalKind {
  return LEGAL_KINDS.some((candidate) => candidate === kind);
}
