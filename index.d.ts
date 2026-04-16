export type UrlMetadata = {
  note?: string;
  tags?: string[];
  openPolicy?: "always" | "desktop" | "mobile";
};

export type CreateLinkyOptions = {
  urls: string[];
  baseUrl?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  // When provided, the API mints a claim token flagged with this email so
  // the named recipient can later take ownership by signing in through the
  // returned `claimUrl`. Applies only to anonymous (unauthenticated) calls.
  email?: string;
  title?: string;
  description?: string;
  urlMetadata?: UrlMetadata[];
  fetchImpl?: typeof fetch;
};

export type CreateLinkyResult = {
  slug: string;
  url: string;
  // Only returned when the Linky was created anonymously. Visiting this URL
  // prompts the visitor to sign in (or sign up) and then transfers
  // ownership to their Clerk user / active organization.
  claimUrl?: string;
  claimExpiresAt?: string;
};

export const DEFAULT_BASE_URL: string;

export function createLinky(
  options: CreateLinkyOptions,
): Promise<CreateLinkyResult>;
