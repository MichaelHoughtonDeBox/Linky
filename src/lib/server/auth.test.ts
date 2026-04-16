import { describe, expect, it } from "vitest";

import {
  canEditLinky,
  ForbiddenError,
  requireCanEditLinky,
  type AuthSubject,
  type LinkyOwnership,
} from "./auth";

// ---------------------------------------------------------------------------
// canEditLinky ownership matrix.
// The real access-control surface of the whole sprint. Any regression here
// silently lets random users edit other people's Linkies — so we enumerate
// the full subject × ownership matrix explicitly.
// ---------------------------------------------------------------------------

const ANONYMOUS: AuthSubject = { type: "anonymous" };
const USER_A: AuthSubject = { type: "user", userId: "user_A" };
const USER_B: AuthSubject = { type: "user", userId: "user_B" };
const ORG_X_USER_A: AuthSubject = {
  type: "org",
  orgId: "org_X",
  userId: "user_A",
  role: "admin",
};
const ORG_Y_USER_A: AuthSubject = {
  type: "org",
  orgId: "org_Y",
  userId: "user_A",
  role: "admin",
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

describe("canEditLinky", () => {
  it("denies edits to anonymous Linkies regardless of subject", () => {
    expect(canEditLinky(ANONYMOUS, ANON_LINKY)).toBe(false);
    expect(canEditLinky(USER_A, ANON_LINKY)).toBe(false);
    expect(canEditLinky(ORG_X_USER_A, ANON_LINKY)).toBe(false);
  });

  it("denies edits from anonymous subjects even on owned Linkies", () => {
    expect(canEditLinky(ANONYMOUS, USER_A_LINKY)).toBe(false);
    expect(canEditLinky(ANONYMOUS, ORG_X_LINKY)).toBe(false);
  });

  it("allows the owning user to edit their Linky", () => {
    expect(canEditLinky(USER_A, USER_A_LINKY)).toBe(true);
  });

  it("denies a different user from editing a user-owned Linky", () => {
    expect(canEditLinky(USER_B, USER_A_LINKY)).toBe(false);
  });

  it("allows org members to edit an org-owned Linky when in that org context", () => {
    expect(canEditLinky(ORG_X_USER_A, ORG_X_LINKY)).toBe(true);
  });

  it("denies a user in a different org from editing an org-owned Linky", () => {
    expect(canEditLinky(ORG_Y_USER_A, ORG_X_LINKY)).toBe(false);
  });

  it("denies a plain-user subject from editing an org-owned Linky", () => {
    // Even if the user is a member of the org in their Clerk account, they
    // must select that org's context to edit org-owned rows. This avoids
    // ambient org ownership leaking across a user's personal work.
    expect(canEditLinky(USER_A, ORG_X_LINKY)).toBe(false);
  });

  it("allows a signed-in user in org context to edit their own user-owned Linky", () => {
    // An org-context subject still carries a userId; we use it for the
    // user-owned ownership path too. This matches Clerk's semantics where
    // a user's personal identity is preserved across org switches.
    expect(canEditLinky(ORG_X_USER_A, USER_A_LINKY)).toBe(true);
  });
});

describe("requireCanEditLinky", () => {
  it("does not throw when canEditLinky returns true", () => {
    expect(() => requireCanEditLinky(USER_A, USER_A_LINKY)).not.toThrow();
  });

  it("throws ForbiddenError when access is denied", () => {
    expect(() => requireCanEditLinky(USER_B, USER_A_LINKY)).toThrow(
      ForbiddenError,
    );
  });
});
