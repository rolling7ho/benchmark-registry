import type { Selectable } from 'kysely';

import {
  generateModelIdentifier,
  validateModelIdentifier,
} from '../identifiers/model-id.js';
import {
  getProviderBySlug,
  type ProviderConfiguration,
} from '../identifiers/providers.js';
import {
  assertModelIdentifierMatchesRecordPrefix,
  generateRecordPrefix,
  validateRecordPrefix,
} from '../identifiers/record-prefix.js';
import { createModelInputSchema } from '../validation/schemas.js';
import type { Database } from './database.js';
import { RegistryEntityNotFoundError } from './errors.js';
import type { ModelsTable, OrganizationsTable } from './types.js';
import { markRegistryUpdated } from './registry-metadata.js';

function assertOrganizationConfiguration(
  organization: Selectable<OrganizationsTable>,
  provider: ProviderConfiguration,
): void {
  if (
    organization.provider_prefix !== provider.providerPrefix ||
    organization.br_namespace !== provider.brNamespace ||
    organization.identifier_strategy !== provider.identifierStrategy
  ) {
    throw new Error(
      `Organization ${organization.slug} does not match the canonical provider configuration.`,
    );
  }
}

export async function createModel(
  db: Database,
  input: unknown,
): Promise<Selectable<ModelsTable>> {
  const validatedInput = createModelInputSchema.parse(input);
  const organization = await db
    .selectFrom('organizations')
    .selectAll()
    .where('slug', '=', validatedInput.organizationSlug)
    .executeTakeFirst();

  if (organization === undefined) {
    throw new RegistryEntityNotFoundError(
      'Organization',
      validatedInput.organizationSlug,
    );
  }

  const provider = getProviderBySlug(organization.slug);
  assertOrganizationConfiguration(organization, provider);

  const identifierInput = {
    provider: provider.slug,
    family: validatedInput.family,
    modelNumber: validatedInput.modelNumber,
    tierCode: validatedInput.tierCode,
  };
  const modelIdentifier = generateModelIdentifier(identifierInput);
  const recordPrefix = generateRecordPrefix(identifierInput);

  assertModelIdentifierMatchesRecordPrefix(modelIdentifier, recordPrefix);
  const validatedModelIdentifier = validateModelIdentifier(modelIdentifier);
  const validatedRecordPrefix = validateRecordPrefix(recordPrefix);
  if (
    validatedModelIdentifier.providerPrefix !== organization.provider_prefix ||
    validatedRecordPrefix.brNamespace !== organization.br_namespace
  ) {
    throw new Error(
      `Generated identifiers do not match organization ${organization.slug}.`,
    );
  }

  return db.transaction().execute(async (transaction) => {
    const model = await transaction
      .insertInto('models')
      .values({
        model_id: modelIdentifier,
        organization_id: organization.id,
        official_name: validatedInput.officialName,
        family: validatedInput.family,
        model_number: validatedInput.modelNumber,
        tier_code: validatedInput.tierCode?.toUpperCase() ?? null,
        status: validatedInput.status,
        release_date: validatedInput.releaseDate,
        record_prefix: recordPrefix,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await markRegistryUpdated(transaction);
    return model;
  });
}
