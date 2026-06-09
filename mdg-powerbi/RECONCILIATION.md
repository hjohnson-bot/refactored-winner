# Reconciliation — model vs. source systems

**As of 2026-06-09.** Every headline figure in the dashboard is derived from a live
QuickBooks Online or Knowify response (pulled via MCP) and reconciles to the source
within rounding. Re-run `scripts/build_dashboard.py` to regenerate; it prints this
reconciliation and writes `data/_reconciliation.json`.

## Profit & Loss (QuickBooks P&L, by section total)

| Period | Revenue | COGS | Gross Profit | OpEx | Net Income | Source check |
|---|--:|--:|--:|--:|--:|---|
| FY2024 | 39,537,774.90 | 28,435,216.93 | 11,102,557.97 | 8,249,044.14 | 2,899,162.56 | QB P&L FY2024 |
| FY2025 | 40,491,815.42 | 27,755,136.44 | 12,736,678.98 | 10,032,604.11 | 2,704,074.87 | QB P&L FY2025 (section totals) |
| YTD2026 | **25,185,251.97** | 17,930,557.68 | 7,254,694.29 | 4,224,187.67 | **2,904,853.02** | QB P&L `totalIncome`; NI = QB cash-flow Net Income |

- **YTD2026 Revenue 25,185,251.97** = QuickBooks P&L `totalIncome` exactly.
- **YTD2026 Net Income 2,904,853.02** = QuickBooks cash-flow statement "Net Income" line exactly.
- FY2025 OpEx uses the QB **Expenses section header total** (10,032,604.11); the saved
  prior-year export itemizes 9,704,407.23, so a single **"Operating Expense — Unitemized"**
  plug of 328,196.88 keeps Fact_GL tied to QB. (FY2025 raw `netIncome` field is `0` — a
  known QuickBooks MCP quirk; the P&L-basis NI is computed from section totals.)
- Monthly trend (Fact_PL_Monthly) uses **verified single-month** QB P&L queries
  (Jan–May 2026 + Jan/Apr 2025); June 2026 is partial and captured in the YTD total.

## Accounts Receivable (QuickBooks)

| Item | Model | Source | Tie |
|---|--:|--:|---|
| Trade A/R (Fact_AR, deduped) | 10,490,161.86 | Balance sheet A/R 10,490,161.86 | ✓ exact |
| Retainage Receivable | 3,181,101.43 | Balance sheet "Retainage Receivable" | ✓ exact |
| **Total receivables incl. retainage** | **13,671,263.29** | | |

A/R aging buckets are deduplicated from the QB A/R Aging Summary by keeping only
top-level customer rows (`parentId="0"`), excluding the "Total for…" and per-job
sub-rows that otherwise triple-count to a spurious ~$31M.

## Accounts Payable (QuickBooks)

| Item | Model | Source | Tie |
|---|--:|--:|---|
| A/P (Fact_AP, deduped) | 3,807,524.75 | Balance sheet A/P 3,807,524.75 | ✓ exact |

## Knowify (AJR / JobsReport)

| Item | Model | Source |
|---|--:|---|
| Active jobs | **301** | JobsReport `Total` = 301 |
| Managed jobs (PM + budget + ≥$1k) | 81 | ≈ spec "~84 actively managed" |
| Contract value (active) | 64,226,519.26 | Σ ContractTotal |
| Invoiced (active) | 41,718,156.23 | Σ Invoiced |
| Backlog (contract − invoiced) | 22,508,363.03 | |
| Job profit $ (active) | 12,335,662.74 | Σ ProfitAmount |
| Worst profit-fade PMs | Tommy Cohoat (6 of worst 10), Spencer Anderson (3) | matches spec's flagged concentration |

## Balance sheet & liquidity (QuickBooks, 2026-06-09)

| Item | Value | Source |
|---|--:|---|
| Total assets | 18,619,292.79 | QB balance sheet |
| Total liabilities | 12,357,085.91 | QB balance sheet |
| Total equity | 6,262,206.88 | QB balance sheet |
| Cash | -1,181,880.81 | QB balance sheet |
| LOC drawn (Forum 0874) | 4,399,830.67 | QB balance sheet |
| Operating / Investing / Financing CF (YTD) | 537,698.35 / 212,852.10 / -1,651,536.77 | QB cash flow |

**USER-MAINTAINED inputs** (not present in QuickBooks/Knowify, parameterized and flagged
yellow on the Cash & Liquidity sheet / `Param_Cash.csv`): LOC Limit, Advance Rate,
Eligible-AR basis. BBC headroom and LOC utilization compute from these.
