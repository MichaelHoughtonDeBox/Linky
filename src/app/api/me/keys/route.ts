import type { NextRequest } from "next/server";

import { LinkyError } from "@/lib/linky/errors";
import { requireAuthSubject } from "@/lib/server/auth";
import { isKnownServerError, toErrorResponse } from "@/lib/server/http-errors";
import {
  createKey,
  listKeys,
  revokeKey,
} from "@/lib/server/services/keys-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const subject = await requireAuthSubject(request);
    const dto = await listKeys(subject);
    return Response.json(dto);
  } catch (error) {
    if (isKnownServerError(error)) return toErrorResponse(error);
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
    const subject = await requireAuthSubject(request);

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

    const dto = await createKey(
      {
        name: body.name,
        scopes: body.scopes,
        rateLimitPerHour: body.rateLimitPerHour,
      },
      subject,
    );
    return Response.json(dto, { status: 201 });
  } catch (error) {
    if (isKnownServerError(error)) return toErrorResponse(error);
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
    const subject = await requireAuthSubject(request);
    const idRaw = request.nextUrl.searchParams.get("id");
    const apiKeyId = idRaw ? Number.parseInt(idRaw, 10) : Number.NaN;

    if (!Number.isFinite(apiKeyId) || apiKeyId <= 0) {
      throw new LinkyError("`id` must be a positive integer.", {
        code: "BAD_REQUEST",
        statusCode: 400,
      });
    }

    const dto = await revokeKey({ id: apiKeyId }, subject);
    return Response.json(dto);
  } catch (error) {
    if (isKnownServerError(error)) return toErrorResponse(error);
    return toErrorResponse(
      new LinkyError("Unexpected server error while revoking API key.", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
      }),
    );
  }
}
