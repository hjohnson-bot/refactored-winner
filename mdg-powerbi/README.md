# MDG Executive Financial Dashboard

A drillable CEO/CFO financial dashboard for **Midwest Design Group LLC**, built on a
star-schema model from **live QuickBooks Online + Knowify** data. Implements the
Power BI Build Specification v1.0 (Hunter Johnson, VP Financial Operations).

**Everything here is real, reconciled data — no dummy values.** As of **2026-06-09**.
See [`RECONCILIATION.md`](RECONCILIATION.md) for every number tied back to source.

## What you get

| Deliverable | Path | Use |
|---|---|---|
| **Excel dashboard** (open & play now) | [`output/MDG_Executive_Dashboard.xlsx`](output/MDG_Executive_Dashboard.xlsx) | 10 report sheets + 13 raw data tables. Opens anywhere; also a clean Power BI source. |
| **Power BI kit** | [`powerbi/`](powerbi/) | `model.bim` (semantic model), `MDG_Theme.json`, `measures.dax`, `powerquery_all.m` |
| **Star-schema data** | [`data/`](data/) | The fact/dim CSVs the model reads |
| **Build pipeline** | [`scripts/`](scripts/) | Re-pull → rebuild everything |

### Excel workbook — sheets
Command Center (CEO landing) · P&L · Division Performance · Project Tracker
(profit-fade ranked) · WIP & Profit Fade (by PM) · A/R Aging · A/P Aging ·
Cash & Liquidity · Balance Sheet · Data Health · plus `» Fact_*` / `» Dim_*`
raw tables (formatted as Excel Tables for instant PivotTables).

## Headline numbers (real, 2026-06-09)

- YTD 2026 Revenue **$25.19M** · Gross Margin **28.8%** · Net Income **$2.90M** (11.5%)
- Active backlog **$22.5M** across **301** active jobs (**81** managed)
- Trade A/R **$10.49M** (+ **$3.18M** retainage) · A/P **$3.81M**
- Cash **-$1.18M** · LOC drawn **$4.40M** · worst profit-fade under **Tommy Cohoat / Spencer Anderson**

## Build the Power BI file (.pbix)

The model reads the CSVs through one parameter, `DataFolder`.

**Path A — Tabular Editor (recommended).**
1. Copy the `data/` folder somewhere stable, e.g. `C:\MDG\PowerBI\data`.
2. Open [Tabular Editor](https://tabulareditor.com) (free) → **File ▸ Open ▸ From File** → `powerbi/model.bim`.
3. Set the `DataFolder` expression to your path · **Save to** a new Power BI Desktop / dataset.
4. Power BI Desktop ▸ **View ▸ Themes ▸ Browse** → `powerbi/MDG_Theme.json`.
5. Build the report pages per spec §7 (the Excel workbook is the visual reference).

**Path B — Power BI Desktop only.**
1. **Transform data ▸ New Parameter** `DataFolder` (Text) = your CSV folder.
2. Paste each section from `powerbi/powerquery_all.m` (**New Source ▸ Blank Query**), or
   **Get Data ▸ Folder** and load the CSVs.
3. Create the relationships (see below) and paste measures from `powerbi/measures.dax`.
4. Apply the theme.

### Model (16 tables · 14 relationships · 52 measures)
Facts: `Fact_GL` (account×period), `Fact_PL_Monthly`, `Fact_WIP`, `Fact_AR`,
`Fact_AP`, `Fact_Cash`, `Fact_Budget`, `Fact_BalanceSheet`.
Dims: `Dim_Date` (marked as date table), `Dim_Division`, `Dim_PM`, `Dim_Job`,
`Dim_Account`, `Dim_Customer`, `Dim_Vendor`. Measures host: `_Measures`.
Hierarchies: **Org** (Division→PM→Job on `Dim_Job`), **Account**
(Category→Subcategory→Account on `Dim_Account`). All relationships single-direction
dimension→fact.

## Refresh (the genuine auto-update path)

```bash
# 1) Re-pull live data into build/raw/ via QuickBooks + Knowify MCP
#    (P&L FY+monthly, balance sheet, AR/AP aging, cash flow, JobsReport active)
# 2) Rebuild the star-schema CSVs + reconciliation
python3 scripts/build_dashboard.py
# 3) Rebuild the Excel workbook
python3 scripts/build_excel.py
# 4) (optional) regenerate the Power BI kit if the schema changed
python3 scripts/build_powerbi.py
```

For scheduled Power BI refresh: install the On-premises Data Gateway on a machine that
sees the CSV folder, publish the dataset, and schedule daily refresh after the export
job runs (spec §9). The CSV folder is the contract between the export job and Power BI.

## Data sources & notes

- **QuickBooks Online** (MCP): P&L (FY2024/FY2025/YTD2026 + verified months), balance
  sheet, A/R & A/P aging, cash flow. Sign convention: P&L stored as natural positive
  magnitudes tagged by `Category`; measures sum by category (no credit-negative flip,
  because we source the rendered P&L report, not raw GL credits).
- **Knowify** `JobsReport` (the AJR): per-job contract, billing, cost, profit, WIP,
  retainage, % complete, PM, division (QB Class). Profit Fade % = forecast margin
  (ProjectedProfit/Contract) − as-bid budget margin ((Contract−Budget)/Contract).
- **USER-MAINTAINED** (not in source systems, flagged): LOC Limit, Advance Rate,
  Eligible-AR basis — edit in `data/Param_Cash.csv` (or the yellow cells on the Excel
  Cash & Liquidity sheet) and rebuild.
- **Out of scope for v1** (documented, not faked): transaction-grain GL drill (model is
  account×period grain); RLS member assignment (role DAX in the spec, assigned in the
  Service); native click-tested .pbix visuals (authored from this kit in Power BI Desktop).
