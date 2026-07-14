---
allowed-tools: Read, Write, Bash(cd:*), Bash(python3:*), Bash(node:*), Bash(ls:*), Bash(date:*), Bash(./scripts/refresh.sh:*), mcp__Intuit_QuickBooks__company_info, mcp__Intuit_QuickBooks__profit_loss_quickbooks_account, mcp__Intuit_QuickBooks__cash_flow_quickbooks_account, mcp__Intuit_QuickBooks__benchmarking_quickbooks_account
argument-hint: [YYYY-MM-DD as-of date, default today]
description: Pull live QuickBooks data via the QuickBooks MCP and rebuild the CFO dashboard snapshot.json
---

# CFO Dashboard Refresh

Pull live QuickBooks Online data via the **QuickBooks MCP**, write it into `cfo-dashboard/data/raw/`, and rebuild `cfo-dashboard/data/snapshot.json` (and the standalone HTML/Excel). This is the **interactive, human-in-the-loop** refresh for **Midwest Design Group LLC** — the on-demand equivalent of the daily headless cron (`.github/workflows/cfo-dashboard-refresh.yml` → `scripts/refresh-quickbooks.mjs`). As-of date: **$ARGUMENTS**

## Purpose

The CFO dashboard renders entirely from `snapshot.json` — it never calls QuickBooks itself. Only Claude Code (with the QuickBooks MCP) can pull live data. Run this when you want a fresh dashboard on demand (month close, board prep, a quick "where are we"), or when the nightly cron failed and you want to re-pull by hand. It replaces the old copy-paste dance (`./scripts/refresh.sh prompt`) with one command.

Relationship to existing tooling: this command performs the **same pull plan and writes the same raw files** as `scripts/refresh-quickbooks.mjs`, then reuses the tested Python builders. Keep the two consistent — if the pull plan changes here, change it there too.

## Preconditions

1. **QuickBooks MCP must be connected** in this session. Confirm by calling `company_info` (no args) and checking it returns "Midwest Design Group LLC". If the MCP is not available, **stop** and tell the user to enable the QuickBooks MCP — do not fabricate numbers.
2. Working directory is the repo root; all paths below are under `cfo-dashboard/`.
3. `python3` is available (the builders are Python).
4. **As-of date**: use `$ARGUMENTS` if provided (must be `YYYY-MM-DD`), else today (UTC). Call it `AS_OF`. Derive `CUR = year(AS_OF)`, `PRIOR = CUR-1`, `PRIOR2 = CUR-2`.

## Tool reference (QuickBooks MCP)

Tool ids are `mcp__<server>__<name>` — the `<server>` segment may differ per session (e.g. `Intuit_QuickBooks`). Use these tools:

| Logical name | Args | Returns |
|---|---|---|
| `company_info` | none | connection / company sanity check |
| `profit_loss_quickbooks_account` | `periodStart`, `periodEnd` (YYYY-MM-DD) | full P&L report incl. top-level `totalIncome`, `grossProfit`, `totalExpenses`, `netIncome`, `periodStart`, `periodEnd` |
| `cash_flow_quickbooks_account` | `periodStart`, `periodEnd` | cash-flow report incl. `operatingActivities`, `investingActivities`, `financingActivities`, `netCashIncrease`, `cashAtBeginning`, `cashAtEnd`, and working-capital rows |
| `benchmarking_quickbooks_account` | `aggregationPeriod:"yearly"`, `metricType:"profit"` | industry benchmark (non-fatal if it fails) |

## Process

### Step 1 — Verify connection
Call `company_info`. Confirm "Midwest Design Group LLC". Compute `AS_OF`, `CUR`, `PRIOR`, `PRIOR2`.

### Step 2 — Pull the five period reports
Call the tools and save each result **verbatim** with the Write tool (pretty-printed JSON):

