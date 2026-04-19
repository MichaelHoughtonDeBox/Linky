import { describe, expect, it } from "vitest";

import {
  canAdminLinky,
  canEditLinky,
  canViewLinky,
  deriveMembershipRole,
  ForbiddenError,
  requireCanAdminLinky,
  requireCanEditLinky,
  requireCanViewLinky,
  roleOfSubject,
  type AuthSubject,
  type LinkyOwnership,
} from "./auth";

// ---------------------------------------------------------------------------
// Ownership + role matrix (Sprint 2.7 Chunk C).
//
// The real access-control surface of the whole sprint lives in this test
// file. Any regression here silently lets random users edit or delete other
// people's launch bundles — so we enumerate the full subject × ownership ×
// role matrix explicitly, not inline in route handlers.
//
// Historical note: Sprint 1 shipped only `canEditLinky(subject, ownership)`.
// Sprint 2.7 extends to (canView / canEdit / canAdmin) × (viewer / editor /
// admin). The two-arg signature is preserved so older callers keep working;
// a missing `role` resolves through `effectiveRole` to today's behavior.
// ---------------------------------------------------------------------------

const ANONYMOUS: AuthSubject = { type: "anonymous" };
const USER_A: AuthSubject = { type: "user", userId: "user_A" };
const USER_B: AuthSubject = { type: "user", userId: "user_B" };
const ORG_X_USER_A_ADMIN: AuthSubject = {
  type: "org",
  orgId: "org_X",
  userId: "user_A",
  role: "org:admin",
};
const ORG_X_USER_A_MEMBER: AuthSubject = {
  type: "org",
  orgId: "org_X",
  userId: "user_A",
  role: "org:member",
};
const ORG_X_USER_A_CUSTOM_VIEWER: AuthSubject = {
  type: "org",
  orgId: "org_X",
  userId: "user_A",
  role: "reports:viewer",
};
const ORG_X_USER_A_CUSTOM_EDITOR: AuthSubject = {
  type: "org",
  orgId: "org_X",
  userId: "user_A",
  role: "linky:editor:reviews",
};
const ORG_Y_USER_A_ADMIN: AuthSubject = {
  type: "org",
  orgId: "org_Y",
  userId: "user_A",
  role: "org:admin",
};
const ORG_X_API_KEY: AuthSubject = {
  type: "org",
  orgId: "org_X",
  userId: null,
  role: null,
};

const ANON_LINKY: LinkyOwnership = {
  ownerUserId: null,
  ownerOrgId: null,
};
const USER_A_LINKY: LinkyOwnership = {
  ownerUserId: "user_A",
  ownerOrgId: null,
};
const ORG_X_LINKY: LinkyOwnership = {
  ownerUserId: null,
  ownerOrgId: "org_X",
};

// ---------------------------------------------------------------------------
// Role derivation.
// ---------------------------------------------------------------------------

describe("deriveMembershipRole", () => {
  it("maps the Clerk admin slug to admin", () => {
    expect(deriveMembershipRole("org:admin")).toBe("admin");
  });

  it("maps the Clerk member slug to editor (today's posture)", () => {
    expect(deriveMembershipRole("org:member")).toBe("editor");
  });

  it("maps any linky:editor-prefixed slug to editor", () => {
    expect(deriveMembershipRole("linky:editor")).toBe("editor");
    expect(deriveMembershipRole("linky:editor:reviews")).toBe("editor");
    expect(deriveMembershipRole("linky:editor:incidents")).toBe("editor");
  });

  it("maps unknown custom roles to viewer (conservative default)", () => {
    expect(deriveMembershipRole("reports:viewer")).toBe("viewer");
    expect(deriveMembershipRole("some:random:role")).toBe("viewer");
  });

  it("does NOT let a custom role escalate to admin", () => {
    // Hypothetical "linky:admin" prefix is intentionally NOT recognized.
    // Privilege escalation has to go through Clerk's native admin slug.
    expect(deriveMembershipRole("linky:admin")).toBe("viewer");
  });

  it("treats null/undefined as editor (API-key subjects, legacy callers)", () => {
    expect(deriveMembershipRole(null)).toBe("editor");
    expect(deriveMembershipRole(undefined)).toBe("editor");
  });

  it("is case-insensitive for mixed-case Clerk exports", () => {
    expect(deriveMembershipRole("Org:Admin")).toBe("admin");
    expect(deriveMembershipRole("LINKY:EDITOR:FOO")).toBe("editor");
  });

  it("trims whitespace", () => {
    expect(deriveMembershipRole("  org:admin  ")).toBe("admin");
  });
});

