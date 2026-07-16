# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Golden Rules (read first)

These are the hard rules for this repo. When in doubt, follow these over any local habit:

- **Never hardcode secrets or infrastructure IDs.** API keys, tokens, DB URLs, Vercel/Discord/Supabase project & org IDs all go in `.env` (Node: `process.env`; Python: `os.environ`). Add a placeholder to `.env.example`. See Security Guidelines for the full policy.
- **Tests live in `cli-tool/`, not the root.** The root `npm test` is a no-op `echo`. Run `cd cli-tool && npm test` (Jest).
- **Deploy only via the deployer agent** (`npm run deploy`). Never `vercel --prod` by hand — the agent runs required pre-deploy checks (git status, API tests, auth).
- **Review every component change with the `component-reviewer` agent**, then regenerate the catalog with `python scripts/generate_components_json.py`. Copy `docs/components.json` → `dashboard/public/components.json` when the dashboard must serve it.
- **Don't break existing component installs** — preserve component names, paths, and frontmatter shape.
- **Use relative paths** (`.claude/scripts/`, `path.join()`), never absolute or home-dir paths, in committed code.
- **The finance dashboards read committed data, never live APIs.** Only Claude Code (via the QuickBooks/Knowify MCPs) pulls live data, into `cfo-dashboard/data/raw/`; the dashboards render from the built `snapshot.json`.

## Project Overview

This repository has **two distinct halves** that live side by side:

1. **Claude Code Templates** (upstream / `claude-code-templates`) — a Node.js CLI
   tool for managing Claude Code components (agents, commands, MCPs, hooks,
   settings, skills) plus an Astro dashboard, Vercel API endpoints, and
   Cloudflare Workers. This is the bulk of the codebase: `cli-tool/`,
   `dashboard/`, `api/`, `cloudflare-workers/`, `docs/`, `scripts/`.

2. **Finance & business tooling** (this fork's additions, for Longhorn
   Consultants / Midwest Design Group LLC) — self-contained dashboards and
   automations wired to live data via MCP servers:
   - `cfo-dashboard/` — CFO dashboard wired to QuickBooks Online (via the
     QuickBooks MCP).
   - `knowify-dashboard.html` + the `/knowify-report` command — Knowify
     (contractor project management) reporting and export automation.
   - `docu/` — a separate Docusaurus documentation site.
   - `templates/agent-teams/` — reusable agent-team definitions.

Most "component" workflows below concern half (1). The finance dashboards
(half 2) are largely standalone and documented in their own sections.

### Repository Layout

| Path | What it is |
|---|---|
| `cli-tool/` | The npm CLI (`claude-code-templates` / `cct`), component library under `cli-tool/components/`, tests |
| `dashboard/` | Astro + React dashboard serving `www.aitmpl.com` / `app.aitmpl.com`, all Astro API routes |
| `api/` | Legacy/standalone Vercel API functions (Discord, tracking) — see note in API section |
| `cloudflare-workers/` | Independent Workers: `docs-monitor`, `pulse` (weekly KPI report) |
| `docs/` | Generated `components.json` + legacy static HTML site + blog |
| `docu/` | Docusaurus documentation site (separate npm project, deploys to Vercel) |
| `cfo-dashboard/` | QuickBooks-wired CFO dashboard (HTML + React + Python build) |
| `knowify-dashboard.html` | Standalone Knowify dashboard |
| `templates/` | Agent-team templates (`agent-teams/agents/*.md`) |
| `database/migrations/` | SQL migrations for Neon (versions, command usage logs) |
| `scripts/` | Python/JS generators, deploy + predeploy scripts |
| `.claude/` | Project agents, commands, hooks, `launch.json` for this repo |
| `.claude-plugin/marketplace.json` | Plugin marketplace manifest |
| `.mcp.json` | Project MCP servers (Linear, Neon) |
| `schedule.json` | Scheduled job: runs `/knowify-report` daily at 23:35 (CFO refresh is scheduled separately via `cfo-dashboard-refresh.yml`) |

## Essential Commands