1. P&L `PRIOR2-01-01 → PRIOR2-12-31` → `cfo-dashboard/data/raw/pl_<PRIOR2>.json`
2. P&L `PRIOR-01-01 → PRIOR-12-31` → `cfo-dashboard/data/raw/pl_<PRIOR>.json`
3. P&L `CUR-01-01 → AS_OF` → `cfo-dashboard/data/raw/pl_<CUR>_ytd.json`
4. Cash Flow `CUR-01-01 → AS_OF` → `cfo-dashboard/data/raw/cf_current.json` *(minimal shape, Step 4)*
5. Cash Flow `PRIOR-01-01 → PRIOR-12-31` → `cfo-dashboard/data/raw/cf_prior.json` *(minimal shape)*

Save P&L reports as the **full** tool result (the builder reads both the top-level totals and the row tree). Save cash-flow in the **minimal shape** below.

### Step 3 — Pull the last 13 completed months
For each of the 13 completed months before `AS_OF` (most recent first is fine), call P&L for that month (`YYYY-MM-01 → YYYY-MM-<lastday>`) and save the **minimal month shape** to `cfo-dashboard/data/raw/months/YYYY-MM.json`:
```json
{ "periodStart": "YYYY-MM-01", "periodEnd": "YYYY-MM-DD",
  "totalIncome": 0, "totalCogs": 0, "grossProfit": 0,
  "totalExpenses": 0, "netIncome": 0 }
```
13 months guarantees the trend tab always has 12+ even at the start of a month.

### Step 4 — Cash-flow minimal shape
Reduce each cash-flow result to exactly this shape before writing. Build `workingCapital` by matching row labels (case-insensitive `contains`) to keys:

```json
{
  "periodStart": "...", "periodEnd": "...",
  "reportTitle": "...", "companyName": "Midwest Design Group LLC",
  "operatingActivities": 0, "investingActivities": 0, "financingActivities": 0,
  "netCashIncrease": 0, "cashAtBeginning": 0, "cashAtEnd": 0,
  "netIncome": 0,
  "workingCapital": {
    "accountsPayableChange": 0, "accountsReceivableChange": 0,
    "retainageReceivableChange": 0, "inventoryDrywallChange": 0,
    "wipOverbillingsChange": 0, "wipUnderbillingsChange": 0,
    "accruedBonusesChange": 0, "accruedPayrollChange": 0,
    "lineOfCreditDraw": 0, "lineOfCreditCapXChange": 0
  }
}
```
Label→key map: `accounts payable`→accountsPayableChange, `accounts receivable`→accountsReceivableChange, `retainage receivable`→retainageReceivableChange, `drywall inventory`→inventoryDrywallChange, `overbilling`→wipOverbillingsChange, `underbilling`→wipUnderbillingsChange, `accrued bonuses`→accruedBonusesChange, `accrued payroll`→accruedPayrollChange, `line of credit`→lineOfCreditDraw, `cap x loc`→lineOfCreditCapXChange. `netIncome` = the "Net Income" row's value. Omit keys whose row is absent (don't invent zeros for missing rows).

### Step 5 — Benchmark (non-fatal)
Call `benchmarking_quickbooks_account` (`aggregationPeriod:"yearly"`, `metricType:"profit"`) → `cfo-dashboard/data/raw/benchmark.json`. If it errors, log it and continue — it is optional.

### Step 6 — Rebuild snapshot + distributables
From `cfo-dashboard/`, run the build directly (mirrors the cron, includes benchmark):
```bash
cd cfo-dashboard
python3 scripts/build_snapshot.py \
  --pl-current data/raw/pl_<CUR>_ytd.json \
  --pl-prior  data/raw/pl_<PRIOR>.json \
  --pl-prior-2 data/raw/pl_<PRIOR2>.json \
  --cf-current data/raw/cf_current.json \
  --cf-prior   data/raw/cf_prior.json \
  --benchmark  data/raw/benchmark.json \
  --months-dir data/raw/months \
  --as-of <AS_OF> \
  --out data/snapshot.json
python3 scripts/build_distributables.py   # optional: standalone HTML + Excel
```
(`./scripts/refresh.sh build` also works but omits the benchmark — prefer the explicit call above.)

