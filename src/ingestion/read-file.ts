import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';

import { MAX_SOURCE_BYTES, type SupportedContentType } from './types.js';

const EXTENSION_TYPES: Readonly<Record<string, SupportedContentType>> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
};

function validateSignature(
  contentType: SupportedContentType,
  content: Uint8Array,
): void {
  if (
    contentType === 'application/pdf' &&
    Buffer.from(content.subarray(0, 5)).toString() !== '%PDF-'
  )
    throw new Error('File content does not match the .pdf extension.');
  if (contentType !== 'application/pdf' && content.includes(0))
    throw new Error('Text source file contains binary content.');
}

export async function readSourceFile(
  file: string,
  maximumBytes = MAX_SOURCE_BYTES,
): Promise<{ content: Uint8Array; contentType: SupportedContentType }> {
  const contentType = EXTENSION_TYPES[extname(file).toLowerCase()];
  if (contentType === undefined)
    throw new Error(
      `Unsupported source file extension: ${extname(file) || '(none)'}`,
    );
  const metadata = await stat(file);
  if (!metadata.isFile()) throw new Error('Source path is not a regular file.');
  if (metadata.size > maximumBytes)
    throw new Error(`Source file exceeds the ${maximumBytes} byte limit.`);
  const content = await readFile(file);
  validateSignature(contentType, content);
  return { content, contentType };
}
