---
allowed-tools: Read, Write, Edit, Bash(python3:*), Bash(node:*), Bash(bash:*), Bash(git:*), Bash(gh:*), Bash(jq:*), Bash(ls:*), Bash(mkdir:*), Bash(date:*), Glob, Grep
argument-hint: "[all | cfo | powerbi | knowify] [--no-commit]"
description: Refresh every finance data product (CFO dashboard, MDG Power BI, Knowify), validate the numbers tie out, and ship the update as a draft PR
---

# Finance Refresh

One command for the ritual you otherwise do by hand: pull fresh financial data, rebuild every downstream artifact, prove the numbers tie out, and ship it. This is the single most-repeated workflow in this repo — treat it as production.

## Sources

| Source | Refresh mechanism | Rebuilds |
|--------|-------------------|----------|
| `cfo` | QuickBooks MCP tools if connected in this session; else `cfo-dashboard/scripts/refresh-quickbooks.mjs` (needs `ANTHROPIC_API_KEY`); else reuse existing `data/raw/` and rebuild only | `cfo-dashboard/data/snapshot.json`, `downloads/cfo-dashboard.html`, `downloads/cfo-dashboard.xlsx` via `build_snapshot.py` + `build_distributables.py` |
| `powerbi` | `mdg-powerbi/scripts/refresh_safe.py` then `validate_refresh.py` (see `mdg-powerbi/SOP_Automated_Refresh.md`) | `mdg-powerbi/output/` artifacts |
| `knowify` | The `/knowify-report` command's flow (browser export; needs `KNOWIFY_USERNAME`/`KNOWIFY_PASSWORD`) | Advanced Job Report .xlsx |

## Process

### Step 1: Scope and preflight

1. Parse `$ARGUMENTS`: default `all`; `cfo`/`powerbi`/`knowify` selects one; `--no-commit` skips Step 5.
2. For each selected source, check its prerequisites (MCP connected / env vars / scripts exist). A source with missing prerequisites is marked **SKIPPED (reason)** — it never aborts the whole run.
3. Record `date -u +%F` as AS_OF and stash the pre-refresh values you'll diff against (current `snapshot.json` revenue/GP/net, file mtimes).

### Step 2: Refresh each source (independent — one failure never kills the others)

- **cfo**: prefer live MCP pulls (P&L for FY-2/FY-1/YTD, cash flow current+prior, individual months, benchmark) written to `cfo-dashboard/data/raw/`; then `python3 cfo-dashboard/scripts/build_snapshot.py` with the standard args (see `cfo-dashboard/DAILY_REFRESH.md`), then `python3 cfo-dashboard/scripts/build_distributables.py` (needs `pip install openpyxl` if missing).
- **powerbi**: `python3 mdg-powerbi/scripts/refresh_safe.py`, then `python3 mdg-powerbi/scripts/validate_refresh.py`. Non-zero exit = FAILED with the validator's message.
- **knowify**: run the `/knowify-report` flow. Environment guard rules from that command apply.

Wrap each source in its own error handling; capture stdout tail for the report.

### Step 3: Validate (the tie-out checklist — ALL must pass for a source to be ✅)

For `cfo` (run against the fresh `snapshot.json` with `jq`/`python3`):
1. Revenue, COGS, OpEx, Net all present and non-null for current + prior periods.
2. **GP = Revenue − COGS** (to the cent).
3. **GM% = GP ÷ Revenue** (±0.0001).
4. **NM% = Net ÷ Revenue** (±0.0001).
5. Forecast consistency: `yearEndRevenue = ytdRevenue + avgMonthlyRevenue × remainingMonths` (±$1).
6. `verifiedMonths[]` months each satisfy checks 2–4 individually.
7. `asOf` equals today.

For `powerbi`: `validate_refresh.py` exit 0 is the contract — plus confirm output artifacts' mtimes are newer than the run start.

For `knowify`: exported file exists, is non-empty, has today's date in the name.

A source with any failed check is **❌ FAILED** and its changes are excluded from the commit (revert its files with `git checkout -- <paths>` if needed).

### Step 4: Report (always, exactly this format)

```
Finance Refresh — <AS_OF>
────────────────────────────────────────────────────────
Source    Status      Key deltas                    Checks
cfo       ✅ OK        Rev $19.4M→$21.2M (+9.3%)     7/7
powerbi   ✅ OK        3 artifacts rebuilt           validator: 0
knowify   ⏭ SKIPPED    no credentials in session     —
────────────────────────────────────────────────────────
Committed: <branch>  ·  PR: <url> | not committed (--no-commit) | nothing passed
```

Below the table: one line per skipped/failed source explaining exactly what's missing and the single action that fixes it.

### Step 5: Ship (unless `--no-commit`)

1. Only if **at least one source is ✅** and you are not on the default branch's protected tip: create/switch to `finance-refresh/<AS_OF>`.
2. Stage ONLY the passing sources' files (`cfo-dashboard/data/`, `cfo-dashboard/downloads/`, `mdg-powerbi/output/`).
3. Commit: `chore(finance): refresh <sources> — <AS_OF>` with the tie-out results in the body.
4. Push and open a **draft PR** (`gh pr create --draft` or the GitHub MCP) with the Step 4 table as the body.

## Example of a great run

`/finance-refresh cfo`
```
Finance Refresh — 2026-07-06
────────────────────────────────────────────────────────
Source    Status   Key deltas                        Checks
cfo       ✅ OK     Rev $19.38M→$22.71M · GM 27.2%→26.8%   7/7
────────────────────────────────────────────────────────
Committed: finance-refresh/2026-07-06 · PR: https://github.com/…/pull/17
```
Follow-up: "GM compressed 0.4pt — the Margin Compression flag will show on the dashboard. Prior snapshot was 60 days stale; trend tabs now have 2 more verified months."

## Do NOT

- Do NOT commit a source whose tie-out checks failed — a dashboard with wrong numbers is worse than a stale one.
- Do NOT touch any file outside `cfo-dashboard/`, `mdg-powerbi/`, and the knowify export destination.
- Do NOT hardcode credentials, API keys, or company IDs anywhere — env vars and MCP auth only (CLAUDE.md security rules apply in full).
- Do NOT push directly to the default branch — always the dated branch + draft PR.
- Do NOT fabricate deltas — every number in the report must come from diffing the actual before/after files.
- Do NOT retry a failed source more than once per run.
