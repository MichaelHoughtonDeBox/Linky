import Link from "next/link";

const SDK_TYPES = `export type CreateLinkyOptions = {
  urls: string[];
  baseUrl?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  email?: string;
  title?: string;
  description?: string;
  urlMetadata?: UrlMetadata[];
  client?: string;
  resolutionPolicy?: ResolutionPolicy;
  fetchImpl?: typeof fetch;
};

export type CreateLinkyResult = {
  slug: string;
  url: string;
  claimUrl?: string;
  claimToken?: string;
  claimExpiresAt?: string;
  warning?: string;
  resolutionPolicy?: ResolutionPolicy;
};`;

const SDK_BASIC = `const { createLinky } = require("@linky/linky");

const result = await createLinky({
  urls: ["https://example.com", "https://example.org"],
  source: "agent",
  title: "Release review",
});

console.log(result.url);
if (result.claimUrl) {
  console.warn(result.warning);
  console.log(result.claimUrl);
}`;

const SDK_POLICY = `const { createLinky } = require("@linky/linky");

await createLinky({
  urls: ["https://acme.com/docs", "https://acme.com/status"],
  source: "agent",
  title: "Acme standup",
  email: "alice@acme.com",           // lands the claim URL with a human
  resolutionPolicy: {
    version: 1,
    rules: [
      {
        name: "Engineering team",
        when: { op: "endsWith", field: "emailDomain", value: "acme.com" },
        tabs: [{ url: "https://linear.app/acme/my-issues" }],
      },
    ],
  },
});`;

export default function DocsSdkPage() {
  return (
    <>
      <p className="terminal-label">Reference — SDK</p>
      <h1 className="display-title text-4xl leading-[0.95] font-semibold text-foreground sm:text-5xl">
        SDK reference
      </h1>
      <p className="docs-lede">
        <code>@linky/linky</code> exports one function:{" "}
        <code>createLinky</code>. Same surface as the CLI, minus the TTY
        affordances.
      </p>

      <section className="docs-section">
        <p className="terminal-label">Install</p>
        <pre className="docs-json">
          <code>npm install @linky/linky</code>
        </pre>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Types</p>
        <pre className="docs-json">
          <code>{SDK_TYPES}</code>
        </pre>
        <p>
          DSL types (<code>ResolutionPolicy</code>, <code>PolicyRule</code>,{" "}
          <code>PolicyCondition</code>, <code>PolicyViewerField</code>) ship
          with the package, so your editor gets full autocomplete on policy
          objects with no extra install.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Options</p>
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Option</th>
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
                <td>Required. Same constraints as the API.</td>
              </tr>
              <tr>
                <td>
                  <code>baseUrl</code>
                </td>
                <td>string</td>
                <td>
                  Defaults to <code>$LINKY_BASE_URL</code> if set, otherwise
                  <code>https://getalinky.com</code>.
                </td>
              </tr>
              <tr>
                <td>
                  <code>source</code>
                </td>
                <td>string</td>
                <td>Free-form caller label for ops.</td>
              </tr>
              <tr>
                <td>
                  <code>title</code>, <code>description</code>
                </td>
                <td>string</td>
                <td>Optional labels.</td>
              </tr>
              <tr>
                <td>
                  <code>urlMetadata</code>
                </td>
                <td>UrlMetadata[]</td>
                <td>
                  Optional per-URL notes / tags / openPolicy aligned with{" "}
                  <code>urls</code>.
                </td>
              </tr>
              <tr>
                <td>
                  <code>email</code>
                </td>
                <td>string</td>
                <td>
                  Anonymous only. Flags the claim token for the named
                  recipient.
                </td>
              </tr>
              <tr>
                <td>
                  <code>client</code>
                </td>
                <td>string</td>
                <td>
                  <code>Linky-Client</code> header value. Convention:{" "}
                  <code>&lt;tool&gt;/&lt;version&gt;</code>.
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
                  <code>fetchImpl</code>
                </td>
                <td>typeof fetch</td>
                <td>
                  Override for tests or non-global-fetch runtimes. Defaults
                  to <code>globalThis.fetch</code>.
                </td>
              </tr>
              <tr>
                <td>
                  <code>metadata</code>
                </td>
                <td>Record&lt;string, unknown&gt;</td>
                <td>
                  Free-form caller metadata. <code>_linky.*</code> is
                  server-reserved and stripped.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Result</p>
        <p>
          <code>claimUrl</code>, <code>claimToken</code>,{" "}
          <code>claimExpiresAt</code>, and <code>warning</code> are present
          only on anonymous creates. <code>resolutionPolicy</code> is present
          when a policy was attached at create time — the server echoes the
          parsed form (with minted rule ids) so you don&apos;t need a second
          fetch.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Basic usage</p>
        <pre className="docs-json">
          <code>{SDK_BASIC}</code>
        </pre>
      </section>

      <section className="docs-section">
        <p className="terminal-label">With a policy</p>
        <pre className="docs-json">
          <code>{SDK_POLICY}</code>
        </pre>
      </section>

      <nav className="docs-next" aria-label="Next steps">
        <span>Next:</span>
        <Link href="/docs/limits">Limits</Link>
        <Link href="/docs/api">API reference</Link>
      </nav>
    </>
  );
}
