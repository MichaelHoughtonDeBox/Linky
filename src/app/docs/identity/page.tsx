import Link from "next/link";

export default function DocsIdentityPage() {
  return (
    <>
      <p className="terminal-label">Identity</p>
      <h1 className="display-title text-4xl leading-[0.95] font-semibold text-foreground sm:text-5xl">
        Viewer identity
      </h1>
      <p className="docs-lede">
        A viewer is whoever clicks a Linky. When they&apos;re signed into
        their Linky account, the rules engine can match on who they are.
        When they&apos;re not, only anonymous rules apply.
      </p>

      <section className="docs-section">
        <p className="terminal-label">Signed-in vs anonymous</p>
        <p>
          Viewers sign in with their Linky account — the same account they
          created to manage their own launch bundles. Anonymous viewers open
          the launcher without signing in; they see the public URL list and
          only match rules that use <code>anonymous</code> or{" "}
          <code>always</code>.
        </p>
        <p>
          If a policy is attached to a Linky but the viewer is signed out,
          the launcher shows a &quot;sign in to personalize&quot; nudge
          alongside the public tabs. The link still works without an
          account; signing in just unlocks anything the rules had planned
          for them.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Fields you can match against</p>
        <p>
          When a signed-in viewer hits a Linky, these seven fields are
          available to rule conditions:
        </p>
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>What it is</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>email</code>
                </td>
                <td>The viewer&apos;s primary email address, lower-cased.</td>
              </tr>
              <tr>
                <td>
                  <code>emailDomain</code>
                </td>
                <td>
                  The domain part of their primary email, lower-cased
                  (everything after the <code>@</code>).
                </td>
              </tr>
              <tr>
                <td>
                  <code>userId</code>
                </td>
                <td>
                  The viewer&apos;s stable Linky user id. Useful when you
                  need exact-match identity without relying on email.
                </td>
              </tr>
              <tr>
                <td>
                  <code>githubLogin</code>
                </td>
                <td>
                  The viewer&apos;s GitHub username, if they connected GitHub
                  to their Linky account.
                </td>
              </tr>
              <tr>
                <td>
                  <code>googleEmail</code>
                </td>
                <td>
                  The email on the viewer&apos;s connected Google account, if
                  any. Useful when it differs from their primary Linky email.
                </td>
              </tr>
              <tr>
                <td>
                  <code>orgIds</code>
                </td>
                <td>
                  Every Linky organization the viewer is a member of — the
                  full list, not just whichever one is active in their
                  dashboard.
                </td>
              </tr>
              <tr>
                <td>
                  <code>orgSlugs</code>
                </td>
                <td>
                  The slug of every Linky organization the viewer is a
                  member of. Same full-list semantics as{" "}
                  <code>orgIds</code>.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <code>email</code>, <code>emailDomain</code>, <code>userId</code>,{" "}
          <code>githubLogin</code>, and <code>googleEmail</code> hold at
          most one value each. <code>orgIds</code> and <code>orgSlugs</code>{" "}
          can hold many, because a viewer can belong to several
          organizations.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Missing fields quietly fail to match</p>
        <p>
          A viewer without a connected GitHub account simply doesn&apos;t
          match a rule that references <code>githubLogin</code>. A viewer
          with no organization memberships won&apos;t match any{" "}
          <code>orgSlugs</code> rule. There&apos;s no error — evaluation
          keeps walking the rule list, and falls through to the public tabs
          if nothing matches. Write rules assuming some fields will be
          absent for some viewers.
        </p>
      </section>

      <nav className="docs-next" aria-label="Next steps">
        <span>Next:</span>
        <Link href="/docs/personalize">Personalize</Link>
        <Link href="/docs/launcher">Launcher</Link>
      </nav>
    </>
  );
}
