import { createHash } from 'node:crypto';

import type { Selectable } from 'kysely';

import type { Database } from '../db/database.js';
import type { EvaluationConfigurationsTable } from '../db/types.js';
import { markRegistryUpdated } from '../db/registry-metadata.js';

export interface EvaluationConfigurationInput {
  shots?: number | null | undefined;
  reasoningMode?: string | null | undefined;
  reasoningEffort?: string | null | undefined;
  passCount?: number | null | undefined;
  agentScaffold?: string | null | undefined;
  evaluationHarness?: string | null | undefined;
  temperature?: number | null | undefined;
  topP?: number | null | undefined;
  maxOutputTokens?: number | null | undefined;
  systemPromptDescription?: string | null | undefined;
  additionalConfiguration?: Record<string, unknown> | undefined;
}

export interface NormalizedEvaluationConfiguration {
  additional_configuration: Record<string, unknown>;
  agent_scaffold: string | null;
  evaluation_harness: string | null;
  max_output_tokens: number | null;
  pass_count: number | null;
  reasoning_effort: string | null;
  reasoning_mode: string | null;
  shots: number | null;
  system_prompt_description: string | null;
  temperature: number | null;
  top_p: number | null;
}

function text(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function normalizeEvaluationConfiguration(
  input: EvaluationConfigurationInput,
): NormalizedEvaluationConfiguration {
  if (input.shots !== undefined && input.shots !== null && input.shots < 0)
    throw new Error('Shots must be a non-negative integer.');
  if (
    input.shots !== undefined &&
    input.shots !== null &&
    !Number.isInteger(input.shots)
  )
    throw new Error('Shots must be a non-negative integer.');
  if (
    input.passCount !== undefined &&
    input.passCount !== null &&
    (!Number.isInteger(input.passCount) || input.passCount <= 0)
  )
    throw new Error('Pass count must be a positive integer.');
  if (
    input.maxOutputTokens !== undefined &&
    input.maxOutputTokens !== null &&
    (!Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens <= 0)
  )
    throw new Error('Max output tokens must be a positive integer.');
  for (const [label, value] of [
    ['Temperature', input.temperature],
    ['Top P', input.topP],
  ] as const)
    if (value !== undefined && value !== null && !Number.isFinite(value))
      throw new Error(`${label} must be numeric.`);

  return {
    additional_configuration: canonicalize(
      input.additionalConfiguration ?? {},
    ) as Record<string, unknown>,
    agent_scaffold: text(input.agentScaffold),
    evaluation_harness: text(input.evaluationHarness),
    max_output_tokens: input.maxOutputTokens ?? null,
    pass_count: input.passCount ?? null,
    reasoning_effort: text(input.reasoningEffort),
    reasoning_mode: text(input.reasoningMode),
    shots: input.shots ?? null,
    system_prompt_description: text(input.systemPromptDescription),
    temperature: input.temperature ?? null,
    top_p: input.topP ?? null,
  };
}

export function configurationFingerprint(
  input: EvaluationConfigurationInput | NormalizedEvaluationConfiguration,
): string {
  const normalized =
    'additional_configuration' in input
      ? input
      : normalizeEvaluationConfiguration(input);
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(normalized)))
    .digest('hex');
}

export async function createOrReuseEvaluationConfiguration(
  db: Database,
  input: EvaluationConfigurationInput,
): Promise<{
  created: boolean;
  configuration: Selectable<EvaluationConfigurationsTable>;
}> {
  const normalized = normalizeEvaluationConfiguration(input);
  const fingerprint = configurationFingerprint(normalized);
  return db.transaction().execute(async (transaction) => {
    const configuration = await transaction
      .insertInto('evaluation_configurations')
      .values({
        ...normalized,
        configuration_fingerprint: fingerprint,
        is_unspecified: false,
      })
      .onConflict((conflict) =>
        conflict.column('configuration_fingerprint').doNothing(),
      )
      .returningAll()
      .executeTakeFirst();
    if (configuration === undefined) {
      const existing = await transaction
        .selectFrom('evaluation_configurations')
        .selectAll()
        .where('configuration_fingerprint', '=', fingerprint)
        .executeTakeFirstOrThrow();
      return { created: false, configuration: existing };
    }
    await markRegistryUpdated(transaction);
    return { created: true, configuration };
  });
}

export async function getUnspecifiedConfiguration(
  db: Database,
): Promise<Selectable<EvaluationConfigurationsTable>> {
  return db
    .selectFrom('evaluation_configurations')
    .selectAll()
    .where('is_unspecified', '=', true)
    .executeTakeFirstOrThrow();
}
