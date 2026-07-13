export interface BenchmarkDisplayInput {
  familyName: string;
  versionLabel?: string | null;
  variantName?: string | null;
}

export function formatBenchmarkDisplay(input: BenchmarkDisplayInput): string {
  const label = input.variantName?.trim() || input.versionLabel?.trim() || null;
  if (label === null) return input.familyName;
  const family = input.familyName.trim();
  return label.toLocaleLowerCase().startsWith(family.toLocaleLowerCase())
    ? label
    : `${family} ${label}`;
}