```bash
# Development (CLI lives in cli-tool/)
npm install                    # Install root dependencies
cd cli-tool && npm test        # Run the Jest test suite (root `npm test` is a no-op)
npm version patch|minor|major  # Bump version (run in cli-tool/ for the published pkg)
npm publish                    # Publish to npm (see Publishing Workflow)

# Component catalog
python scripts/generate_components_json.py  # Update docs/components.json

# Dashboards / sites
cd dashboard && npx astro dev --port 4321   # Astro dashboard + APIs
cd docu && yarn start                        # Docusaurus docs site
npm run deploy                               # Deploy via deployer agent (preferred)
```

## Security Guidelines

### ⛔ CRITICAL: NEVER Hardcode Secrets or IDs

**NEVER write API keys, tokens, passwords, project IDs, org IDs, or any identifier in code.** This includes Vercel project/org IDs, Supabase URLs, Discord IDs, database connection strings, and any other infrastructure identifier. ALL must go in `.env`.

```javascript
// ❌ WRONG
const API_KEY = "AIzaSy...";

// ✅ CORRECT
const API_KEY = process.env.GOOGLE_API_KEY;
```

**When creating scripts with API keys:**
1. Use `process.env` (Node.js) or `os.environ.get()` (Python)
2. Load from `.env` file using `dotenv`
3. Add variable to `.env.example` with placeholder
4. Verify `.env` is in `.gitignore`

**If you accidentally commit a secret:**
1. Revoke the key IMMEDIATELY
2. Generate new key
3. Update `.env`
4. Old key is compromised forever (git history)

## Component System

### Component Types

**Agents** (600+) - AI specialists for development tasks
**Commands** (200+) - Custom slash commands for workflows
**MCPs** (55+) - External service integrations
**Settings** (60+) - Claude Code configuration files
**Hooks** (39+) - Automation triggers
**Templates** (14+) - Complete project configurations

### Installation Patterns

```bash
# Single component
npx claude-code-templates@latest --agent frontend-developer
npx claude-code-templates@latest --command setup-testing
npx claude-code-templates@latest --hook automation/simple-notifications

# Batch installation
npx claude-code-templates@latest --agent security-auditor --command security-audit --setting read-only-mode

# Interactive mode
npx claude-code-templates@latest
```

### Component Development

#### Adding New Components

**CRITICAL: Use the component-reviewer agent for ALL component changes**

When adding or modifying components, you MUST use the `component-reviewer` subagent to validate the component before committing:

```
Use the component-reviewer agent to review [component-path]
```

**Component Creation Workflow:**

1. Create component file in `cli-tool/components/{type}/{category}/{name}.md`
2. Use descriptive hyphenated names (kebab-case)
3. Include clear descriptions and usage examples
4. **REVIEW with component-reviewer agent** (validates format, security, naming)
5. Fix any issues identified by the reviewer
6. Run `python scripts/generate_components_json.py` to update catalog

**The component-reviewer agent checks:**
- ✅ Valid YAML frontmatter and required fields
- ✅ Proper kebab-case naming conventions
- ✅ No hardcoded secrets (API keys, tokens, passwords)
- ✅ Relative paths only (no absolute paths)
- ✅ Supporting files exist (for hooks with scripts)
- ✅ Clear, specific descriptions
- ✅ Correct category placement
- ✅ Security best practices

**Example Usage:**
```
# After creating a new agent
Use the component-reviewer agent to review cli-tool/components/agents/development-team/react-expert.md

# Before committing hook changes
Use the component-reviewer agent to review cli-tool/components/hooks/git/prevent-force-push.json

# For PR reviews with multiple components
Use the component-reviewer agent to review all modified components in cli-tool/components/
```

The agent will provide prioritized feedback:
- **❌ Critical Issues**: Must fix before merge (security, missing fields)
- **⚠️ Warnings**: Should fix (clarity, best practices)
- **📋 Suggestions**: Nice to have improvements

#### Statuslines with Python Scripts

Statuslines can reference Python scripts that are auto-downloaded to `.claude/scripts/`:

