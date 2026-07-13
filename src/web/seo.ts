export const CANONICAL_ORIGIN = 'https://benchmarkregistry.org';
export const SITE_NAME = 'Benchmark Registry';

export interface PageSeo {
  title: string;
  description: string;
  canonicalUrl: string | null;
  robots: 'index,follow' | 'noindex,follow';
  openGraphType: 'website';
  jsonLd: string | null;
}

interface PageSeoInput {
  title: string;
  description: string;
  path?: string | undefined;
  index?: boolean | undefined;
  includeSiteIdentity?: boolean | undefined;
}

export function canonicalUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`Canonical paths must be root-relative: ${path}`);
  }
  return new URL(path, CANONICAL_ORIGIN).toString();
}

export function canonicalPagePath(path: string, page: number): string {
  if (page <= 1) return path;
  const url = new URL(path, CANONICAL_ORIGIN);
  url.searchParams.set('page', page.toString());
  return `${url.pathname}${url.search}`;
}

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function createPageSeo(input: PageSeoInput): PageSeo {
  return {
    title: input.title,
    description: input.description,
    canonicalUrl: input.path === undefined ? null : canonicalUrl(input.path),
    robots: input.index === false ? 'noindex,follow' : 'index,follow',
    openGraphType: 'website',
    jsonLd:
      input.includeSiteIdentity === true
        ? serializeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: SITE_NAME,
            url: `${CANONICAL_ORIGIN}/`,
          })
        : null,
  };
}

export function modelSlug(modelIdentifier: string): string {
  return modelIdentifier.toLowerCase();
}
