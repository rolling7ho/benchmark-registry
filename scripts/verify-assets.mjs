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

if (
  typeof generatedPath !== 'string' ||
  !/^styles\/main\.[a-f0-9]{12}\.css$/.test(generatedPath)
) {
  throw new Error(
    'The asset manifest does not contain a hashed main stylesheet.',
  );
}

const generatedFile = path.join(outputDirectory, 'public', generatedPath);
await access(generatedFile);
await access(path.join(outputDirectory, 'views', 'layout.eta'));

const [sourceSize, generatedSize] = await Promise.all([
  stat(path.join(projectRoot, 'public', 'styles', 'main.css')),
  stat(generatedFile),
]);
if (generatedSize.size >= sourceSize.size) {
  throw new Error('The generated stylesheet was not smaller than its source.');
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
  `Verified ${generatedPath} (${generatedSize.size} bytes; source ${sourceSize.size} bytes).\n`,
);
