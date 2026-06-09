#!/usr/bin/env bash
# MDG Executive Dashboard — refresh orchestrator (Option B: scripted refresh)
#
#   ./refresh.sh prompt   # prints the copy/paste prompt for the live data pull
#   ./refresh.sh build    # rebuilds CSVs + Excel + Power BI kit from build/raw/
#   ./refresh.sh          # same as build
#
# The data pull (QuickBooks + Knowify) runs through the MCP connection inside a
# Claude Code session — that is the only client with access to those sources.
# Step 1 pulls fresh source JSON into build/raw/; step 2 rebuilds every output.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
RAW="$ROOT/build/raw"
TODAY="$(date +%F)"
YEAR="$(date +%Y)"

cmd="${1:-build}"

if [ "$cmd" = "prompt" ]; then
cat <<PROMPT
=================================================================
 MDG DASHBOARD — DATA PULL PROMPT   (paste into a Claude Code session
 that has the QuickBooks + Knowify MCP servers connected)
=================================================================
As-of date: $TODAY

Pull the following and save each raw response to mdg-powerbi/build/raw/
(closed prior years FY2024/FY2025 do NOT change — reuse the existing
qb_pl_2024.json / qb_pl_2025.json / qb_cf_2025.json):

QuickBooks Online:
  1. profit_loss_quickbooks_account  periodStart=$YEAR-01-01 periodEnd=$TODAY
       -> build/raw/qb_pl_${YEAR}_ytd.json   (rename to qb_pl_2026_ytd.json if the
          build still expects that name, or update PERIODS in build_dashboard.py)
  2. qbo_accounting_get_balance_sheet  start_date=$TODAY end_date=$TODAY
       -> build/raw/qb_balance_sheet.json
  3. qbo_accounting_get_ar_aging_summary  as_of_date=$TODAY
       -> build/raw/qb_ar_aging_summary.json
  4. qbo_accounting_get_ap_aging_summary  as_of_date=$TODAY
       -> build/raw/qb_ap_aging_summary.json
  5. cash_flow_quickbooks_account  periodStart=$YEAR-01-01 periodEnd=$TODAY
       -> build/raw/qb_cf_${YEAR}_ytd.json   (the build reads qb_cf_2026_ytd.json)
  6. (optional, for the monthly trend) profit_loss_quickbooks_account for each
       completed month of $YEAR -> build/raw/months/$YEAR-MM.json

Knowify (JobsReport — the AJR). IMPORTANT: paginate with a STABLE order
([["ProjectId","DESC"]]) and pull every page until you cover Total rows.
Use the 'active' scope + wide params window. Save:
  7. offset 0   -> build/raw/knowify_jobs_active.json
  8. offset 100 -> build/raw/knowify_jobs_p2.json
  9. offset 200 -> build/raw/knowify_jobs_p3.json
 10. offset 300 -> build/raw/knowify_jobs_p4.json   (add p5.. if Total > 400)

Each Knowify call fields:
  ProjectId, ProjectName, ProjectManager, ClassName, ClientName, Status,
  ContractType, ContractTotal, ChangeOrders, Invoiced, PaymentsInvoices,
  BudgetTotal, *Estimated/*Actual/*Committed, Profit, ProfitAmount,
  ProjectedProfit, PercCompleted, WIP, Retainage, Deposits, dates, City, State.

Then run:  ./scripts/refresh.sh build
=================================================================
PROMPT
  exit 0
fi

echo "[refresh] rebuilding from $RAW ..."
python3 "$HERE/build_dashboard.py"
python3 "$HERE/build_excel.py"
python3 "$HERE/build_powerbi.py"
# refresh the self-contained Power BI kit zip
( cd "$ROOT" && rm -f output/MDG_PowerBI_Kit.zip && \
  zip -q -r output/MDG_PowerBI_Kit.zip powerbi/ data/*.csv README.md RECONCILIATION.md )
echo "[refresh] done. Outputs in output/ and data/. As-of = $(python3 -c "import json;print(json.load(open('$ROOT/data/_reconciliation.json'))['as_of'])")"
