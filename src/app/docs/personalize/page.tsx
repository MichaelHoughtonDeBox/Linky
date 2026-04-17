import Link from "next/link";

const POLICY_SHAPE = `type ResolutionPolicy = {
  version: 1;
  rules: Rule[];
};

type Rule = {
  id: string;                  // minted for you if you omit it
  name?: string;               // your private label; viewer sees it only if showBadge
  when: Condition;             // what has to be true for this rule to match
  tabs: { url: string; note?: string }[];
  stopOnMatch: boolean;        // default: true — first match wins and evaluation stops
  showBadge: boolean;          // default: false — rule name stays private
};`;

const OP_EXAMPLES: { op: string; example: string; note: string }[] = [
  {
    op: "always",
    example: '{ "op": "always" }',
    note: "Matches every viewer. Useful as a catch-all final rule.",
  },
  {
    op: "anonymous",
    example: '{ "op": "anonymous" }',
    note: "Matches viewers who aren't signed into Linky.",
  },
  {
    op: "signedIn",
    example: '{ "op": "signedIn" }',
    note: "Matches any signed-in viewer, regardless of identity.",
  },
  {
    op: "equals",
    example: '{ "op": "equals", "field": "email", "value": "alice@acme.com" }',
    note: "Exact-match on a single-value field.",
  },
  {
    op: "in",
    example:
      '{ "op": "in", "field": "orgSlugs", "value": ["acme", "acme-staging"] }',
    note:
      "Matches if the viewer's org membership list overlaps the value list, or — on a single-value field — if the viewer's value is in the list.",
  },
  {
    op: "endsWith",
    example:
      '{ "op": "endsWith", "field": "emailDomain", "value": "acme.com" }',
    note: "Suffix match on a single-value field.",
  },
  {
    op: "exists",
    example: '{ "op": "exists", "field": "githubLogin" }',
    note: "Matches when the viewer has any value for that field.",
  },
  {
    op: "and",
    example:
      '{ "op": "and", "of": [ { "op": "signedIn" }, { "op": "endsWith", "field": "emailDomain", "value": "acme.com" } ] }',
    note: "All branches must match.",
  },
  {
    op: "or",
    example:
      '{ "op": "or", "of": [ { "op": "equals", "field": "email", "value": "alice@acme.com" }, { "op": "equals", "field": "email", "value": "bob@acme.com" } ] }',
    note: "Any branch matches.",
  },
  {
    op: "not",
    example: '{ "op": "not", "of": [ { "op": "anonymous" } ] }',
    note: "Invert a single nested condition.",
  },
];

const WORKED_EXAMPLE = `{
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
    },
    {
      "name": "Partner access",
      "when": {
        "op": "in",
        "field": "orgSlugs",
        "value": ["partner-co"]
      },
      "tabs": [
        { "url": "https://partners.acme.com/dashboard" }
      ]
    }
  ]
}`;

