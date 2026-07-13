export const SEARCH_FIELDS = [
  'brand',
  'benchmark',
  'record',
  'model',
  'metric',
  'date',
  'org',
] as const;

export type SearchField = (typeof SEARCH_FIELDS)[number];

export interface SearchTerm {
  field: SearchField | null;
  values: string[];
}

export interface SearchAlternative {
  terms: SearchTerm[];
}

export interface ParsedSearchQuery {
  alternatives: SearchAlternative[];
}

const FIELD_PATTERN = new RegExp(`\\b(${SEARCH_FIELDS.join('|')}):\\s*`, 'gi');
const OR_PATTERN = /\s+OR\s+/;

function cleanValue(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function parseAlternative(value: string): SearchAlternative | null {
  const matches = [...value.matchAll(FIELD_PATTERN)];
  if (matches.length === 0) {
    const generalValue = cleanValue(value);
    return generalValue === ''
      ? null
      : { terms: [{ field: null, values: [generalValue] }] };
  }

  const terms: SearchTerm[] = [];
  const leadingValue = cleanValue(value.slice(0, matches[0]!.index));
  if (leadingValue !== '') {
    terms.push({ field: null, values: [leadingValue] });
  }

  for (const [index, match] of matches.entries()) {
    const valueStart = match.index + match[0].length;
    const valueEnd = matches[index + 1]?.index ?? value.length;
    const values = value
      .slice(valueStart, valueEnd)
      .split(',')
      .map(cleanValue)
      .filter((candidate) => candidate !== '');
    if (values.length > 0) {
      terms.push({
        field: match[1]!.toLowerCase() as SearchField,
        values,
      });
    }
  }

  return terms.length === 0 ? null : { terms };
}

/**
 * Parses the optional search language. Commas are OR within a field, separate
 * terms are AND, and an uppercase OR separates complete alternatives.
 * Returns null for a normal, unscoped search so deterministic resolution can
 * retain its existing behavior.
 */
export function parseSearchQuery(query: string): ParsedSearchQuery | null {
  const hasFieldOperator = FIELD_PATTERN.test(query);
  FIELD_PATTERN.lastIndex = 0;
  const hasOrOperator = OR_PATTERN.test(query);
  if (!hasFieldOperator && !hasOrOperator) return null;

  const alternatives = query
    .split(OR_PATTERN)
    .map(parseAlternative)
    .filter((alternative): alternative is SearchAlternative =>
      Boolean(alternative),
    );

  return { alternatives };
}
