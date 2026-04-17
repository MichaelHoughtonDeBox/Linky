import "server-only";

import type { AuthSubject } from "./auth";

// ---------------------------------------------------------------------------
// Entitlements.
//
// Sprint 1 scope: scaffold the gating primitive so every API route reads
// limits from the same place, but ship with only one plan ("free") whose
// limits are hard-coded here. Stripe webhooks will populate the
// `entitlements` table in a later sprint; this module will then fall back
// to plan defaults when no row exists.
//
// Anonymous subjects share the anonymous plan, which is slightly tighter
// than "free" (no per-user accountability, rate-limited elsewhere).
// ---------------------------------------------------------------------------

export type PlanId = "anonymous" | "free";

export type Limits = {
  /** Maximum Linkies the subject may own concurrently. -1 = unlimited. */
  maxLinkies: number;
  /** Maximum URLs allowed inside a single Linky. */
  maxUrlsPerLinky: number;
  /** Whether the subject may edit existing Linkies (anonymous cannot). */
  canEdit: boolean;
};

const PLAN_LIMITS: Record<PlanId, Limits> = {
  anonymous: {
    maxLinkies: 50,
    maxUrlsPerLinky: 25,
    canEdit: false,
  },
  free: {
    maxLinkies: 100,
    maxUrlsPerLinky: 25,
    canEdit: true,
  },
};

/**
 * Resolve the plan id for a subject.
 *
 * Sprint 1: users and orgs both land on "free". When Stripe-backed plans go
 * live, this function will query the `entitlements` table and return the
 * persisted plan id, falling back to "free" if no row exists.
 */
export function resolvePlanId(subject: AuthSubject): PlanId {
  if (subject.type === "anonymous") return "anonymous";
  return "free";
}

/** Hard limits for the resolved plan. */
export function getLimits(subject: AuthSubject): Limits {
  return PLAN_LIMITS[resolvePlanId(subject)];
}
