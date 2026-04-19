import "server-only";

import {
  LinkyError,
  RateLimitError,
  isLinkyError,
  isRateLimitError,
} from "@/lib/linky/errors";
import { AuthRequiredError, ForbiddenError } from "./auth";

// ============================================================================
// Shared HTTP error envelope — extracted in Sprint 2.8 Chunk D so the
// 429/RateLimitError path only lives in one place. Every /api/* route
// used to inline its own `isKnownError` + `toErrorResponse`, which made
// it easy for a new error type (RateLimitError here) to be handled
// correctly in some routes and silently fall through to a generic 500
// in others. Centralizing pays off the moment there are 2+ routes.
//
// Shape contract: { error, code, details?, retryAfterSeconds? }.
// Details only render in development so the production envelope never
// leaks internal shape.
// ============================================================================

export type KnownServerError =
  | LinkyError
  | AuthRequiredError
  | ForbiddenError
  | RateLimitError;

export function isKnownServerError(
  error: unknown,
): error is KnownServerError {
  return (
    isLinkyError(error) ||
    error instanceof AuthRequiredError ||
    error instanceof ForbiddenError ||
    isRateLimitError(error)
  );
}

export function toErrorResponse(error: KnownServerError): Response {
  if (isRateLimitError(error)) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
      },
      {
        status: error.statusCode,
        headers: { "Retry-After": String(error.retryAfterSeconds) },
      },
    );
  }

  const isInternal = isLinkyError(error) && error.code === "INTERNAL_ERROR";
  const publicMessage = isInternal
    ? "Linky is temporarily unavailable. Please try again shortly."
    : error.message;

  const details =
    isLinkyError(error) && process.env.NODE_ENV === "development"
      ? error.details
      : undefined;

  return Response.json(
    { error: publicMessage, code: error.code, details },
    { status: error.statusCode },
  );
}