describe("roleOfSubject", () => {
  it("user subjects are always admin of themselves", () => {
    expect(roleOfSubject(USER_A)).toBe("admin");
  });

  it("anonymous subjects are viewer (conservative, never actually reached)", () => {
    expect(roleOfSubject(ANONYMOUS)).toBe("viewer");
  });

  it("org subjects inherit their Clerk role slug", () => {
    expect(roleOfSubject(ORG_X_USER_A_ADMIN)).toBe("admin");
    expect(roleOfSubject(ORG_X_USER_A_MEMBER)).toBe("editor");
    expect(roleOfSubject(ORG_X_USER_A_CUSTOM_VIEWER)).toBe("viewer");
    expect(roleOfSubject(ORG_X_USER_A_CUSTOM_EDITOR)).toBe("editor");
  });

  it("org-scoped API keys default to editor (no Clerk session, no role)", () => {
    expect(roleOfSubject(ORG_X_API_KEY)).toBe("editor");
  });
});

// ---------------------------------------------------------------------------
// canViewLinky.
// ---------------------------------------------------------------------------

describe("canViewLinky", () => {
  it("denies views on anonymous Linkies regardless of subject", () => {
    expect(canViewLinky(ANONYMOUS, ANON_LINKY)).toBe(false);
    expect(canViewLinky(USER_A, ANON_LINKY)).toBe(false);
    expect(canViewLinky(ORG_X_USER_A_ADMIN, ANON_LINKY)).toBe(false);
  });

  it("denies views from anonymous subjects even on owned Linkies", () => {
    expect(canViewLinky(ANONYMOUS, USER_A_LINKY)).toBe(false);
    expect(canViewLinky(ANONYMOUS, ORG_X_LINKY)).toBe(false);
  });

  it("allows the owning user to view their Linky", () => {
    expect(canViewLinky(USER_A, USER_A_LINKY)).toBe(true);
  });

  it("denies a different user from viewing a user-owned Linky", () => {
    expect(canViewLinky(USER_B, USER_A_LINKY)).toBe(false);
  });

  it("allows every derived role to view an org-owned Linky", () => {
    expect(canViewLinky(ORG_X_USER_A_ADMIN, ORG_X_LINKY, "admin")).toBe(true);
    expect(canViewLinky(ORG_X_USER_A_MEMBER, ORG_X_LINKY, "editor")).toBe(true);
    expect(canViewLinky(ORG_X_USER_A_CUSTOM_VIEWER, ORG_X_LINKY, "viewer")).toBe(
      true,
    );
  });

  it("denies viewers from a different org", () => {
    expect(canViewLinky(ORG_Y_USER_A_ADMIN, ORG_X_LINKY, "admin")).toBe(false);
  });

  it("allows an org API key to view an org-owned Linky (effective role: editor)", () => {
    expect(canViewLinky(ORG_X_API_KEY, ORG_X_LINKY)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canEditLinky.
// ---------------------------------------------------------------------------

describe("canEditLinky", () => {
  it("denies edits to anonymous Linkies regardless of subject", () => {
    expect(canEditLinky(ANONYMOUS, ANON_LINKY)).toBe(false);
    expect(canEditLinky(USER_A, ANON_LINKY)).toBe(false);
    expect(canEditLinky(ORG_X_USER_A_ADMIN, ANON_LINKY)).toBe(false);
  });

  it("denies edits from anonymous subjects", () => {
    expect(canEditLinky(ANONYMOUS, USER_A_LINKY)).toBe(false);
    expect(canEditLinky(ANONYMOUS, ORG_X_LINKY)).toBe(false);
  });

  it("allows the owning user to edit their own Linky", () => {
    expect(canEditLinky(USER_A, USER_A_LINKY)).toBe(true);
  });

  it("denies a different user from editing", () => {
    expect(canEditLinky(USER_B, USER_A_LINKY)).toBe(false);
  });

  it("allows admin and editor to edit an org-owned Linky", () => {
    expect(canEditLinky(ORG_X_USER_A_ADMIN, ORG_X_LINKY, "admin")).toBe(true);
    expect(canEditLinky(ORG_X_USER_A_MEMBER, ORG_X_LINKY, "editor")).toBe(true);
    expect(canEditLinky(ORG_X_USER_A_CUSTOM_EDITOR, ORG_X_LINKY, "editor")).toBe(
      true,
    );
  });

  it("denies a custom viewer role from editing", () => {
    expect(
      canEditLinky(ORG_X_USER_A_CUSTOM_VIEWER, ORG_X_LINKY, "viewer"),
    ).toBe(false);
  });

  it("allows org API keys to edit (preserves Sprint 2.6 behavior until Chunk D)", () => {
    expect(canEditLinky(ORG_X_API_KEY, ORG_X_LINKY)).toBe(true);
  });

  it("denies editors in a different org", () => {
    expect(canEditLinky(ORG_Y_USER_A_ADMIN, ORG_X_LINKY, "admin")).toBe(false);
  });

  it("allows ORG-context subject to edit their own user-owned Linky (Clerk identity preserved)", () => {
    expect(canEditLinky(ORG_X_USER_A_ADMIN, USER_A_LINKY)).toBe(true);
  });

  it("denies an org API key from editing a user-owned Linky", () => {
    expect(canEditLinky(ORG_X_API_KEY, USER_A_LINKY)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canAdminLinky — new in Chunk C. Destructive ops (DELETE, API-key admin).
// ---------------------------------------------------------------------------

describe("canAdminLinky", () => {
  it("denies every subject on anonymous Linkies", () => {
    expect(canAdminLinky(ANONYMOUS, ANON_LINKY)).toBe(false);
    expect(canAdminLinky(USER_A, ANON_LINKY)).toBe(false);
    expect(canAdminLinky(ORG_X_USER_A_ADMIN, ANON_LINKY, "admin")).toBe(false);
  });

  it("grants admin to the owning user (self is always admin of self)", () => {
    expect(canAdminLinky(USER_A, USER_A_LINKY)).toBe(true);
  });

  it("denies admin to any non-owner user", () => {
    expect(canAdminLinky(USER_B, USER_A_LINKY)).toBe(false);
  });

  it("grants admin only to the org:admin role on org-owned Linkies", () => {
    expect(canAdminLinky(ORG_X_USER_A_ADMIN, ORG_X_LINKY, "admin")).toBe(true);
  });

  it("denies editor and viewer roles on org-owned Linkies", () => {
    expect(canAdminLinky(ORG_X_USER_A_MEMBER, ORG_X_LINKY, "editor")).toBe(
      false,
    );
    expect(canAdminLinky(ORG_X_USER_A_CUSTOM_EDITOR, ORG_X_LINKY, "editor")).toBe(
      false,
    );
    expect(
      canAdminLinky(ORG_X_USER_A_CUSTOM_VIEWER, ORG_X_LINKY, "viewer"),
    ).toBe(false);
  });

  it("denies org API keys admin by default (role null → editor effective)", () => {
    // This is the behavior change that lets future scoped keys (Chunk D)
    // upgrade to admin explicitly via the `keys:admin` scope. Default
    // API keys should NOT be able to delete.
    expect(canAdminLinky(ORG_X_API_KEY, ORG_X_LINKY)).toBe(false);
  });

  it("denies admin across orgs", () => {
    expect(canAdminLinky(ORG_Y_USER_A_ADMIN, ORG_X_LINKY, "admin")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// require* helpers — thin ForbiddenError wrappers.
// ---------------------------------------------------------------------------

describe("require* helpers", () => {
  it("requireCanViewLinky throws ForbiddenError when denied", () => {
    expect(() => requireCanViewLinky(USER_B, USER_A_LINKY)).toThrow(
      ForbiddenError,
    );
  });

  it("requireCanEditLinky does not throw when allowed", () => {
    expect(() => requireCanEditLinky(USER_A, USER_A_LINKY)).not.toThrow();
  });

  it("requireCanEditLinky throws when a viewer tries to edit an org-owned Linky", () => {
    expect(() =>
      requireCanEditLinky(ORG_X_USER_A_CUSTOM_VIEWER, ORG_X_LINKY, "viewer"),
    ).toThrow(ForbiddenError);
  });

  it("requireCanAdminLinky throws when an editor tries to delete", () => {
    expect(() =>
      requireCanAdminLinky(ORG_X_USER_A_MEMBER, ORG_X_LINKY, "editor"),
    ).toThrow(ForbiddenError);
  });

  it("requireCanAdminLinky does not throw for an org admin", () => {
    expect(() =>
      requireCanAdminLinky(ORG_X_USER_A_ADMIN, ORG_X_LINKY, "admin"),
    ).not.toThrow();
  });
});