export default function DocsPersonalizePage() {
  return (
    <>
      <p className="terminal-label">Launch bundles — personalize</p>
      <h1 className="display-title text-4xl leading-[0.95] font-semibold text-foreground sm:text-5xl">
        Personalize a Linky
      </h1>
      <p className="docs-lede">
        One Linky, different tabs per viewer. Attach a{" "}
        <code>resolutionPolicy</code> and Linky evaluates it against the
        viewer&apos;s identity on every click to <code>/l/[slug]</code>.
      </p>

      <section className="docs-section">
        <p className="terminal-label">Policy shape</p>
        <pre className="docs-json">
          <code>{POLICY_SHAPE}</code>
        </pre>
        <p>
          Omit <code>id</code> and Linky mints one for you. Omit{" "}
          <code>stopOnMatch</code> and the first match wins; omit{" "}
          <code>showBadge</code> and the rule name stays private to you.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Viewer fields</p>
        <p>
          <strong>Single-value fields</strong>: <code>email</code>,{" "}
          <code>emailDomain</code>, <code>userId</code>,{" "}
          <code>githubLogin</code>, <code>googleEmail</code>. Each holds one
          value per viewer.
        </p>
        <p>
          <strong>Plural fields</strong> (hold multiple values per viewer):{" "}
          <code>orgIds</code>, <code>orgSlugs</code>. These are the viewer&apos;s
          full organization membership list — not just whichever workspace
          they have active.
        </p>
        <p>
          <code>in</code> is the only operator you can use against a plural
          field. <code>equals</code>, <code>endsWith</code>, and{" "}
          <code>exists</code> against <code>orgIds</code> /{" "}
          <code>orgSlugs</code> are rejected with a 400 — use <code>in</code>{" "}
          with a single-element <code>value</code> array instead.
        </p>
        <p>
          What each field means and where its value comes from is documented
          on the <Link href="/docs/identity">Identity</Link> page.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Operators</p>
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Op</th>
                <th>Example</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {OP_EXAMPLES.map((row) => (
                <tr key={row.op}>
                  <td>
                    <code>{row.op}</code>
                  </td>
                  <td>
                    <code>{row.example}</code>
                  </td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <p className="terminal-label">How Linky evaluates your rules</p>
        <ul>
          <li>
            Rules are checked top-to-bottom. With{" "}
            <code>stopOnMatch: true</code> (the default) the first matching
            rule fires and the viewer gets that rule&apos;s tabs. With{" "}
            <code>stopOnMatch: false</code> the rule&apos;s tabs are appended
            and evaluation continues down the list.
          </li>
          <li>
            A rule that references a field the viewer doesn&apos;t have just
            fails to match — it never errors.
          </li>
          <li>
            An empty or missing policy skips evaluation entirely; every
            viewer gets the public tab set.
          </li>
          <li>
            Rule names are private by default. The viewer only sees the
            matched rule&apos;s <code>name</code> when you set{" "}
            <code>showBadge: true</code> on that rule.
          </li>
          <li>
            When nothing matches, the viewer always gets the public tab set
            you supplied as <code>urls</code>.
          </li>
        </ul>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Limits</p>
        <ul>
          <li>Up to 50 rules per policy.</li>
          <li>Up to 20 tabs per rule.</li>
          <li>Condition nesting depth ≤ 4.</li>
          <li>String values are capped at 512 characters.</li>
        </ul>
        <p>
          The <Link href="/docs/limits">Limits</Link> page has the full list
          alongside plan and rate-limit defaults.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">How to author</p>
        <p>
          <strong>Dashboard</strong> — the Personalize panel at{" "}
          <code>/dashboard/links/[slug]</code> has two modes:
        </p>
        <ul>
          <li>
            <strong>Structured</strong> — canned operator presets
            (<code>equals email</code>, <code>endsWith emailDomain</code>,{" "}
            <code>in orgSlugs</code>, <code>anonymous</code>,{" "}
            <code>signedIn</code>) plus a <strong>Preview as</strong> control
            that runs your rules against a sample viewer exactly the way{" "}
            <code>/l/[slug]</code> would.
          </li>
          <li>
            <strong>Advanced (JSON)</strong> — raw policy with validation on
            Apply. Use this for compound <code>and</code> / <code>or</code>{" "}
            / <code>not</code>.
          </li>
        </ul>
        <p>
          <strong>API / CLI / SDK</strong> — attach at create time (see{" "}
          <Link href="/docs/create">Create</Link>) or edit later via{" "}
          <code>PATCH /api/links/:slug</code> (see{" "}
          <Link href="/docs/api">API</Link>). The CLI takes a JSON file with{" "}
          <code>--policy</code> (see <Link href="/docs/cli">CLI</Link>), and
          the SDK takes an object under <code>resolutionPolicy</code> (see{" "}
          <Link href="/docs/sdk">SDK</Link>).
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Worked example</p>
        <p>
          Two rules: signed-in Acme engineers get a personal Linear + GitHub
          queue with a visible badge; members of partner-co get a separate
          partner dashboard. Everyone else falls through to the public tab
          set.
        </p>
        <pre className="docs-json">
          <code>{WORKED_EXAMPLE}</code>
        </pre>
      </section>

      <nav className="docs-next" aria-label="Next steps">
        <span>Next:</span>
        <Link href="/docs/launcher">Launcher</Link>
        <Link href="/docs/api">API reference</Link>
      </nav>
    </>
  );
}
