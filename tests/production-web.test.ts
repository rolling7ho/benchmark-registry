import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { registerCompression } from '../src/plugins/compression.js';
import { createAssetPath } from '../src/web/assets.js';

describe('production web delivery', () => {
  let app: FastifyInstance | undefined;
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    if (app !== undefined) await app.close();
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map(async (directory) =>
          rm(directory, { force: true, recursive: true }),
        ),
    );
  });

  it.each([
    ['br', 'br'],
    ['gzip', 'gzip'],
  ])(
    'negotiates %s for a sufficiently large HTML response',
    async (accepted, expected) => {
      app = Fastify({ logger: false });
      registerCompression(app, true);
      void app.register((instance, _options, done) => {
        instance.get('/', (_request, reply) =>
          reply
            .type('text/html')
            .send(`<main>${'registry '.repeat(1000)}</main>`),
        );
        done();
      });

      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: { 'accept-encoding': accepted },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-encoding']).toBe(expected);
      expect(response.headers.vary).toContain('accept-encoding');
      expect(response.rawPayload.byteLength).toBeLessThan(1000);
    },
  );

  it('leaves responses usable for unsupported encoding negotiation', async () => {
    app = Fastify({ logger: false });
    registerCompression(app, true);
    void app.register((instance, _options, done) => {
      instance.get('/', (_request, reply) =>
        reply.type('text/plain').send('registry '.repeat(1000)),
      );
      done();
    });

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'accept-encoding': 'unsupported' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.body).toContain('registry');
  });

  it('does not enable compression in development', async () => {
    app = Fastify({ logger: false });
    registerCompression(app, false);
    app.get('/', () => 'registry '.repeat(1000));

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(response.headers['content-encoding']).toBeUndefined();
  });

  it('resolves development and manifest-backed production assets', async () => {
    expect(createAssetPath(false, '/unused')('styles/main.css')).toBe(
      '/public/styles/main.css',
    );

    const directory = await mkdtemp(
      path.join(tmpdir(), 'benchmark-registry-assets-'),
    );
    temporaryDirectories.push(directory);
    await writeFile(
      path.join(directory, 'asset-manifest.json'),
      JSON.stringify({
        'styles/main.css': 'styles/main.0123456789ab.css',
      }),
    );
    const assetPath = createAssetPath(true, directory);
    expect(assetPath('styles/main.css')).toBe(
      '/public/styles/main.0123456789ab.css',
    );
    expect(() => assetPath('styles/missing.css')).toThrow(
      'Asset manifest has no entry',
    );
  });
});
