export class RegistryEntityNotFoundError extends Error {
  override readonly name = 'RegistryEntityNotFoundError';

  constructor(entityName: string, entityId: string) {
    super(`${entityName} ${entityId} does not exist.`);
  }
}
