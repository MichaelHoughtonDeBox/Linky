import Link from "next/link";

import { CommandBlock } from "@/components/site/command-block";

const EX_BASIC =
  "linky create https://example.com https://example.org";

const EX_WITH_EMAIL =
  'linky create https://example.com --email alice@example.com --title "Standup bundle"';

const EX_WITH_POLICY =
  "linky create https://acme.com/docs --policy ./acme-team.policy.json";

const EX_STDIN =
  'echo "https://example.com" | linky create --stdin --json';

const EX_POLICY_STDIN = [
  "cat policy.json | linky create \\",
  "  https://acme.com/docs \\",
  "  --policy - \\",
  '  --email alice@acme.com',
].join("\n");

export default function DocsCliPage() {
  return (
    <>
      <p className="terminal-label">Reference — CLI</p>
      <h1 className="display-title text-4xl leading-[0.95] font-semibold text-foreground sm:text-5xl">
        CLI reference
      </h1>
      <p className="docs-lede">
        The package ships a <code>linky</code> command with zero runtime
        dependencies. Works identically in shells, CI, and agent tool
        wrappers.
      </p>

      <section className="docs-section">
        <p className="terminal-label">Usage</p>
        <pre className="docs-json">
          <code>{`linky create <url1> <url2> [url3] ... [options]
linky <url1> <url2> [url3] ... [options]`}</code>
        </pre>
        <p>
          The <code>create</code> subcommand is optional — any positional
          arguments that look like URLs are treated as a create call.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Options</p>
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Flag</th>
                <th>Value</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>--base-url</code>
                </td>
                <td>url</td>
                <td>
                  Linky API/web base URL. Defaults to{" "}
                  <code>$LINKY_BASE_URL</code> or{" "}
                  <code>https://getalinky.com</code>.
                </td>
              </tr>
              <tr>
                <td>
                  <code>--stdin</code>
                </td>
                <td>—</td>
                <td>Read additional URLs from stdin, one per line.</td>
              </tr>
              <tr>
                <td>
                  <code>--email</code>
                </td>
                <td>address</td>
                <td>
                  Anonymous create only. Flags the claim token for the named
                  recipient so they can bind ownership after signing in.
                </td>
              </tr>
              <tr>
                <td>
                  <code>--title</code>
                </td>
                <td>string</td>
                <td>Optional title stored with the Linky.</td>
              </tr>
              <tr>
                <td>
                  <code>--description</code>
                </td>
                <td>string</td>
                <td>Optional description stored with the Linky.</td>
              </tr>
              <tr>
                <td>
                  <code>--policy</code>
                </td>
                <td>path</td>
                <td>
                  JSON file containing a <code>resolutionPolicy</code>. Use{" "}
                  <code>-</code> to read policy JSON from stdin.
                </td>
              </tr>
              <tr>
                <td>
                  <code>--client</code>
                </td>
                <td>
                  &lt;tool&gt;/&lt;version&gt;
                </td>
                <td>
                  Client attribution sent as the <code>Linky-Client</code>{" "}
                  header. Malformed values are silently dropped by the server.
                </td>
              </tr>
              <tr>
                <td>
                  <code>--json</code>
                </td>
                <td>—</td>
                <td>
                  Machine-readable output. Includes <code>claimToken</code>{" "}
                  and <code>warning</code> on anonymous creates.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Examples</p>
        <CommandBlock
          title="Basic create"
          command={EX_BASIC}
          note="Anonymous. Prints the short URL and a claim URL in green."
        />
        <CommandBlock
          title="Flagged for a named recipient"
          command={EX_WITH_EMAIL}
          note="--email scopes the claim token; the recipient signs in to take ownership."
        />
        <CommandBlock
          title="Born personalized"
          command={EX_WITH_POLICY}
          note="Policy applies from the first click. Pair with --email on anonymous calls so the claim URL lands with the owner."
        />
        <CommandBlock
          title="Policy from stdin"
          command={EX_POLICY_STDIN}
          note="--policy - reads JSON from stdin. Useful for piping from jq or generators."
        />
        <CommandBlock
          title="URLs from stdin, machine-readable"
          command={EX_STDIN}
          note="Combine --stdin and --json for scripted pipelines."
        />
      </section>

      <nav className="docs-next" aria-label="Next steps">
        <span>Next:</span>
        <Link href="/docs/sdk">SDK reference</Link>
        <Link href="/docs/api">API reference</Link>
      </nav>
    </>
  );
}
