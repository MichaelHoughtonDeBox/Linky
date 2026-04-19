import { describe, expect, it } from "vitest";

import {
  LinkyError,
  RateLimitError,
  isLinkyError,
  isRateLimitError,
} from "./errors";

// ============================================================================
// LinkyError + RateLimitError — shape tests (Sprint 2.8 Chunk D).
//
// These are pure constructors, but the shape is the contract the rest of
// the stack (http-errors, MCP error mapper, SDK LinkyApiError) reads off.
// Pin it here so a refactor can't silently break the 429 story.
// ============================================================================

describe("LinkyError", () => {
  it("defaults to BAD_REQUEST / 400 when no options are given", () => {
    const err = new LinkyError("bad");
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("bad");
    expect(isLinkyError(err)).toBe(true);
  });

  it("accepts NOT_FOUND + 404 (Sprint 2.8 Chunk 0 code)", () => {
    const err = new LinkyError("gone", {
      code: "NOT_FOUND",
      statusCode: 404,
    });
    expect(err.code).toBe("NOT_FOUND");
    expect(err.statusCode).toBe(404);
  });

  it("does not classify a plain Error as a LinkyError", () => {
    expect(isLinkyError(new Error("nope"))).toBe(false);
  });
});

describe("RateLimitError", () => {
  it("carries code RATE_LIMITED, status 429, and retryAfterSeconds", () => {
    const err = new RateLimitError(42);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.statusCode).toBe(429);
    expect(err.retryAfterSeconds).toBe(42);
    expect(err.message).toMatch(/42s/);
    expect(isRateLimitError(err)).toBe(true);
    // Must NOT classify as a LinkyError — the shared error envelope
    // branches on RateLimitError specifically to set the `Retry-After`
    // header and the dedicated `retryAfterSeconds` JSON field.
    expect(isLinkyError(err)).toBe(false);
  });

  it("clamps retryAfterSeconds to at least 1", () => {
    expect(new RateLimitError(0).retryAfterSeconds).toBe(1);
    expect(new RateLimitError(-5).retryAfterSeconds).toBe(1);
  });

  it("supports a custom message override", () => {
    const err = new RateLimitError(30, "Your key has exhausted its quota.");
    expect(err.message).toBe("Your key has exhausted its quota.");
    expect(err.retryAfterSeconds).toBe(30);
  });
});
