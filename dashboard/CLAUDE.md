# CLAUDE.md — Dashboard

Astro + React + Tailwind dashboard serving `www.aitmpl.com` and `app.aitmpl.com`.
All API endpoints are Astro API routes in this same project (`src/pages/api/`),
not a separate serverless project. Clerk auth uses the `window.Clerk` global —
there is no `ClerkProvider` per React island.

## Critical Endpoints

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

## Data

`components.json` and `trending-data.json` are served from `public/` (same-origin).
`docs/components.json` at the repo root is the generated source of truth — regenerate
it with `python scripts/generate_components_json.py`, then copy it to
`dashboard/public/components.json`.

## Environment variables

Vercel env vars are listed in `.env.example`. Never commit real values.
