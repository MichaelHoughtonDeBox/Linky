---
name: linky
description: Create Linky short launch URLs through the Linky API with curl or through the Linky CLI. Use when bundling multiple URLs into one short link, testing `POST /api/links`, or generating launch links for scripts and agents.
---

# Linky

## What this skill does

Use this skill when you need to create a Linky from a list of URLs.

Supported creation paths in this repo:
- `curl` against `POST /api/links`
- the local CLI at `node cli/index.js`

## Inputs to gather

Before creating a Linky, gather:
- the Linky base URL, for example `https://getalinky.com` in production or `http://localhost:4040` in local development
- one or more absolute URLs to bundle
- optional `metadata` as a JSON object
- optional `source`

Valid `source` values:
- `web`
- `cli`
- `sdk`
- `agent`
- `unknown`

Use `agent` by default when the request is coming from an agent workflow.

Production default:
- Use `https://getalinky.com` unless the user explicitly wants a local or alternate deployment.

## API contract

Endpoint:
- `POST /api/links`

JSON body shape:
- `urls`: required non-empty array of URL strings
- `source`: optional string, normalized to one of the allowed values
- `metadata`: optional JSON object
- `title`, `description`: optional strings (length capped server-side)
- `urlMetadata`: optional positional array aligned with `urls`
- `email`: optional; on anonymous creates, flags the returned claim token for this address
- `resolutionPolicy`: optional identity-aware resolution policy — see "Personalize at create time" below

Success response:
- `201`
- JSON object with `slug` and `url`
- On anonymous creates: also `claimUrl`, `claimToken`, `claimExpiresAt`, `warning`
- When `resolutionPolicy` was attached: echoed back with server-minted rule ids

Common failure modes:
- `400` for invalid JSON or invalid payload (including malformed `resolutionPolicy`)
- `429` for rate limiting
- `500` for server or database issues

Important constraints:
- Do not send `alias`. Custom aliases are currently rejected.
- `metadata` must be a JSON object when provided.
- `resolutionPolicy` goes through the same server-side validator used by `PATCH /api/links/:slug`. A malformed policy fails the entire create with `400` — no partial write.

## Preferred workflow

1. If you are already operating inside this repository and want the most direct local path, use the CLI.
2. If you need a raw HTTP example, want to test the API contract directly, or are operating outside the Node runtime, use `curl`.
3. If the caller wants machine-readable output, prefer the CLI with `--json` or parse the JSON response from `curl`.

## CLI usage

Run the local CLI from the repository root:

```bash
# Create a Linky locally through the repo's CLI entrypoint.
node cli/index.js create \
  "https://example.com" \
  "https://example.org" \
  --base-url "http://localhost:4040"
```

JSON output mode:

```bash
# Return machine-readable JSON so another tool can parse the result.
node cli/index.js create \
  "https://example.com" \
  "https://example.org" \
  --base-url "http://localhost:4040" \
  --json
```

Read some URLs from stdin:

```bash
# Combine positional URLs with newline-delimited URLs from stdin.
printf '%s\n' "https://example.net" "https://example.dev" | \
  node cli/index.js create \
    "https://example.com" \
    --stdin \
    --base-url "http://localhost:4040" \
    --json
```

Notes:
- The CLI defaults `source` to `cli`.
- The CLI uses `LINKY_BASE_URL` or `LINKIE_URL` when `--base-url` is not provided.

## curl usage

Minimal request:

```bash
# Create a Linky directly via the production public HTTP API.
curl -X POST "https://getalinky.com/api/links" \
  -H "content-type: application/json" \
  --data-binary '{
    "urls": [
      "https://example.com",
      "https://example.org"
    ],
    "source": "agent"
  }'
```

Request with metadata:

```bash
# Attach structured metadata so downstream systems can understand why this Linky was created.
curl -X POST "https://getalinky.com/api/links" \
  -H "content-type: application/json" \
  --data-binary '{
    "urls": [
      "https://example.com",
      "https://example.org"
    ],
    "source": "agent",
    "metadata": {
      "task": "share-release-links",
      "requestedBy": "agent"
    }
  }'
```

Capture just the created URL in a shell pipeline:

```bash
# Parse the JSON response and print only the final short Linky URL.
curl -sS -X POST "https://getalinky.com/api/links" \
  -H "content-type: application/json" \
  --data-binary '{
    "urls": [
      "https://example.com",
      "https://example.org"
    ],
    "source": "agent"
  }' | node -e 'process.stdin.once("data", (buf) => console.log(JSON.parse(buf).url))'
```

