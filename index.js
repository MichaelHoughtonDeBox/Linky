const DEFAULT_BASE_URL =
  process.env.LINKY_BASE_URL ||
  process.env.LINKIE_URL ||
  "https://getalinky.com";

function buildHeaders(client, apiKey) {
  const headers = {
    "content-type": "application/json",
  };

  if (typeof client === "string" && client.trim().length > 0) {
    headers["Linky-Client"] = client.trim();
  }

  if (typeof apiKey === "string" && apiKey.trim().length > 0) {
    headers.authorization = `Bearer ${apiKey.trim()}`;
  }

  return headers;
}

async function parseJsonResponse(response) {
  return response.json().catch(() => {
    return {};
  });
}

function assertPatchPayload({
  urls,
  title,
  description,
  urlMetadata,
  resolutionPolicy,
}) {
  const hasUpdate =
    urls !== undefined ||
    title !== undefined ||
    description !== undefined ||
    urlMetadata !== undefined ||
    resolutionPolicy !== undefined;

  if (!hasUpdate) {
    throw new Error(
      "Provide at least one update field: urls, title, description, urlMetadata, or resolutionPolicy.",
    );
  }

  if (urls !== undefined) {
    assertUrlArray(urls);
  }
}

function assertUrlArray(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error("`urls` must be a non-empty array of URL strings.");
  }

  urls.forEach((url, index) => {
    if (typeof url !== "string" || url.trim().length === 0) {
      throw new Error(`Invalid URL at index ${index}.`);
    }
  });
}

async function createLinky({
  urls,
  baseUrl = DEFAULT_BASE_URL,
  source = "sdk",
  metadata,
  email,
  title,
  description,
  urlMetadata,
  // Optional client attribution. Sent as a `Linky-Client` header so the
  // server can attribute API calls to a specific integration for ops
  // debugging. Format convention: `<tool>/<version>` (e.g. "cursor/skill-v1").
  // Malformed values are silently dropped server-side — they never break
  // the create call.
  client,
  // Sprint 2.5: optional resolution policy attached at create time. The
  // server re-validates via parseResolutionPolicy — malformed policies
  // reject with a 400. Pass-through; no client-side shape coercion.
  resolutionPolicy,
  fetchImpl = fetch,
}) {
  assertUrlArray(urls);

  const endpoint = new URL("/api/links", baseUrl).toString();
  const headers = buildHeaders(client);

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers,
    // This payload shape matches the server route contract.
    body: JSON.stringify({
      urls,
      source,
      metadata,
      email,
      title,
      description,
      urlMetadata,
      resolutionPolicy,
    }),
  });

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : `Linky request failed with status ${response.status}.`;
    throw new Error(message);
  }

  if (typeof data.slug !== "string" || typeof data.url !== "string") {
    throw new Error("Linky API returned an invalid response payload.");
  }

  // claim* fields are only returned for anonymous creates. claimToken is
  // the raw secret; claimUrl is a convenience URL that wraps it. The
  // `warning` string is a verbatim message the caller can surface to the
  // end user to explain one-time-only semantics.
  return {
    slug: data.slug,
    url: data.url,
    claimUrl: typeof data.claimUrl === "string" ? data.claimUrl : undefined,
    claimToken:
      typeof data.claimToken === "string" ? data.claimToken : undefined,
    claimExpiresAt:
      typeof data.claimExpiresAt === "string" ? data.claimExpiresAt : undefined,
    warning: typeof data.warning === "string" ? data.warning : undefined,
    // Server echoes the parsed policy (with minted rule ids) iff one was
    // attached. Caller can persist it to reason about rule ids later.
    resolutionPolicy:
      data.resolutionPolicy && typeof data.resolutionPolicy === "object"
        ? data.resolutionPolicy
        : undefined,
  };
}

async function updateLinky({
  slug,
  baseUrl = DEFAULT_BASE_URL,
  title,
  description,
  urls,
  urlMetadata,
  resolutionPolicy,
  client,
  apiKey,
  fetchImpl = fetch,
}) {
  if (typeof slug !== "string" || slug.trim().length === 0) {
    throw new Error("`slug` must be a non-empty string.");
  }

  assertPatchPayload({
    urls,
    title,
    description,
    urlMetadata,
    resolutionPolicy,
  });

  const endpoint = new URL(`/api/links/${slug}`, baseUrl).toString();
  const headers = buildHeaders(client, apiKey);

  const response = await fetchImpl(endpoint, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      title,
      description,
      urls,
      urlMetadata,
      resolutionPolicy,
    }),
  });

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : `Linky request failed with status ${response.status}.`;
    throw new Error(message);
  }

  const linky = data.linky;
  if (!linky || typeof linky !== "object" || typeof linky.slug !== "string") {
    throw new Error("Linky API returned an invalid response payload.");
  }

  return {
    linky: {
      slug: linky.slug,
      urls: Array.isArray(linky.urls) ? linky.urls : [],
      urlMetadata: Array.isArray(linky.urlMetadata) ? linky.urlMetadata : [],
      title:
        typeof linky.title === "string" || linky.title === null
          ? linky.title
          : null,
      description:
        typeof linky.description === "string" || linky.description === null
          ? linky.description
          : null,
      createdAt:
        typeof linky.createdAt === "string" ? linky.createdAt : "",
      updatedAt:
        typeof linky.updatedAt === "string" ? linky.updatedAt : "",
      source: typeof linky.source === "string" ? linky.source : "unknown",
      resolutionPolicy:
        linky.resolutionPolicy && typeof linky.resolutionPolicy === "object"
          ? linky.resolutionPolicy
          : undefined,
    },
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  createLinky,
  updateLinky,
};
