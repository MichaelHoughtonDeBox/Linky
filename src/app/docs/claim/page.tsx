import Link from "next/link";

export default function DocsClaimPage() {
  return (
    <>
      <p className="terminal-label">Handoff — claim flow</p>
      <h1 className="display-title text-4xl leading-[0.95] font-semibold text-foreground sm:text-5xl">
        Claim flow
      </h1>
      <p className="docs-lede">
        The agent-to-human handoff. An agent creates a Linky on your behalf,
        sends you a claim URL, and one click binds ownership to your Clerk
        account.
      </p>

      <section className="docs-section">
        <p className="terminal-label">Lifecycle</p>
        <ul>
          <li>
            Agent calls <code>POST /api/links</code> (or CLI / SDK) without a
            Clerk session. The backend creates the Linky anonymously and
            mints a <code>claim_tokens</code> row with a 30-day expiry.
          </li>
          <li>
            Response returns <code>claimToken</code>, <code>claimUrl</code>,{" "}
            <code>claimExpiresAt</code>, and a <code>warning</code>. The CLI
            prints them in green; the SDK returns them; the web UI renders a
            &quot;keep this for later&quot; card.
          </li>
          <li>
            User visits <code>/claim/&lt;token&gt;</code>. Signed-out
            visitors see Sign-in / Sign-up CTAs that round-trip back to the
            claim URL via <code>redirect_url</code>. Signed-in visitors have
            the token consumed atomically and land on{" "}
            <code>/dashboard/links/&lt;slug&gt;</code> as the new owner.
          </li>
        </ul>
      </section>

      <section className="docs-section">
        <p className="terminal-label">One-shot guarantee</p>
        <ul>
          <li>
            <code>claimToken</code> is returned exactly once. Lose it and the
            Linky can never be bound to an account. Persist it to a secret
            store immediately.
          </li>
          <li>
            Consuming a token is atomic — races can&apos;t double-assign a
            Linky.
          </li>
          <li>
            No endpoint re-issues a claim token for an existing anonymous
            Linky. By design.
          </li>
        </ul>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Expiry + windows</p>
        <ul>
          <li>
            Claim window: 30 days from create time. Not extended by re-reads
            or passive activity.
          </li>
          <li>
            After expiry the Linky stays live at <code>/l/&lt;slug&gt;</code>
            {" "}but cannot be bound to an account. Anonymous Linkies are
            permanent — no TTL on the bundle itself.
          </li>
          <li>
            Anonymous Linkies remain immutable until claimed. Policies
            attached at create time by an anonymous caller lock with the
            Linky.
          </li>
        </ul>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Ownership rules at claim time</p>
        <p>
          Org context wins. If the claiming user has an active Clerk org,
          ownership is attributed to the org (team-owned). Switch to Personal
          in the Clerk org switcher before claiming to attribute to your
          individual user instead.
        </p>
        <p>
          Claiming is a no-op on bundles that already have an owner — prevents
          a race from transferring a claimed Linky a second time.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Failure modes</p>
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Condition</th>
                <th>What the claim page renders</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Token expired</td>
                <td>Dedicated message — bundle stays public but unclaimable.</td>
              </tr>
              <tr>
                <td>Token already consumed</td>
                <td>&quot;Already claimed&quot; messaging with a link to the launcher.</td>
              </tr>
              <tr>
                <td>Orphan token (no bundle)</td>
                <td>&quot;Not found&quot; messaging; safe to retry with a different URL.</td>
              </tr>
              <tr>
                <td>Bundle already owned</td>
                <td>No-op; the existing owner is preserved.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <nav className="docs-next" aria-label="Next steps">
        <span>Next:</span>
        <Link href="/docs/api">API reference</Link>
        <Link href="/docs/authentication">Authentication</Link>
      </nav>
    </>
  );
}
