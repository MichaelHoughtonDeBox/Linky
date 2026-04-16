import { NextRequest } from "next/server";

import { LinkyError, isLinkyError } from "@/lib/linky/errors";
import { parseCreateLinkyPayload } from "@/lib/linky/schemas";
import { generateSlug } from "@/lib/linky/slugs";
import type {
  CreateLinkyPayload,
  CreateLinkyResponse,
  LinkyRecord,
} from "@/lib/linky/types";
import { getAuthSubject, type AuthSubject } from "@/lib/server/auth";
import { createClaimToken } from "@/lib/server/claim-tokens";
import { getPublicBaseUrl, getRateLimitConfig } from "@/lib/server/config";
import { getLimits } from "@/lib/server/entitlements";
import { computeCreatorFingerprint } from "@/lib/server/fingerprint";
import { insertLinkyRecord } from "@/lib/server/linkies-repository";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getClientIp } from "@/lib/server/request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GENERATED_SLUG_ATTEMPTS = 5;

function toErrorResponse(error: LinkyError): Response {
  const isInternal = error.code === "INTERNAL_ERROR";
  const publicMessage = isInternal
    ? "Linky is temporarily unavailable. Please try again shortly."
    : error.message;

  return Response.json(
    {
      error: publicMessage,
      code: error.code,
      details: process.env.NODE_ENV === "development" ? error.details : undefined,
    },
    { status: error.statusCode },
  );
}

function buildCreateResponse(
  record: LinkyRecord,
  request: NextRequest,
  claim?: { token: string; expiresAt: string },
): CreateLinkyResponse {
  const baseUrl = getPublicBaseUrl(request.nextUrl.origin);
  const url = new URL(`/l/${record.slug}`, baseUrl).toString();

  const response: CreateLinkyResponse = {
    slug: record.slug,
    url,
  };

  if (claim) {
    response.claimUrl = new URL(`/claim/${claim.token}`, baseUrl).toString();
    response.claimExpiresAt = claim.expiresAt;
  }

  return response;
}

// ---------------------------------------------------------------------------
// Ownership + fingerprint attribution.
//
// - Org context wins over user context (team plan > solo).
// - Anonymous creates stay anonymous, but we still capture a fingerprint
//   so the creator can later claim the Linky through the claim-token flow.
// ---------------------------------------------------------------------------

type AttributionFields = {
  ownerUserId: string | null;
  ownerOrgId: string | null;
  creatorFingerprint: string | null;
};

function resolveAttribution(
  subject: AuthSubject,
  ipAddress: string,
  userAgent: string | null,
): AttributionFields {
  if (subject.type === "org") {
    return {
      ownerUserId: null,
      ownerOrgId: subject.orgId,
      creatorFingerprint: null,
    };
  }

  if (subject.type === "user") {
    return {
      ownerUserId: subject.userId,
      ownerOrgId: null,
      creatorFingerprint: null,
    };
  }

  return {
    ownerUserId: null,
    ownerOrgId: null,
    creatorFingerprint: computeCreatorFingerprint(ipAddress, userAgent),
  };
}

async function createLinkyRecord(
  payload: CreateLinkyPayload,
  attribution: AttributionFields,
): Promise<LinkyRecord> {
  for (let attempt = 0; attempt < GENERATED_SLUG_ATTEMPTS; attempt += 1) {
    const created = await insertLinkyRecord({
      slug: generateSlug(),
      urls: payload.urls,
      urlMetadata: payload.urlMetadata ?? [],
      source: payload.source,
      metadata: payload.metadata,
      title: payload.title ?? null,
      description: payload.description ?? null,
      ownerUserId: attribution.ownerUserId,
      ownerOrgId: attribution.ownerOrgId,
      creatorFingerprint: attribution.creatorFingerprint,
    });

    if (created) {
      return created;
    }
  }

  throw new LinkyError("Failed to allocate a unique slug. Please retry.", {
    code: "INTERNAL_ERROR",
    statusCode: 500,
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const rateConfig = getRateLimitConfig();
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(clientIp, rateConfig);

    if (!rateLimit.allowed) {
      return Response.json(
        {
          error: "Too many requests. Please try again shortly.",
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: {
            "Retry-After": `${rateLimit.retryAfterSeconds}`,
          },
        },
      );
    }

    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch {
      throw new LinkyError("Request body must be valid JSON.", {
        code: "INVALID_JSON",
        statusCode: 400,
      });
    }

    const payload = parseCreateLinkyPayload(rawPayload);

    const subject = await getAuthSubject();
    const limits = getLimits(subject);

    if (payload.urls.length > limits.maxUrlsPerLinky) {
      throw new LinkyError(
        `Your plan allows up to ${limits.maxUrlsPerLinky} URLs per Linky.`,
        { code: "BAD_REQUEST", statusCode: 400 },
      );
    }

    const attribution = resolveAttribution(
      subject,
      clientIp,
      request.headers.get("user-agent"),
    );

    const record = await createLinkyRecord(payload, attribution);

    // Mint a claim token iff the Linky ended up anonymous. Signed-in
    // callers already have ownership attributed; minting a token for them
    // would be noise. Anonymous callers ALWAYS get a claim URL back so
    // they have a frictionless path to bind the Linky to an account later,
    // even if they didn't pass an email.
    const claim =
      subject.type === "anonymous"
        ? await createClaimToken({
            linkyId: record.id,
            email: payload.email ?? null,
          })
        : null;

    const response = buildCreateResponse(
      record,
      request,
      claim
        ? { token: claim.token, expiresAt: claim.expiresAt }
        : undefined,
    );

    return Response.json(response, { status: 201 });
  } catch (error) {
    if (isLinkyError(error)) {
      return toErrorResponse(error);
    }

    return toErrorResponse(
      new LinkyError("Unexpected server error while creating Linky.", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
      }),
    );
  }
}
