import type { NextRequest } from "next/server";

import { LinkyError } from "@/lib/linky/errors";
import { parsePatchLinkyPayload } from "@/lib/linky/schemas";
import { requireAuthSubject } from "@/lib/server/auth";
import { isKnownServerError, toErrorResponse } from "@/lib/server/http-errors";
import {
  deleteLinky,
  updateLinky,
} from "@/lib/server/services/linkies-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Next.js 16: dynamic `params` is a Promise and must be awaited.
// See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const { slug } = await context.params;
    const subject = await requireAuthSubject(request);

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
    const dto = await updateLinky({ ...patch, slug }, subject);

    return Response.json({ linky: dto });
  } catch (error) {
    if (isKnownServerError(error)) return toErrorResponse(error);
    return toErrorResponse(
      new LinkyError("Unexpected server error while updating Linky.", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
      }),
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const { slug } = await context.params;
    const subject = await requireAuthSubject(request);

    await deleteLinky({ slug }, subject);

    return Response.json({ ok: true });
  } catch (error) {
    if (isKnownServerError(error)) return toErrorResponse(error);
    return toErrorResponse(
      new LinkyError("Unexpected server error while deleting Linky.", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
      }),
    );
  }
}
