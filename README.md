<p align="center">
  <img src="./public/github-header-minimal.svg" alt="Linky header" width="100%" />
</p>

# Linky

Linky turns many URLs into one short launch link.

Hosted production URL: `https://getalinky.com`

Use it from:
- a Cursor skill (`skills/linky`)
- the web app (`/`)
- the CLI (`linky create ...`)
- the npm package API (`createLinky(...)`)
- direct HTTP (`POST /api/links`)

The short URL resolves to `/l/[slug]`, where users click **Open All** to launch each tab.

## Features

- **Anonymous creation** — public API + CLI + skill + web with basic IP rate limiting. No account required to ship a Linky.
- **Accounts (Clerk)** — users, organizations, team-owned Linkies, SSO-ready.
- **Editable Linkies** — rename, re-order URLs, add per-URL notes/tags/open policies, soft-delete. Every edit is captured as an append-only version.
- **Claim flow** — agents can create a Linky on your behalf and return a claim URL; clicking it binds ownership to your Clerk account in one click.
- **Billing scaffold (Stripe direct)** — Stripe Customers minted per user and per organization, webhook pipeline ready for plans.
- **Launcher page** with popup-blocking guidance and manual fallback links.
- **Agent-friendly CLI** with `--json`, `--email` (for the claim flow), and coloured TTY output.
- **Programmatic SDK** for scripts and agent tools.

## Architecture

```text
Skill / WebUI / CLI / SDK / curl / agent handoff
        |
        v
POST /api/links  ---> Neon Postgres (linkies + users + orgs + versions + claim_tokens)
        |
        v
   /l/[slug] public launcher
        |
   /dashboard (signed-in)
        |
   /claim/[token]  (agent → human handoff)
```

## Quick Start (Local)

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

Copy `.env.example` to `.env.local` (if it exists locally) or create `.env.local` with these variables:

```bash
# Required — core
DATABASE_URL=postgresql://...              # Neon connection string, or local Postgres
LINKY_BASE_URL=http://localhost:4040       # Public base URL used by API + launcher

# Required — Clerk (https://dashboard.clerk.com)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/signin
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup

# Required — Stripe (https://dashboard.stripe.com)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SIGNING_SECRET=whsec_...

# Optional — rate-limit overrides (anonymous /api/links only)
LINKY_RATE_LIMIT_WINDOW_MS=60000
LINKY_RATE_LIMIT_MAX_REQUESTS=30
```

#### Wiring webhooks

In the Clerk dashboard, create a webhook endpoint pointing at
`${LINKY_BASE_URL}/api/webhooks/clerk` and subscribe to every `user.*`,
`organization.*`, and `organizationMembership.*` event. Copy the signing
secret into `CLERK_WEBHOOK_SIGNING_SECRET`.

In the Stripe dashboard, create a webhook endpoint at
`${LINKY_BASE_URL}/api/webhooks/stripe`. Subscribe to
`customer.subscription.created|updated|deleted` (no state changes happen
yet in Sprint 1, but the endpoint verifies signatures and logs events).
Copy the signing secret into `STRIPE_WEBHOOK_SIGNING_SECRET`.

