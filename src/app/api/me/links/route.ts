import type { NextRequest } from "next/server";

import { LinkyError, isLinkyError } from "@/lib/linky/errors";
import type { LinkyRecord } from "@/lib/linky/types";
import {
  AuthRequiredError,
  requireAuthSubject,
} from "@/lib/server/auth";
import { listLinkiesForSubject } from "@/lib/server/linkies-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

function toRecordDto(record: LinkyRecord) {
  return {
    slug: record.slug,
    title: record.title,
    description: record.description,
    urls: record.urls,
    urlMetadata: record.urlMetadata,
    owner: record.owner,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    source: record.source,
  };
}

function parsePaginationParams(request: NextRequest): {
  limit: number;
  offset: number;
} {
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const offsetRaw = request.nextUrl.searchParams.get("offset");

  const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : DEFAULT_LIMIT;
  const parsedOffset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 0;

  if (
    !Number.isFinite(parsedLimit) ||
    parsedLimit <= 0 ||
    parsedLimit > MAX_LIMIT
  ) {
    throw new LinkyError(
      `\`limit\` must be a positive integer <= ${MAX_LIMIT}.`,
      { code: "BAD_REQUEST", statusCode: 400 },
    );
  }

  if (!Number.isFinite(parsedOffset) || parsedOffset < 0) {
    throw new LinkyError("`offset` must be a non-negative integer.", {
      code: "BAD_REQUEST",
      statusCode: 400,
    });
  }

  return { limit: parsedLimit, offset: parsedOffset };
}

// ---------------------------------------------------------------------------
// GET /api/me/links
//
// Lists the Linky launch bundles owned by the active subject:
//   - org context → org-owned bundles
//   - user context → user-owned bundles
//
// Paginated with `limit` (default 20, max 100) and `offset`.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const subject = await requireAuthSubject();
    const { limit, offset } = parsePaginationParams(request);

    const records =
      subject.type === "org"
        ? await listLinkiesForSubject({
            type: "org",
            orgId: subject.orgId,
            limit,
            offset,
          })
        : await listLinkiesForSubject({
            type: "user",
            userId: subject.userId,
            limit,
            offset,
          });

    return Response.json({
      linkies: records.map(toRecordDto),
      pagination: {
        limit,
        offset,
        // Note: we intentionally do not return a total count — it would
        // require a second query on every list call. Clients can detect the
        // end of the list by receiving fewer than `limit` rows.
      },
      subject,
    });
  } catch (error) {
    if (isKnownError(error)) {
      return toErrorResponse(error);
    }
    return toErrorResponse(
      new LinkyError("Unexpected server error while listing your Linky bundles.", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
      }),
    );
  }
}
