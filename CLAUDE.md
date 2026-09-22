# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

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

Directory-specific guidance lives in nested `CLAUDE.md` files
(`cli-tool/`, `dashboard/`, `cloudflare-workers/`, `cfo-dashboard/`,
`docu/`) and loads only when working in those trees.

## Essential Commands

```bash
# Development (CLI lives in cli-tool/)
npm install                    # Install root dependencies
cd cli-tool && npm test        # Run the Jest test suite (root `npm test` is a no-op)
npm version patch|minor|major  # Bump version (run in cli-tool/ for the published pkg)
npm publish                    # Publish to npm (see the publish-npm-package skill)

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

### Component Development

**CRITICAL: Use the component-reviewer agent for ALL component changes**

When adding or modifying components, you MUST use the `component-reviewer` subagent to validate the component before committing:

```
Use the component-reviewer agent to review [component-path]
```

Then run `python scripts/generate_components_json.py` to update the catalog.
See `cli-tool/CLAUDE.md` for the full creation workflow.

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

Use the `publish-npm-package` skill (`.claude/skills/publish-npm-package/SKILL.md`)
for the full release sequence and the npm token requirements.

## API Architecture

API endpoints live as Astro API routes in `dashboard/src/pages/api/`.
See `dashboard/CLAUDE.md` for the critical endpoints and their databases.

### Emergency Rollback

```bash
vercel ls                              # List deployments
vercel promote <previous-deployment>   # Rollback
```

## Dashboard (www.aitmpl.com)

Astro + React + Tailwind dashboard serving both `www.aitmpl.com` and `app.aitmpl.com`. Clerk auth for user collections. Source lives in `dashboard/`. All API endpoints are Astro API routes in the same project.

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

**Only Claude Code has QuickBooks MCP access** — the dashboard itself never
calls QuickBooks directly. Keep `data/raw/` as the verifiable source of truth;
all formulas are documented in both `README.md` and `ACCOUNT_MAP.md`.

See `cfo-dashboard/CLAUDE.md` for the monthly refresh flow.

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

A **separate** Docusaurus documentation project. Do not confuse it with the
legacy `docs/` static site or the `cli-tool/docs_to_claude/` Docusaurus content.
See `docu/CLAUDE.md`.

## Code Standards

### Path Handling
- Use relative paths: `.claude/scripts/`, `.claude/hooks/`
- Never hardcode absolute paths or home directories
- Use `path.join()` for cross-platform compatibility

## Testing

The Jest suite lives in `cli-tool/` — **root `npm test` is a no-op `echo`**.
Run `cd cli-tool && npm test`; see `cli-tool/package.json` for the
watch/coverage/unit/integration/e2e variants.

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
