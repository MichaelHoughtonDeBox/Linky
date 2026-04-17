import Link from "next/link";

import { MAX_URLS_PER_LINKY } from "@/lib/linky/urls";
import {
  MAX_CONDITION_DEPTH,
  MAX_RULES_PER_POLICY,
  MAX_TABS_PER_RULE,
} from "@/lib/linky/policy";

export default function DocsLimitsPage() {
  return (
    <>
      <p className="terminal-label">Reference — limits</p>
      <h1 className="display-title text-4xl leading-[0.95] font-semibold text-foreground sm:text-5xl">
        Limits & rate limits
      </h1>
      <p className="docs-lede">
        Hard caps that gate agent abuse. Numbers on this page are pulled from
        Linky itself at build time, so they always match what the API will
        actually accept.
      </p>

      <section className="docs-section">
        <p className="terminal-label">Per-Linky limits</p>
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Limit</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>URLs per Linky</td>
                <td>{MAX_URLS_PER_LINKY}</td>
              </tr>
              <tr>
                <td>Max URL length</td>
                <td>2048 characters</td>
              </tr>
              <tr>
                <td>Supported protocols</td>
                <td>
                  <code>http:</code>, <code>https:</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          URLs outside these bounds are rejected with{" "}
          <code>400 INVALID_URLS</code>.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Policy limits</p>
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Limit</th>
                <th>Value</th>
                <th>When it bites</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Rules per policy</td>
                <td>{MAX_RULES_PER_POLICY}</td>
                <td>Checked on every <code>POST</code> and <code>PATCH</code>.</td>
              </tr>
              <tr>
                <td>Tabs per rule</td>
                <td>{MAX_TABS_PER_RULE}</td>
                <td>Checked on create / edit.</td>
              </tr>
              <tr>
                <td>Condition nesting depth</td>
                <td>{MAX_CONDITION_DEPTH}</td>
                <td>
                  Compound <code>and</code> / <code>or</code> /{" "}
                  <code>not</code> bodies can&apos;t nest deeper. Checked on
                  create / edit.
                </td>
              </tr>
              <tr>
                <td>Condition string value length</td>
                <td>512 characters</td>
                <td>Per value in an <code>in</code> list or a scalar op. Checked on create / edit.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Exceed any of these and the API returns <code>400 BAD_REQUEST</code>.
          See <Link href="/docs/personalize">Personalize</Link> for how the
          caps interact with the DSL.
        </p>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Plan defaults</p>
        <p>
          Every account currently uses these defaults.
        </p>
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Max Linkies</th>
                <th>Max URLs per Linky</th>
                <th>Can edit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>anonymous</code>
                </td>
                <td>50</td>
                <td>25</td>
                <td>No (anonymous Linkies are immutable).</td>
              </tr>
              <tr>
                <td>
                  <code>free</code> (signed-in user or org)
                </td>
                <td>100</td>
                <td>25</td>
                <td>Yes (per ownership rules).</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <p className="terminal-label">Anonymous create rate limit</p>
        <p>
          Applies only to unauthenticated <code>POST /api/links</code>, keyed
          by client IP. Signed-in callers are exempt.
        </p>
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Default</th>
                <th>Self-host override</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Window</td>
                <td>60,000 ms (1 minute)</td>
                <td>
                  <code>LINKY_RATE_LIMIT_WINDOW_MS</code>
                </td>
              </tr>
              <tr>
                <td>Max requests per window</td>
                <td>30</td>
                <td>
                  <code>LINKY_RATE_LIMIT_MAX_REQUESTS</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Exceeding the limit returns <code>429 RATE_LIMITED</code>. Back off
          and retry — a retry-after strategy is recommended for agents
          running in a loop.
        </p>
      </section>

      <nav className="docs-next" aria-label="Next steps">
        <span>Next:</span>
        <Link href="/docs/api">API reference</Link>
        <Link href="/docs/personalize">Personalize</Link>
      </nav>
    </>
  );
}
