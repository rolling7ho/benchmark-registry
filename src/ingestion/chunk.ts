import {
  MAX_CHUNK_TEXT_LENGTH,
  type ExtractionChunk,
  type NormalizedSourceDocument,
} from './types.js';

export function chunkDocument(
  document: NormalizedSourceDocument,
  maximumLength = MAX_CHUNK_TEXT_LENGTH,
): ExtractionChunk[] {
  const chunks: ExtractionChunk[] = [];
  for (const section of document.sections) {
    chunks.push({
      text: section.text.slice(0, maximumLength),
      location: section.location,
      heading: section.heading,
      tables: document.tables.filter(
        (table) => table.sectionHeading === section.heading,
      ),
      truncated: section.text.length > maximumLength,
    });
  }
  for (const page of document.pages) {
    chunks.push({
      text: page.text.slice(0, maximumLength),
      location: `PDF page ${page.pageNumber}`,
      heading: null,
      tables: [],
      truncated: page.text.length > maximumLength,
    });
  }
  if (chunks.length === 0) {
    chunks.push({
      text: document.text.slice(0, maximumLength),
      location: 'Source document',
      heading: null,
      tables: document.tables,
      truncated: document.text.length > maximumLength,
    });
  }
  return chunks;
}
