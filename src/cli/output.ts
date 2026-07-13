export interface Output {
  write(line?: string): void;
}

export const terminalOutput: Output = {
  write(line = ''): void {
    console.info(line);
  },
};

export function heading(output: Output, value: string): void {
  output.write(value.toUpperCase());
}

export function keyValues(
  output: Output,
  values: ReadonlyArray<readonly [string, unknown]>,
): void {
  for (const [key, value] of values) output.write(`${key}: ${display(value)}`);
}

export function table(
  output: Output,
  rows: readonly Record<string, unknown>[],
): void {
  if (rows.length === 0) {
    output.write('No records found.');
    return;
  }
  const columns = Object.keys(rows[0]!);
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => display(row[column]).length)),
  );
  output.write(
    columns.map((column, index) => column.padEnd(widths[index]!)).join('  '),
  );
  output.write(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) {
    output.write(
      columns
        .map((column, index) => display(row[column]).padEnd(widths[index]!))
        .join('  '),
    );
  }
}

export function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Unknown';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint')
    return value.toString();
  if (typeof value === 'symbol') return value.description ?? 'Symbol';
  if (typeof value === 'function') return value.name || 'Function';
  if (typeof value === 'object') return JSON.stringify(value);
  return 'Unknown';
}
