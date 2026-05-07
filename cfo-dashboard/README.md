# CFO Dashboard — Midwest Design Group LLC

A self-contained, browser-based CFO dashboard wired to live QuickBooks Online
data via the QuickBooks MCP. No hardcoded numbers — every value renders from
`data/snapshot.json`, which is rebuilt monthly from QuickBooks.

## What's in here

| Path | Purpose |
|---|---|
| `index.html` | Single-page dashboard, 7 tabs |
| `styles.css` | Dashboard styling |
| `app.js` | All formulas, filters, comparisons, forecasts, action flags |
| `data/snapshot.json` | The "live" data the dashboard reads |
| `data/raw/` | Raw QuickBooks API responses (saved per refresh) |
| `data/raw/months/` | Per-month verified P&L queries (used for monthly trend) |
| `scripts/build_snapshot.py` | Reduces raw QB responses to `snapshot.json` |
| `scripts/refresh.sh` | Orchestrates the monthly refresh |

## Tabs

1. **CFO Executive Summary** — KPIs, comparison deltas, critical alerts.
2. **P&L Dashboard** — full P&L with current vs comparison column and `$`/`%`
   variances. Includes the formula reference (Gross Profit, Margins, Variance).
3. **Date Filter & Period Comparison** — month-vs-month, quarter-vs-quarter,
   actual-vs-forecast tables. Live-recalculates from filter bar.
4. **Deep Dive Analysis** — revenue concentration, margin progression, and a
   cash-flow decomposition (operating / investing / financing).
5. **Forecast & Year-End Projection** — run-rate and forecast methodology with
   methodology callout.
6. **Trends** — multi-year revenue/GP/net charts plus the verified monthly
   detail table.
7. **Action Flags** — automatic flags: revenue decline, margin compression,
   expense spike, negative cash flow / position, A/R risk, forecast miss.

## Filters

- **Start date** / **End date**: drive the active period.
- **Period**: presets — YTD 2026 / FY 2025 / FY 2024 / Custom.
- **Compare to**: prior year, 2 years prior, year-end forecast, or none.
- **Revenue account / Expense category / Class / Location**: scaffolded for
  drill-down. Populated automatically when QB account-level data is present.

## Formulas (verified in `app.js`)

```
Gross Profit          = Revenue − COGS
Gross Margin %        = Gross Profit ÷ Revenue
Net Income            = Revenue − COGS − Operating Expenses
Net Margin %          = Net Income ÷ Revenue
Period Variance       = Current − Comparison
Variance %            = (Current − Comparison) ÷ |Comparison|
Year-End Run Rate     = (YTD Actual ÷ Completed Months) × 12
Year-End Forecast     = YTD Actual + (Avg Monthly × Remaining Months)
Year-End Cash         = Beginning + YTD CF + (Avg Monthly CF × Remaining)
2-yr CAGR             = (current / 2-yrs-prior)^(1/2) − 1
```

## How the data refreshes (monthly)

Run from this directory:

```bash
./scripts/refresh.sh prompt   # prints a prompt
./scripts/refresh.sh build    # rebuilds snapshot from raw files
```

The refresh flow:

1. Run `./scripts/refresh.sh prompt` — it prints a copy/paste-ready prompt
   that walks Claude Code (the only client with QuickBooks MCP access) through
   the API calls.
2. Paste the prompt into Claude Code. Claude pulls live P&L (annual and per
   month) and Cash Flow reports, saving each as a JSON file in `data/raw/`
   and `data/raw/months/`.
3. Run `./scripts/refresh.sh build` — `scripts/build_snapshot.py` reads the
   raw files, applies the formulas above, and writes `data/snapshot.json`.
4. Open `index.html` in a browser. The dashboard re-reads `snapshot.json` on
   page load and re-renders all 7 tabs.

To automate monthly: schedule a Claude Code session that runs the prompt on
the 1st of every month, commits the regenerated `snapshot.json`, and pushes.

## Why per-month queries

The QuickBooks MCP `profit-loss-quickbooks-account` tool returns a
`monthlyBreakdown` field on multi-month queries, but those values do not
reconcile to the same response's annual totals (verified empirically — the
sum of the monthly `totalIncome` for FY 2025 was −$1.4M while the annual
`totalIncome` was $40.5M). The annual top-level totals are accurate. To get
trustworthy monthly data, this dashboard runs an individual one-month query
per month and saves the verified totals in `data/raw/months/YYYY-MM.json`.

## Validation checklist (run before sharing)

- [ ] `data/snapshot.json` `periods.current.revenue` matches QB P&L for YTD.
- [ ] `data/snapshot.json` `periods.prior.netIncome` equals QB cash-flow
      "Net Income" line for FY 2025 (the QB P&L `netIncome` field is `0` for
      that year — a known MCP quirk, see the comment in `build_snapshot.py`).
- [ ] Each month in `data/raw/months/` matches QB's individual P&L for that
      month.
- [ ] Date filters re-render every tab (try YTD 2026 → FY 2025 → FY 2024).
- [ ] Compare-to selector swaps the comparison column on the P&L tab.
- [ ] Action flags fire at the documented thresholds.

## Local preview

```bash
python3 -m http.server 8000 --directory cfo-dashboard
# open http://localhost:8000/
```

(There's nothing to build — the dashboard is plain HTML/CSS/JS that fetches
`data/snapshot.json` over `file:` or HTTP.)
