import "server-only";

import { randomBytes } from "node:crypto";

import { getPgPool } from "./postgres";

// ---------------------------------------------------------------------------
// Claim tokens.
//
// Agent-initiated sign-up flow: backend mints a token tied to a newly-created
// anonymous Linky, returns a claim URL. A user clicks the URL, signs in (or
// signs up) via Clerk, and the Linky's ownership is transferred to their
// Clerk user / active org in a single DB transaction.
//
// Properties we care about:
//   - Single-use: once `consumed_at` is set, a retry lookup returns null.
//   - Time-limited: 30 days by default; expired tokens short-circuit.
//   - Tied to a specific Linky row: one token → one linky.
//   - Email-optional: emails are a convenience for later delivery; they are
//     NOT a gate. Anonymous agents without an email still get a claim URL.
// ---------------------------------------------------------------------------

export const DEFAULT_EXPIRY_DAYS = 30;

// 24 random bytes encoded as URL-safe base64 → 32 chars. Collision-proof and
// short enough to fit on a terminal-printed URL without wrapping.
function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export type CreateClaimTokenInput = {
  linkyId: number;
  email?: string | null;
  expiryDays?: number;
};

export type ClaimTokenRecord = {
  token: string;
  linkyId: number;
  email: string | null;
  expiresAt: string;
  consumedAt: string | null;
  consumedByClerkUserId: string | null;
};

export async function createClaimToken(
  input: CreateClaimTokenInput,
): Promise<ClaimTokenRecord> {
  const pool = getPgPool();
  const token = generateToken();
  const expiryDays = input.expiryDays ?? DEFAULT_EXPIRY_DAYS;

  const result = await pool.query<{
    token: string;
    linky_id: number;
    email: string | null;
    expires_at: Date;
    consumed_at: Date | null;
    consumed_by_clerk_user_id: string | null;
  }>(
    `
    INSERT INTO claim_tokens (token, linky_id, email, expires_at)
    VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval)
    RETURNING token, linky_id, email, expires_at, consumed_at, consumed_by_clerk_user_id
    `,
    [token, input.linkyId, input.email ?? null, String(expiryDays)],
  );

  const row = result.rows[0];
  return {
    token: row.token,
    linkyId: row.linky_id,
    email: row.email,
    expiresAt: row.expires_at.toISOString(),
    consumedAt: row.consumed_at ? row.consumed_at.toISOString() : null,
    consumedByClerkUserId: row.consumed_by_clerk_user_id,
  };
}

export type ClaimTokenLookup = {
  status: "ready" | "expired" | "consumed" | "not-found";
  token?: ClaimTokenRecord;
  linky?: {
    id: number;
    slug: string;
    ownerUserId: string | null;
    ownerOrgId: string | null;
    deletedAt: string | null;
  };
  // Pre-computed at lookup time so UI components can render friendly
  // "expires in N days" strings without re-implementing the math (and
  // without calling Date.now() inside a render function, which React 19's
  // compiler correctly flags as impure).
  expiresInDays?: number;
};

/**
 * Peek at a claim token without consuming it — used by the /claim/[token]
 * page to render a friendly error when the token is stale or already
 * claimed, before asking the user to sign in.
 */
export async function lookupClaimToken(token: string): Promise<ClaimTokenLookup> {
  const pool = getPgPool();

  const result = await pool.query<{
    token: string;
    linky_id: number;
    email: string | null;
    expires_at: Date;
    consumed_at: Date | null;
    consumed_by_clerk_user_id: string | null;
    slug: string;
    owner_user_id: string | null;
    owner_org_id: string | null;
    deleted_at: Date | null;
  }>(
    `
    SELECT ct.token,
           ct.linky_id,
           ct.email,
           ct.expires_at,
           ct.consumed_at,
           ct.consumed_by_clerk_user_id,
           l.slug,
           l.owner_user_id,
           l.owner_org_id,
           l.deleted_at
    FROM claim_tokens ct
    INNER JOIN linkies l ON l.id = ct.linky_id
    WHERE ct.token = $1
    LIMIT 1
    `,
    [token],
  );

  if (result.rowCount === 0) {
    return { status: "not-found" };
  }

  const row = result.rows[0];
  const tokenRecord: ClaimTokenRecord = {
    token: row.token,
    linkyId: row.linky_id,
    email: row.email,
    expiresAt: row.expires_at.toISOString(),
    consumedAt: row.consumed_at ? row.consumed_at.toISOString() : null,
    consumedByClerkUserId: row.consumed_by_clerk_user_id,
  };
  const linky = {
    id: row.linky_id,
    slug: row.slug,
    ownerUserId: row.owner_user_id,
    ownerOrgId: row.owner_org_id,
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
  };

  if (tokenRecord.consumedAt) {
    return { status: "consumed", token: tokenRecord, linky };
  }

  const msUntilExpiry =
    new Date(tokenRecord.expiresAt).getTime() - Date.now();
  if (msUntilExpiry < 0) {
    return { status: "expired", token: tokenRecord, linky };
  }

  const expiresInDays = Math.max(
    0,
    Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000)),
  );

  return { status: "ready", token: tokenRecord, linky, expiresInDays };
}

