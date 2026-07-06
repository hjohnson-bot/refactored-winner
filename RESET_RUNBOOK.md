# Reset Runbook — Safe Full Reset of Claude Sessions

**Prepared:** 2026-07-06 · **For:** Hunter Johnson (Longhorn Consultants / Midwest Design Group LLC)
**Purpose:** You want a clean slate across Claude chats, Cowork, and Claude Code sessions. This runbook maps everything that currently runs or produces output, tells you exactly what a reset can break (only two things), and gives you an ordered checklist so nothing you rely on disappears.

---

## 1. The one-paragraph answer

A full reset is safer than it feels. Of everything running today, **only two automations depend on your Claude setup**: the nightly `/knowify-report` schedule and the QuickBooks MCP authorization behind the CFO dashboard's daily refresh. Everything else — all 10 GitHub Actions workflows and both Cloudflare Workers — keeps its secrets in GitHub or Cloudflare and is completely untouched by anything you do to Claude. Protect those two, export your chat history, decide on the 8 stale draft PRs, and you can reset with confidence.

---

## 2. Inventory map — everything that runs

| # | Automation | Trigger | Output goes to | Credentials it needs | Breaks on Claude reset? |
|---|---|---|---|---|---|
| 1 | `/knowify-report` nightly export | **Claude schedule** — `schedule.json`, cron `35 23 * * *` (11:35 PM daily) | OneDrive → `…/Finance/Knowify Reports/AJR Reports/Advanced Job Report MM.DD.YYYY.xlsx` | `KNOWIFY_USERNAME`, `KNOWIFY_PASSWORD` env vars + Playwright skill | **YES** |
| 2 | CFO dashboard daily refresh | GitHub Actions `cfo-dashboard-refresh.yml`, crons `0 8 * * *` + `0 9 * * *` (gated to 4 AM ET) | Commits `cfo-dashboard/data/snapshot.json`, `downloads/cfo-dashboard.html`, `downloads/cfo-dashboard.xlsx` | GitHub secrets `ANTHROPIC_API_KEY` (required), `QB_MCP_URL` (optional) | **PARTIALLY** — workflow survives, but the QuickBooks MCP OAuth it depends on is authorized from a Claude session and expires (100-day inactivity / 365-day max) |
| 3 | CFO dashboard interactive refresh | Manual — paste `./scripts/refresh.sh prompt` output into a Claude session with the QuickBooks MCP | `cfo-dashboard/data/raw/`, then `snapshot.json` | QuickBooks MCP connector on your Claude account | **YES** (if you rely on it) |
| 4 | components.json nightly update | GitHub Actions `update-json-data.yml`, cron `0 3 * * *` | Commits updated catalog/download stats | GitHub secrets (`SUPABASE_URL`, `SUPABASE_API_KEY`) | No |
| 5 | Discord daily posts (×4) | GitHub Actions, crons 14:00–17:00 UTC | Discord channels | GitHub secrets (`DISCORD_WEBHOOK_URL_*`) | No |
| 6 | Vercel deploy | GitHub Actions `deploy.yml`, on push to main under `dashboard/**` | www.aitmpl.com / app.aitmpl.com | GitHub secrets (`VERCEL_*`) | No |
| 7 | npm publish / release notify / component security validation | GitHub Actions, manual dispatch / release / PR | npm, Discord, CI checks | GitHub secrets | No |
| 8 | docs-monitor | **Cloudflare cron**, hourly (`0 * * * *`) | Telegram notification on Claude docs changes | Cloudflare secrets (wrangler) | No |
| 9 | pulse weekly KPI report | **Cloudflare cron**, Sundays 14:00 UTC | Telegram report (GitHub/Discord/Supabase/Vercel/GA metrics) | Cloudflare secrets (wrangler) | No |
| 10 | Telegram PR webhook hook | Claude hook on `gh pr create` (`.claude/hooks/telegram-pr-webhook.py`) | Telegram message with PR + preview URLs | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | **VERIFY** — not wired into any settings.json in this repo; if it fires today it's registered in your local/global Claude settings on your Mac |

**Gap to be aware of:** the root `.env.example` does not list `KNOWIFY_USERNAME`, `KNOWIFY_PASSWORD`, `ANTHROPIC_API_KEY`, or `QB_MCP_URL` — the four credentials the fragile automations actually need. Easy to miss when rebuilding an environment.

---

## 3. The two fragile items — exact re-creation steps

