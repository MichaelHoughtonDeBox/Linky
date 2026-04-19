import type { NextRequest } from "next/server";

import { LinkyError, isLinkyError } from "@/lib/linky/errors";
import { parsePatchLinkyPayload } from "@/lib/linky/schemas";
import type { LinkyRecord } from "@/lib/linky/types";
import {
  AuthRequiredError,
  ForbiddenError,
  requireAuthSubject,
  requireCanAdminLinky,
  requireCanEditLinky,
  roleOfSubject,
} from "@/lib/server/auth";
import {
  getLinkyRecordBySlug,
  patchLinkyRecord,
  softDeleteLinkyRecord,
} from "@/lib/server/linkies-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Next.js 16: dynamic `params` is a Promise and must be awaited.
// See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
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
  const statusCode = error.statusCode;
  const isInternal = isLinkyError(error) && error.code === "INTERNAL_ERROR";
  const publicMessage = isInternal
    ? "Linky is temporarily unavailable. Please try again shortly."
    : error.message;

  return Response.json(
    {
      error: publicMessage,
      code: error.code,
      details:
        process.env.NODE_ENV === "development" && isLinkyError(error)
          ? error.details
          : undefined,
    },
    { status: statusCode },
  );
}

function toRecordDto(record: LinkyRecord) {
  return {
    slug: record.slug,
    urls: record.urls,
    urlMetadata: record.urlMetadata,
    title: record.title,
    description: record.description,
    owner: record.owner,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    source: record.source,
    metadata: record.metadata,
    // Sprint 2: the DTO includes the full policy so the dashboard editor
    // can round-trip without a second read. Safe because PATCH is owner-only
    // (ownership is enforced by `requireCanEditLinky` above). The public
    // `/l/[slug]` launcher never ships the policy to the client — it only
    // forwards the resolved tab set.
    resolutionPolicy: record.resolutionPolicy,
  };
}

// ---------------------------------------------------------------------------
// PATCH: owner-only edit. Anonymous Linkies reject with 403.
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const { slug } = await context.params;

    const subject = await requireAuthSubject(request);

    const existing = await getLinkyRecordBySlug(slug);
    if (!existing) {
      return Response.json(
        { error: "Linky not found.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    // Owner check lives at the repository boundary so any future caller
    // (CLI, SDK, dashboard) hits the same guard. Role is derived from the
    // subject's active Clerk org role (Sprint 2.7 Chunk C); editors and
    // admins can patch, viewers cannot.
    requireCanEditLinky(
      subject,
      {
        ownerUserId:
          existing.owner.type === "user" ? existing.owner.userId : null,
        ownerOrgId:
          existing.owner.type === "org" ? existing.owner.orgId : null,
      },
      roleOfSubject(subject),
    );

    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch {
      throw new LinkyError("Request body must be valid JSON.", {
        code: "INVALID_JSON",
        statusCode: 400,
      });
    }

    const patch = parsePatchLinkyPayload(rawPayload);

    const updated = await patchLinkyRecord({
      slug,
      patch,
      // API-key-authenticated org subjects may not carry a human user id. We
      // preserve the append-only history row anyway and leave the editor field
      // null rather than inventing a Clerk identity.
      editedByClerkUserId: subject.type === "user" ? subject.userId : subject.userId,
    });

    if (!updated) {
      // Row disappeared between read and patch; rare but possible if a
      // parallel DELETE landed first. Return 404 to reflect reality.
      return Response.json(
        { error: "Linky not found.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return Response.json({ linky: toRecordDto(updated) });
  } catch (error) {
    if (isKnownError(error)) {
      return toErrorResponse(error);
    }
    return toErrorResponse(
      new LinkyError("Unexpected server error while updating Linky.", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE: owner-only soft delete. Public resolver responds 410 afterwards.
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const { slug } = await context.params;

    const subject = await requireAuthSubject(request);

    const existing = await getLinkyRecordBySlug(slug);
    if (!existing) {
      return Response.json(
        { error: "Linky not found.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    // Sprint 2.7 Chunk C tightening: DELETE is now admin-only on org-owned
    // Linkies. Editors cannot nuke a team bundle unilaterally — the
    // supported path is "promote the caller to org:admin in Clerk" or
    // "ask an admin." Deletes are soft and show up in version history,
    // so the tightening does not block real recovery needs.
    requireCanAdminLinky(
      subject,
      {
        ownerUserId:
          existing.owner.type === "user" ? existing.owner.userId : null,
        ownerOrgId:
          existing.owner.type === "org" ? existing.owner.orgId : null,
      },
      roleOfSubject(subject),
    );

    await softDeleteLinkyRecord(slug);
    return Response.json({ ok: true });
  } catch (error) {
    if (isKnownError(error)) {
      return toErrorResponse(error);
    }
    return toErrorResponse(
      new LinkyError("Unexpected server error while deleting Linky.", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
      }),
    );
  }
}
