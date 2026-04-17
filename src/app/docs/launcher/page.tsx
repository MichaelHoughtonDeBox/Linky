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
        <p className="terminal-label">What the viewer gets</p>
        <p>
          When you attach a policy, every click is evaluated against the
          viewer&apos;s Clerk identity (see{" "}
          <Link href="/docs/authentication">Authentication</Link>) and the
          first matching rule&apos;s tabs are served. <code>stopOnMatch: false</code>{" "}
          lets later rules append more tabs.
        </p>
        <p>
          If no rule matches — whether the viewer is anonymous or signed-in —
          they get the public tab set. That makes a Linky with a policy safe
          to paste in a public channel: the personalized tabs only surface
          for the viewers you targeted.
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
          The policy itself never leaves the server. The viewer&apos;s
          browser only ever sees the tab list they resolved to — and, when
          <code>showBadge</code> is on, the name of the matched rule.
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
          Unknown slugs return 404. Deleted Linkies also return 404 — the
          launcher treats them as gone. The version history is retained, so
          an owner can still inspect what the bundle used to contain.
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