For local webhook testing, use [`svix`](https://docs.svix.com/receiving/testing-with-the-cli)
(Clerk) and [`stripe listen --forward-to`](https://docs.stripe.com/webhooks#test-webhook)
(Stripe) to tunnel events to `localhost:4040`.

### 3) Create or upgrade the database schema

Fresh database:

```bash
npm run db:schema
```

Existing database (applies every file in `db/migrations/` in order, idempotently):

```bash
npm run db:migrate
```

See `db/migrations/README.md` for how to author new migrations.

### 4) Start the app

```bash
npm run dev
```

App defaults to `http://localhost:4040`.

## API

### `POST /api/links` (public)

Create a new Linky and return a short URL. Stays open to anonymous callers;
ownership is attributed automatically when a Clerk session is present.

Request:

```json
{
  "urls": ["https://example.com", "https://example.org"],
  "source": "cli",
  "title": "Release review bundle",
  "description": "Open everything needed for the 2026.04 standup.",
  "urlMetadata": [
    { "note": "PR under review", "tags": ["eng"] },
    { "note": "Preview deploy", "openPolicy": "desktop" }
  ],
  "email": "alice@example.com"
}
```

Response:

```json
{
  "slug": "x8q2m4k",
  "url": "https://getalinky.com/l/x8q2m4k",
  "claimUrl": "https://getalinky.com/claim/B6p...",
  "claimExpiresAt": "2026-05-16T12:00:00.000Z"
}
```

`claimUrl` and `claimExpiresAt` are returned only for anonymous creates.
Signed-in callers already own the Linky and do not need them.

Errors:
- `400`: invalid payload (URLs, metadata, email, URL count exceeds plan limit)
- `429`: rate limit exceeded
- `500`: server/database issue

### `PATCH /api/links/:slug` (owner-only)

Edit a Linky. Every edit inserts a row into `linky_versions` so history
is never lost. Request body (all fields optional, at least one required):

```json
{
  "title": "Release review (v2)",
  "description": null,
  "urls": ["https://example.com"],
  "urlMetadata": [{ "note": "rebuilt" }]
}
```

### `DELETE /api/links/:slug` (owner-only)

Soft-deletes the Linky. The public `/l/:slug` resolver returns 404
afterwards.

### `GET /api/me/linkies` (signed-in)

Paginated list of the active subject's Linkies. Query params: `limit`
(default 20, max 100), `offset`.

### `GET /api/linkies/:slug/versions` (owner-only)

Append-only edit history for an owned Linky.

### `POST /api/webhooks/clerk` + `POST /api/webhooks/stripe`

Service-to-service endpoints. Verify signatures; reject unsigned requests.
Clerk events upsert users/orgs/memberships into Neon. Stripe events are
logged (entitlement updates arrive when paid plans launch).

Production `curl` example:

```bash
# Create a Linky directly through the production public API.
curl -X POST "https://getalinky.com/api/links" \
  -H "content-type: application/json" \
  --data-binary '{
    "urls": ["https://example.com", "https://example.org"],
    "source": "agent",
    "metadata": { "task": "launch-two-links" }
  }'
```

## Skill Install (for model workflows)

```bash
# Install the Linky skill from the GitHub repository.
npx skills add https://github.com/MichaelHoughtonDeBox/linky --skill linky
```

Verify:

```bash
npx skills list
```

## CLI

The package ships a `linky` command.

```bash
linky create <url1> <url2> [url3] ... [options]
```

Options:
- `--base-url <url>` Linky API/web base URL
- `--stdin` read additional URLs from stdin
- `--email <address>` flag this Linky to be claimed by the given email after the recipient signs in
- `--title <string>` optional title stored with the Linky
- `--description <string>` optional description stored with the Linky
- `--json` machine-readable output

Examples:

```bash
linky create https://example.com https://example.org
linky create https://example.com --email alice@example.com --title "Standup bundle"
echo "https://example.com" | linky create --stdin --json
```

When `--email` is used on an anonymous call, the CLI prints a `Claim this
Linky by signing in:` section with a claim URL. Clicking it (or sharing
it with the named recipient) lets them bind ownership to their account.

## Package API

```js
const { createLinky } = require("@linky/linky");

const result = await createLinky({
  urls: ["https://example.com", "https://example.org"],
  baseUrl: "https://getalinky.com",
  source: "agent",
  email: "alice@example.com",       // optional; enables claim flow
  title: "Release review",          // optional
  description: "Standup context",   // optional
  urlMetadata: [                    // optional; aligned with urls[]
    { note: "PR", tags: ["eng"] },
    { note: "Preview", openPolicy: "desktop" },
  ],
});

console.log(result.url);       // always present
console.log(result.claimUrl);  // present only for anonymous creates
```

## Claim Flow (agent → human handoff)

The agent-first moment Sprint 1 unlocks: an agent creates a Linky on your
behalf, then sends you a claim URL. One click and the Linky is yours.

1. Agent calls `POST /api/links` (or uses the CLI / SDK) without a Clerk
   session. The backend creates the Linky anonymously and mints a
   `claim_token` row with a 30-day expiry.
2. Response includes `claimUrl` (`/claim/<token>`). The CLI prints it in
   green; the SDK returns it; the web UI renders a "Keep this Linky for
   later" card.
3. User visits `/claim/<token>`:
   - **Signed-out**: landing page with Sign-in / Sign-up CTAs that
     round-trip back to the claim URL via `redirect_url`.
   - **Signed-in**: token is consumed atomically and the user is
     redirected to `/dashboard/linkies/<slug>` as the new owner.
4. Org context takes precedence — if the user has an active Clerk org
   when claiming, ownership is attributed to the org.

Expired / already-consumed / orphaned tokens render dedicated messaging
so failures are explainable. Claiming is a no-op on Linkies that already
have an owner (prevents a race from transferring a claimed Linky a
second time).

## Deployment

### Vercel + Neon

1. Deploy this repo to Vercel.
2. Attach a Neon Postgres database (or any managed Postgres).
3. Run `npm run db:schema` (fresh) or `npm run db:migrate` (upgrade) against
   the production database.
4. Set env vars in Vercel project settings (see the Quick Start list above,
   omitting rate-limit overrides unless you need them).
5. In Clerk + Stripe dashboards, create webhook endpoints pointing at
   `https://<your-domain>/api/webhooks/clerk` and `.../stripe` with the
   signing secrets that match the env vars.
6. Add your custom domain in Vercel and point DNS records.

## Roadmap

- [x] **Accounts + editable Linkies + per-URL metadata** — Sprint 1.
- [ ] **Analytics + access control** — team plan foundation.
- [ ] **First-class MCP server + "linky session" convention** — other frameworks can adopt; publish the spec.
- [ ] **Cursor / Claude / ChatGPT-native skills** — emit a Linky at the end of every task.
- [ ] **Browser extension** — tab-group capture and restore.
- [ ] **Identity-aware URL resolution** — same Linky, different tabs per viewer. Sprint 2's magic demo.

## Development Commands

```bash
npm run dev        # Start the Next.js dev server on :4040
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run test       # vitest (unit tests)
npm run test:watch # vitest in watch mode
npm run build      # Next.js production build
npm run check      # lint + typecheck + test
npm run db:schema  # Apply db/schema.sql (fresh install)
npm run db:migrate # Apply db/migrations/*.sql in order (upgrade existing DB)
```

## Contributing

See `CONTRIBUTING.md`.

## GitHub Stars

If Linky is useful, star the repository to help more builders discover it.

[![GitHub stars](https://img.shields.io/github/stars/MichaelHoughtonDeBox/linky?style=flat-square)](https://github.com/MichaelHoughtonDeBox/linky/stargazers)

## Contributors

Contributions of all sizes are welcome.

[![GitHub contributors](https://img.shields.io/github/contributors/MichaelHoughtonDeBox/linky?style=flat-square)](https://github.com/MichaelHoughtonDeBox/linky/graphs/contributors)

[![Contributors](https://contrib.rocks/image?repo=MichaelHoughtonDeBox/linky)](https://github.com/MichaelHoughtonDeBox/linky/graphs/contributors)

## License

MIT (`LICENSE`).
