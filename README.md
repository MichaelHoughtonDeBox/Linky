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

- Create short slugs backed by Postgres
- Public create API with basic IP rate limiting
- Launcher page with popup-blocking guidance and manual fallback links
- Agent-friendly CLI output with `--json`
- Programmatic package API for scripts and agent tools

## Architecture

```text
Skill / WebUI / CLI / SDK / curl
        |
        v
POST /api/links  --->  Postgres (slug -> url bundle)
        |
        v
   /l/[slug] launcher page
```

## Quick Start (Local)

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

Copy `.env.example` to `.env.local` and set values.

Required:
- `DATABASE_URL`
- `LINKY_BASE_URL`

Optional:
- `LINKY_RATE_LIMIT_WINDOW_MS`
- `LINKY_RATE_LIMIT_MAX_REQUESTS`

### 3) Create database schema

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

### 4) Start the app

```bash
npm run dev
```

App defaults to `http://localhost:4040`.

## API

### `POST /api/links`

Create a new Linky and return a short URL.

Request:

```json
{
  "urls": ["https://example.com", "https://example.org"],
  "source": "cli"
}
```

Response:

```json
{
  "slug": "x8q2m4k",
  "url": "https://getalinky.com/l/x8q2m4k"
}
```

Production `curl` example:

```bash
# Create a Linky directly through the production public API.
curl -X POST "https://getalinky.com/api/links" \
  -H "content-type: application/json" \
  --data-binary '{
    "urls": [
      "https://example.com",
      "https://example.org"
    ],
    "source": "agent",
    "metadata": {
      "task": "launch-two-links"
    }
  }'
```

Common errors:
- `400`: invalid payload (URLs, metadata)
- `429`: rate limit exceeded
- `500`: server/database issue

## Skill Install (for model workflows)

Install the Linky skill from this repository:

```bash
# Install the Linky skill from the GitHub repository.
npx skills add https://github.com/MichaelHoughtonDeBox/linky --skill linky
```

Verify the skill is installed:

```bash
# List installed skills and confirm `linky` appears.
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
- `--json` machine-readable output

Examples:

```bash
linky create https://example.com https://example.org --base-url https://getalinky.com
echo "https://example.com" | linky create --stdin --json --base-url https://getalinky.com
```

## Package API (for agents and scripts)

```js
const { createLinky } = require("@linky/linky");

const result = await createLinky({
  // Point the SDK at the production Linky deployment.
  urls: ["https://example.com", "https://example.org"],
  baseUrl: "https://getalinky.com",
  source: "agent",
});

// Print the final short Linky URL.
console.log(result.url);
```

## Deployment

### Vercel + Managed Postgres

1. Deploy this repo to Vercel.
2. Attach a managed Postgres database.
3. Set env vars in Vercel project settings:
   - `DATABASE_URL`
   - `LINKY_BASE_URL` (`https://getalinky.com` in production)
   - `LINKY_RATE_LIMIT_WINDOW_MS` (optional)
   - `LINKY_RATE_LIMIT_MAX_REQUESTS` (optional)
4. Add your custom domain in Vercel and point DNS records.

## Roadmap

- Custom domains per user/workspace
- Custom aliases (re-introduced with domain ownership controls)
- Team/workspace access controls

## Development Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run check
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
