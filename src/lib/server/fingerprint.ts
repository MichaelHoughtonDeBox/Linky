import "server-only";

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Creator fingerprint.
//
// A deterministic hash of (IP + User-Agent + daily salt) captured at the
// moment an anonymous Linky is created. Used later to let the creator claim
// their Linky from the same device within the same day — NOT a security
// primitive and NOT a cross-day identity.
//
// Properties this satisfies:
//   1. Hard to forge from another IP/UA without collusion.
//   2. Rotated daily via the salt so the fingerprint is NOT a stable
//      long-term user identifier we'd need to disclose in a privacy notice.
//   3. Short + fixed-length for cheap storage/indexing.
//
// Real claim-ownership enforcement is the `claim_tokens` table + Clerk sign-in.
// This fingerprint is a convenience signal only.
// ---------------------------------------------------------------------------

function dailySalt(): string {
  // UTC date string gives us a fresh salt every 24h without any storage.
  return new Date().toISOString().slice(0, 10);
}

export function computeCreatorFingerprint(
  ipAddress: string,
  userAgent: string | null,
): string {
  const hash = createHash("sha256");
  hash.update(ipAddress);
  hash.update("|");
  hash.update(userAgent ?? "unknown-ua");
  hash.update("|");
  hash.update(dailySalt());
  return hash.digest("hex").slice(0, 32);
}
