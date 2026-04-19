import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// authenticateApiKey × per-key rate limit (Sprint 2.8 Chunk D).
//
// Verifies the bucket enforcement path end-to-end against a mocked
// Postgres pool: the DB row supplies `rate_limit_per_hour`, the real
// rate-limit bucket implementation (src/lib/server/rate-limit.ts) is
// consulted, and exhaustion surfaces as a RateLimitError.
//
// Specifically pins:
//
//   1. A request that fits under the cap returns the subject.
//   2. The N+1th request in the same window throws RateLimitError with
//      a positive retryAfterSeconds.
//   3. rate_limit_per_hour = 0 means "unlimited" — no bucket check, so
//      we can hit the endpoint 1000+ times without rate limiting.
//   4. Different api_keys.id rows use different buckets (no cross-key
//      interference).
//
// Bucket state lives on globalThis via rate-limit.ts. Each test resets
// the bucket map so prior tests can't influence the current one.
// ============================================================================

vi.mock("@/lib/server/postgres", () => {
  const pool = {
    // Every test sets `.query` to its own handler before calling
    // authenticateApiKey. This wrapper keeps the getPgPool import stable.
    query: vi.fn(),
  };
  return { getPgPool: () => pool };
});

import { RateLimitError } from "@/lib/linky/errors";
import * as pg from "@/lib/server/postgres";
import {
  authenticateApiKey,
  hashApiKeySecret,
} from "./api-keys";

function mockPool() {
  return pg.getPgPool() as unknown as {
    query: ReturnType<typeof vi.fn>;
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    key_prefix: "lkyu_deadbeef",
    secret_hash: hashApiKeySecret("the-secret-with-more-than-24-chars"),
    owner_user_id: "user_alice",
    owner_org_id: null,
    name: "ci bot",
    scopes: ["links:write"],
    rate_limit_per_hour: 3,
    created_by_clerk_user_id: "user_alice",
    created_at: new Date("2026-01-01T00:00:00Z"),
    last_used_at: null,
    revoked_at: null,
    ...overrides,
  };
}

const VALID_RAW_KEY = "lkyu_deadbeef.the-secret-with-more-than-24-chars";

function resetBuckets() {
  // rate-limit.ts attaches its bucket Map to globalThis so Next.js hot-
  // reloads don't drop existing buckets. Reach in and clear it so each
  // test starts with a fresh quota for every key id.
  const globalWithBuckets = globalThis as typeof globalThis & {
    __linkyRateLimitBuckets?: Map<string, unknown>;
  };
  globalWithBuckets.__linkyRateLimitBuckets?.clear();
}

beforeEach(() => {
  resetBuckets();
  mockPool().query.mockReset();
});

describe("authenticateApiKey → per-key rate limit", () => {
  it("returns the subject while under the cap", async () => {
    mockPool().query.mockResolvedValue({
      rowCount: 1,
      rows: [makeRow({ rate_limit_per_hour: 3 })],
    });

    const subject = await authenticateApiKey(VALID_RAW_KEY);
    expect(subject).toMatchObject({
      type: "user",
      userId: "user_alice",
      scopes: ["links:write"],
    });
  });

  it("throws RateLimitError on the N+1th call inside the window", async () => {
    mockPool().query.mockResolvedValue({
      rowCount: 1,
      rows: [makeRow({ rate_limit_per_hour: 2 })],
    });

    // 2 succeed.
    await authenticateApiKey(VALID_RAW_KEY);
    await authenticateApiKey(VALID_RAW_KEY);

    // 3rd exhausts the bucket.
    let caught: unknown;
    try {
      await authenticateApiKey(VALID_RAW_KEY);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RateLimitError);
    expect((caught as RateLimitError).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("rate_limit_per_hour = 0 is unlimited", async () => {
    mockPool().query.mockResolvedValue({
      rowCount: 1,
      rows: [makeRow({ rate_limit_per_hour: 0 })],
    });

    // Far more than any sensible default; every call must succeed.
    for (let i = 0; i < 50; i += 1) {
      const subject = await authenticateApiKey(VALID_RAW_KEY);
      expect(subject).not.toBeNull();
    }
  });

  it("different key ids keep independent buckets", async () => {
    // Two keys, both with a cap of 2/hr. Key 1 burns its quota; key 2
    // must still succeed because its bucket lives under a different
    // id-keyed entry.
    const queryMock = mockPool().query;
    queryMock.mockImplementation(async () => {
      // The cycle: the test toggles which row the `authenticateApiKey`
      // sees by returning row id 1 then row id 2 on alternating calls.
      // We drive both keys explicitly instead of relying on the
      // implementation's argument order, so any future change to the
      // query shape doesn't falsely pass this test.
      throw new Error("Test should call queryMock via mockResolvedValueOnce");
    });

    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [makeRow({ id: 1, rate_limit_per_hour: 2 })],
    });
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [makeRow({ id: 1, rate_limit_per_hour: 2 })],
    });
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [makeRow({ id: 1, rate_limit_per_hour: 2 })],
    });
    await authenticateApiKey(VALID_RAW_KEY);
    await authenticateApiKey(VALID_RAW_KEY);
    await expect(authenticateApiKey(VALID_RAW_KEY)).rejects.toBeInstanceOf(
      RateLimitError,
    );

    // Key 2 (different id) should still have its full quota.
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [makeRow({ id: 2, rate_limit_per_hour: 2 })],
    });
    const otherSubject = await authenticateApiKey(VALID_RAW_KEY);
    expect(otherSubject).not.toBeNull();
  });
});
