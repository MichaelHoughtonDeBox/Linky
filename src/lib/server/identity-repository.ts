import "server-only";

import { getPgPool } from "./postgres";

// ---------------------------------------------------------------------------
// Identity repository.
//
// Writes received from the Clerk webhook handler. Clerk is the source of
// truth; we denormalize the minimal fields we care about so API routes can
// JOIN on clerk_user_id / clerk_org_id without a Clerk round-trip.
//
// All upserts are idempotent: Clerk retries webhook deliveries aggressively,
// and ordering is not guaranteed. `ON CONFLICT DO UPDATE` lets out-of-order
// `user.updated` events overwrite stale data safely.
// ---------------------------------------------------------------------------

export type UpsertUserInput = {
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export async function upsertUser(input: UpsertUserInput): Promise<void> {
  const pool = getPgPool();

  await pool.query(
    `
    INSERT INTO users (clerk_user_id, email, display_name, avatar_url, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (clerk_user_id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      updated_at = NOW()
    `,
    [input.clerkUserId, input.email, input.displayName, input.avatarUrl],
  );
}

export async function deleteUser(clerkUserId: string): Promise<void> {
  const pool = getPgPool();

  // Cascading behavior: memberships are dropped via ON DELETE CASCADE;
  // linkies owned by this user have their owner_user_id set to NULL so the
  // row survives (a soft-orphan that future claim flows can re-attribute).
  await pool.query(`DELETE FROM users WHERE clerk_user_id = $1`, [clerkUserId]);
}

export type UpsertOrganizationInput = {
  clerkOrgId: string;
  name: string;
  slug: string | null;
};

export async function upsertOrganization(
  input: UpsertOrganizationInput,
): Promise<void> {
  const pool = getPgPool();

  await pool.query(
    `
    INSERT INTO organizations (clerk_org_id, name, slug, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (clerk_org_id) DO UPDATE SET
      name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      updated_at = NOW()
    `,
    [input.clerkOrgId, input.name, input.slug],
  );
}

export async function deleteOrganization(clerkOrgId: string): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `DELETE FROM organizations WHERE clerk_org_id = $1`,
    [clerkOrgId],
  );
}

export type UpsertMembershipInput = {
  clerkUserId: string;
  clerkOrgId: string;
  role: string;
};

export async function upsertMembership(
  input: UpsertMembershipInput,
): Promise<void> {
  const pool = getPgPool();

  await pool.query(
    `
    INSERT INTO memberships (clerk_user_id, clerk_org_id, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (clerk_user_id, clerk_org_id) DO UPDATE SET
      role = EXCLUDED.role
    `,
    [input.clerkUserId, input.clerkOrgId, input.role],
  );
}

export async function deleteMembership(
  clerkUserId: string,
  clerkOrgId: string,
): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `DELETE FROM memberships WHERE clerk_user_id = $1 AND clerk_org_id = $2`,
    [clerkUserId, clerkOrgId],
  );
}

// ---------------------------------------------------------------------------
// Stripe customer linking.
//
// Called from the Stripe-customer-creation path in the Clerk webhook after
// we create the Customer on Stripe's side. Kept in this file (rather than
// a separate stripe-repository) because it's strictly a field on the
// identity rows.
// ---------------------------------------------------------------------------

export async function setUserStripeCustomerId(
  clerkUserId: string,
  stripeCustomerId: string,
): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE users SET stripe_customer_id = $2, updated_at = NOW() WHERE clerk_user_id = $1`,
    [clerkUserId, stripeCustomerId],
  );
}

export async function setOrganizationStripeCustomerId(
  clerkOrgId: string,
  stripeCustomerId: string,
): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE organizations SET stripe_customer_id = $2, updated_at = NOW() WHERE clerk_org_id = $1`,
    [clerkOrgId, stripeCustomerId],
  );
}

