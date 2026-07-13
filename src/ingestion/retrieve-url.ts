import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { Agent } from 'undici';

import {
  INGESTION_USER_AGENT,
  MAX_REDIRECTS,
  MAX_SOURCE_BYTES,
  RETRIEVAL_TIMEOUT_MS,
  SUPPORTED_CONTENT_TYPES,
  type SupportedContentType,
} from './types.js';

export interface RetrievalResult {
  requestedUrl: string;
  finalUrl: string;
  contentType: SupportedContentType;
  content: Uint8Array;
  contentLength: number;
  retrievedAt: Date;
  redirects: number;
}

export interface RetrievalDependencies {
  fetch?: typeof fetch;
  lookup?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
  maximumBytes?: number;
  maximumRedirects?: number;
}

function ipv4Number(address: string): number {
  return address
    .split('.')
    .reduce((result, part) => result * 256 + Number(part), 0);
}

function inIpv4Range(address: string, base: string, prefix: number): boolean {
  const shift = 32 - prefix;
  return ipv4Number(address) >>> shift === ipv4Number(base) >>> shift;
}

export function isDisallowedAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]!;
  if (isIP(normalized) === 4) {
    return [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
    ].some(([base, prefix]) =>
      inIpv4Range(normalized, String(base), Number(prefix)),
    );
  }
  if (isIP(normalized) === 6) {
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith('ff')) return true;
    // Reject all IPv4-mapped forms, including hexadecimal URL canonicalization,
    // so private IPv4 destinations cannot be disguised as IPv6 literals.
    if (normalized.startsWith('::ffff:')) return true;
    return false;
  }
  return true;
}

async function defaultLookup(hostname: string): Promise<string[]> {
  return (await dnsLookup(hostname, { all: true, verbatim: true })).map(
    (entry) => entry.address,
  );
}

export async function assertPublicHttpUrl(
  value: string,
  lookup: (hostname: string) => Promise<string[]> = defaultLookup,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid source URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error(`Unsupported source URL protocol: ${url.protocol}`);
  if (url.username !== '' || url.password !== '')
    throw new Error('Source URLs must not contain credentials.');
  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost'))
    throw new Error('Source URL resolves to a disallowed network address.');
  const addresses = isIP(hostname) === 0 ? await lookup(hostname) : [hostname];
  if (addresses.length === 0 || addresses.some(isDisallowedAddress))
    throw new Error('Source URL resolves to a disallowed network address.');
  return url;
}

function supportedContentType(header: string | null): SupportedContentType {
  const value = header?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!SUPPORTED_CONTENT_TYPES.includes(value as SupportedContentType))
    throw new Error(`Unsupported source content type: ${value || 'unknown'}`);
  return value as SupportedContentType;
}

async function readLimitedBody(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes)
    throw new Error(`Source response exceeds the ${maximumBytes} byte limit.`);
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumBytes)
        throw new Error(
          `Source response exceeds the ${maximumBytes} byte limit.`,
        );
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const content = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return content;
}

export async function retrieveUrl(
  input: string,
  dependencies: RetrievalDependencies = {},
): Promise<RetrievalResult> {
  const lookup = dependencies.lookup ?? defaultLookup;
  const timeoutMs = dependencies.timeoutMs ?? RETRIEVAL_TIMEOUT_MS;
  const maximumBytes = dependencies.maximumBytes ?? MAX_SOURCE_BYTES;
  const maximumRedirects = dependencies.maximumRedirects ?? MAX_REDIRECTS;
  const secureLookup: LookupFunction = (hostname, options, callback): void => {
    // Node's happy-eyeballs (autoSelectFamily, default on) connects by calling
    // lookup with `{ all: true }` and expects callback(err, addresses[]) rather
    // than the single-address callback(err, address, family) form.
    const wantsAll =
      typeof options === 'object' && options !== null && options.all === true;
    void lookup(hostname)
      .then((addresses) => {
        if (addresses.length === 0 || addresses.some(isDisallowedAddress)) {
          const error = Object.assign(
            new Error('Source URL resolves to a disallowed network address.'),
            { code: 'EACCES' },
          );
          if (wantsAll) callback(error, []);
          else callback(error, '', 0);
          return;
        }
        if (wantsAll) {
          callback(
            null,
            addresses.map((address) => ({
              address,
              family: isIP(address) as 4 | 6,
            })),
          );
          return;
        }
        const address = addresses[0]!;
        callback(null, address, isIP(address));
      })
      .catch((error: unknown) => {
        const wrapped =
          error instanceof Error
            ? Object.assign(error, { code: 'ENOTFOUND' })
            : Object.assign(new Error(String(error)), { code: 'ENOTFOUND' });
        if (wantsAll) callback(wrapped, []);
        else callback(wrapped, '', 0);
      });
  };
  const agent =
    dependencies.fetch === undefined
      ? new Agent({ connect: { lookup: secureLookup } })
      : null;
  const fetchImplementation: typeof fetch =
    dependencies.fetch ??
    ((url, init) =>
      fetch(url, { ...init, dispatcher: agent } as RequestInit & {
        dispatcher: Agent;
      }));
  const requested = await assertPublicHttpUrl(input, lookup);
  let current = requested;
  try {
    for (let redirects = 0; ; redirects += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImplementation(current, {
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'user-agent': INGESTION_USER_AGENT,
            accept: SUPPORTED_CONTENT_TYPES.join(', '),
          },
        });
      } catch (error) {
        if (controller.signal.aborted)
          throw new Error(`Source retrieval timed out after ${timeoutMs} ms.`, {
            cause: error,
          });
        throw new Error(
          `Source retrieval failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      } finally {
        clearTimeout(timeout);
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects >= maximumRedirects)
          throw new Error(
            `Source retrieval exceeded ${maximumRedirects} redirects.`,
          );
        const location = response.headers.get('location');
        if (location === null)
          throw new Error('Source redirect is missing a Location header.');
        current = await assertPublicHttpUrl(
          new URL(location, current).toString(),
          lookup,
        );
        continue;
      }
      if (!response.ok)
        throw new Error(`Source retrieval returned HTTP ${response.status}.`);
      const contentType = supportedContentType(
        response.headers.get('content-type'),
      );
      const content = await readLimitedBody(response, maximumBytes);
      return {
        requestedUrl: requested.toString(),
        finalUrl: current.toString(),
        contentType,
        content,
        contentLength: content.byteLength,
        retrievedAt: new Date(),
        redirects,
      };
    }
  } finally {
    await agent?.close();
  }
}
