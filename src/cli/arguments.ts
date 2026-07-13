export interface ParsedArguments {
  command: string[];
  flags: Map<string, string | true>;
}

const BOOLEAN_FLAGS = new Set([
  'yes',
  'debug',
  'allow-possible-duplicate',
  'help',
  'force',
]);

export function parseArguments(argv: readonly string[]): ParsedArguments {
  const command: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith('--')) {
      if (flags.size > 0)
        throw new Error(`Unexpected positional argument: ${argument}`);
      command.push(argument);
      continue;
    }
    const [rawName, inlineValue] = argument.slice(2).split('=', 2);
    if (!rawName) throw new Error('Invalid empty flag.');
    if (flags.has(rawName)) throw new Error(`Duplicate flag: --${rawName}`);
    if (BOOLEAN_FLAGS.has(rawName)) {
      if (inlineValue !== undefined)
        throw new Error(`--${rawName} does not accept a value.`);
      flags.set(rawName, true);
      continue;
    }
    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value.startsWith('--'))
      throw new Error(`Missing value for --${rawName}.`);
    flags.set(rawName, value);
    if (inlineValue === undefined) index += 1;
  }
  return { command, flags };
}

export function assertAllowedFlags(
  flags: ReadonlyMap<string, string | true>,
  allowed: readonly string[],
): void {
  const accepted = new Set([...allowed, 'yes', 'debug', 'help']);
  for (const name of flags.keys()) {
    if (!accepted.has(name)) throw new Error(`Unknown flag: --${name}`);
  }
}

export function requiredFlag(
  flags: ReadonlyMap<string, string | true>,
  name: string,
): string {
  const value = flags.get(name);
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`Missing required flag: --${name}`);
  return value;
}

export function optionalFlag(
  flags: ReadonlyMap<string, string | true>,
  name: string,
): string | undefined {
  const value = flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

export function booleanValue(
  value: string | undefined,
  label: string,
): boolean | null {
  if (value === undefined) return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${label} must be true or false.`);
}
