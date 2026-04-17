import Link from "next/link";

export default function DocsOverviewPage() {
  return (
    <>
      <p className="terminal-label">Docs</p>
      <h1 className="display-title text-4xl leading-[0.95] font-semibold text-foreground sm:text-5xl">
        Linky docs
      </h1>
      <p className="docs-lede">
        Linky turns many URLs into one short launch link, and agents are the
        first-class caller. These docs cover every surface — skill, CLI, SDK,
        curl — and the identity-aware resolution layer on top.
      </p>

      <section className="docs-section">
        <p className="terminal-label">What Linky is</p>
        <p>
          One launch bundle, one short URL. Give <code>POST /api/links</code>
          {" "}a list of URLs and get back <code>/l/[slug]</code>. Share it. The
          recipient clicks <strong>Open All</strong> and the tabs fire — with
          popup-blocker fallbacks baked in.
        </p>
        <p>
          Attach a <Link href="/docs/personalize">resolution policy</Link> and
          the same Linky opens a different tab set per viewer. Unmatched or
          anonymous viewers fall through to the public bundle, so the URL stays
          safe to share in public channels.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Three ways to create</p>
        <ul>
          <li>
            <strong>Cursor skill</strong> — {""}
            <Link href="/docs/install">install</Link> the skill and let the
            model emit Linky URLs at the end of every task.
          </li>
          <li>
            <strong>CLI / SDK</strong> — {""}
            <Link href="/docs/cli">{`linky create <url>`}</Link> for shells and
            CI; <Link href="/docs/sdk"><code>createLinky()</code></Link> for
            scripts.
          </li>
          <li>
            <strong>Direct API</strong> — a single {""}
            <Link href="/docs/api">
              <code>POST /api/links</code>
            </Link>{" "}
            works from any HTTP-capable agent, including curl and edge
            functions.
          </li>
        </ul>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Start here</p>
        <ul>
          <li>
            <Link href="/docs/install">Install</Link> — skill, CLI, curl
            baseline.
          </li>
          <li>
            <Link href="/docs/quick-start">Quick start</Link> — create, launch,
            optionally claim, optionally personalize.
          </li>
          <li>
            <Link href="/docs/create">Create</Link> — the canonical{" "}
            <code>POST /api/links</code> contract.
          </li>
          <li>
            <Link href="/docs/personalize">Personalize</Link> — the DSL, the
            operators, and the dashboard editor.
          </li>
        </ul>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Reference</p>
        <ul>
          <li>
            <Link href="/docs/api">API</Link> — every route, full JSON,
            error codes.
          </li>
          <li>
            <Link href="/docs/cli">CLI</Link> — every flag, with examples.
          </li>
          <li>
            <Link href="/docs/sdk">SDK</Link> —{" "}
            <code>createLinky()</code> options and result types.
          </li>
          <li>
            <Link href="/docs/limits">Limits</Link> — plan defaults, rate
            limits, policy caps.
          </li>
        </ul>
      </section>

      <nav className="docs-next" aria-label="Next steps">
        <span>Next:</span>
        <Link href="/docs/install">Install</Link>
        <Link href="/docs/quick-start">Quick start</Link>
      </nav>
    </>
  );
}
