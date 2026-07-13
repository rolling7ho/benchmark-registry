import { describe, expect, it, vi } from 'vitest';

import {
  assertPublicHttpUrl,
  retrieveUrl,
} from '../../src/ingestion/retrieve-url.js';

const publicLookup = (): Promise<string[]> =>
  Promise.resolve(['93.184.216.34']);

function textResponse(body = 'source', init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/plain', ...init.headers },
    ...init,
  });
}

describe('source URL security', () => {
  it.each(['http://example.com/report', 'https://example.com/report'])(
    'accepts public %s',
    async (url) => {
      await expect(
        assertPublicHttpUrl(url, publicLookup),
      ).resolves.toBeInstanceOf(URL);
    },
  );

  it.each(['file:///tmp/report', 'ftp://example.com/report'])(
    'rejects unsupported protocol %s',
    async (url) => {
      await expect(assertPublicHttpUrl(url, publicLookup)).rejects.toThrow(
        'Unsupported source URL protocol',
      );
    },
  );

  it.each([
    'http://localhost/report',
    'http://127.0.0.1/report',
    'http://[::1]/report',
    'http://[::ffff:127.0.0.1]/report',
    'http://10.0.0.1/report',
    'http://172.16.0.1/report',
    'http://192.168.0.1/report',
    'http://169.254.1.1/report',
    'http://169.254.169.254/latest/meta-data',
  ])('rejects non-public destination %s', async (url) => {
    await expect(assertPublicHttpUrl(url, publicLookup)).rejects.toThrow(
      'disallowed network address',
    );
  });

  it('rejects a redirect to a private destination', async () => {
    const mockedFetch = vi.fn(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/private' },
        }),
      ),
    );
    await expect(
      retrieveUrl('https://example.com/report', {
        fetch: mockedFetch,
        lookup: publicLookup,
      }),
    ).rejects.toThrow('disallowed network address');
  });

  it('rejects an oversized declared or streamed response', async () => {
    await expect(
      retrieveUrl('https://example.com/report', {
        fetch: () =>
          Promise.resolve(
            textResponse('short', { headers: { 'content-length': '50' } }),
          ),
        lookup: publicLookup,
        maximumBytes: 10,
      }),
    ).rejects.toThrow('exceeds');
    await expect(
      retrieveUrl('https://example.com/report', {
        fetch: () => Promise.resolve(textResponse('a'.repeat(20))),
        lookup: publicLookup,
        maximumBytes: 10,
      }),
    ).rejects.toThrow('exceeds');
  });

  it('rejects excessive redirects', async () => {
    await expect(
      retrieveUrl('https://example.com/report', {
        fetch: () =>
          Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { location: '/next' },
            }),
          ),
        lookup: publicLookup,
        maximumRedirects: 1,
      }),
    ).rejects.toThrow('exceeded 1 redirects');
  });

  it('handles request timeouts', async () => {
    const hangingFetch = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    await expect(
      retrieveUrl('https://example.com/report', {
        fetch: hangingFetch,
        lookup: publicLookup,
        timeoutMs: 5,
      }),
    ).rejects.toThrow('timed out');
  });

  it('returns supported content and structured retrieval metadata', async () => {
    const result = await retrieveUrl('https://example.com/report', {
      fetch: () => Promise.resolve(textResponse('benchmark source')),
      lookup: publicLookup,
    });
    expect(result).toMatchObject({
      contentType: 'text/plain',
      contentLength: 16,
      redirects: 0,
    });
  });

  it('rejects unsupported response content types', async () => {
    await expect(
      retrieveUrl('https://example.com/archive', {
        fetch: () =>
          Promise.resolve(
            new Response('archive', {
              headers: { 'content-type': 'application/zip' },
            }),
          ),
        lookup: publicLookup,
      }),
    ).rejects.toThrow('Unsupported source content type: application/zip');
  });
});
