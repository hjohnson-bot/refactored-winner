# Account → Tab Linked Map

For every QuickBooks account, report, and cash-flow line, this document
states which dashboard tab and KPI consumes it. Use it to audit any number
on the dashboard back to its QuickBooks source.

The data flow has three layers:

```
QuickBooks Online
       │
       ▼  (live, via QuickBooks MCP)
data/raw/*.json  ─────────────────────────────►  Section 1
       │
       ▼  scripts/build_snapshot.py
data/snapshot.json  ──────────────────────────►  Section 2
       │
       ▼  app.js
index.html (7 tabs)  ─────────────────────────►  Section 4 (flags) + Section 2
```

Section 3 documents which raw QuickBooks accounts roll into which snapshot
bucket — useful when you're holding a printed QB P&L and want to know
where a single line item lives on the dashboard.

---

## 1. QuickBooks API → raw files (ingestion layer)

Each row is one MCP call. `scripts/refresh.sh prompt` walks Claude Code
through the same calls every month. Schema-extraction logic lives in
`scripts/build_snapshot.py:32-102`.

| MCP tool | Period | Raw file | Fields the build script reads |
|---|---|---|---|
| `profit-loss-quickbooks-account` | YTD current year | `data/raw/pl_2026_ytd.json` | `totalIncome`, `grossProfit`, `totalExpenses`, `netIncome` |
| `profit-loss-quickbooks-account` | FY 2025 | `data/raw/pl_2025.json` | same; `netIncome=0` quirk → back-filled from `cf_prior.json` Net Income line |
| `profit-loss-quickbooks-account` | FY 2024 | `data/raw/pl_2024.json` | same |
| `profit-loss-quickbooks-account` | per individual month | `data/raw/months/YYYY-MM.json` | same → each row becomes one entry in `verifiedMonths[]` |
| `cash-flow-quickbooks-account` | YTD current year | `data/raw/cf_current.json` | `operatingActivities`, `investingActivities`, `financingActivities`, `netCashIncrease`, `cashAtBeginning`, `cashAtEnd`, plus the **Net Income** line under Operating Activities |
| `cash-flow-quickbooks-account` | FY 2025 | `data/raw/cf_prior.json` | same |

> The QB MCP P&L tool's `monthlyBreakdown` field on multi-month queries does
> not reconcile to its own annual totals. Treat it as unreliable — always
> use individual-month queries (`data/raw/months/`) for trend data.

---

## 2. snapshot.json field → tab + KPI (rendering layer)

Cell content is the rendering target on each tab (DOM `id` for KPIs,
descriptive text for table cells). `—` means the field is not surfaced on
that tab. Source: `app.js` render functions and `index.html` element IDs.