### 3a. Knowify nightly report

If your reset deletes the Claude Code environment or schedule that runs this, recreate it like so:

1. In the new/kept environment, set env vars `KNOWIFY_USERNAME` and `KNOWIFY_PASSWORD` (environment settings, never committed).
2. Ensure the Playwright skill is available (Chromium is pre-installed in Claude Code remote environments).
3. `schedule.json` at the repo root is the source of truth and survives in git:
   ```json
   { "run": "/knowify-report", "cron": "35 23 * * *" }
   ```
   Recreate the scheduled trigger pointing at this repo's environment (claude.ai/code → your environment → scheduled tasks / Routines), or ask a Claude Code session to "recreate the daily 11:35 PM /knowify-report trigger".
4. Verify: run `/knowify-report` once manually and confirm a fresh `Advanced Job Report MM.DD.YYYY.xlsx` lands in the OneDrive AJR Reports folder.

**Note:** the command writes to a macOS OneDrive path (`~/Library/CloudStorage/OneDrive-MidwestDesignGroup/…`), so the schedule must fire in an environment that can reach that path (or the command needs updating for the new environment).

### 3b. QuickBooks MCP authorization (feeds the CFO daily refresh)

1. The GitHub Action itself needs no Claude session — but its `ANTHROPIC_API_KEY` must belong to the **same Anthropic account** that authorized the QuickBooks MCP, and Intuit's OAuth expires after 100 days of inactivity or 365 days maximum.
2. After a reset, re-connect the QuickBooks connector on your claude.ai account (Settings → Connectors), authorizing against Midwest Design Group LLC.
3. Confirm GitHub secrets exist at `Settings → Secrets and variables → Actions`: `ANTHROPIC_API_KEY` (as of this audit it appears **never to have been set** — the 4 AM refresh has been failing silently; PR #14 adds a preflight check + a 10-second setup-check workflow for exactly this) and optionally `QB_MCP_URL` (defaults to `https://ai-inc.quickbooks.intuit.com/v1/mcp`).
4. Verify: manually dispatch "CFO Dashboard — Daily QuickBooks Refresh" in the Actions tab and confirm a fresh snapshot commit with today's `asOf` date.

---

## 4. Open PR backlog — verdicts (recommendations only, nothing has been closed)

All 8 open PRs are drafts based on `claude/setup-code-templates-5xNfM`. Several are duplicate work from parallel sessions — the exact tangle prompting this reset.

| PR | What it is | Verdict |
|---|---|---|
| **#15** Instruction-files overhaul (+ validator script, `/finance-refresh`) | Duplicates #13's audit, adds a reusable validator | **Pick ONE of #13/#15** — they rewrite the same 24 files and cannot both merge. #15 is the more complete audit (validator + workflow table); #13 uniquely contains real CFO pipeline bug fixes. Recommended: merge **#15**, then cherry-pick #13's `refresh.sh`/`refresh-quickbooks.mjs` bug fixes (nulled dashboard tabs, hardcoded 2026 filename) as a small follow-up. Close the other. |
| **#13** Instruction-files audit + `/cfo-refresh` + pipeline fixes | Duplicates #15's audit; has unique pipeline bug fixes | See above — don't merge both. |
| **#14** Daily-refresh setup UX (preflight secret check, setup-check workflow) | Solves the missing-`ANTHROPIC_API_KEY` problem properly | **Merge** — still relevant until the secret is set and verified. |
| **#12** Manual QB data refresh as of 2026-06-30 | One-time data refresh from a session that had QB MCP auth | **Close** — data is now a week stale; superseded by the daily Action once #14 + the secret land. Merging old financials over newer ones would be a regression. |
| **#9** useDashboardState hook + reducer | Standalone dashboard code, compiles clean | **Keep** — merge if you still want the dashboard work; harmless. |
| **#7** Reporting-inventory drop-zone scaffold (for Steve's inventory) | Cloud scaffold awaiting a local-Mac session to populate | **Keep open only if the Steve inventory is still live**; otherwise close — it's a runway to work that may have been overtaken by events. |
| **#6** FP&A construction workflow (pipeline + agents + commands) | Complete, tested feature | **Decide by intent**: merge if you want FP&A tooling in this repo; if you split finance into its own repo (see §6), retarget it there instead. |
| **#5** Indy 500 Monte Carlo | May one-off; the race has run | **Close** — keep the script by merging first only if you want it in history. |

---

## 5. Pre-reset checklist (do in this order)

1. **Export your claude.ai data** — claude.ai → Settings → Privacy → Export data. This is the only copy of your chat history; nothing in this repo can recover it. Cowork and Claude Code session transcripts on your Mac live under `~/.claude/projects/` — copy that folder too if you want local session history.
2. **Capture the live trigger list** — open claude.ai/code → Routines/scheduled tasks (or ask any interactive Claude Code session to run `list_triggers`) and screenshot/save it. *This session could not read it — the account-level call requires interactive approval — so treat the schedule.json knowify trigger as confirmed and check for any others you've forgotten.*
3. **Confirm the reset-safe secrets are where they should be** — GitHub repo → Settings → Secrets → Actions (and note `ANTHROPIC_API_KEY` is likely missing — see §3b); Cloudflare dashboard → Workers → docs-monitor / pulse-weekly-report → secrets. A Claude reset never touches these.
4. **Check your Mac's global Claude settings** for the Telegram PR hook (`~/.claude/settings.json`) — if registered there, note it for re-adding.
5. **Settle the PR backlog** per §4 (merge #14 and one of #13/#15 first; close #5 and #12).
6. **Verify env vars to carry forward**: `KNOWIFY_USERNAME`, `KNOWIFY_PASSWORD` (Claude environment), `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (if using the hook).
7. **Then reset** — archive/delete old chats, sessions, and environments as you see fit.
8. **Post-reset re-authorization** — reconnect connectors you actually use: QuickBooks (critical — §3b), plus Gmail, Google Calendar, Google Drive, Granola, Linear, Figma, and any others; Neon was already unauthenticated at audit time. Recreate the knowify trigger (§3a) and run one manual verification of each of the two fragile automations.

---

## 6. Fresh-start guide — so this doesn't happen again

The tangle had three causes: parallel sessions doing overlapping work with no shared record, a repo mixing two unrelated purposes, and PRs living forever as drafts. Countermeasures:

1. **One repo, one purpose.** This repo is two things at once: the upstream `claude-code-templates` fork *and* your Longhorn/MDG finance tooling (`cfo-dashboard/`, `knowify-dashboard.html`, `mdg-powerbi/`, `fpa/`). Strongly consider splitting the finance work into its own private repo — sessions scoped to a finance repo can't wander into template-library work and vice versa. (Flagged only; not done in this PR.)
2. **Fix the default branch.** Everything currently bases off `claude/setup-code-templates-5xNfM` — a session-named branch acting as `main`. After settling the PR backlog, rename it to `main` (or merge it into `main`) so future sessions have an unambiguous base.
3. **One task, one session, one branch, one PR — and PRs don't stay drafts.** Merge or close within days. Two of your eight drafts were the same work done twice because neither session could see the other's PR was already open; a quick "check open PRs before starting" habit (or asking each session to do it) prevents this.
4. **`schedule.json` + this runbook are the source of truth for recurring jobs.** Any new scheduled task gets a line in the §2 table in the same commit that creates it. If it's not in the table, it doesn't exist.
5. **Complete `.env.example`** with placeholder entries for `KNOWIFY_USERNAME`, `KNOWIFY_PASSWORD`, `ANTHROPIC_API_KEY`, `QB_MCP_URL` so environment rebuilds are copy-paste.
6. **Name sessions by project**, not by whatever the first message was — "CFO dashboard: June refresh" beats letting the tool auto-name, and makes the session list scannable when you're deciding what to archive.

---

## Appendix — load-bearing file reference

| File | Why it matters |
|---|---|
| `schedule.json` | The knowify nightly trigger definition |
| `.claude/commands/knowify-report.md` | The export automation itself (Playwright flow, OneDrive path, filename rules) |
| `.github/workflows/cfo-dashboard-refresh.yml` | Daily 4 AM ET QuickBooks refresh |
| `cfo-dashboard/scripts/refresh.sh`, `scripts/refresh-quickbooks.mjs`, `DAILY_REFRESH.md` | The three CFO refresh paths and their runbook |
| `cloudflare-workers/{docs-monitor,pulse}/wrangler.toml` | Cloudflare cron definitions |
| `.claude/hooks/telegram-pr-webhook.py` | PR notification hook (verify registration locally) |
| `.mcp.json` | Repo-level MCP servers (Linear, Neon); QuickBooks/Knowify are account-level connectors instead |
| `.env.example` | Incomplete — see §6.5 |
