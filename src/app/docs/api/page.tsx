import Link from "next/link";

const POST_LINKS_REQ = `POST /api/links
content-type: application/json
Linky-Client: cursor/skill-v1        # optional

{
  "urls": ["https://example.com", "https://example.org"],
  "source": "agent",
  "title": "Release review bundle",
  "description": "Open everything needed for the 2026.04 standup.",
  "urlMetadata": [
    { "note": "PR under review", "tags": ["eng"] },
    { "note": "Preview deploy", "openPolicy": "desktop" }
  ],
  "email": "alice@example.com",
  "resolutionPolicy": {
    "version": 1,
    "rules": [
      {
        "name": "Engineering team",
        "when": { "op": "endsWith", "field": "emailDomain", "value": "acme.com" },
        "tabs": [{ "url": "https://linear.app/acme/my-issues" }]
      }
    ]
  }
}`;

const POST_LINKS_RES = `{
  "slug": "x8q2m4k",
  "url": "https://getalinky.com/l/x8q2m4k",
  "claimUrl": "https://getalinky.com/claim/B6p…",
  "claimToken": "B6p…",
  "claimExpiresAt": "2026-05-16T12:00:00.000Z",
  "warning": "Save claimToken and claimUrl now — they are returned only once and cannot be recovered."
}`;

const PATCH_LINKS_REQ = `PATCH /api/links/:slug
content-type: application/json
# owner-only — Clerk session required

{
  "title": "Release review (v2)",
  "description": null,
  "urls": ["https://example.com"],
  "urlMetadata": [{ "note": "rebuilt" }],
  "resolutionPolicy": {
    "version": 1,
    "rules": [
      {
        "name": "Engineering team",
        "showBadge": true,
        "when": {
          "op": "and",
          "of": [
            { "op": "signedIn" },
            { "op": "endsWith", "field": "emailDomain", "value": "acme.com" }
          ]
        },
        "tabs": [
          { "url": "https://linear.app/acme/my-issues", "note": "Your queue" },
          { "url": "https://github.com/acme/app/pulls?q=author:@me" }
        ]
      }
    ]
  }
}`;

const ME_LINKS_RES = `{
  "items": [
    {
      "slug": "x8q2m4k",
      "title": "Release review bundle",
      "description": null,
      "urls": ["https://example.com", "https://example.org"],
      "urlMetadata": [{}, {}],
      "owner": { "type": "user", "userId": "user_…" },
      "createdAt": "2026-04-16T12:00:00.000Z",
      "updatedAt": "2026-04-16T12:00:00.000Z",
      "source": "agent"
    }
  ],
  "nextOffset": 20
}`;

const VERSIONS_RES = `{
  "items": [
    {
      "versionId": "ver_…",
      "createdAt": "2026-04-16T12:00:00.000Z",
      "title": "Release review bundle",
      "description": null,
      "urls": ["https://example.com"],
      "urlMetadata": [{}],
      "resolutionPolicy": { "version": 1, "rules": [] }
    }
  ]
}`;

