import { Buffer } from 'node:buffer';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const outputDirectory = path.join(projectRoot, 'dist');
const manifest = JSON.parse(
  await readFile(path.join(outputDirectory, 'asset-manifest.json'), 'utf8'),
);
const generatedPath = manifest['styles/main.css'];
const generatedFaviconPath = manifest['favicon.svg'];
const generatedScriptPath = manifest['scripts/record-actions.js'];

if (
  typeof generatedPath !== 'string' ||
  !/^styles\/main\.[a-f0-9]{12}\.css$/.test(generatedPath)
) {
  throw new Error(
    'The asset manifest does not contain a hashed main stylesheet.',
  );
}
if (
  typeof generatedScriptPath !== 'string' ||
  !/^scripts\/record-actions\.[a-f0-9]{12}\.js$/.test(generatedScriptPath)
) {
  throw new Error(
    'The asset manifest does not contain a hashed record action script.',
  );
}
if (
  typeof generatedFaviconPath !== 'string' ||
  !/^favicon\.[a-f0-9]{12}\.svg$/.test(generatedFaviconPath)
) {
  throw new Error('The asset manifest does not contain a hashed favicon.');
}

const generatedFile = path.join(outputDirectory, 'public', generatedPath);
const generatedFaviconFile = path.join(
  outputDirectory,
  'public',
  generatedFaviconPath,
);
const generatedScriptFile = path.join(
  outputDirectory,
  'public',
  generatedScriptPath,
);
await access(generatedFile);
await access(generatedFaviconFile);
await access(generatedScriptFile);
const stableFaviconFile = path.join(outputDirectory, 'public', 'favicon.png');
const stableFavicon = await readFile(stableFaviconFile);
if (
  stableFavicon
    .subarray(0, 8)
    .compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0 ||
  stableFavicon.readUInt32BE(16) !== 96 ||
  stableFavicon.readUInt32BE(20) !== 96
) {
  throw new Error('The stable favicon must be a 96x96 PNG.');
}
for (const [name, width, height] of [
  ['logo.png', 512, 512],
  ['social-card.png', 1200, 630],
]) {
  const image = await readFile(path.join(outputDirectory, 'public', name));
  if (
    image
      .subarray(0, 8)
      .compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0 ||
    image.readUInt32BE(16) !== width ||
    image.readUInt32BE(20) !== height
  ) {
    throw new Error(`${name} must be a ${width}x${height} PNG.`);
  }
}
await access(path.join(outputDirectory, 'views', 'layout.eta'));

const [sourceSize, generatedSize, sourceScriptSize, generatedScriptSize] =
  await Promise.all([
    stat(path.join(projectRoot, 'public', 'styles', 'main.css')),
    stat(generatedFile),
    stat(path.join(projectRoot, 'public', 'scripts', 'record-actions.js')),
    stat(generatedScriptFile),
  ]);
if (generatedSize.size >= sourceSize.size) {
  throw new Error('The generated stylesheet was not smaller than its source.');
}
if (generatedScriptSize.size >= sourceScriptSize.size) {
  throw new Error('The generated script was not smaller than its source.');
}

const generatedStyles = await readdir(
  path.join(outputDirectory, 'public', 'styles'),
);
if (
  generatedStyles.length !== 1 ||
  generatedStyles[0] !== path.basename(generatedPath)
) {
  throw new Error('The production styles directory contains stale assets.');
}

process.stdout.write(
  `Verified ${generatedPath} (${generatedSize.size} bytes; source ${sourceSize.size} bytes).\n` +
    `Verified ${generatedScriptPath} (${generatedScriptSize.size} bytes; source ${sourceScriptSize.size} bytes).\n`,
);