| `snapshot.json` path | Exec | P&L | Compare | Deep Dive | Forecast | Trends | Flags |
|---|---|---|---|---|---|---|---|
| `periods.current.revenue` | `#kpi-revenue` | Revenue row | Revenue row + YoY | Rev concentration | — | Annual revenue bars + margin trend | Revenue decline flag |
| `periods.current.cogs` | — | COGS row | — | Rev concentration | — | — | — |
| `periods.current.grossProfit` | `#kpi-gp` | GP row | GP row + YoY | Rev concentration | — | Annual GP bars + margin trend | — |
| `periods.current.grossMarginPct` | `#kpi-gm-pct` | GM% row | GM% row + YoY | Rev concentration | — | Margin trend table | Margin compression / expansion flags |
| `periods.current.operatingExpenses` | `#kpi-opex` | OpEx row | OpEx row + YoY | Rev concentration | — | — | Expense spike flag |
| `periods.current.netIncome` | `#kpi-net` | Net row | Net row + YoY | Rev concentration | — | Annual net bars + margin trend | Forecast miss flag |
| `periods.current.netMarginPct` | `#kpi-nm-pct` | NM% row | NM% row + YoY | Rev concentration | — | Margin trend table | Forecast miss flag |
| `periods.current.periodStart/periodEnd` | `#exec-period-label` | `#pnl-period-label` | filter defaults | — | — | — | — |
| `periods.prior.*` | comparison delta on every KPI (when comparison=prior-year) | comparison column | "Prior period" col | "FY 2025" col | — | "FY 2025" row | YoY threshold inputs |
| `periods.prior2.*` | comparison delta (when comparison=prior-2) | comparison column | "2 periods ago" col | — | — | "FY 2024" row | 2-yr CAGR input |
| `cashFlow.current.cashEnding` | `#kpi-cash` | — | — | Cash flow tbody | — | — | Negative cash position flag |
| `cashFlow.current.cashBeginning` | — | — | — | Cash flow tbody | — | — | inputs to cash-position flag |
| `cashFlow.current.netCashChange` | — | — | — | Cash flow tbody | — | — | Negative net cash flow flag |
| `cashFlow.current.operating` / `investing` / `financing` | — | — | — | Cash flow tbody | — | — | Negative net cash flow flag inputs |
| `cashFlow.prior.cashEnding` | — | — | — | Cash flow tbody | — | — | A/R risk flag |
| `cashFlow.prior.{operating,investing,financing,netCashChange,cashBeginning}` | — | — | — | Cash flow tbody | — | — | — |
| `forecast.completedMonths` / `remainingMonths` | — | — | — | — | `#forecast-meta` | — | — |
| `forecast.ytdRevenue` / `ytdGrossProfit` / `ytdOperatingExpenses` / `ytdNetIncome` | — | — | "YTD actual" col on AvF | — | — | — | — |
| `forecast.yearEndRevenue` | — | — | "Year-end forecast" col | — | `#fc-revenue` | "2026 forecast" bar | — |
| `forecast.yearEndGrossProfit` | — | — | "Year-end forecast" col | — | `#fc-gp` | "2026 forecast" bar | — |
| `forecast.yearEndOperatingExpenses` | — | — | "Year-end forecast" col | — | `#fc-opex` | — | — |
| `forecast.yearEndNetIncome` | — | — | "Year-end forecast" col | — | `#fc-net` | "2026 forecast" bar | — |
| `forecast.yearEndGrossMarginPct` | — | — | — | — | `#fc-gm-pct` | — | — |
| `forecast.yearEndNetMarginPct` | — | — | — | — | `#fc-nm-pct` | — | Forecast miss flag |
| `forecast.yearEndCash` | — | — | — | — | `#fc-cash` | — | — |
| `forecast.runRateRevenue` | — | — | "YTD → annualized" row | — | `#fc-runrate` | — | Revenue decline flag |
| `forecast.runRateGrossProfit` | — | — | "YTD → annualized" row | — | — | — | — |
| `forecast.runRateOperatingExpenses` | — | — | — | — | — | — | Expense spike flag |
| `forecast.runRateNetIncome` | — | — | "YTD → annualized" row | — | — | — | — |
| `forecast.avgMonthlyRevenue` / `avgMonthlyGrossProfit` / `avgMonthlyOperatingExpenses` / `avgMonthlyNetIncome` | — | — | — | — | (forecast methodology) | — | — |
| `verifiedMonths[]` | — | — | M-vs-M table | Margin progression table | — | Verified monthly P&L table | — |
| `company.{name,industry,naics}` | — | — | — | — | — | — | — (header chrome) |
| `asOf`, `generatedAt`, `source` | header badge + footer | — | — | — | — | — | — |

---

## 3. QuickBooks chart of accounts → snapshot roll-up

Pick any line on a QuickBooks P&L statement and find it here. Account
names are taken empirically from `data/raw/months/*.json` and
`data/raw/pl_2025.json`. All accounts roll into one of four snapshot
buckets: `revenue`, `cogs`, `operatingExpenses`, or cash-flow.

### Income → `periods.*.revenue`

