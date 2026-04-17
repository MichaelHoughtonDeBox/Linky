import Link from "next/link";

import { CommandBlock } from "@/components/site/command-block";
import { MAX_URLS_PER_LINKY } from "@/lib/linky/urls";

const BASE_URL =
  process.env.NEXT_PUBLIC_LINKY_BASE_URL ??
  process.env.LINKY_BASE_URL ??
  "https://getalinky.com";

const BASIC_CURL = [
  `curl -X POST "${BASE_URL}/api/links" \\`,
  '  -H "content-type: application/json" \\',
  "  --data-binary '{",
  '    "urls": [',
  '      "https://example.com",',
  '      "https://example.org"',
  "    ],",
  '    "source": "agent",',
  '    "title": "Release review bundle"',
  "  }'",
].join("\n");

const POLICY_CURL = [
  `curl -X POST "${BASE_URL}/api/links" \\`,
  '  -H "content-type: application/json" \\',
  '  -H "Linky-Client: cursor/skill-v1" \\',
  "  --data-binary '{",
  '    "urls": ["https://acme.com/docs", "https://acme.com/status"],',
  '    "source": "agent",',
  '    "title": "Acme standup",',
  '    "email": "alice@acme.com",',
  '    "resolutionPolicy": {',
  '      "version": 1,',
  '      "rules": [',
  "        {",
  '          "name": "Engineering team",',
  '          "when": {',
  '            "op": "endsWith",',
  '            "field": "emailDomain",',
  '            "value": "acme.com"',
  "          },",
  '          "tabs": [',
  '            { "url": "https://linear.app/acme/my-issues" }',
  "          ]",
  "        }",
  "      ]",
  "    }",
  "  }'",
].join("\n");

const ANON_RESPONSE = `{
  "slug": "x8q2m4k",
  "url": "${BASE_URL}/l/x8q2m4k",
  "claimUrl": "${BASE_URL}/claim/B6p…",
  "claimToken": "B6p…",
  "claimExpiresAt": "2026-05-16T12:00:00.000Z",
  "warning": "Save claimToken and claimUrl now — they are returned only once and cannot be recovered."
}`;

const SIGNED_RESPONSE = `{
  "slug": "x8q2m4k",
  "url": "${BASE_URL}/l/x8q2m4k"
}`;

export default function DocsCreatePage() {
  return (
    <>
      <p className="terminal-label">Launch bundles — create</p>
      <h1 className="display-title text-4xl leading-[0.95] font-semibold text-foreground sm:text-5xl">
        Create a Linky
      </h1>
      <p className="docs-lede">
        <code>POST /api/links</code> is public. Anonymous callers get a claim
        token back; signed-in callers get a Linky attributed to their active
        Clerk org (or user, when no org is active).
      </p>

      <section className="docs-section">
        <p className="terminal-label">Basic create</p>
        <CommandBlock
          title="POST /api/links"
          command={BASIC_CURL}
          note="source is free-form; `web`, `cli`, `sdk`, `agent`, `unknown` are the conventional values."
        />
      </section>

      <section className="docs-section">
        <p className="terminal-label">Request body</p>
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>urls</code>
                </td>
                <td>string[]</td>
                <td>
                  Required. 1&ndash;{MAX_URLS_PER_LINKY} http/https URLs,
                  length ≤ 2048 each.
                </td>
              </tr>
              <tr>
                <td>
                  <code>source</code>
                </td>
                <td>string</td>
                <td>
                  Optional. Free-form caller label used for ops.
                </td>
              </tr>
              <tr>
                <td>
                  <code>title</code>, <code>description</code>
                </td>
                <td>string</td>
                <td>Optional labels stored with the Linky.</td>
              </tr>
              <tr>
                <td>
                  <code>urlMetadata</code>
                </td>
                <td>
                  {"{ note?, tags?, openPolicy? }[]"}
                </td>
                <td>
                  Optional per-URL metadata aligned with <code>urls</code>.
                </td>
              </tr>
              <tr>
                <td>
                  <code>email</code>
                </td>
                <td>string</td>
                <td>
                  Optional. Anonymous only. Flags the claim token for the
                  named recipient.
                </td>
              </tr>
              <tr>
                <td>
                  <code>resolutionPolicy</code>
                </td>
                <td>ResolutionPolicy</td>
                <td>
                  Optional. Lock the Linky down from the first click. See{" "}
                  <Link href="/docs/personalize">Personalize</Link>.
                </td>
              </tr>
              <tr>
                <td>
                  <code>metadata</code>
                </td>
                <td>Record&lt;string, unknown&gt;</td>
                <td>
                  Optional free-form caller metadata. The{" "}
                  <code>_linky.*</code> namespace is reserved for
                  server-injected fields and is stripped from callers.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Optional header: <code>Linky-Client: &lt;tool&gt;/&lt;version&gt;</code>
          {" "}(e.g. <code>cursor/skill-v1</code>). Malformed values are
          silently dropped.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Create with a policy (Sprint 2.5)</p>
        <p>
          Agents that want a Linky personalized from click one should attach
          the policy in the same request. The Linky is born personalized — no
          window where an unrestricted version is live.
        </p>
        <CommandBlock
          title="POST /api/links with resolutionPolicy"
          command={POLICY_CURL}
          note="Anonymous creates with a policy are immutable until claimed — pass `email` so the claim URL reaches the eventual human owner."
        />
      </section>

      <section className="docs-section">
        <p className="terminal-label">Response — anonymous</p>
        <pre className="docs-json">
          <code>{ANON_RESPONSE}</code>
        </pre>
        <p>
          The <code>claimToken</code> is the raw secret. <code>claimUrl</code>{" "}
          wraps it for convenience. Returned once, cannot be recovered.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Response — signed-in</p>
        <pre className="docs-json">
          <code>{SIGNED_RESPONSE}</code>
        </pre>
        <p>
          Signed-in creates omit every <code>claim*</code> field and the{" "}
          <code>warning</code>. Ownership is already resolved (org context
          wins, otherwise user).
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
                <th>Cause</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>400</td>
                <td>
                  <code>INVALID_URLS</code>
                </td>
                <td>Empty list, unsupported protocol, URL too long, &gt; 25 URLs.</td>
              </tr>
              <tr>
                <td>400</td>
                <td>
                  <code>BAD_REQUEST</code>
                </td>
                <td>Malformed JSON, bad policy shape, email invalid.</td>
              </tr>
              <tr>
                <td>400</td>
                <td>
                  <code>INVALID_JSON</code>
                </td>
                <td>Request body was not parsable JSON.</td>
              </tr>
              <tr>
                <td>429</td>
                <td>
                  <code>RATE_LIMITED</code>
                </td>
                <td>
                  Anonymous IP exceeded the create window. Defaults: 30 per
                  60s per IP.
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
        <Link href="/docs/personalize">Personalize</Link>
        <Link href="/docs/launcher">Launcher</Link>
      </nav>
    </>
  );
}
