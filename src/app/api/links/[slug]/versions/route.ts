import type { NextRequest } from "next/server";

import { LinkyError, isLinkyError } from "@/lib/linky/errors";
import type { LinkyVersionRecord } from "@/lib/linky/types";
import {
  AuthRequiredError,
  ForbiddenError,
  requireAuthSubject,
  requireCanEditLinky,
} from "@/lib/server/auth";
import {
  getLinkyRecordBySlug,
  listLinkyVersions,
} from "@/lib/server/linkies-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Next.js 16: dynamic `params` is a Promise.
type RouteContext = {
  params: Promise<{ slug: string }>;
};

type KnownError = LinkyError | AuthRequiredError | ForbiddenError;

function isKnownError(error: unknown): error is KnownError {
  return (
    isLinkyError(error) ||
    error instanceof AuthRequiredError ||
    error instanceof ForbiddenError
  );
}

function toErrorResponse(error: KnownError): Response {
  const publicMessage =
    isLinkyError(error) && error.code === "INTERNAL_ERROR"
      ? "Linky is temporarily unavailable. Please try again shortly."
      : error.message;

  return Response.json(
    { error: publicMessage, code: error.code },
    { status: error.statusCode },
  );
}

function toVersionDto(version: LinkyVersionRecord) {
  return {
    versionNumber: version.versionNumber,
    urls: version.urls,
    urlMetadata: version.urlMetadata,
    title: version.title,
    description: version.description,
    editedByClerkUserId: version.editedByClerkUserId,
    editedAt: version.editedAt,
  };
}

// ---------------------------------------------------------------------------
// GET /api/links/:slug/versions
//
// Append-only edit history. Viewable only by users who can edit the Linky
// (owner, or org member for org-owned Linkies). Anonymous Linkies have no
// versions — the endpoint 403s before attempting a DB read.
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const { slug } = await context.params;
    const subject = await requireAuthSubject();

    const existing = await getLinkyRecordBySlug(slug);
    if (!existing) {
      return Response.json(
        { error: "Linky not found.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    requireCanEditLinky(subject, {
      ownerUserId:
        existing.owner.type === "user" ? existing.owner.userId : null,
      ownerOrgId:
        existing.owner.type === "org" ? existing.owner.orgId : null,
    });

    const versions = await listLinkyVersions(slug);

    return Response.json({ versions: versions.map(toVersionDto) });
  } catch (error) {
    if (isKnownError(error)) {
      return toErrorResponse(error);
    }
    return toErrorResponse(
      new LinkyError("Unexpected server error while listing versions.", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
      }),
    );
  }
}