- **Service/Fee Income** — largest contributor (~$1.7M–$4.9M/month).
- **Drywall Service Income** subtree:
  - Drywall Division Delivery Income
  - Drywall Division Material Income
  - Drywall Supply Arbor Income
  - Drywall Supply Century Income
  - Drywall Supply HD Boom Scatter Income
  - Drywall Supply Pulte Income
  - Drywall Tax
- **Engineering Project Income**
- **Construction-segment income**: Doors and Windows, Finishes, Metals,
  Specialties, Thermal and Moisture Control, Wood and Plastics, Sales
- **Billable Expense Income**
- **WIP Adj – Net change** (balance-sheet timing adjustment; can be
  positive or negative in any month)

### Cost of Goods Sold → `periods.*.cogs` (= revenue − grossProfit)

- **Cost of labor – Contractors** — largest COGS line
- **Cost of labor – Direct Labor**
- **Drywall Supply expense lines**:
  - Drywall Supply External Expense
  - Drywall Supply Internal Expense
  - Drywall Supply Arbor Expense
  - Drywall Supply Century Expense
  - Drywall Supply HD Boom Scatter Expense (+ Diesel-Boom Truck, Labor,
    Travel sub-accounts)
  - Drywall Supply Pulte Expense
- **Job Site Expenses** subtree:
  - Drywall Project (Material) Expense - Internal
  - Drywall Project (Tax) Expense - Internal
  - Equipment Rental
- **Per Diem Job Expense**
- **Warranty Labor Expense**, **Warranty Material Expense**

### Operating Expenses → `periods.*.operatingExpenses`

- Advertising & Marketing, Bad Debt, Bank Charges & Fees, Charitable
  Contributions (incl. Non-Deductible)
- **Car & Truck** subtree:
  - DEF - Boom Truck, DOT Boom Trucks Compliance
  - Fuel Diesel - Boom Truck, Fuel Truck - Company Pickup
  - Service - Boom Truck (rolled-up)
  - Per-vehicle service: 1103 Volvo, 1107 Western Star, 1109 Freightliner
    16, 1110 Peterbilt 18, 1111 Freightliner, 1112 Peterbilt 17
  - Service - Company Truck
- Contractors, Depreciation
- Drywall Division Labor – Subcontractors
- Drywall Division Supplies Expense, Drywall Tax (Internal)
- Dues & subscriptions, Equipment/Vehicle Rental
- Insurance, Interest Paid, Job Supplies
- Legal & Professional Services
- **Meals & Entertainment** subtree (Entertainment, Meals)
- **Office Supplies & Software** subtree (Software Subscription/Use Fee)
- Other Business Expenses, Outsourced IT Services
- **Payroll Expenses** subtree:
  - Bonus, Commission, Payroll Fees, Taxes, Wages
  - **Employee Benefits** (Health Insurance)
  - Accrued Bonuses / Accrued Payroll / Accrued Commissions
- Property Tax, Reimbursable Expenses, Rent & Lease, Repairs & Maintenance
- Small Tools & Equipment, Taxes & Licenses
- **Travel** subtree (Travel - Fuel, Travel - Meals)
- Utilities

### Other income / non-operating → flow into `periods.*.netIncome` only

(Captured by QB inside `Net Income` but shown separately on the QB report)

- Credit Card Rewards
- Interest Earned
- Subletter Rent Income
- Vendor Rebate Income
- Other Income (catch-all)

### Cash-flow-only items → `cashFlow.current.*` / `cashFlow.prior.*`

These never appear on the P&L; they're balance-sheet movements that the
cash flow statement captures.

**Operating activities**
- Accounts Receivable (A/R) — feeds A/R risk flag indirectly
- Accounts Payable (A/P)
- Retainage Receivable
- Inventory Asset:Drywall Inventory
- Allowance for Doubtful Accounts, Accumulated Depreciation
- Accrued Property Tax
- Per-employee Chase CC accounts (~50 holders), AMEX Credit Cards 41002
  and 72006 — A/P-style movements treated as working-capital changes
