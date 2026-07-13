import { CANONICAL_ORIGIN, canonicalUrl } from './seo.js';
import type { SitemapEntry } from '../db/sitemaps.js';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function renderUrlSet(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (entry) =>
        `  <url><loc>${escapeXml(canonicalUrl(entry.path))}</loc>${entry.lastModified === undefined ? '' : `<lastmod>${entry.lastModified.toISOString()}</lastmod>`}</url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}${urls === '' ? '' : '\n'}</urlset>\n`;
}

export function renderSitemapIndex(paths: string[]): string {
  const sitemaps = paths
    .map(
      (path) =>
        `  <sitemap><loc>${escapeXml(new URL(path, CANONICAL_ORIGIN).toString())}</loc></sitemap>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps}\n</sitemapindex>\n`;
}
