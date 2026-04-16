const DEFAULT_BASE_URL =
  process.env.LINKY_BASE_URL ||
  process.env.LINKIE_URL ||
  "https://getalinky.com";

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
  fetchImpl = fetch,
}) {
  assertUrlArray(urls);

  const endpoint = new URL("/api/links", baseUrl).toString();
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    // This payload shape matches the server route contract.
    body: JSON.stringify({
      urls,
      source,
      metadata,
      email,
      title,
      description,
      urlMetadata,
    }),
  });

  const data = await response.json().catch(() => {
    return {};
  });

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

  // `claimUrl` + `claimExpiresAt` are only returned for anonymous creates.
  // Callers that are signed-in (via a reverse-proxied session cookie) will
  // not receive them and should ignore the absence.
  return {
    slug: data.slug,
    url: data.url,
    claimUrl: typeof data.claimUrl === "string" ? data.claimUrl : undefined,
    claimExpiresAt:
      typeof data.claimExpiresAt === "string" ? data.claimExpiresAt : undefined,
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  createLinky,
};