export default function DocsApiPage() {
  return (
    <>
      <p className="terminal-label">Reference — API</p>
      <h1 className="display-title text-4xl leading-[0.95] font-semibold text-foreground sm:text-5xl">
        API reference
      </h1>
      <p className="docs-lede">
        Every public Linky route lives under <code>/api</code>. All mutating
        routes return <code>Content-Type: application/json</code>; error
        bodies share a common <code>{"{ error, code }"}</code> shape.
      </p>

      <section className="docs-section">
        <p className="terminal-label">POST /api/links (public)</p>
        <p>
          Create a new Linky. Anonymous callers get a claim token; signed-in
          callers get a Linky attributed to their active Clerk org (or user,
          when no org is active).
        </p>
        <pre className="docs-json">
          <code>{POST_LINKS_REQ}</code>
        </pre>
        <pre className="docs-json">
          <code>{POST_LINKS_RES}</code>
        </pre>
        <p>
          Signed-in responses omit every <code>claim*</code> field and the{" "}
          <code>warning</code>. See <Link href="/docs/create">Create</Link>{" "}
          for the full request-body table and error codes.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">PATCH /api/links/:slug (owner-only)</p>
        <p>
          Edit a Linky. All fields optional; at least one required. Every
          edit — including policy edits — is saved as a new version, so
          previous states are always recoverable via{" "}
          <code>GET /api/links/:slug/versions</code>.
        </p>
        <pre className="docs-json">
          <code>{PATCH_LINKS_REQ}</code>
        </pre>
        <p>
          Send <code>&quot;resolutionPolicy&quot;: null</code> to clear the
          policy. Omit the field to leave it untouched. Anonymous Linkies
          (both owner columns NULL) always reject — claim first.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">DELETE /api/links/:slug (owner-only)</p>
        <p>
          Soft-deletes the Linky. The public <code>/l/:slug</code> launcher
          returns 404 afterwards; the version history stays intact so you
          can audit what the bundle pointed at.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">GET /api/me/links (signed-in)</p>
        <p>
          Paginated list of the active subject&apos;s launch bundles. Query
          params: <code>limit</code> (default 20, max 100),{" "}
          <code>offset</code> (default 0).
        </p>
        <pre className="docs-json">
          <code>{ME_LINKS_RES}</code>
        </pre>
      </section>

      <section className="docs-section">
        <p className="terminal-label">GET /api/links/:slug/versions (owner-only)</p>
        <p>
          Every edit is kept forever as a new version. This endpoint returns
          every prior snapshot for the Linky, newest first.
        </p>
        <pre className="docs-json">
          <code>{VERSIONS_RES}</code>
        </pre>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Webhooks (service-to-service)</p>
        <ul>
          <li>
            <code>POST /api/webhooks/clerk</code> — signature-verified
            (svix). Upserts users, orgs, and memberships into Neon.
          </li>
          <li>
            <code>POST /api/webhooks/stripe</code> — signature-verified.
            Wired up for billing; events are accepted and logged today.
          </li>
        </ul>
        <p>
          Both reject unsigned requests with <code>401</code>. Never call
          these from client code — they&apos;re owned by Clerk and Stripe.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Error codes</p>
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Code</th>
                <th>Typical cause</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>400</td>
                <td>
                  <code>INVALID_URLS</code>
                </td>
                <td>Bad URL shape, unsupported protocol, too many URLs.</td>
              </tr>
              <tr>
                <td>400</td>
                <td>
                  <code>BAD_REQUEST</code>
                </td>
                <td>Malformed body, bad policy, invalid pagination.</td>
              </tr>
              <tr>
                <td>400</td>
                <td>
                  <code>INVALID_JSON</code>
                </td>
                <td>Request body was not parsable JSON.</td>
              </tr>
              <tr>
                <td>401</td>
                <td>
                  <code>AUTH_REQUIRED</code>
                </td>
                <td>Route requires a Clerk session.</td>
              </tr>
              <tr>
                <td>403</td>
                <td>
                  <code>FORBIDDEN</code>
                </td>
                <td>Signed in but not the owner of the resource.</td>
              </tr>
              <tr>
                <td>404</td>
                <td>
                  <code>NOT_FOUND</code>
                </td>
                <td>Unknown slug, or Linky was soft-deleted.</td>
              </tr>
              <tr>
                <td>429</td>
                <td>
                  <code>RATE_LIMITED</code>
                </td>
                <td>
                  Anonymous create rate limit exceeded. See{" "}
                  <Link href="/docs/limits">Limits</Link>.
                </td>
              </tr>
              <tr>
                <td>500</td>
                <td>
                  <code>INTERNAL_ERROR</code>
                </td>
                <td>Server / database issue; safe to retry.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <nav className="docs-next" aria-label="Next steps">
        <span>Next:</span>
        <Link href="/docs/cli">CLI reference</Link>
        <Link href="/docs/sdk">SDK reference</Link>
      </nav>
    </>
  );
}
