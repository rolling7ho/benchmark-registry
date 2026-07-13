import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { transform as transformCss } from 'lightningcss';
import { transform as transformJs } from 'esbuild';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const sourcePublicDirectory = path.join(projectRoot, 'public');
const sourceStylesheet = path.join(sourcePublicDirectory, 'styles', 'main.css');
const sourceFavicon = path.join(sourcePublicDirectory, 'favicon.svg');
const sourceScript = path.join(
  sourcePublicDirectory,
  'scripts',
  'record-actions.js',
);
const outputDirectory = path.join(projectRoot, 'dist');
const outputPublicDirectory = path.join(outputDirectory, 'public');
const outputStylesDirectory = path.join(outputPublicDirectory, 'styles');
const outputScriptsDirectory = path.join(outputPublicDirectory, 'scripts');

const sourceCss = await readFile(sourceStylesheet);
const favicon = await readFile(sourceFavicon);
const script = await readFile(sourceScript, 'utf8');
const { code: minifiedCss } = transformCss({
  code: sourceCss,
  filename: sourceStylesheet,
  minify: true,
  sourceMap: false,
});
const { code: minifiedScript } = await transformJs(script, {
  loader: 'js',
  minify: true,
  target: 'es2019',
  sourcefile: sourceScript,
});
const contentHash = createHash('sha256')
  .update(minifiedCss)
  .digest('hex')
  .slice(0, 12);
const generatedStylesheet = `styles/main.${contentHash}.css`;
const faviconHash = createHash('sha256')
  .update(favicon)
  .digest('hex')
  .slice(0, 12);
const generatedFavicon = `favicon.${faviconHash}.svg`;
const scriptHash = createHash('sha256')
  .update(minifiedScript)
  .digest('hex')
  .slice(0, 12);
const generatedScript = `scripts/record-actions.${scriptHash}.js`;

await Promise.all([
  mkdir(outputStylesDirectory, { recursive: true }),
  mkdir(outputScriptsDirectory, { recursive: true }),
]);
await cp(sourcePublicDirectory, outputPublicDirectory, {
  recursive: true,
  filter: (source) =>
    ![sourceStylesheet, sourceFavicon, sourceScript].some(
      (excludedSource) => path.resolve(source) === path.resolve(excludedSource),
    ),
});
await writeFile(
  path.join(outputPublicDirectory, generatedStylesheet),
  minifiedCss,
);
await writeFile(path.join(outputPublicDirectory, generatedFavicon), favicon);
await writeFile(
  path.join(outputPublicDirectory, generatedScript),
  minifiedScript,
);
await writeFile(
  path.join(outputDirectory, 'asset-manifest.json'),
  `${JSON.stringify(
    {
      'favicon.svg': generatedFavicon,
      'styles/main.css': generatedStylesheet,
      'scripts/record-actions.js': generatedScript,
    },
    null,
    2,
  )}\n`,
);
await cp(
  path.join(projectRoot, 'src', 'views'),
  path.join(outputDirectory, 'views'),
  { recursive: true },
);
