import { readFileSync } from 'node:fs';
import path from 'node:path';

export type AssetPath = (logicalPath: string) => string;

function parseManifest(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Production asset manifest must be an object.');
  }

  const manifest: Record<string, string> = {};
  for (const [logicalPath, generatedPath] of Object.entries(value)) {
    if (
      typeof generatedPath !== 'string' ||
      generatedPath.startsWith('/') ||
      generatedPath.includes('..')
    ) {
      throw new Error(`Invalid generated asset path for ${logicalPath}.`);
    }
    manifest[logicalPath] = generatedPath;
  }
  return manifest;
}

export function createAssetPath(
  production: boolean,
  runtimeDirectory: string,
): AssetPath {
  if (!production) {
    return (logicalPath) => `/public/${logicalPath}`;
  }

  const manifestPath = path.join(runtimeDirectory, 'asset-manifest.json');
  const manifest = parseManifest(
    JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown,
  );
  return (logicalPath) => {
    const generatedPath = manifest[logicalPath];
    if (generatedPath === undefined) {
      throw new Error(`Asset manifest has no entry for ${logicalPath}.`);
    }
    return `/public/${generatedPath}`;
  };
}
