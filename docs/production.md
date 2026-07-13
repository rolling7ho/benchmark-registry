# Production web behavior

## Complete build and startup

```sh
pnpm build
NODE_ENV=production pnpm start
```

`pnpm build` performs the complete production build in this order:

1. Remove the previous `dist` directory so stale generated assets cannot survive.
2. Compile strict server TypeScript into `dist`.
3. Minify `public/styles/main.css` with Lightning CSS.
4. Name the generated stylesheet with a SHA-256 content-hash prefix and write it under `dist/public/styles`.
5. Write `dist/asset-manifest.json` and copy Eta templates to `dist/views`.
6. Verify the manifest, generated stylesheet, copied layout, minification result, and absence of stale stylesheets.

Development continues to render `src/views` and serve the readable source stylesheet from `public`. Generated production assets are build output and must not be edited.

Production environment validation requires `DATABASE_URL`. A private `FEEDBACK_RATE_LIMIT_SECRET` of at least 32 characters may be configured as a dedicated HMAC key for durable, pseudonymous abuse-control fingerprints; when it is omitted, the already-required server-only `DATABASE_URL` is used as the key. Neither value is exposed to browsers. `ADMIN_USERNAME` and `ADMIN_PASSWORD` remain optional as a pair; omitting both disables the administrative feedback routes.

## Asset resolution and caching

The manifest maps the logical name `styles/main.css` to a generated name such as `styles/main.a8f29c012345.css`. The layout calls the shared `assetPath` helper. Development resolves the logical name to `/public/styles/main.css`; production resolves it through the manifest.

The production static root is only `dist/public`. Content-hashed static assets use:

```text
Cache-Control: public, max-age=31536000, immutable
```

Development assets use `max-age=0` without `immutable`. Dynamic HTML uses `Cache-Control: no-cache`, allowing browser storage only with revalidation. HTML never receives immutable caching.

Repository files, `.env`, TypeScript sources, migrations, CLI sources, package metadata, documentation sources, and server source maps are outside the static root. TypeScript source maps remain available to operators in `dist` for server debugging but are not served publicly. Production CSS source maps are not generated.

## Compression and HTML policy

Production registers `@fastify/compress` centrally before static and route plugins. Textual responses of at least 1 KiB negotiate Brotli first and gzip as the fallback through standard `Accept-Encoding` handling. Unsupported encodings leave the response uncompressed and usable. Development compression is disabled for easier inspection.

Rendered HTML is not aggressively minified. Registry Documentation contains whitespace-sensitive `<pre>` identifier diagrams, and global HTML minification would create unnecessary correctness risk. CSS minification plus negotiated HTTP compression provides the production size reduction while preserving semantic markup and fixed-width explanations.

Public search, filtering, pagination, and responsive layout require no client-side JavaScript. A small content-hashed progressive script supports explicit copy/share buttons, and production loads Vercel Web Analytics as disclosed in the Privacy Policy.

## Security headers

Security headers are configured centrally with `@fastify/helmet`. The Content Security Policy allows same-origin page resources and form submissions, disallows all scripts and object embedding, and blocks framing with `frame-ancestors 'none'`. External source links are ordinary user navigation and do not require resource-origin allowances. Helmet also provides `X-Content-Type-Options: nosniff` and related baseline protections. Referrers use `strict-origin-when-cross-origin`.

The CSP deliberately excludes wildcard origins, `unsafe-eval`, and inline-script allowances. The progressive action script and Vercel Web Analytics load from same-origin paths. `upgrade-insecure-requests` is omitted so local development over HTTP remains usable; production TLS redirection belongs at the deployment edge.

Public 500 pages remain generic while failures continue to be logged server-side.

## Responsive strategy

The mobile interface preserves the registry table. It does not transform benchmark records into cards.

The primary narrow-screen breakpoint removes desktop sheet borders and excess outer margins, lets navigation wrap while retaining every text link, and stacks model metadata where needed. A very narrow breakpoint gives the labeled search form a two-row layout and keeps the input large enough for practical touch entry.

Registry, model, benchmark, organization, source, and documentation tables use the shared `.table-scroll` pattern. The container uses native horizontal overflow, is keyboard reachable, and exposes a restrained narrow-screen notice. The tables retain practical minimum widths, identifier values remain unbroken, and every registry column—including the final Model ID column—remains present. Horizontal table scrolling is intentional on narrow displays; body-level horizontal scrolling is not.

Documentation `<pre>` blocks preserve whitespace and scroll horizontally inside their own bounds when necessary. Browser zoom remains enabled through the standard viewport declaration without maximum-scale or user-scalable restrictions.
