import { describe, expect, it } from 'vitest';

import {
  normalizeHtml,
  normalizeMarkdown,
  normalizePdf,
  normalizePlainText,
} from '../../src/ingestion/normalize.js';

const bytes = (value: string): Uint8Array => Buffer.from(value);

function tinyPdf(): Uint8Array {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n<< /Length 45 >>\nstream\nBT /F1 12 Tf 72 720 Td (PDF evidence) Tj ET\nendstream\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n `)
    .join(
      '\n',
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

describe('source content normalization', () => {
  it('removes HTML scripts/styles and preserves headings, paragraphs, and tables', () => {
    const document = normalizeHtml(
      '1',
      bytes(`<!doctype html><title>Report</title><style>.x{}</style><script>bad()</script>
        <h2>GPQA Diamond</h2><p>Evaluation results.</p>
        <table><caption>Scores</caption><tr><th>Model</th><th>Accuracy</th></tr><tr><td>GPT-5.5</td><td>88.1%</td></tr></table>`),
    );
    expect(document.text).not.toContain('bad()');
    expect(document.text).not.toContain('.x');
    expect(document.text).toContain('GPQA Diamond');
    expect(document.sections[0]).toMatchObject({
      heading: 'GPQA Diamond',
      text: 'Evaluation results.',
    });
    expect(document.tables[0]).toMatchObject({
      caption: 'Scores',
      sectionHeading: 'GPQA Diamond',
      headers: ['Model', 'Accuracy'],
      rows: [['GPT-5.5', '88.1%']],
    });
  });

  it('preserves Markdown table structure and heading context', () => {
    const document = normalizeMarkdown(
      '1',
      bytes(
        '# Report\n## SWE-bench Verified Results\n| Model | Resolved |\n| --- | --- |\n| GPT-5.5 | 74.0% |',
      ),
    );
    expect(document.title).toBe('Report');
    expect(document.tables[0]).toMatchObject({
      sectionHeading: 'SWE-bench Verified Results',
      headers: ['Model', 'Resolved'],
      rows: [['GPT-5.5', '74.0%']],
    });
  });

  it('normalizes plain-text newlines without inferring structure', () => {
    const document = normalizePlainText('1', bytes('first\r\n\r\n\r\nsecond'));
    expect(document.text).toBe('first\n\nsecond');
    expect(document.tables).toEqual([]);
  });

  it('preserves PDF page references when text is extractable', async () => {
    const document = await normalizePdf('1', tinyPdf());
    expect(document.pages).toMatchObject([
      { pageNumber: 1, text: 'PDF evidence' },
    ]);
  });
});
