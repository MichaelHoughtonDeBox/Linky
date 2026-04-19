import type { NextRequest } from "next/server";

import { LinkyError } from "@/lib/linky/errors";
import { requireAuthSubject } from "@/lib/server/auth";
import { isKnownServerError, toErrorResponse } from "@/lib/server/http-errors";
import { getLinkyVersions } from "@/lib/server/services/linkies-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const { slug } = await context.params;
    const subject = await requireAuthSubject(request);

    const dto = await getLinkyVersions({ slug }, subject);
    return Response.json(dto);
  } catch (error) {
    if (isKnownServerError(error)) return toErrorResponse(error);
    return toErrorResponse(
      new LinkyError("Unexpected server error while listing versions.", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
      }),
    );
  }
}
