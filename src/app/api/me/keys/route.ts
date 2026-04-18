import type { NextRequest } from "next/server";

import { LinkyError, isLinkyError } from "@/lib/linky/errors";
import {
  createApiKeyForSubject,
  listApiKeysForSubject,
  normalizeApiKeyName,
  revokeApiKeyForSubject,
  type ApiKeyRecord,
} from "@/lib/server/api-keys";
import {
  AuthRequiredError,
  requireAuthSubject,
} from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type KnownError = LinkyError | AuthRequiredError;

function isKnownError(error: unknown): error is KnownError {
  return isLinkyError(error) || error instanceof AuthRequiredError;
}

function toErrorResponse(error: KnownError): Response {
  const publicMessage =
    isLinkyError(error) && error.code === "INTERNAL_ERROR"
      ? "Linky is temporarily unavailable. Please try again shortly."
      : error.message;

  return Response.json(
    {
      error: publicMessage,
      code: error.code,
    },
    { status: error.statusCode },
  );
}

function toApiKeyDto(record: ApiKeyRecord) {
  return {
    id: record.id,
    name: record.name,
    scope: record.scope,
    keyPrefix: record.keyPrefix,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const subject = await requireAuthSubject(request);
    const apiKeys = await listApiKeysForSubject(subject);

    return Response.json({
      apiKeys: apiKeys.map(toApiKeyDto),
      subject: {
        type: subject.type,
        ...(subject.type === "org" ? { orgId: subject.orgId } : {}),
        ...(subject.type === "user" ? { userId: subject.userId } : {}),
      },
    });
  } catch (error) {
    if (isKnownError(error)) {
      return toErrorResponse(error);
    }

    return toErrorResponse(
      new LinkyError("Unexpected server error while listing API keys.", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
      }),
    );
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const subject = await requireAuthSubject();
    let rawBody: unknown;

    try {
      rawBody = await request.json();
    } catch {
      throw new LinkyError("Request body must be valid JSON.", {
        code: "INVALID_JSON",
        statusCode: 400,
      });
    }

    const body =
      rawBody && typeof rawBody === "object"
        ? (rawBody as Record<string, unknown>)
        : null;
    if (!body) {
      throw new LinkyError("Request body must be a JSON object.", {
        code: "BAD_REQUEST",
        statusCode: 400,
      });
    }

    const name = normalizeApiKeyName(body.name);
    const created = await createApiKeyForSubject({
      subject,
      name,
      createdByClerkUserId:
        subject.type === "user" ? subject.userId : subject.userId ?? "",
    });

    return Response.json(
      {
        apiKey: toApiKeyDto(created.apiKey),
        rawKey: created.rawKey,
        warning:
          "Save this API key now — it is shown only once and cannot be recovered.",
      },
      { status: 201 },
    );
  } catch (error) {
    if (isKnownError(error)) {
      return toErrorResponse(error);
    }

    return toErrorResponse(
      new LinkyError("Unexpected server error while creating API key.", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
      }),
    );
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const subject = await requireAuthSubject();
    const idRaw = request.nextUrl.searchParams.get("id");
    const apiKeyId = idRaw ? Number.parseInt(idRaw, 10) : Number.NaN;

    if (!Number.isFinite(apiKeyId) || apiKeyId <= 0) {
      throw new LinkyError("`id` must be a positive integer.", {
        code: "BAD_REQUEST",
        statusCode: 400,
      });
    }

    const revoked = await revokeApiKeyForSubject({
      apiKeyId,
      subject,
    });

    if (!revoked) {
      return Response.json(
        { error: "API key not found.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return Response.json({ apiKey: toApiKeyDto(revoked) });
  } catch (error) {
    if (isKnownError(error)) {
      return toErrorResponse(error);
    }

    return toErrorResponse(
      new LinkyError("Unexpected server error while revoking API key.", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
      }),
    );
  }
}
