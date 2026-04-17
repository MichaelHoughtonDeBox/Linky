import "server-only";

import { Pool, type PoolConfig } from "pg";

import { getDatabaseUrl } from "./config";

declare global {
  var __linkyPgPool: Pool | undefined;
}

// ---------------------------------------------------------------------------
// SSL configuration.
//
// Neon (and most managed Postgres providers) put `sslmode=require` + similar
// params directly in the connection string. `pg-connection-string` currently
// treats `require`/`prefer`/`verify-ca` as aliases for `verify-full`, but has
// started warning that this will change in pg v9 to match libpq's weaker
// semantics. The warning fires every time we instantiate a Pool — noisy in
// dev, and turns into a hard break whenever `pg` ships v9.
//
// We sidestep it by stripping SSL-related query params from the URL and
// configuring SSL explicitly here. That keeps our SSL policy in code (where
// it's reviewable) instead of in each developer's env file.
//
// Policy:
//   - Local (localhost / 127.0.0.1): no TLS.
//   - Remote (Neon, managed prod): TLS on, `rejectUnauthorized: false`.
//     Neon terminates TLS with a valid cert, but some ops contexts (CI,
//     ngrok-tunneled dev) have been flaky with strict verification. We lean
//     permissive here for reliability; revisit when we're one stack.
// ---------------------------------------------------------------------------

// Params that `pg-connection-string` parses and emits the deprecation warning
// for. Removing them from the URL silences the warning; we apply an
// equivalent policy via the explicit `ssl` option below.
const SSL_RELATED_QUERY_PARAMS = [
  "sslmode",
  "ssl",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "channel_binding",
];

function isLocalConnection(connectionString: string): boolean {
  return (
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1")
  );
}

function stripSslQueryParams(connectionString: string): string {
  // `URL` can parse most Postgres connection strings fine when the scheme
  // is `postgresql://` / `postgres://`. For exotic variants (socket paths,
  // etc.) we fall back to returning the original string unmodified.
  try {
    const url = new URL(connectionString);
    let mutated = false;
    for (const param of SSL_RELATED_QUERY_PARAMS) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        mutated = true;
      }
    }
    return mutated ? url.toString() : connectionString;
  } catch {
    return connectionString;
  }
}

function resolveSslConfig(
  connectionString: string,
): PoolConfig["ssl"] {
  if (isLocalConnection(connectionString)) return false;
  return { rejectUnauthorized: false };
}

export function getPgPool(): Pool {
  if (globalThis.__linkyPgPool) {
    return globalThis.__linkyPgPool;
  }

  const raw = getDatabaseUrl();
  const pool = new Pool({
    // Sanitized URL (no sslmode=*): keeps pg-connection-string silent and
    // stops future pg releases from re-interpreting the mode.
    connectionString: stripSslQueryParams(raw),
    max: 10,
    ssl: resolveSslConfig(raw),
  });

  globalThis.__linkyPgPool = pool;
  return pool;
}