- Forum CAP X LOC (1708), Forum Line of Credit - LOC (0874)
- Lease Liability – operating (current and noncurrent)
- ROU Asset – A/A operating leases, ROU Asset – operating leases
- State agency payables: Indiana Dept of Revenue, Kentucky Dept of
  Revenue, Michigan Dept of Treasury, Out Of Scope Agency Payable
- WIP Adj – Overbillings, WIP Adj – Underbillings
- Employee Advance

**Investing activities**
- Equipment & Tools, Fixed Asset Computers, Fixed Asset Vehicles,
  Furniture, Leasehold Improvements
- Note Receivable, Notes Receivable - Intercompany
- Security Deposits

**Financing activities**
- Partner Contributions (per partner: Cohoat Consulting LLC, MDG
  Engineering LLC, Patel Consulting Services LLC, Steve Little, The
  Cohoat Group LLC, Brandon Clymer)
- Partner Distributions (same partners)
- Opening Balance Equity, Partner's Equity, Retained Earnings
- Wells Fargo Loan/Lease

---

## 4. Action flag → triggering inputs

Every flag on the Action Flags tab. Rules implemented in
`app.js:510-580` (`computeActionFlags`). Severity is `bad` (red) unless
noted.

| Flag | Severity rule | Snapshot inputs | Surfaced on |
|---|---|---|---|
| Revenue decline | `forecast.runRateRevenue < periods.prior.revenue` | `forecast.runRateRevenue`, `periods.prior.revenue` | Exec + Flags |
| Revenue trajectory above prior year (good) | `forecast.runRateRevenue ≥ periods.prior.revenue` | same as above | Flags |
| Margin compression | `current GM% − prior GM% < −0.01` | `periods.current.grossMarginPct`, `periods.prior.grossMarginPct` | Flags |
| Margin expansion (good) | `current GM% − prior GM% > +0.01` | same as above | Flags |
| Expense spike (warn) | `(forecast.runRateOperatingExpenses ÷ periods.prior.operatingExpenses) − 1 > 0.05` | `forecast.runRateOperatingExpenses`, `periods.prior.operatingExpenses` | Flags |
| Negative net cash flow YTD | `cashFlow.current.netCashChange < 0` | `cashFlow.current.{operating, investing, financing, netCashChange}` | Exec + Flags |
| Negative cash position | `cashFlow.current.cashEnding < 0` | `cashFlow.current.{cashEnding, cashBeginning}` | Exec + Flags |
| A/R collection risk (warn) | `cashFlow.current.cashEnding < cashFlow.prior.cashEnding − $100,000` | `cashFlow.current.cashEnding`, `cashFlow.prior.cashEnding` | Flags |
| Forecast net margin below prior year (warn) | `forecast.yearEndNetMarginPct < periods.prior.netMarginPct − 0.01` | `forecast.yearEndNetMarginPct`, `periods.prior.netMarginPct` | Flags |

---

## How to audit a number end-to-end

1. **Pick a number on the dashboard.** Note the tab and KPI label.
2. **Look up the KPI in section 2.** Find the row whose tab column points
   at that DOM element — that gives you the `snapshot.json` path.
3. **Look up the snapshot path in section 1.** That tells you which raw
   QuickBooks file (and therefore which MCP call) it came from.
4. **Open the raw file** in `data/raw/` and confirm the value matches.
5. **For accounts**, use section 3 to confirm the line item rolls into the
   bucket you expect.

To audit a flag, jump to section 4 — every rule cites both the threshold
and the snapshot fields it reads.

## Refresh cadence

This document tracks the data shape, not the data values. It only needs
updating when:

- a new tab or KPI is added → update section 2;
- a new flag rule is added → update section 4;
- the QuickBooks chart of accounts changes (new account in a category) →
  add it to section 3;
- the ingestion path changes (a new MCP tool is used or a raw file is
  added) → update section 1.

The numbers themselves refresh monthly via `scripts/refresh.sh`.
