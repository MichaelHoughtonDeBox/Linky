# Sprint 2.7 — Analytics + Access Control

*Status: **planning / not started**. Draft 1 — `cursor/sprint-2.7-analytics-access-control-plan-6ffd`.*
*Anchor commit: `72479aa feat: add api-key auth and linky update workflow (#12)` — the bearer / subject / api_keys model this sprint builds on.*
*Previous sprints: 1 (accounts + owned bundles), 2 (identity-aware resolution), 2.5 (policy at create-time), 2.6 (`linky update` + API keys).*

---

## TL;DR

Sprint 2.7 turns the three-subject auth model (`anonymous` / `user` / `org`) into something a team can actually run a ritual on:

1. **Owner-side analytics** — did my audience arrive, and did the right rule match? Launcher view + click events written from `/l/[slug]`, aggregated in a per-Linky insights panel. No viewer-side tracking.
2. **Role-aware access control inside orgs** — today every org member can edit every org-owned Linky. Split that into `viewer` / `editor` / `admin` via `memberships.role`, with analytics gated on `viewer+`, edits gated on `editor+`, key management gated on `admin`.
3. **Scoped API keys** — extend `api_keys` so an automation key can be read-only (`links:read`) or read-write (`links:write`). Matches the RBAC model; unblocks "give my LLM a key it can't use to nuke prod."

Everything is additive. No breaking change to existing `POST /api/links`, `/l/[slug]`, or `linky update` surfaces. The trust posture from the Sprint 3 analytics framing (`README.md` → "Trust & lifecycle policy" bullet 9) is load-bearing — this sprint is the first time we're writing that posture into code.

---

## Why now

