import { PROVIDERS } from '../identifiers/providers.js';
import type { Database } from './database.js';

export async function seedOrganizations(db: Database): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    await transaction
      .insertInto('organizations')
      .values(
        PROVIDERS.map((provider) => ({
          slug: provider.slug,
          name: provider.displayName,
          provider_prefix: provider.providerPrefix,
          br_namespace: provider.brNamespace,
          identifier_strategy: provider.identifierStrategy,
        })),
      )
      .onConflict((conflict) => conflict.column('slug').doNothing())
      .execute();

    const organizations = await transaction
      .selectFrom('organizations')
      .select([
        'slug',
        'name',
        'provider_prefix',
        'br_namespace',
        'identifier_strategy',
      ])
      .where(
        'slug',
        'in',
        PROVIDERS.map((provider) => provider.slug),
      )
      .execute();

    for (const provider of PROVIDERS) {
      const organization = organizations.find(
        (candidate) => candidate.slug === provider.slug,
      );

      if (
        organization === undefined ||
        organization.name !== provider.displayName ||
        organization.provider_prefix !== provider.providerPrefix ||
        organization.br_namespace !== provider.brNamespace ||
        organization.identifier_strategy !== provider.identifierStrategy
      ) {
        throw new Error(
          `Organization ${provider.slug} conflicts with the canonical provider configuration.`,
        );
      }
    }
  });
}