## Personalize at create time (Sprint 2.5)

When you want the Linky to serve different tabs to different viewers from
the very first click, attach a `resolutionPolicy`. Signed-in viewers see
tabs that match the rules; anonymous or unmatched viewers see the public
`urls` as the fallback.

### When to attach a policy

- You are emitting a Linky that must not be fully public (e.g. customer-specific dashboards, internal agent runbooks).
- You want a shared bundle to personalize per teammate without minting one URL per person.
- The recipient will be signed in to Linky (or can be nudged to sign in — the launcher page already does this).

When **not** to attach a policy:

- Every viewer should see the same tabs. The public fallback is simpler.
- The Linky will be claimed by a human who prefers to author their own rules in the dashboard.

### Caveat — anonymous Linkies are immutable

If you create a Linky anonymously (no Clerk session) with a policy, the
policy is locked along with the Linky. Anonymous Linkies cannot be edited;
this preserves the Sprint 1 trust model. The recipient must claim the
Linky (via the returned `claimUrl`) to become the owner; only then can
they edit the policy.

Agents that need ongoing policy editing should either:
1. Create under an authenticated Clerk session, or
2. Pass `email` alongside `resolutionPolicy` so the claim URL lands with the eventual human owner.

### Minimum-viable policy shape

```json
{
  "version": 1,
  "rules": [
    {
      "name": "Engineering team",
      "when": { "op": "endsWith", "field": "emailDomain", "value": "acme.com" },
      "tabs": [{ "url": "https://linear.app/acme/my-issues" }]
    }
  ]
}
```

Operators: `always`, `anonymous`, `signedIn`, `equals`, `in`, `endsWith`, `exists`, `and`, `or`, `not`. Viewer fields: `email`, `emailDomain`, `userId`, `githubLogin`, `googleEmail` (singular) and `orgIds`, `orgSlugs` (set-valued, used with `in`). Full reference lives in the main README's "Identity-aware resolution" section.

### curl — create + attach in one shot

```bash
# Write the policy to a file first so the JSON heredoc below stays readable.
cat > /tmp/acme-team.policy.json <<'JSON'
{
  "version": 1,
  "rules": [
    {
      "name": "Engineering team",
      "when": { "op": "endsWith", "field": "emailDomain", "value": "acme.com" },
      "tabs": [
        { "url": "https://linear.app/acme/my-issues", "note": "Your queue" }
      ]
    }
  ]
}
JSON

# POST the policy alongside the URLs. The server validates, mints rule ids,
# and echoes the parsed policy back so you can log the canonical form.
curl -sS -X POST "https://getalinky.com/api/links" \
  -H "content-type: application/json" \
  --data-binary @- <<JSON
{
  "urls": ["https://acme.com/docs", "https://acme.com/status"],
  "source": "agent",
  "title": "Acme standup",
  "resolutionPolicy": $(cat /tmp/acme-team.policy.json)
}
JSON
```

### CLI — create + attach in one shot

```bash
# Point the CLI at the policy file; everything else is identical to a
# normal create call.
node cli/index.js create \
  "https://acme.com/docs" \
  "https://acme.com/status" \
  --policy /tmp/acme-team.policy.json \
  --base-url "http://localhost:4040" \
  --title "Acme standup"
```

Use `--policy -` to read the policy JSON from stdin instead of a file (handy when scripting). The CLI refuses `--policy -` together with `--stdin` — only one stdin consumer.

The CLI prints a `Personalized: N rules attached` line in TTY mode; `--json` includes the full `resolutionPolicy` object on the result.

### Validation errors

Malformed policies surface a clear `400` response:

- `Operator equals cannot be used with set-valued field orgSlugs. Use in with a single-element value array instead.`
- `Condition at resolutionPolicy.rules[0].when nests deeper than 4 levels.`
- `resolutionPolicy.rules may contain at most 50 rules.`
- `URL at index 0 must use http:// or https:// protocol.` (applies to every rule's tab URLs, not just the public list)

Read them back verbatim — the server's error message is the single source of truth for the DSL.

## Decision guide

Use CLI when:
- you are in this repo
- you want the shortest local command
- you want `--json` output without hand-rolling parsing

Use `curl` when:
- you want to test the HTTP contract directly
- you are documenting or debugging the API
- you are integrating from a non-Node environment

## Verification

After creation, verify:
- the response includes a non-empty `slug`
- the response includes a full `url`
- opening the returned `url` loads the launcher page for the bundle
