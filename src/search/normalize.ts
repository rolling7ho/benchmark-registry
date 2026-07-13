export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/[\s._-]/g, '');
}