```javascript
// In src/index.js:installIndividualSetting()
if (settingName.includes('statusline/')) {
  const pythonFileName = settingName.split('/')[1] + '.py';
  const pythonUrl = githubUrl.replace('.json', '.py');
  additionalFiles['.claude/scripts/' + pythonFileName] = {
    content: pythonContent,
    executable: true
  };
}
```

### Publishing Workflow

```bash
# 1. Update component catalog
python scripts/generate_components_json.py

# 2. Run tests
npm test

# 3. Check current npm version and align local version
npm view claude-code-templates version  # check latest on registry
# Edit package.json version to be one patch above the registry version

# 4. Commit version bump and push
git add package.json && git commit -m "chore: Bump version to X.Y.Z"
git push origin main

# 5. Publish to npm (requires granular access token with "Bypass 2FA" enabled)
npm config set //registry.npmjs.org/:_authToken=YOUR_GRANULAR_TOKEN
npm publish
npm config delete //registry.npmjs.org/:_authToken  # always clean up after

# 6. Tag the release
git tag vX.Y.Z && git push origin vX.Y.Z

# 7. Deploy website
vercel --prod
```

**npm Publishing Notes:**
- Classic npm tokens were revoked Dec 2025. Use **granular access tokens** from [npmjs.com/settings/~/tokens](https://www.npmjs.com/settings/~/tokens)
- The token must have **Read and Write** permissions for `claude-code-templates` and **"Bypass 2FA"** enabled
- Always remove the token from npm config after publishing (`npm config delete`)
- The local `package.json` version may drift from npm if published from CI — always check `npm view claude-code-templates version` first
- Never hardcode or commit tokens

## API Architecture

### Critical Endpoints

API endpoints live as Astro API routes in `dashboard/src/pages/api/`:

**`/api/track-download-supabase`** (CRITICAL)
- Tracks component downloads for analytics
- Used by CLI on every installation
- Database: Supabase (component_downloads table)

**`/api/discord/interactions`**
- Discord bot slash commands
- Features: /search, /info, /install, /popular

**`/api/claude-code-check`**
- Monitors Claude Code releases
- Vercel Cron: every 30 minutes
- Database: Neon (claude_code_versions, claude_code_changes, discord_notifications_log, monitoring_metadata tables)

### Shared API Libraries

- `dashboard/src/lib/api/cors.ts` — CORS headers, `corsResponse()`, `jsonResponse()`
- `dashboard/src/lib/api/neon.ts` — Neon client factory
- `dashboard/src/lib/api/auth.ts` — Clerk JWT verification
- `dashboard/src/lib/api/changelog-parser.ts` — Claude Code changelog parser

### Emergency Rollback

```bash
vercel ls                              # List deployments
vercel promote <previous-deployment>   # Rollback
```

## Cloudflare Workers

The `cloudflare-workers/` directory contains Cloudflare Worker projects that run independently from Vercel.

### docs-monitor

Monitors https://code.claude.com/docs for changes every hour and sends Telegram notifications.

```bash
cd cloudflare-workers/docs-monitor
npm run dev          # Local dev
npx wrangler deploy  # Deploy
```

### pulse (Weekly KPI Report)

Collects metrics from GitHub, Discord, Supabase, Vercel, and Google Analytics every Sunday at 14:00 UTC and sends a consolidated report via Telegram.

**Architecture:** Single `index.js` file (no npm dependencies at runtime). All source collectors, formatter, and Telegram sender in one file.

**Cron:** `0 14 * * 0` (Sundays 14:00 UTC / 11:00 AM Chile)

```bash
cd cloudflare-workers/pulse
npm run dev          # Local dev
npx wrangler deploy  # Deploy

# Manual trigger
curl -X POST https://pulse-weekly-report.SUBDOMAIN.workers.dev/trigger \
  -H "Authorization: Bearer $TRIGGER_SECRET"

# Test single source
curl -X POST "https://pulse-weekly-report.SUBDOMAIN.workers.dev/trigger?source=github" \
  -H "Authorization: Bearer $TRIGGER_SECRET"

# Dry run (no Telegram)
curl -X POST "https://pulse-weekly-report.SUBDOMAIN.workers.dev/trigger?send=false" \
  -H "Authorization: Bearer $TRIGGER_SECRET"
```

**Secrets (Cloudflare):**
```bash
TELEGRAM_BOT_TOKEN          # Shared with docs-monitor
TELEGRAM_CHAT_ID            # Shared with docs-monitor
GITHUB_TOKEN                # GitHub PAT (public_repo scope)
SUPABASE_URL                # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY   # Supabase service role key
DISCORD_BOT_TOKEN           # Discord bot token
DISCORD_GUILD_ID            # Discord server ID
VERCEL_TOKEN                # Vercel personal access token (optional)
VERCEL_PROJECT_ID           # Vercel project ID (optional)
TRIGGER_SECRET              # For manual /trigger endpoint
GA_PROPERTY_ID              # GA4 property ID (optional)
GA_SERVICE_ACCOUNT_JSON     # Base64 service account (optional)
```

**Graceful degradation:** Each source catches its own errors. Missing secrets or API failures show `⚠️ Unavailable` instead of crashing the report.

## Dashboard (www.aitmpl.com)

Astro + React + Tailwind dashboard serving both `www.aitmpl.com` and `app.aitmpl.com`. Clerk auth for user collections. Source lives in `dashboard/`. All API endpoints are Astro API routes in the same project.

### Architecture

- **Framework**: Astro 5 with React islands, Tailwind v4, `output: 'server'`
- **Auth**: Clerk (`window.Clerk` global, no ClerkProvider per island)
- **Data**: `components.json` and `trending-data.json` served from `dashboard/public/` (same-origin)
- **APIs**: All endpoints in `dashboard/src/pages/api/` (Astro API routes, no separate serverless project)

### Vercel Project Setup

Single Vercel project serves all domains:

| Project | Domains | Root Directory |
|---------|---------|----------------|
| `aitmpl-dashboard` | `www.aitmpl.com`, `aitmpl.com` (redirect), `app.aitmpl.com` | `dashboard` |

The legacy root project (`aitmpl`) is archived — only its `.vercel.app` subdomain remains.

### Deployment

**ALWAYS use the deployer agent (`.claude/agents/deployer.md`) for all deployments.** It runs pre-deploy checks (auth, git status, API tests) and handles the full pipeline safely. Never deploy manually.

```bash
npm run deploy             # Deploy www + app.aitmpl.com
npm run deploy:dashboard   # Same as above
```

**CI/CD**: Pushes to `main` auto-deploy via GitHub Actions (`.github/workflows/deploy.yml`):
- Changes in `dashboard/**` trigger deploy

**Required GitHub Secrets** (Settings > Secrets > Actions):
- `VERCEL_TOKEN` — Vercel personal access token
- `VERCEL_ORG_ID` — Vercel org/team ID
- `VERCEL_DASHBOARD_PROJECT_ID` — Project ID for aitmpl-dashboard

### Environment Variables (Vercel)

```bash
# Clerk
PUBLIC_CLERK_PUBLISHABLE_KEY=xxx
CLERK_SECRET_KEY=xxx

# Data
PUBLIC_COMPONENTS_JSON_URL=/components.json

# GitHub OAuth
PUBLIC_GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx

# Supabase (download tracking)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Neon Database
NEON_DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Discord
DISCORD_APP_ID=xxx
DISCORD_BOT_TOKEN=xxx
DISCORD_PUBLIC_KEY=xxx
DISCORD_WEBHOOK_URL_CHANGELOG=https://discord.com/api/webhooks/xxx
```

### Known Issues & Solutions

**Node v24 breaks `fs.writeFileSync` on Vercel**
- Node v24 has a bug with `writeFileSync` in Vercel's build environment
- Solution: Dashboard project is pinned to Node 22.x (set via Vercel API/dashboard)

**Vercel CLI ignores local `.vercel/project.json`**
- The CLI often resolves to the parent directory's project. Use `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` env vars to force the correct project.

### Local Development

```bash
cd dashboard
npm install
npx astro dev --port 4321   # Dashboard + APIs at http://localhost:4321
```

## Data Files

### Component Catalog

- `docs/components.json` — Generated catalog (source of truth)
- `dashboard/public/components.json` — Copy served by the dashboard
- `dashboard/public/trending-data.json` — Trending/download stats

### Data Flow

1. `scripts/generate_components_json.py` scans `cli-tool/components/`
2. Generates `docs/components.json` with embedded content
3. Copy to `dashboard/public/components.json` for the dashboard to serve
4. Dashboard loads JSON and renders component cards
5. Download tracking via `/api/track-download-supabase`

### Legacy Static Site (docs/)

The `docs/` directory contains the old static HTML site (no longer deployed to www). Blog articles in `docs/blog/` are still referenced externally.

### Blog Article Creation

Use the CLI skill to create blog articles:

```bash
/create-blog-article @cli-tool/components/{type}/{category}/{name}.json
```

This automatically:
1. Generates AI cover image
2. Creates HTML with SEO optimization
3. Updates `docs/blog/blog-articles.json`

## CFO Dashboard (`cfo-dashboard/`)

A self-contained, browser-based CFO dashboard for **Midwest Design Group LLC**,
wired to live QuickBooks Online data via the **QuickBooks MCP**. Every value
renders from `data/snapshot.json` — there are **no hardcoded numbers**.

### Structure

| Path | Purpose |
|---|---|
| `index.html` / `styles.css` / `app.js` | Single-page dashboard (7 tabs); `app.js` holds all formulas, filters, comparisons, forecasts, action flags |
| `data/snapshot.json` | The "live" data the dashboard reads |
| `data/raw/*.json` | Raw QuickBooks API responses, saved per refresh |
| `data/raw/months/*.json` | Per-month verified P&L queries (monthly trend) |
| `scripts/build_snapshot.py` | Reduces raw QB responses into `snapshot.json` |
| `scripts/build_distributables.py` | Builds standalone HTML + Excel under `downloads/` |
| `scripts/refresh.sh` | Orchestrates the monthly refresh |
| `react/CFODashboard.jsx` | Drop-in React version; auto-loads `snapshot.json` |
| `react/snapshotAdapter.js` | Maps `snapshot.json` into the React component's shape |
| `ACCOUNT_MAP.md` | Audit map: every QuickBooks account → dashboard tab/KPI |

### Refreshing the data

Three ways to refresh, all producing the same `data/snapshot.json`:

1. **`/cfo-refresh` (preferred, interactive)** — run the slash command in a
   Claude Code session with the QuickBooks MCP enabled. It pulls the 3 P&L
   periods, 2 cash-flow periods, last 13 months, and benchmark into
   `data/raw/`, rebuilds `snapshot.json`, and reports KPI deltas. See
   `.claude/commands/cfo-refresh.md`.
2. **Nightly cron (headless)** — `.github/workflows/cfo-dashboard-refresh.yml`
   runs `scripts/refresh-quickbooks.mjs` (needs `ANTHROPIC_API_KEY`, `QB_MCP_URL`).
   `/cfo-refresh` mirrors this script's exact pull plan — **keep the two in
   lockstep** if either changes.
3. **Manual fallback** — `./scripts/refresh.sh prompt` prints a copy/paste
   prompt; `./scripts/refresh.sh build` rebuilds `snapshot.json` from existing
   `data/raw/` files (no QuickBooks calls).

```bash
cd cfo-dashboard
./scripts/refresh.sh build    # rebuild snapshot.json from existing raw files
# Open index.html (re-reads snapshot.json on load)
```

**Only Claude Code (or the headless script) has QuickBooks MCP access** — the
dashboard itself never calls QuickBooks directly. Keep `data/raw/` as the
verifiable source of truth; all formulas are documented in both `README.md`
and `ACCOUNT_MAP.md`.

### Recurring data refreshes (at a glance)

| Command | Refreshes | Scheduled by | On-demand |
|---|---|---|---|
| `/cfo-refresh` | CFO dashboard `snapshot.json` from QuickBooks | `cfo-dashboard-refresh.yml` (GitHub Actions cron) | run `/cfo-refresh` |
| `/knowify-report` | Knowify Advanced Jobs Report → AJR Reports folder | `schedule.json` (daily 23:35) | run `/knowify-report` |

Both are finance/ops automations for Midwest Design Group LLC and both require
their respective MCP/credentials to be present in the session that runs them.

## Knowify Integration

Tooling for **Knowify** (contractor project management) for Midwest Design
Group LLC.

- `knowify-dashboard.html` — standalone dashboard (open in a browser).
- `.claude/commands/knowify-report.md` (the `/knowify-report` command) —
  automates exporting the Advanced Jobs report via Playwright browser
  automation and saves it to the AJR Reports folder. Requires
  `KNOWIFY_USERNAME` / `KNOWIFY_PASSWORD` env vars.
- `schedule.json` runs `/knowify-report` daily at 23:35 (cron `35 23 * * *`).
- A **Knowify MCP** is also available in some sessions for direct data access
  (company is Midwest Design Group LLC, time zone America/Indianapolis).

## Docusaurus Site (`docu/`)

A **separate** Docusaurus documentation project (its own `package.json`,
`vercel.json`, and `docusaurus.config.ts`). Do not confuse it with the legacy
`docs/` static site or the `cli-tool/docs_to_claude/` Docusaurus content.

```bash
cd docu
yarn          # install
yarn start    # local dev server
yarn build    # static build → build/
```

## Project Claude Config (`.claude/`)

This repo ships its own Claude Code configuration:

- **`.claude/agents/`** — project agents including `component-reviewer`,
  `deployer`, `catalog-generator`, `blog-writer`, the `*-expert` component
  authors, and `linear-tracker`. Use them as directed elsewhere in this file.
- **`.claude/commands/`** — slash commands: `cfo-refresh` (rebuild the CFO
  dashboard from QuickBooks), `knowify-report`, `create-blog-article`,
  `lint`, `test`, `cleanup-cache`, and the `worktree-*` family
  (`worktree-init`, `worktree-check`, `worktree-deliver`, `worktree-cleanup`)
  for parallel multi-task development.
- **`.claude/hooks/telegram-pr-webhook.py`** — sends a Telegram notification
  (with PR + Vercel preview URLs) when a PR is created via `gh pr create`.
  Needs `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`.
- **`.claude/launch.json`** — launches the dashboard (`astro dev --port 4321`).
- **`.mcp.json`** — project MCP servers: **Linear** and **Neon**.

## Database Migrations (`database/migrations/`)

SQL migrations for the Neon database, applied in numeric order:

- `001_create_claude_code_versions.sql` — Claude Code release tracking
- `002_create_command_usage_logs.sql` — CLI command usage logs

## Code Standards

### Path Handling
- Use relative paths: `.claude/scripts/`, `.claude/hooks/`
- Never hardcode absolute paths or home directories
- Use `path.join()` for cross-platform compatibility

### Naming Conventions
- Files: `kebab-case.js`, `PascalCase.js` (for classes)
- Functions/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Components: `hyphenated-names`

### Error Handling
- Use try/catch for async operations
- Provide helpful error messages
- Log errors with context
- Implement fallback mechanisms

## Testing

The Jest suite lives in `cli-tool/` (root `npm test` is a no-op `echo`):

```bash
cd cli-tool
npm test                 # Run all tests (jest)
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run test:unit        # tests/unit only
npm run test:integration # tests/integration only
npm run test:e2e         # tests/e2e only
```

Aim for 70%+ test coverage. Test critical paths and error handling.

## Common Issues

**API endpoint returns 404 after deploy**
- API routes must be in `dashboard/src/pages/api/` as Astro API routes
- Export named HTTP methods: `export const POST: APIRoute`, `export const GET: APIRoute`

**Download tracking not working**
- Check Vercel logs: `vercel logs aitmpl.com --follow`
- Verify environment variables in Vercel dashboard
- Test endpoint manually with curl

**Components not updating on website**
- Run `python scripts/generate_components_json.py`
- Copy `docs/components.json` to `dashboard/public/components.json`
- Deploy and clear browser cache

## Important Notes

- **Component catalog**: Always regenerate after adding/modifying components
- **API tests**: Required before production deploy (breaks download tracking)
- **Secrets**: Never commit API keys (use environment variables)
- **Paths**: Use relative paths for all project files
- **Backwards compatibility**: Don't break existing component installations
