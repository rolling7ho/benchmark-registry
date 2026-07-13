import { load } from 'cheerio';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { sha256 } from './hash.js';
import type {
  NormalizedPage,
  NormalizedSection,
  NormalizedSourceDocument,
  NormalizedTable,
  SupportedContentType,
} from './types.js';

function cleanText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function emptyDocument(
  sourceId: string,
  contentType: SupportedContentType,
  content: Uint8Array,
): Omit<NormalizedSourceDocument, 'title' | 'text'> {
  return {
    sourceId,
    contentType,
    sections: [],
    tables: [],
    pages: [],
    contentHash: sha256(content),
    warnings: [],
  };
}

export function normalizeHtml(
  sourceId: string,
  content: Uint8Array,
): NormalizedSourceDocument {
  const html = Buffer.from(content).toString('utf8');
  const $ = load(html);
  $(
    'script, style, noscript, template, svg, nav, header, footer, aside',
  ).remove();
  const title = cleanText($('title').first().text()) || null;
  const sections: NormalizedSection[] = [];
  let heading: string | null = null;
  let sectionParts: string[] = [];
  let sectionNumber = 1;
  const flush = (): void => {
    const text = cleanText(sectionParts.join('\n'));
    if (text.length > 0) {
      sections.push({
        heading,
        text,
        location:
          heading === null
            ? `HTML section ${sectionNumber}`
            : `Section: ${heading}`,
      });
      sectionNumber += 1;
    }
    sectionParts = [];
  };
  $('body')
    .find('h1, h2, h3, h4, h5, h6, p, li')
    .each((_index, element) => {
      const tag = element.tagName.toLowerCase();
      const text = cleanText($(element).text());
      if (text.length === 0) return;
      if (/^h[1-6]$/.test(tag)) {
        flush();
        heading = text;
      } else {
        sectionParts.push(text);
      }
    });
  flush();

  const tables: NormalizedTable[] = [];
  $('table').each((tableIndex, tableElement) => {
    const table = $(tableElement);
    const rows = table
      .find('tr')
      .toArray()
      .map((row) =>
        $(row)
          .children('th, td')
          .toArray()
          .map((cell) => cleanText($(cell).text())),
      )
      .filter((row) => row.length > 0);
    if (rows.length === 0) return;
    const firstRowHasHeaders =
      table.find('tr').first().children('th').length > 0;
    const precedingHeading = table
      .prevAll('h1, h2, h3, h4, h5, h6')
      .first()
      .text();
    const context = table.prevAll('p').first().text();
    tables.push({
      index: tableIndex + 1,
      caption: cleanText(table.find('caption').first().text()) || null,
      sectionHeading: cleanText(precedingHeading) || null,
      context: cleanText(context) || null,
      headers: firstRowHasHeaders ? rows[0]! : [],
      rows: firstRowHasHeaders ? rows.slice(1) : rows,
      location: `HTML table ${tableIndex + 1}`,
    });
  });

  return {
    ...emptyDocument(sourceId, 'text/html', content),
    title,
    text: cleanText($('body').text()),
    sections,
    tables,
  };
}

function markdownCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cleanText(cell));
}

function isMarkdownSeparator(line: string): boolean {
  const cells = markdownCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function normalizeMarkdown(
  sourceId: string,
  content: Uint8Array,
): NormalizedSourceDocument {
  const text = cleanText(Buffer.from(content).toString('utf8'));
  const lines = text.split('\n');
  const sections: NormalizedSection[] = [];
  const tables: NormalizedTable[] = [];
  let heading: string | null = null;
  let parts: string[] = [];
  const flush = (): void => {
    const sectionText = cleanText(parts.join('\n'));
    if (sectionText.length > 0)
      sections.push({
        heading,
        text: sectionText,
        location:
          heading === null
            ? `Markdown section ${sections.length + 1}`
            : `Section: ${heading}`,
      });
    parts = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const headingMatch = /^#{1,6}\s+(.+)$/.exec(line);
    if (headingMatch !== null) {
      flush();
      heading = cleanText(headingMatch[1]!);
      continue;
    }
    if (
      line.includes('|') &&
      lines[index + 1] !== undefined &&
      isMarkdownSeparator(lines[index + 1]!)
    ) {
      const headers = markdownCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index]!.includes('|')) {
        rows.push(markdownCells(lines[index]!));
        index += 1;
      }
      index -= 1;
      tables.push({
        index: tables.length + 1,
        caption: null,
        sectionHeading: heading,
        context: cleanText(parts.at(-1) ?? '') || null,
        headers,
        rows,
        location: `Markdown table ${tables.length + 1}`,
      });
      parts.push(
        [headers.join(' | '), ...rows.map((row) => row.join(' | '))].join('\n'),
      );
      continue;
    }
    parts.push(line);
  }
  flush();
  const title = lines
    .map((line) => /^#\s+(.+)$/.exec(line)?.[1])
    .find((value) => value !== undefined);
  return {
    ...emptyDocument(sourceId, 'text/markdown', content),
    title: title === undefined ? null : cleanText(title),
    text,
    sections,
    tables,
  };
}

export function normalizePlainText(
  sourceId: string,
  content: Uint8Array,
): NormalizedSourceDocument {
  const text = cleanText(Buffer.from(content).toString('utf8'));
  return {
    ...emptyDocument(sourceId, 'text/plain', content),
    title: null,
    text,
    sections:
      text.length === 0
        ? []
        : [{ heading: null, text, location: 'Plain text' }],
  };
}

export async function normalizePdf(
  sourceId: string,
  content: Uint8Array,
): Promise<NormalizedSourceDocument> {
  const loadingTask = getDocument({ data: new Uint8Array(content) });
  const pdf = await loadingTask.promise;
  const pages: NormalizedPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = cleanText(
        textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' '),
      );
      pages.push({ pageNumber, text });
    }
  } finally {
    await loadingTask.destroy();
  }
  const text = pages
    .map((page) => page.text)
    .filter(Boolean)
    .join('\n\n');
  const document: NormalizedSourceDocument = {
    ...emptyDocument(sourceId, 'application/pdf', content),
    title: null,
    text,
    pages,
  };
  if (text.length === 0)
    document.warnings.push(
      'PDF contains no extractable text; OCR is not supported.',
    );
  return document;
}

export async function normalizeContent(
  sourceId: string,
  contentType: SupportedContentType,
  content: Uint8Array,
): Promise<NormalizedSourceDocument> {
  switch (contentType) {
    case 'text/html':
      return normalizeHtml(sourceId, content);
    case 'text/markdown':
      return normalizeMarkdown(sourceId, content);
    case 'text/plain':
      return normalizePlainText(sourceId, content);
    case 'application/pdf':
      return normalizePdf(sourceId, content);
  }
}
