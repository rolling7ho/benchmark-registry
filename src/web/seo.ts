export const CANONICAL_ORIGIN = 'https://www.benchmarkregistry.org';
export const SITE_NAME = 'Benchmark Registry';
export const SOCIAL_IMAGE_PATH = '/social-card.png';

export const SEO_ROUTE_POLICY = {
  INDEXABLE: 'index,follow',
  NON_INDEXABLE: 'noindex,follow',
} as const;

export type SeoRoutePolicy = keyof typeof SEO_ROUTE_POLICY;

export interface BreadcrumbItem {
  name: string;
  path?: string | undefined;
}

export interface PageSeo {
  title: string;
  description: string;
  canonicalUrl: string | null;
  robots: (typeof SEO_ROUTE_POLICY)[SeoRoutePolicy];
  openGraphType: 'website';
  socialImageUrl: string;
  socialImageAlt: string;
  jsonLd: string | null;
}

interface PageSeoInput {
  title: string;
  description: string;
  path?: string | undefined;
  policy?: SeoRoutePolicy | undefined;
  includeSiteIdentity?: boolean | undefined;
  datasetModified?: string | null | undefined;
  breadcrumbs?: readonly BreadcrumbItem[] | undefined;
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

function breadcrumbNode(items: readonly BreadcrumbItem[]): object | null {
  if (items.length === 0) return null;
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.path === undefined ? {} : { item: canonicalUrl(item.path) }),
    })),
  };
}

function structuredData(
  input: PageSeoInput,
  pageUrl: string | null,
): string | null {
  if (pageUrl === null) return null;

  const organizationId = `${CANONICAL_ORIGIN}/#organization`;
  const websiteId = `${CANONICAL_ORIGIN}/#website`;
  const datasetId = `${CANONICAL_ORIGIN}/#dataset`;
  const graph: object[] = [
    {
      '@type': 'WebPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: input.title,
      description: input.description,
      isPartOf: { '@id': websiteId },
      primaryImageOfPage: {
        '@id': `${CANONICAL_ORIGIN}${SOCIAL_IMAGE_PATH}#image`,
      },
      ...(input.includeSiteIdentity === true
        ? { mainEntity: { '@id': datasetId } }
        : {}),
    },
    {
      '@type': 'ImageObject',
      '@id': `${CANONICAL_ORIGIN}${SOCIAL_IMAGE_PATH}#image`,
      url: `${CANONICAL_ORIGIN}${SOCIAL_IMAGE_PATH}`,
      contentUrl: `${CANONICAL_ORIGIN}${SOCIAL_IMAGE_PATH}`,
      width: 1200,
      height: 630,
      caption: SITE_NAME,
    },
  ];

  if (input.includeSiteIdentity === true) {
    graph.push(
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: SITE_NAME,
        url: `${CANONICAL_ORIGIN}/`,
        logo: {
          '@type': 'ImageObject',
          '@id': `${CANONICAL_ORIGIN}/logo.png#image`,
          url: `${CANONICAL_ORIGIN}/logo.png`,
          contentUrl: `${CANONICAL_ORIGIN}/logo.png`,
          width: 512,
          height: 512,
        },
        description:
          'An independent public registry of reported artificial intelligence benchmark evaluations and their sources.',
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: SITE_NAME,
        url: `${CANONICAL_ORIGIN}/`,
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'Dataset',
        '@id': datasetId,
        name: 'Benchmark Registry AI Benchmark Records',
        description:
          'A public registry of reported artificial intelligence benchmark evaluations, including canonical models, benchmark versions or variants, metrics, scores, primary sources, and known evaluation context.',
        url: `${CANONICAL_ORIGIN}/`,
        creator: { '@id': organizationId },
        publisher: { '@id': organizationId },
        ...(input.datasetModified === null ||
        input.datasetModified === undefined
          ? {}
          : { dateModified: input.datasetModified }),
      },
    );
  }

  const breadcrumbs = breadcrumbNode(input.breadcrumbs ?? []);
  if (breadcrumbs !== null) graph.push(breadcrumbs);

  return serializeJsonLd({
    '@context': 'https://schema.org',
    '@graph': graph,
  });
}

export function createPageSeo(input: PageSeoInput): PageSeo {
  const pageUrl = input.path === undefined ? null : canonicalUrl(input.path);
  return {
    title: input.title,
    description: input.description,
    canonicalUrl: pageUrl,
    robots: SEO_ROUTE_POLICY[input.policy ?? 'INDEXABLE'],
    openGraphType: 'website',
    socialImageUrl: canonicalUrl(SOCIAL_IMAGE_PATH),
    socialImageAlt: 'Benchmark Registry institutional mark',
    jsonLd: structuredData(input, pageUrl),
  };
}

export function modelSlug(modelIdentifier: string): string {
  return modelIdentifier.toLowerCase();
}
