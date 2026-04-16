import { describe, expect, it } from "vitest";

import { computeCreatorFingerprint } from "./fingerprint";

describe("computeCreatorFingerprint", () => {
  it("produces a stable hex string of fixed length", () => {
    const result = computeCreatorFingerprint("1.2.3.4", "Mozilla/5.0");
    expect(result).toMatch(/^[0-9a-f]+$/);
    expect(result).toHaveLength(32);
  });

  it("returns the same value for the same inputs within a single day", () => {
    const a = computeCreatorFingerprint("1.2.3.4", "Mozilla/5.0");
    const b = computeCreatorFingerprint("1.2.3.4", "Mozilla/5.0");
    expect(a).toBe(b);
  });

  it("differs when the IP differs", () => {
    const a = computeCreatorFingerprint("1.2.3.4", "Mozilla/5.0");
    const b = computeCreatorFingerprint("4.3.2.1", "Mozilla/5.0");
    expect(a).not.toBe(b);
  });

  it("differs when the User-Agent differs", () => {
    const a = computeCreatorFingerprint("1.2.3.4", "Mozilla/5.0");
    const b = computeCreatorFingerprint("1.2.3.4", "curl/8.0");
    expect(a).not.toBe(b);
  });

  it("handles a null User-Agent without throwing", () => {
    expect(() =>
      computeCreatorFingerprint("1.2.3.4", null),
    ).not.toThrow();
  });
});
