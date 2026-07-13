import { createInterface } from 'node:readline/promises';

export async function confirm(
  question: string,
  options: {
    yes: boolean;
    input?: NodeJS.ReadableStream;
    output?: NodeJS.WritableStream;
  },
): Promise<boolean> {
  if (options.yes) return true;
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  if (!('isTTY' in input) || input.isTTY !== true) {
    throw new Error(
      'Confirmation required; use --yes for non-interactive operation.',
    );
  }
  const readline = createInterface({ input, output });
  try {
    const answer = await readline.question(`${question} [y/N] `);
    return (
      answer.trim().toLowerCase() === 'y' ||
      answer.trim().toLowerCase() === 'yes'
    );
  } finally {
    readline.close();
  }
}