- **PR #12** shipped bearer auth + api_keys. We now have a machine-identity primitive, but it has exactly **one** scope level ("full edit as this subject"). That's the wrong shape for any LLM-held credential — any read usage also has delete rights.
- **Sprint 2** shipped `resolutionPolicy`. Owners can author rules but have no signal that the rules work — no way to see "40% of viewers hit the Acme rule, 10% fell through." That's the single biggest piece of missing feedback from the policy editor.
- **Sprint 1** shipped `memberships.role` (populated by Clerk webhooks). The column exists, is read nowhere. Sprint 2.7 is the cheapest moment to turn it on, before Stripe pricing lands and we're trying to RBAC *and* meter at once.
- The analytics posture is already written into `README.md` (PR #4, commit `298b751`). We've committed to the scope in public prose; shipping the instrumentation without re-litigating the scope is the job.

---

## Non-goals (explicit — do not slip these in)

- **No viewer-side analytics.** No "time on page," no "did Alice click URL #3," no fingerprint cookies on anonymous viewers. Trust posture bullet 9 is the contract.
- **No destination-tab observability.** Same-Origin Policy makes this impossible anyway; we don't try.
- **No per-URL wrapper redirects.** If we ever ship them, they're opt-in per Linky, never on by default. Out of scope for this sprint.
- **No entitlement enforcement for paid plans.** `entitlements.plan` stays at `'free'` for everyone. Paid-plan gates (`hide_launcher_attribution`, `maxLinkies`, analytics retention) are Sprint 3.
- **No UI for custom roles.** We use the three Clerk defaults (`org:admin`, `org:member`, plus our derived `viewer`). Custom Clerk roles map conservatively (see Chunk C).
- **No retroactive analytics.** Events start when Chunk A ships; historic views are gone and we don't backfill.
- **No export / webhook / BI-connector for analytics.** JSON in the dashboard + a paginated API route is the whole surface.

---

## Architecture at a glance

```text
/l/[slug]  ── evaluatePolicy ──►  launcher_events INSERT (fire-and-forget, async)
                                         │
                                         ▼
                                   Neon Postgres
                                         │
                                         ▼
  /dashboard/links/[slug]/insights  ◄── aggregateLauncherEvents(linkyId, range)
                                         │
                                         ▼
                   GET /api/links/:slug/insights   (owner+analytics scope)

memberships.role ──► deriveMembershipRole()  ──►  canViewLinky / canEditLinky / canAdminLinky
                                                          │
                                                          ▼
                                         PATCH / DELETE / /versions / /insights / /keys  route guards

api_keys.scopes JSONB  ──►  authenticateApiKey() attaches scopes to AuthenticatedSubject
                                                          │
                                                          ▼
                                      requireScope(subject, "links:write") in PATCH/DELETE
```

---

## Chunks

Each chunk is landable independently and passes `npm run check`. Follow the Sprint 2 pattern: one chunk per PR, merged behind a feature flag only if downstream chunks haven't caught up.

### Chunk A — `launcher_events` table + write path from `/l/[slug]`

**Goal:** every render of the launcher page writes exactly one row. Every **Open All** click writes exactly one row. Async, best-effort, never blocks the viewer.

**Schema** — new migration `db/migrations/005_launcher_events.sql` + mirror into `db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS launcher_events (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  linky_id          INTEGER NOT NULL REFERENCES linkies(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('view', 'open_all')),
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Policy evaluation context. NULL when the Linky has no resolution_policy.
  matched_rule_id   TEXT,
  viewer_state      TEXT NOT NULL CHECK (viewer_state IN ('anonymous', 'signed_in')),
  -- Coarse signal only. Hashed with a per-day salt so we can count "unique
  -- viewers per day" without storing anything re-identifiable.
  viewer_hash_day   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_launcher_events_linky_time
  ON launcher_events (linky_id, occurred_at DESC);
```

**Invariants (locked in — do not drift):**

- `viewer_hash_day = sha256(clerk_user_id || ':' || YYYY-MM-DD || ':' || LINKY_DAILY_SALT)` for signed-in viewers, `sha256(ip_subnet24 || ':' || YYYY-MM-DD || ':' || LINKY_DAILY_SALT)` for anonymous. **No raw IP, no user-agent, no email, no Clerk id persisted.** Daily salt rotation means "unique viewers this week" is answerable; cross-day identity is not.
- `matched_rule_id` references the rule id minted at parse time in `src/lib/linky/policy.ts`. If the owner deletes a rule later, old events keep the dangling id — the insights UI surfaces that as `"(removed rule)"`. Do **not** add an FK to a rules table; the policy lives in a JSONB column by design.
- **Write path is fire-and-forget.** `/l/[slug]` returns the launcher HTML; the insert happens via `context.waitUntil()` (or the Node equivalent under Next.js 16). A DB outage must never 500 the launcher. Wrap in try/catch + log.
- **Open All events fire from the browser** via a no-body `POST /api/links/:slug/events` with `kind=open_all`. Public endpoint, IP-rate-limited identically to `POST /api/links`. No-op if the slug doesn't exist or is deleted.

**Files touched:**

- `db/migrations/005_launcher_events.sql` (new)
- `db/schema.sql` (mirror)
- `src/lib/server/launcher-events-repository.ts` (new — `recordView`, `recordOpenAll`, `aggregate`)
- `src/lib/server/launcher-events.test.ts` (new — hashing matrix, daily salt rotation)
- `src/app/l/[slug]/page.tsx` (call `recordView` in a `waitUntil`)
- `src/app/api/links/[slug]/events/route.ts` (new — `POST` for `open_all`)
- `src/components/launcher/open-all-button.tsx` (fire the POST on click, ignore failures)
- `src/proxy.ts` (add the events route to the public matcher)

**Tests:**

- `viewer_hash_day` is deterministic across requests on the same day, different across days.
- Writes are non-blocking — mock repo throws, launcher still renders.
- Anonymous viewer + anonymous Linky produces a `viewer_state='anonymous'`, `matched_rule_id=NULL` row.
- Signed-in viewer hitting a matched rule produces `matched_rule_id=<ulid>`, `viewer_state='signed_in'`.

### Chunk B — `/dashboard/links/[slug]/insights` + `GET /api/links/:slug/insights`

**Goal:** owner answers two questions in under a second:

1. **"Did my audience arrive?"** → views + unique viewers per day (bucket by `viewer_hash_day`), Open All click-through rate, last-30-days sparkline.
2. **"Is my policy working?"** → grouped-by-rule breakdown: "Engineering team: 40% of views · 62% Open All. Fallthrough: 45% of views · 30% Open All."

**API shape** — `GET /api/links/:slug/insights?range=7d|30d|90d`:

```json
{
  "slug": "x8q2m4k",
  "range": { "from": "2026-03-18T00:00:00Z", "to": "2026-04-18T00:00:00Z" },
  "totals": {
    "views": 412,
    "uniqueViewerDays": 287,
    "openAllClicks": 198,
    "openAllRate": 0.481
  },
  "byRule": [
    { "ruleId": "01J...", "ruleName": "Engineering team", "views": 164, "openAllClicks": 102, "openAllRate": 0.622 },
    { "ruleId": null,      "ruleName": "Fallthrough",       "views": 186, "openAllClicks": 56,  "openAllRate": 0.301 }
  ],
  "series": [
    { "day": "2026-04-11", "views": 18, "openAllClicks": 9 },
    { "day": "2026-04-12", "views": 22, "openAllClicks": 12 }
  ]
}
```

**Guards:**

- Requires `canViewLinky(subject, ownership)` (Chunk C). Anonymous subjects get 401; non-members of the owner org get 403.
- Returns `{ totals: {...zeros...}, byRule: [], series: [] }` for Linkies with no events yet — never 404, always a shape.
- `range` defaults to `30d`, caps at `90d` in Sprint 2.7 (retention story comes with the paid plan).

**Files touched:**

- `src/app/api/links/[slug]/insights/route.ts` (new)
- `src/app/dashboard/links/[slug]/insights/page.tsx` (new — server component, renders SVG sparkline + rule breakdown table from terminal-aesthetic primitives)
- `src/app/dashboard/links/[slug]/layout.tsx` or owner tab bar (add **Insights** tab next to **Edit**)
- `src/lib/linky/launcher-insights.test.ts` (new — aggregate fixture)

**Tests:**

- Aggregator bucketing is stable across timezones (DB in UTC; display in UTC until we ship a per-user preference).
- Rule name is looked up from the *current* policy; deleted rule ids render as "(removed rule)" with events preserved.
- Owner without events sees a zeroed shape, not an error.
- Non-owner gets 403.

### Chunk C — Role-aware access control for org-owned Linkies

**Goal:** replace the current binary `canEditLinky` with a three-level check that reads `memberships.role` instead of treating every org member as an editor.

**Role model** — derived from `memberships.role`, not stored independently:

| Derived | Matches Clerk role slug | Can view | Can edit | Can admin (keys, member list) |
|---|---|---|---|---|
| `admin` | `org:admin` | ✓ | ✓ | ✓ |
| `editor` | `org:member` + any custom role whose slug starts with `linky:editor` | ✓ | ✓ | ✗ |
| `viewer` | anything else (incl. unknown custom roles) | ✓ | ✗ | ✗ |

**Why conservative on unknown roles:** we'd rather deny edit to a custom role that nobody configured than grant it. Admins can promote via Clerk or a `linky:editor` prefix; if they want a power user who isn't a Clerk org admin, that's the supported path.

**New primitives in `src/lib/server/auth.ts`:**

```ts
export type MembershipRole = "admin" | "editor" | "viewer";

export function deriveMembershipRole(rawRole: string | null | undefined): MembershipRole;
export function canViewLinky(subject: AuthSubject, ownership: LinkyOwnership, role: MembershipRole | null): boolean;
export function canEditLinky(subject: AuthSubject, ownership: LinkyOwnership, role: MembershipRole | null): boolean; // EXISTING SIGNATURE EXTENDS
export function canAdminLinky(subject: AuthSubject, ownership: LinkyOwnership, role: MembershipRole | null): boolean;
```

- `role` is the derived role for the subject's **active org** (from `session.orgRole` for browser sessions; from `memberships` for API keys — see below).
- For user-owned Linkies, `role` is ignored and the ownership check is identical to today.
- For API keys: the role carried on the subject is whatever role the key's owner (user or org) implicitly holds. Org-scoped keys default to `editor` unless Chunk D upgrades that key's scope explicitly.

**Ownership call sites to update (exhaustive):**

- `PATCH /api/links/:slug` — now requires `canEditLinky` (unchanged semantically for 90% of orgs, tightens for the rest).
- `DELETE /api/links/:slug` — requires `canAdminLinky` (soft-delete is destructive; needs stricter gate than edit).
- `GET /api/links/:slug/versions` — requires `canViewLinky` (was owner-only with no role check).
- `GET /api/links/:slug/insights` (Chunk B) — requires `canViewLinky`.
- `GET /api/me/links` — filter list query by `canViewLinky` for the active org, not just `owner_org_id=$1`.
- `GET|POST|DELETE /api/me/keys` — requires `canAdminLinky` against the org (keys are admin-only).
- Dashboard pages that mirror the above — server-component gating at render time, redirect on deny.

**Files touched:**

- `src/lib/server/auth.ts` (primitives + role derivation)
- `src/lib/server/auth.test.ts` (extend matrix: 3 subjects × 3 roles × 3 ownership shapes × 3 actions = 81 cells; encode at least the 27 non-equivalent ones)
- Every route listed above
- `src/lib/server/identity-repository.ts` (new helper: `getMembershipRole(userId, orgId)` for API-key subjects that don't carry a role on the session)

**Tests (examples — live in `auth.test.ts`, not inline):**

- `org:admin` on org-owned Linky → all three actions `true`.
- `org:member` on org-owned Linky → view + edit `true`, admin `false`.
- Custom role `linky:editor:reviews` on org-owned Linky → view + edit `true`, admin `false`.
- Custom role `reports:viewer` on org-owned Linky → view `true`, edit + admin `false`.
- Any role on user-owned Linky belonging to a different user → all `false`.
- Anonymous subject → always `false`.

### Chunk D — Scoped API keys

**Goal:** make it safe to put a Linky API key in an LLM context window. Today one leaked key = full delete authority.

**Schema change** — new migration `db/migrations/006_api_key_scopes.sql`:

```sql
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS scopes JSONB NOT NULL DEFAULT '["links:write"]'::jsonb;
```

- Default `["links:write"]` preserves current behavior for every existing key.
- Validated at mint time against the allow-list `links:read`, `links:write`, `keys:admin`. Unknown scopes reject at create.
- `links:write` **implies** `links:read`; `keys:admin` **implies** `links:write` + `links:read`. Implication resolution happens in a single pure helper `expandScopes(stored: string[]): Set<string>` — tested exhaustively.

**Scope gate** — new primitive in `src/lib/server/auth.ts`:

```ts
export type ApiKeyScope = "links:read" | "links:write" | "keys:admin";

export function subjectHasScope(subject: AuthSubject, scope: ApiKeyScope): boolean;
// Session subjects (browser Clerk auth) always return `true` — a signed-in
// human is not scope-limited by the API key model. Scope only applies to
// bearer-token subjects.
```

**Call-site matrix:**

| Route | Minimum scope (bearer) | RBAC role (session + bearer after Chunk C) |
|---|---|---|
| `POST /api/links` | `links:write` | n/a (creation needs no role; ownership attribution is automatic) |
| `PATCH /api/links/:slug` | `links:write` | `editor+` |
| `DELETE /api/links/:slug` | `links:write` | `admin` |
| `GET /api/links/:slug/versions` | `links:read` | `viewer+` |
| `GET /api/links/:slug/insights` | `links:read` | `viewer+` |
| `GET /api/me/links` | `links:read` | `viewer+` (filters to what you can see) |
| `POST /api/links/:slug/events` | — (public endpoint) | — |
| `* /api/me/keys` | `keys:admin` | `admin` |

**UI** — `/dashboard/api-keys` gets a **Scope** selector on create:

- **Read-only** (`["links:read"]`) — safe for LLM context, analytics consumers, read-only SDK calls.
- **Read-write** (`["links:write"]`) — default, today's behavior.
- **Admin** (`["keys:admin"]`) — can mint and revoke keys. Intentionally rare; off by default.

Scope is displayed in the key list. Scope is **immutable** once minted — to change it, revoke and re-issue. Keeps the threat model simple (no "quietly escalated this key").

**Files touched:**

- `db/migrations/006_api_key_scopes.sql` (new)
- `db/schema.sql` (mirror)
- `src/lib/server/api-keys.ts` (scopes param, scope validation, `expandScopes`)
- `src/lib/server/auth.ts` (`subjectHasScope`, carry scopes on `AuthenticatedSubject`)
- Every route in the matrix above (add the scope guard before the role guard)
- `src/app/api/me/keys/route.ts` (accept + validate `scopes` on POST)
- `src/app/dashboard/api-keys/panel-client.tsx` (scope picker)
- `cli/index.js` (show scope in `linky auth whoami`; pass `--scope` on create if we ever add a CLI-create-key command — not in this sprint)
- `src/lib/server/api-keys.test.ts` (scope parsing, implication, rejection)

**Tests:**

- `expandScopes(["links:read"])` → `Set{"links:read"}`.
- `expandScopes(["links:write"])` → `Set{"links:read","links:write"}`.
- `expandScopes(["keys:admin"])` → all three.
- Unknown scope rejects at mint.
- Read-only key hitting `PATCH /api/links/:slug` → 403 with `code: "FORBIDDEN"`, message names the missing scope.

### Chunk E — Org member list + role surface in the dashboard

**Goal:** give an org admin a place to see who has what role without bouncing to the Clerk dashboard, and surface the `linky:editor:*` custom-role convention in-app.

**Scope (small — this is the polish chunk):**

- New page `/dashboard/team` (admins only). Lists `memberships` joined on `users` for the active org, renders name + email + derived role badge + last-seen-at.
- Badge legend links to a new `/docs/access-control` page that documents the three derived roles and the `linky:editor:*` prefix convention.
- No write actions — promotions happen in Clerk. We read; they write. Matches the Sprint 1 posture that Clerk is the source of truth for identity.

**Files touched:**

- `src/app/dashboard/team/page.tsx` (new)
- `src/lib/server/identity-repository.ts` (new helper: `listOrgMembers(orgId)`)
- `src/app/docs/access-control/page.tsx` (new)
- `src/app/docs/layout.tsx` (add sidebar entry)
- `README.md` (new section under "Trust & lifecycle policy" — "Access control model")

**Tests:**

- `listOrgMembers` filters by `clerk_org_id`, orders by role then name.
- Non-admin hitting `/dashboard/team` redirects to `/dashboard` (handled at the server-component layer).

---

## Rollout order

Chunks are ordered by dependency, not priority. Each merges to `main` behind no flag — the roll-forward story is one-way.

1. **A first.** Write path is invisible until we add UI; safe to ship standalone. Unblocks the migration rollout pattern in `linky-codebase/SKILL.md` → §Migrations + schema.
2. **C second.** Role-aware primitives without B or D would still be a correctness improvement. But the new `canAdminLinky` gate on `DELETE` is technically a tightening — flag it in the PR body.
3. **B third.** Needs Chunk A (events) and Chunk C (viewer gate) to be meaningful.
4. **D fourth.** Orthogonal to B; ordered last because the default-scope migration and the UI picker together are the largest diff.
5. **E last.** Pure polish; skippable if we're short on time and would otherwise ship Chunk D half-baked.

If we ship only Chunks A + C, the sprint is still a net positive — analytics data is being captured and roles are enforced. B and D can slip a week without breaking anything.

---

## Migrations touched

| # | File | Shape change |
|---|---|---|
| 005 | `launcher_events` table + indexes | Chunk A |
| 006 | `api_keys.scopes` JSONB column | Chunk D |

Both follow the migration discipline in `.cursor/skills/linky-codebase/SKILL.md` → §Migration rollout pattern: idempotent SQL, mirror into `db/schema.sql` in the same commit, apply to local dev first, then production via Neon MCP, then ship the code.

---

## New environment variables

- **`LINKY_DAILY_SALT`** (required once Chunk A ships) — 32-byte hex string used in `viewer_hash_day`. Must be the same across every app instance or unique-viewer counts fragment. Rotating it mid-day is safe (hashes from before the rotation remain internally consistent); rotating mid-sprint reboots the unique-viewer counters and is intentional.

`LINKY_RATE_LIMIT_*` already exists and is reused by `POST /api/links/:slug/events`.

---

## Open questions (resolve in the PR that introduces the affected chunk)

1. **Event write path for `/l/[slug]` when the Linky is anonymous + has no policy** — do we still write a view row? *Working answer: yes.* The owner doesn't exist so no one reads it, but skipping would create an asymmetric "policy-bearing Linkies get analytics; simple ones don't" gotcha when someone eventually claims.
2. **`viewer_hash_day` for signed-in viewers of org-owned Linkies** — do we hash `clerk_user_id` directly or hash `clerk_user_id || clerk_org_id`? *Working answer: `clerk_user_id` alone,* so a dashboard showing "unique viewers this week" can't be cross-referenced against an org member list to deanonymize. Tradeoff: we lose the ability to answer "how many distinct Acme employees clicked" — which is a viewer question and thus intentionally out of scope per posture bullet 9.
3. **Custom Clerk role mapping** — do we ship only `linky:editor` as a recognized prefix, or also `linky:viewer` and `linky:admin`? *Working answer: just `linky:editor`,* because `admin` would otherwise smuggle privilege-escalation behind a string; `viewer` is already the conservative default.
4. **Should scoped keys show a preview of what they can/can't do before minting?** *Working answer: yes,* one-line copy under the scope picker — "Read-only: can list and view Linkies; cannot edit or delete." Saves one support round trip.
5. **`DELETE` requiring `admin`** — is this a regression for teams where every `org:member` today can delete? *Working answer: yes, and the PR body will say so.* Delete is soft (row survives), deletes show up in audit via `linky_versions`, and the escape hatch is obvious (promote the user in Clerk). Tightening here lines up with how every other team tool treats "anyone can delete" → "admins can delete."

---

## Product-marketing signals

When Sprint 2.7 ships, update:

- **`README.md`** → Roadmap: flip `[ ] Analytics + access control` → `[x]`. Add a new "Access control" subsection under "Trust & lifecycle policy" that names the three derived roles. Add an "Analytics" subsection that names the two owner questions the instrumentation answers.
- **`.agents/product-marketing-context.md`** → Roadmap signals section: move analytics + access control from "Upcoming" to "Shipped."
- **`/docs/access-control`** (Chunk E) is the public-facing anchor for partner / evaluator questions.
- **Copy rule:** analytics language is **always** owner-framed ("did my audience arrive"), never viewer-framed. `plain-english-alternatives.md` and the brand voice rules in `linky-codebase/SKILL.md` already enforce this.

---

## Risks

| Risk | Mitigation |
|---|---|
| `waitUntil` not reliable under every Node runtime we deploy to | Fall back to `Promise.resolve().then(writeEvent).catch(log)`; the worst case is a dropped event, which is explicitly acceptable. |
| Chunk C tightens `DELETE` for existing orgs | Call out in PR body + README; the Clerk role model is the documented promotion path. |
| Unique-viewer hash makes fan-out debugging painful | Keep an internal dev-only `viewer_debug` env var that writes an additional plaintext `clerk_user_id` to logs only (never DB). Off by default in prod. |
| Scope migration defaults everyone to `links:write` | That's the correct default — no existing key should have its behavior changed. Shipping a read-only *new* key option is the whole point. |
| `launcher_events` table growth | Indexed by `(linky_id, occurred_at DESC)`. Retention is open for Sprint 3 along with paid plan tiers. Size to watch at ~10M rows — fine on Neon Pro. |

---

## Exit criteria

Sprint 2.7 is done when:

1. `npm run check` green on `main` with all five chunks merged.
2. A signed-in org admin can visit `/dashboard/links/<slug>/insights` and see views + rule breakdown + Open All rate for any Linky their org owns.
3. A signed-in `org:member` can visit the same URL and see the numbers, cannot edit, cannot delete, cannot manage keys.
4. An LLM holding a `links:read` API key can `GET /api/links/:slug/insights` but gets 403 on `PATCH`.
5. The Trust & lifecycle section of `README.md` names both new behaviors in prose, and the product-marketing context is in sync.
6. No new viewer-side tracker, cookie, or destination-tab hook was shipped.
