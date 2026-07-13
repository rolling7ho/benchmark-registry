import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { transform } from 'lightningcss';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const sourcePublicDirectory = path.join(projectRoot, 'public');
const sourceStylesheet = path.join(sourcePublicDirectory, 'styles', 'main.css');
const outputDirectory = path.join(projectRoot, 'dist');
const outputPublicDirectory = path.join(outputDirectory, 'public');
const outputStylesDirectory = path.join(outputPublicDirectory, 'styles');

const sourceCss = await readFile(sourceStylesheet);
const { code: minifiedCss } = transform({
  code: sourceCss,
  filename: sourceStylesheet,
  minify: true,
  sourceMap: false,
});
const contentHash = createHash('sha256')
  .update(minifiedCss)
  .digest('hex')
  .slice(0, 12);
const generatedStylesheet = `styles/main.${contentHash}.css`;

await mkdir(outputStylesDirectory, { recursive: true });
await cp(sourcePublicDirectory, outputPublicDirectory, {
  recursive: true,
  filter: (source) => path.resolve(source) !== path.resolve(sourceStylesheet),
});
await writeFile(
  path.join(outputPublicDirectory, generatedStylesheet),
  minifiedCss,
);
await writeFile(
  path.join(outputDirectory, 'asset-manifest.json'),
  `${JSON.stringify({ 'styles/main.css': generatedStylesheet }, null, 2)}\n`,
);
await cp(
  path.join(projectRoot, 'src', 'views'),
  path.join(outputDirectory, 'views'),
  { recursive: true },
);
