import Link from "next/link";

export default function DocsLauncherPage() {
  return (
    <>
      <p className="terminal-label">Launch bundles — launcher</p>
      <h1 className="display-title text-4xl leading-[0.95] font-semibold text-foreground sm:text-5xl">
        The launcher page
      </h1>
      <p className="docs-lede">
        <code>/l/[slug]</code> is where a Linky opens. It resolves the tab
        set, renders the <strong>Open All</strong> button, and nudges the
        viewer when identity would unlock a different bundle.
      </p>

      <section className="docs-section">
        <p className="terminal-label">Resolution</p>
        <p>
          On every click the server looks up <code>linkies.resolution_policy</code>.
          If it&apos;s empty, Clerk is skipped and <code>linkies.urls</code>{" "}
          serves directly. Otherwise it builds a viewer context (see{" "}
          <Link href="/docs/authentication">Authentication</Link>) and
          evaluates the policy; the first matching rule wins (unless{" "}
          <code>stopOnMatch: false</code> appends it and evaluation
          continues).
        </p>
        <p>
          Unmatched viewers — anonymous or signed-in — always fall through to
          the public tab set. A Linky with a policy is safe to paste in a
          public channel.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Open All + popup fallback</p>
        <p>
          <strong>Open All</strong> calls <code>window.open()</code> once per
          tab in a synchronous loop triggered by the click event — most
          browsers honor it. If the browser blocks the batch, the launcher
          renders a manual list with each URL as an explicit anchor so the
          viewer can click through one at a time.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Personalized banner</p>
        <p>
          When a rule matches and has <code>showBadge: true</code>, the
          launcher renders the rule&apos;s <code>name</code> as a small banner
          so the viewer understands which bundle they&apos;re seeing. Rules
          with <code>showBadge: false</code> (the default) stay invisible —
          the viewer sees only their tab set.
        </p>
        <p>
          The policy itself is never shipped to the client. Only the resolved
          tab list and the optional matched-rule name cross the wire.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Anonymous sign-in nudge</p>
        <p>
          When a Linky has a policy and the viewer is anonymous, the launcher
          surfaces a small prompt to sign in — personalized tabs may be
          waiting. The prompt never blocks: the public tab set still renders
          and <strong>Open All</strong> still works. Signing in triggers a
          re-resolve.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Not found / deleted</p>
        <p>
          Unknown slugs return 404. Soft-deleted Linkies also return 404 from
          the public resolver — the underlying row survives for audit but the
          launcher treats them as gone.
        </p>
      </section>

      <nav className="docs-next" aria-label="Next steps">
        <span>Next:</span>
        <Link href="/docs/claim">Claim flow</Link>
        <Link href="/docs/api">API reference</Link>
      </nav>
    </>
  );
}
