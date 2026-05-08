# Daily QuickBooks refresh — operations guide

Every day at **4:00 AM US Eastern Time** (year-round, DST-aware), GitHub
Actions:

1. Calls Anthropic's Messages API with the QuickBooks MCP server attached
2. Pulls FY 2024, FY 2025, YTD current year, current cash flow, prior cash
   flow, the last 13 individual months, and the industry benchmark
3. Writes raw files to `cfo-dashboard/data/raw/`
4. Rebuilds `cfo-dashboard/data/snapshot.json`
5. Rebuilds `cfo-dashboard/downloads/cfo-dashboard.html` and
   `cfo-dashboard.xlsx`
6. Commits the diff back to the branch and pushes

Workflow file: `.github/workflows/cfo-dashboard-refresh.yml`
Refresh script: `cfo-dashboard/scripts/refresh-quickbooks.mjs`

## How "4 AM Eastern, year-round" actually works

GitHub Actions cron is UTC-only, so the workflow registers two triggers:

| Cron (UTC) | Eastern Time |
|---|---|
| `0 8 * * *` | 4 AM EDT (March – November, daylight time) |
| `0 9 * * *` | 4 AM EST (November – March, standard time) |

The first step (`should-run`) checks `TZ=America/New_York date +%H` and
exits early if the current Eastern hour isn't `04`. So exactly one of the
two scheduled runs actually executes the refresh on any given day, no
matter where in the DST cycle we are.

Manual runs from **Actions → CFO Dashboard — Daily QuickBooks Refresh →
Run workflow** bypass the gate and always execute.

## Required GitHub secrets

Set these once at **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | An Anthropic API key with permission to use MCP. |
| `QB_MCP_URL` | The QuickBooks MCP server URL — defaults to `https://ai-inc.quickbooks.intuit.com/v1/mcp` if unset. |

The Anthropic API key must belong to the same Anthropic account that
authenticated against the QuickBooks MCP. The MCP server keeps the OAuth
token associated with your Anthropic account; the daily cron just calls
through with your API key and the MCP fetches data using the stored
OAuth token.

If the QB OAuth token expires (Intuit's refresh tokens are valid 100 days
of inactivity, 365 days max), the cron will fail until you re-authenticate
in a Claude Code or ChatGPT session. The failure surfaces as a non-zero
exit in the Actions log and the artifact upload contains the partial
snapshot for triage.

## What the cron commits

Each successful run produces a single commit on the workflow's target
branch (default: the repo's default branch):

```
chore(cfo-dashboard): daily QuickBooks refresh 2026-05-08
```

That commit changes only files under:

- `cfo-dashboard/data/raw/`     — raw QuickBooks pulls
- `cfo-dashboard/data/snapshot.json` — derived dashboard data
- `cfo-dashboard/downloads/cfo-dashboard.html` — standalone HTML
- `cfo-dashboard/downloads/cfo-dashboard.xlsx` — Excel workbook

If a run produces no diff (very unlikely — at minimum the `generatedAt`
timestamp changes), the commit step exits cleanly without committing.

## Concurrency

The workflow uses a `cfo-dashboard-refresh` concurrency group with
`cancel-in-progress: false`. If a manual run is dispatched while the
scheduled run is in flight, the manual run waits for the scheduled one
to finish — the two never overlap and clobber each other's commits.

## Watching it

- **Actions tab**: every run is logged here, including the early-exit
  "not 4 AM ET" runs which take ~5 seconds each.
- **Artifacts**: each run uploads `cfo-dashboard-${run_id}` containing
  `snapshot.json` + `cfo-dashboard.html` + `cfo-dashboard.xlsx`. Useful
  for debugging the rare case where the commit step fails.
- **Commit history**: filter on `cfo-dashboard-bot` to see all the
  daily refreshes.

## Manual operations

```bash
# Run the headless refresh locally (same as the cron does)
cd cfo-dashboard
ANTHROPIC_API_KEY=sk-ant-… QB_MCP_URL=https://ai-inc.quickbooks.intuit.com/v1/mcp \
  ./scripts/refresh.sh cron

# Just rebuild from existing raw files (no QuickBooks calls)
./scripts/refresh.sh build

# Print the prompt for an interactive Claude Code refresh
./scripts/refresh.sh prompt
```

Set `AS_OF=YYYY-MM-DD` env var to override the as-of date (e.g. for
month-end runs at 11:59 PM the previous day).

## Disabling the schedule

Comment out the two `- cron:` lines in
`.github/workflows/cfo-dashboard-refresh.yml`. The `workflow_dispatch`
trigger keeps manual runs available.
