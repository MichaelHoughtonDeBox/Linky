export type LinkyErrorCode =
  | "BAD_REQUEST"
  | "INVALID_JSON"
  | "INVALID_URLS"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

type LinkyErrorOptions = {
  code?: LinkyErrorCode;
  statusCode?: number;
  details?: Record<string, unknown>;
};

export class LinkyError extends Error {
  code: LinkyErrorCode;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(message: string, options: LinkyErrorOptions = {}) {
    super(message);
    this.name = "LinkyError";
    this.code = options.code ?? "BAD_REQUEST";
    this.statusCode = options.statusCode ?? 400;
    this.details = options.details;
  }
}

export function isLinkyError(error: unknown): error is LinkyError {
  return error instanceof LinkyError;
}

// ---------------------------------------------------------------------------
// RateLimitError — Sprint 2.8 Chunk D.
//
// Thrown by `authenticateApiKey` when the per-key hourly bucket is spent.
// Carries a `retryAfterSeconds` so HTTP routes can set the `Retry-After`
// response header and the MCP error mapper can include the same number
// in the JSON-RPC error envelope (code -32004).
//
// A separate class (not just a LinkyError with code: "RATE_LIMITED")
// because callers need the `retryAfterSeconds` field on the error
// object itself — a structural `LinkyError.details` field would require
// every consumer to switch on a string code instead of a type narrow.
// ---------------------------------------------------------------------------

export class RateLimitError extends Error {
  readonly code = "RATE_LIMITED";
  readonly statusCode = 429;
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message?: string) {
    super(
      message ??
        `Rate limit exceeded. Retry in ${Math.max(1, retryAfterSeconds)}s.`,
    );
    this.name = "RateLimitError";
    this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
  }
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}