### Step 7 — Verify and report
Read `cfo-dashboard/data/snapshot.json` and confirm `asOf` matches `AS_OF` and `periods.current.revenue` is non-zero. Then print the report below. If `periods.prior.netIncome` is 0, note it — the builder back-fills it from cash flow (a known QuickBooks P&L quirk), so mention that it was reconciled.

## Output Format

```
CFO Dashboard Refresh ✅  (as of <AS_OF>)
────────────────────────────────────────────
Source:   QuickBooks Online (live, via QuickBooks MCP)
Pulled:   3 P&L periods, 2 cash-flow periods, <N> months, benchmark <ok|skipped>

KPIs (YTD <CUR> vs FY <PRIOR>)
  Revenue        $<cur>    ( <±%> vs prior )
  Gross Profit   $<cur>    ( GM <cur%> vs <prior%> )
  Net Income     $<cur>    ( NM <cur%> )
  Cash (ending)  $<cur>
  Year-end fcst  $<revenue>   (net $<net>)

Files written: data/raw/pl_*.json, cf_*.json, months/*.json, snapshot.json
Open cfo-dashboard/index.html to view (re-reads snapshot.json on load).
────────────────────────────────────────────
```
On failure:
```
CFO Dashboard Refresh ❌
Failed at: <step — e.g. "cash_flow_quickbooks_account CUR YTD">
Error:     <message>
Snapshot NOT rebuilt — data/raw/ left as-is from the last good run.
```

## Example

**`/cfo-refresh 2026-05-07`** — QB MCP connected, all pulls succeed:
> Verified Midwest Design Group LLC. AS_OF=2026-05-07, CUR=2026, PRIOR=2025, PRIOR2=2024.
> Pulled FY2024, FY2025, YTD2026 P&L; YTD2026 + FY2025 cash flow; 13 months; benchmark ok. Rebuilt snapshot.
> ```
> CFO Dashboard Refresh ✅  (as of 2026-05-07)
> ────────────────────────────────────────────
> Source:   QuickBooks Online (live, via QuickBooks MCP)
> Pulled:   3 P&L periods, 2 cash-flow periods, 13 months, benchmark ok
>
> KPIs (YTD 2026 vs FY 2025)
>   Revenue        $19,376,770   ( +38% vs prior )
>   Gross Profit   $5,267,781    ( GM 27.2% vs 24.9% )
>   Net Income     $1,661,588    ( NM 8.6% )
>   Cash (ending)  $-602,043
>   Year-end fcst  $46,504,000   (net ~$3,988,000)
>
> Files written: data/raw/pl_*.json, cf_*.json, months/*.json, snapshot.json
> Open cfo-dashboard/index.html to view.
> ────────────────────────────────────────────
> ```
> Note: FY2025 P&L netIncome came back 0 from QuickBooks and was reconciled from cash flow by the builder.

## Never Do

- **Never fabricate or estimate any figure.** Every number comes from a QuickBooks MCP call. If a required pull fails after a retry, stop and report — do not fill gaps with guesses or stale values.
- **Never edit `snapshot.json` by hand** or hand-edit numbers into `data/raw/`. Regenerate via the builder so the dashboard stays fully derived from source.
- **Never rebuild the snapshot if a *required* pull failed** (the three P&L or two cash-flow periods). Benchmark and any single month are non-fatal; the five period reports are not.
- **Never hardcode QuickBooks/Anthropic credentials, the MCP URL, or `QB_MCP_URL`** in committed files — the headless path reads them from env; this interactive path uses the session's MCP connection.
- **Never change the company, NAICS, or the pull plan** (3 P&L + 2 CF + 13 months) without also updating `scripts/refresh-quickbooks.mjs` — the two must stay in lockstep.
- Do not commit or push as part of this command unless the user asks — refreshing data and committing it are separate decisions.
