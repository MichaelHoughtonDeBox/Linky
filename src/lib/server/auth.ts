import "server-only";

import { auth } from "@clerk/nextjs/server";

import { authenticateApiKey } from "./api-keys";

// ---------------------------------------------------------------------------
// Authenticated subject model.
//
// Linky rows can be owned by three kinds of subjects:
//   - "org"       — a Clerk organization (team plan)
//   - "user"      — a Clerk user (solo plan)
//   - "anonymous" — no signed-in identity (today's default, preserved forever)
//
// Ownership resolution rules (for CREATE):
//   1. If the request has active org context → org-owned.
//   2. Else if the request has a signed-in user → user-owned.
//   3. Otherwise → anonymous (immutable).
//
// Ownership enforcement (for UPDATE/DELETE) lives in the repository layer,
// which compares the subject against the stored owner columns.
// ---------------------------------------------------------------------------

export type OrgSubject = {
  type: "org";
  orgId: string;
  // Clerk-backed org context carries the active human user id. Org-scoped API
  // keys deliberately do NOT: they authenticate as the org only, so they
  // cannot accidentally bleed into user-owned resources.
  userId: string | null;
  role: string | null;
};

export type UserSubject = {
  type: "user";
  userId: string;
};

export type AnonymousSubject = {
  type: "anonymous";
};

export type AuthenticatedSubject = OrgSubject | UserSubject;
export type AuthSubject = AuthenticatedSubject | AnonymousSubject;

function parseBearerToken(request: Request): string | null {
  const raw = request.headers.get("authorization");
  if (!raw) return null;

  const match = /^\s*Bearer\s+(.+?)\s*$/i.exec(raw);
  if (!match) return null;

  const token = match[1]?.trim();
  return token && token.length > 0 ? token : null;
}

async function getSessionAuthSubject(): Promise<AuthSubject> {
  const session = await auth();

  if (!session.userId) {
    return { type: "anonymous" };
  }

  if (session.orgId) {
    return {
      type: "org",
      orgId: session.orgId,
      userId: session.userId,
      // Clerk's session exposes the active org role when org context is
      // selected. `orgRole` is a role slug like "org:admin" or a custom role
      // configured in the Clerk dashboard.
      role: session.orgRole ?? null,
    };
  }

  return {
    type: "user",
    userId: session.userId,
  };
}

async function getRequestAuthSubject(request: Request): Promise<AuthSubject> {
  const bearerToken = parseBearerToken(request);
  if (bearerToken) {
    const apiKeySubject = await authenticateApiKey(bearerToken);
    if (!apiKeySubject) {
      throw new AuthRequiredError("Invalid API key.");
    }
    return apiKeySubject;
  }

  return getSessionAuthSubject();
}

/**
 * Resolve the active subject for the current request.
 *
 * Safe to call from any server context (Server Components, Route Handlers,
 * Server Actions). Returns an anonymous subject if no Clerk session is
 * present — callers that require auth should guard explicitly.
 */
export async function getAuthSubject(request?: Request): Promise<AuthSubject> {
  if (request) {
    return getRequestAuthSubject(request);
  }

  return getSessionAuthSubject();
}

/**
 * Resolve the subject or throw if unauthenticated. Convenience for routes
 * that must have a signed-in user. Callers still need to check ownership.
 */
export async function requireAuthSubject(
  request?: Request,
): Promise<AuthenticatedSubject> {
  const subject = await getAuthSubject(request);

  if (subject.type === "anonymous") {
    throw new AuthRequiredError();
  }

  return subject;
}

/**
 * Resolve the signed-in Clerk user id from the browser session only.
 *
 * Claim consumption is intentionally human-mediated: API keys may edit owned
 * Linkies, but they must never claim anonymous ones. This helper preserves
 * that boundary without forcing callers to reason about bearer-auth subjects.
 */
export async function requireSessionUserId(): Promise<string> {
  const session = await auth();
  if (!session.userId) {
    throw new AuthRequiredError();
  }
  return session.userId;
}

export class AuthRequiredError extends Error {
  readonly code = "UNAUTHORIZED";
  readonly statusCode = 401;

  constructor(message = "Authentication required.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  readonly statusCode = 403;

  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// ---------------------------------------------------------------------------
// Ownership check.
// ---------------------------------------------------------------------------

export type LinkyOwnership = {
  ownerUserId: string | null;
  ownerOrgId: string | null;
};

/**
 * Returns true iff the given subject is permitted to edit the given Linky.
 *
 * - Anonymous Linkies (both owner columns NULL) can never be edited — they
 *   are immutable by policy to preserve the trust model: a URL shared with
 *   the world will not change under its consumers.
 * - User-owned Linkies: editable only by the owning Clerk user.
 * - Org-owned Linkies: editable by any member of the org. Role-based
 *   restrictions (e.g. viewer vs editor) can be layered on top of this
 *   primitive in a future sprint; for Sprint 1 all members can edit.
 */
export function canEditLinky(
  subject: AuthSubject,
  ownership: LinkyOwnership,
): boolean {
  const isAnonymousLinky =
    !ownership.ownerUserId && !ownership.ownerOrgId;
  if (isAnonymousLinky) return false;

  if (subject.type === "anonymous") return false;

  if (ownership.ownerOrgId) {
    return subject.type === "org" && subject.orgId === ownership.ownerOrgId;
  }

  if (ownership.ownerUserId) {
    return (
      (subject.type === "user" && subject.userId === ownership.ownerUserId) ||
      (subject.type === "org" &&
        subject.userId !== null &&
        subject.userId === ownership.ownerUserId)
    );
  }

  return false;
}

/** Throws ForbiddenError if the subject cannot edit the Linky. */
export function requireCanEditLinky(
  subject: AuthSubject,
  ownership: LinkyOwnership,
): void {
  if (!canEditLinky(subject, ownership)) {
    throw new ForbiddenError();
  }
}
