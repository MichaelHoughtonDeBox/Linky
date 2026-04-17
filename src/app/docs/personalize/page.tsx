import Link from "next/link";

const POLICY_SHAPE = `type ResolutionPolicy = {
  version: 1;
  rules: Rule[];
};

type Rule = {
  id: string;                  // ULID-style, minted server-side if absent
  name?: string;               // owner-facing label; leaks only if showBadge
  when: Condition;             // predicate over the viewer
  tabs: { url: string; note?: string }[];
  stopOnMatch: boolean;        // default: true (first-match-wins)
  showBadge: boolean;          // default: false (keep owner taxonomy private)
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
    note: "Matches viewers with no Clerk session.",
  },
  {
    op: "signedIn",
    example: '{ "op": "signedIn" }',
    note: "Matches any signed-in viewer, regardless of identity.",
  },
  {
    op: "equals",
    example: '{ "op": "equals", "field": "email", "value": "alice@acme.com" }',
    note: "Exact-match on a singular field.",
  },
  {
    op: "in",
    example:
      '{ "op": "in", "field": "orgSlugs", "value": ["acme", "acme-staging"] }',
    note:
      "Membership-set against a set-valued field, or value-in-list against a singular field.",
  },
  {
    op: "endsWith",
    example:
      '{ "op": "endsWith", "field": "emailDomain", "value": "acme.com" }',
    note: "Suffix match on a singular field.",
  },
  {
    op: "exists",
    example: '{ "op": "exists", "field": "githubLogin" }',
    note: "Matches when the singular field has any value.",
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
        <code>resolutionPolicy</code> and <code>/l/[slug]</code> evaluates it
        server-side against the viewer&apos;s Clerk identity on every click.
      </p>

      <section className="docs-section">
        <p className="terminal-label">Policy shape</p>
        <pre className="docs-json">
          <code>{POLICY_SHAPE}</code>
        </pre>
        <p>
          Missing <code>id</code>s are minted server-side. Missing{" "}
          <code>stopOnMatch</code> defaults to <code>true</code> (first match
          wins); missing <code>showBadge</code> defaults to <code>false</code>
          {" "}(rule names stay private unless you opt in).
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Viewer fields</p>
        <p>
          <strong>Singular</strong>: <code>email</code>,{" "}
          <code>emailDomain</code>, <code>userId</code>,{" "}
          <code>githubLogin</code>, <code>googleEmail</code>.
        </p>
        <p>
          <strong>Set-valued</strong> (viewer&apos;s full membership set, not
          active workspace): <code>orgIds</code>, <code>orgSlugs</code>.
        </p>
        <p>
          <code>in</code> is the only operator that accepts set-valued fields.{" "}
          <code>equals</code>, <code>endsWith</code>, and <code>exists</code>
          {" "}against <code>orgIds</code> / <code>orgSlugs</code> are
          rejected at parse time — use <code>in</code> with a
          single-element <code>value</code> array instead.
        </p>
        <p>
          The mapping from Clerk to viewer fields lives in{" "}
          <Link href="/docs/authentication">Authentication</Link>.
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
        <p className="terminal-label">Evaluator semantics</p>
        <ul>
          <li>
            Rules evaluate top-to-bottom. <code>stopOnMatch: true</code>{" "}
            (the default) fires the first match and stops;{" "}
            <code>stopOnMatch: false</code> appends its{" "}
            <code>tabs</code> and evaluation continues.
          </li>
          <li>
            Missing viewer fields never throw — they return{" "}
            <code>false</code> at the leaf operator.
          </li>
          <li>
            Empty policies (<code>{}</code> or{" "}
            <code>{"{ version: 1, rules: [] }"}</code>) short-circuit the
            resolver. Clerk is skipped entirely and the public{" "}
            <code>linkies.urls</code> list serves.
          </li>
          <li>
            Rule names are private by default. The matched rule&apos;s{" "}
            <code>name</code> is surfaced to the viewer only when{" "}
            <code>showBadge: true</code>.
          </li>
          <li>
            Fallback when nothing matches is always{" "}
            <code>linkies.urls</code> — the public tab set.
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
            that runs the same pure evaluator as <code>/l/[slug]</code>.
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
