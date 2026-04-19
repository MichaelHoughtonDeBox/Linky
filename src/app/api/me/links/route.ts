import type { NextRequest } from "next/server";

import { LinkyError } from "@/lib/linky/errors";
import { requireAuthSubject } from "@/lib/server/auth";
import { isKnownServerError, toErrorResponse } from "@/lib/server/http-errors";
import {
  listLinkies,
  parseListPagination,
} from "@/lib/server/services/linkies-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const subject = await requireAuthSubject(request);
    const pagination = parseListPagination({
      limit: request.nextUrl.searchParams.get("limit"),
      offset: request.nextUrl.searchParams.get("offset"),
    });

    const dto = await listLinkies(pagination, subject);
    return Response.json(dto);
  } catch (error) {
    if (isKnownServerError(error)) return toErrorResponse(error);
    return toErrorResponse(
      new LinkyError(
        "Unexpected server error while listing your Linky bundles.",
        { code: "INTERNAL_ERROR", statusCode: 500 },
      ),
    );
  }
}