export type ConsumeClaimTokenInput = {
  token: string;
  // The caller asserts these at the site of consumption, having resolved
  // them from the active Clerk session. Ownership moves to the org if one
  // is provided, otherwise to the user.
  clerkUserId: string;
  clerkOrgId?: string | null;
};

export type ConsumeClaimTokenResult =
  | { status: "ok"; slug: string }
  | {
      status: "not-found" | "expired" | "consumed" | "already-owned" | "deleted";
    };

/**
 * Atomically consume a claim token and transfer Linky ownership. The entire
 * operation runs inside a single transaction so a racing consumer cannot
 * observe a partially-applied state.
 *
 * Expected failure modes are returned as tagged results rather than thrown
 * errors so the route handler can render helpful UI for each case.
 */
export async function consumeClaimToken(
  input: ConsumeClaimTokenInput,
): Promise<ConsumeClaimTokenResult> {
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the token row so a parallel consumer cannot double-apply.
    const tokenRes = await client.query<{
      linky_id: number;
      expires_at: Date;
      consumed_at: Date | null;
    }>(
      `
      SELECT linky_id, expires_at, consumed_at
      FROM claim_tokens
      WHERE token = $1
      FOR UPDATE
      `,
      [input.token],
    );

    if (tokenRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return { status: "not-found" };
    }

    const tokenRow = tokenRes.rows[0];
    if (tokenRow.consumed_at) {
      await client.query("ROLLBACK");
      return { status: "consumed" };
    }
    if (tokenRow.expires_at.getTime() < Date.now()) {
      await client.query("ROLLBACK");
      return { status: "expired" };
    }

    // Lock the linky row before we decide whether ownership is still open.
    const linkyRes = await client.query<{
      slug: string;
      owner_user_id: string | null;
      owner_org_id: string | null;
      deleted_at: Date | null;
    }>(
      `
      SELECT slug, owner_user_id, owner_org_id, deleted_at
      FROM linkies
      WHERE id = $1
      FOR UPDATE
      `,
      [tokenRow.linky_id],
    );

    if (linkyRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return { status: "not-found" };
    }

    const linkyRow = linkyRes.rows[0];
    if (linkyRow.deleted_at) {
      await client.query("ROLLBACK");
      return { status: "deleted" };
    }

    // Only anonymous Linkies can be claimed. If someone else already owns
    // this row we refuse — preserves the "ownership is sticky" invariant.
    if (linkyRow.owner_user_id || linkyRow.owner_org_id) {
      await client.query("ROLLBACK");
      return { status: "already-owned" };
    }

    // Transfer ownership. Org context wins when present.
    await client.query(
      `
      UPDATE linkies
      SET owner_user_id = $1,
          owner_org_id = $2,
          updated_at = NOW()
      WHERE id = $3
      `,
      [
        input.clerkOrgId ? null : input.clerkUserId,
        input.clerkOrgId ?? null,
        tokenRow.linky_id,
      ],
    );

    await client.query(
      `
      UPDATE claim_tokens
      SET consumed_at = NOW(),
          consumed_by_clerk_user_id = $2
      WHERE token = $1
      `,
      [input.token, input.clerkUserId],
    );

    await client.query("COMMIT");
    return { status: "ok", slug: linkyRow.slug };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
