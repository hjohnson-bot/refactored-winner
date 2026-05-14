#!/usr/bin/env bash
#
# Refresh the FP&A workflow from QuickBooks + Knowify.
#
# The QuickBooks and Knowify MCPs live inside Claude Code. This script
# orchestrates the refresh in two phases:
#
#   1) pull   — print the MCP prompt to paste into Claude Code. Claude
#               runs the MCP calls and writes the raw blobs into
#               fpa/data/raw/. (Or, when this script is invoked from
#               inside a Claude session that has both MCPs available,
#               the /fpa-refresh slash command does the same in one go.)
#   2) build  — rebuild fpa/data/period-<label>.json from the raw blobs
#               and run the workflow into fpa/artifacts/<label>.
#
# Manual / 24-hour cadence:
#
#   fpa/scripts/refresh.sh prompt           # print the MCP prompt
#   fpa/scripts/refresh.sh build 2026-04    # rebuild from existing raw + run workflow
#   fpa/scripts/refresh.sh all 2026-04      # both phases (interactive)
#
# The recommended automation pattern is a daily Claude Code session
# triggered by schedule.json that runs the /fpa-refresh slash command.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/data/raw"
PERIOD_LABEL="${2:-$(date -u +%Y-%m)}"

cmd="${1:-build}"

case "$cmd" in
  prompt)
    cat <<EOF
Paste this into a Claude Code session that has both QuickBooks and Knowify MCPs.
Replace <PERIOD> with the target month, e.g. 2026-04. Save each MCP result
into the indicated raw file. After the pulls land, run:

  $ROOT/scripts/refresh.sh build <PERIOD>

---
Refresh FP&A raw inputs for period $PERIOD_LABEL. Working directory: $ROOT

Use the Write tool for every file save.

1. company-info  →  $RAW/company-info.txt
2. profit-loss-quickbooks-account periodStart=YYYY-MM-01 periodEnd=YYYY-MM-31
                 →  $RAW/pnl-$PERIOD_LABEL.json   (capture totalIncome,
                    grossProfit, totalExpenses, netIncome, cogs breakdown
                    by line, opex breakdown by category)
3. profit-loss-quickbooks-account for prior month
                 →  $RAW/pnl-<prior-month>.json
4. profit-loss-quickbooks-account for prior year same month
                 →  $RAW/pnl-<prior-year-month>.json
5. qbo_accounting_get_balance_sheet start_date=<period-end> end_date=<period-end>
                 → extract .summary to $RAW/balance-sheet-summary.json
6. qbo_accounting_get_ar_aging_summary as_of_date=<period-end>
                 → extract .summary to $RAW/ar-aging-summary.json
7. qbo_accounting_get_ap_aging_summary as_of_date=<period-end>
                 → extract .summary to $RAW/ap-aging-summary.json
8. Knowify query JobsReport (active jobs, fields incl. ContractTotal,
   ChangeOrders, BudgetTotal, Invoiced, PercCompleted, ProjectedProfit,
   Retainage, WIP, StartDate, EndDate, ProjectManager, ClientName)
                 →  $RAW/knowify-jobs.json

Once all eight files exist, exit. The cron host (or the user) will run
'fpa/scripts/refresh.sh build $PERIOD_LABEL'.
EOF
    ;;

  build)
    cd "$ROOT"
    if [ ! -f "$RAW/pnl-$PERIOD_LABEL.json" ]; then
      echo "Missing $RAW/pnl-$PERIOD_LABEL.json — run '$0 prompt $PERIOD_LABEL' first."
      exit 2
    fi
    node "$ROOT/scripts/build-period.js" "$PERIOD_LABEL"
    node "$ROOT/src/index.js" run --period "$ROOT/data/period-$PERIOD_LABEL.json" --out "$ROOT/artifacts/$PERIOD_LABEL"
    echo "Done. Artifacts: $ROOT/artifacts/$PERIOD_LABEL/"
    ;;

  all)
    "$0" prompt "$PERIOD_LABEL"
    echo
    echo "---"
    echo "Press Enter once the raw files exist in $RAW/ ..."
    read -r _
    "$0" build "$PERIOD_LABEL"
    ;;

  *)
    echo "Usage: $0 {prompt|build|all} [period-label]" >&2
    exit 2
    ;;
esac