export async function getUserStripeCustomerId(
  clerkUserId: string,
): Promise<string | null> {
  const pool = getPgPool();
  const result = await pool.query<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM users WHERE clerk_user_id = $1 LIMIT 1`,
    [clerkUserId],
  );
  return result.rows[0]?.stripe_customer_id ?? null;
}

export async function getOrganizationStripeCustomerId(
  clerkOrgId: string,
): Promise<string | null> {
  const pool = getPgPool();
  const result = await pool.query<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM organizations WHERE clerk_org_id = $1 LIMIT 1`,
    [clerkOrgId],
  );
  return result.rows[0]?.stripe_customer_id ?? null;
}

// ---------------------------------------------------------------------------
// Name lookups for UI labels. Cheap single-row queries; the dashboard calls
// these to render the active workspace name so the user always knows which
// Clerk context they're viewing.
// ---------------------------------------------------------------------------

export async function getOrganizationNameByClerkId(
  clerkOrgId: string,
): Promise<string | null> {
  const pool = getPgPool();
  const result = await pool.query<{ name: string }>(
    `SELECT name FROM organizations WHERE clerk_org_id = $1 LIMIT 1`,
    [clerkOrgId],
  );
  return result.rows[0]?.name ?? null;
}

// ---------------------------------------------------------------------------
// Membership-role lookup (Sprint 2.7 Chunk C).
//
// Source of truth: `memberships.role` populated by the Clerk webhook. The
// raw Clerk role slug is returned — callers must funnel through
// `deriveMembershipRole` in `auth.ts` before making an access decision.
//
// Session subjects already carry `session.orgRole`; this helper mostly
// exists for (a) org-scoped API keys that want to enforce role checks
// against the issuing user (not used in Chunk C — org API keys keep their
// effective role as `editor` until Chunk D scope claims change that), and
// (b) the team page in Chunk E, which needs to list every member's role
// without reaching back into Clerk.
// ---------------------------------------------------------------------------

export async function getMembershipRole(
  clerkUserId: string,
  clerkOrgId: string,
): Promise<string | null> {
  const pool = getPgPool();
  const result = await pool.query<{ role: string }>(
    `SELECT role FROM memberships WHERE clerk_user_id = $1 AND clerk_org_id = $2 LIMIT 1`,
    [clerkUserId, clerkOrgId],
  );
  return result.rows[0]?.role ?? null;
}

// ---------------------------------------------------------------------------
// Org member listing (Sprint 2.7 Chunk E).
//
// Read-only: powers /dashboard/team. We deliberately do NOT mutate
// memberships from the Linky dashboard — Clerk is the source of truth
// and role changes go through their admin UI. Surfacing the list here
// just saves a tab-switch when an admin wants to see who has what role.
// ---------------------------------------------------------------------------

export type OrgMemberRow = {
  clerkUserId: string;
  role: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
};

export async function listOrgMembers(
  clerkOrgId: string,
): Promise<OrgMemberRow[]> {
  const pool = getPgPool();
  const result = await pool.query<{
    clerk_user_id: string;
    role: string;
    display_name: string | null;
    email: string | null;
    created_at: Date | string;
  }>(
    `
    SELECT
      m.clerk_user_id,
      m.role,
      u.display_name,
      u.email,
      m.created_at
    FROM memberships m
    LEFT JOIN users u ON u.clerk_user_id = m.clerk_user_id
    WHERE m.clerk_org_id = $1
    ORDER BY
      CASE m.role
        WHEN 'org:admin' THEN 0
        WHEN 'org:member' THEN 1
        ELSE 2
      END,
      COALESCE(u.display_name, u.email, m.clerk_user_id) ASC
    `,
    [clerkOrgId],
  );

  return result.rows.map((row) => ({
    clerkUserId: row.clerk_user_id,
    role: row.role,
    displayName: row.display_name,
    email: row.email,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
  }));
}

export async function getUserDisplayNameByClerkId(
  clerkUserId: string,
): Promise<{ displayName: string | null; email: string | null } | null> {
  const pool = getPgPool();
  const result = await pool.query<{
    display_name: string | null;
    email: string | null;
  }>(
    `SELECT display_name, email FROM users WHERE clerk_user_id = $1 LIMIT 1`,
    [clerkUserId],
  );
  if (result.rowCount === 0) return null;
  return {
    displayName: result.rows[0].display_name,
    email: result.rows[0].email,
  };
}
