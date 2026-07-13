import tls from 'node:tls';

import { Kysely, PostgresDialect } from 'kysely';
import { Pool, type PoolConfig } from 'pg';

import { SUPABASE_ROOT_CA } from './supabase-root-ca.js';
import type { DatabaseSchema } from './types.js';

export type Database = Kysely<DatabaseSchema>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Managed Postgres hosts (Supabase included) are always reached over TLS
 * with full certificate verification. Supabase's pooler chains to its own
 * private root rather than a publicly cross-signed one, so that root is
 * trusted explicitly alongside (not instead of) Node's default CA bundle —
 * this keeps verification real (MITM-resistant) rather than disabling it.
 * Local development databases skip TLS since a local Postgres has no
 * certificate configured.
 */
function resolveSslConfig(connectionString: string): PoolConfig['ssl'] {
  const { hostname } = new URL(connectionString);
  if (LOCAL_HOSTS.has(hostname)) {
    return undefined;
  }
  return {
    rejectUnauthorized: true,
    ca: [...tls.rootCertificates, SUPABASE_ROOT_CA],
  };
}

export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    ssl: resolveSslConfig(connectionString),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // node-postgres emits 'error' on the pool when an idle client's connection
  // is dropped by the network or the backend. Without a listener, Node treats
  // this as an uncaught exception and kills the process; the pool itself
  // already discards the broken client and opens a fresh one on next use, so
  // logging and continuing is the correct response here.
  pool.on('error', (error: unknown) => {
    console.error('Idle database connection error', error);
  });

  return pool;
}

export function createDatabase(connectionString: string): Database {
  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool: createPool(connectionString) }),
  });
}
