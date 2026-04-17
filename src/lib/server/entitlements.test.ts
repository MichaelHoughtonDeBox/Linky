import { describe, expect, it } from "vitest";

import { getLimits, resolvePlanId } from "./entitlements";
import type { AuthSubject } from "./auth";

describe("resolvePlanId", () => {
  it("returns 'anonymous' for anonymous subjects", () => {
    expect(resolvePlanId({ type: "anonymous" })).toBe("anonymous");
  });

  it("returns 'free' for signed-in users", () => {
    const subject: AuthSubject = { type: "user", userId: "u1" };
    expect(resolvePlanId(subject)).toBe("free");
  });

  it("returns 'free' for org-context subjects", () => {
    const subject: AuthSubject = {
      type: "org",
      orgId: "o1",
      userId: "u1",
      role: "admin",
    };
    expect(resolvePlanId(subject)).toBe("free");
  });
});

describe("getLimits", () => {
  it("blocks editing for anonymous subjects", () => {
    const limits = getLimits({ type: "anonymous" });
    expect(limits.canEdit).toBe(false);
  });

  it("allows editing for signed-in users", () => {
    const limits = getLimits({ type: "user", userId: "u1" });
    expect(limits.canEdit).toBe(true);
  });

  it("enforces a positive max URL count per Linky", () => {
    expect(getLimits({ type: "user", userId: "u1" }).maxUrlsPerLinky).toBeGreaterThan(0);
    expect(getLimits({ type: "anonymous" }).maxUrlsPerLinky).toBeGreaterThan(0);
  });
});
