#!/usr/bin/env bash
#
# Refresh CFO dashboard data from QuickBooks.
#
# Three modes:
#
#   ./scripts/refresh.sh prompt     # prints the prompt to paste into Claude Code
#                                   # (use this when QuickBooks needs interactive
#                                   # OAuth or you don't have an API key yet)
#
#   ./scripts/refresh.sh cron       # fully headless: calls Anthropic + QB MCP,
#                                   # writes raw files, rebuilds snapshot.json,
#                                   # rebuilds standalone HTML + Excel.
#                                   # This is what the daily 4 AM ET GitHub
#                                   # Actions workflow runs.
#                                   # Requires: ANTHROPIC_API_KEY, QB_MCP_URL.
#
#   ./scripts/refresh.sh build      # just rebuild snapshot.json from existing
#                                   # raw files (no QuickBooks calls).
#
set -euo pipefail
cd "$(dirname "$0")/.."

AS_OF="${AS_OF:-$(date -u +%F)}"
RAW=data/raw
MONTHS_DIR=$RAW/months

mkdir -p "$RAW" "$MONTHS_DIR"

cmd="${1:-build}"

case "$cmd" in
  cron)
    if ! command -v node >/dev/null 2>&1; then
      echo "node is required for headless cron mode." >&2
      exit 2
    fi
    : "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY env var required}"
    AS_OF="$AS_OF" node scripts/refresh-quickbooks.mjs
    ;;

  prompt)
    cat <<EOF
Paste this prompt into Claude Code (which must have the QuickBooks MCP enabled):

---
Refresh the CFO dashboard data files. Working directory: $(pwd)

For each call, save the raw JSON to the indicated file using the Write tool.

1. Confirm the QuickBooks connection:
   - Call mcp__*__company-info (no args).

2. Pull the period totals:
   - profit-loss-quickbooks-account periodStart=2024-01-01 periodEnd=2024-12-31
     Save to $RAW/pl_2024.json
   - profit-loss-quickbooks-account periodStart=2025-01-01 periodEnd=2025-12-31
     Save to $RAW/pl_2025.json
   - profit-loss-quickbooks-account periodStart=$(date -u +%Y)-01-01 periodEnd=$AS_OF
     Save to $RAW/pl_current_ytd.json
   - cash-flow-quickbooks-account periodStart=$(date -u +%Y)-01-01 periodEnd=$AS_OF
     Extract operatingActivities, investingActivities, financingActivities,
     netCashIncrease, cashAtBeginning, cashAtEnd, plus the Net Income row,
     and write a minimal JSON to $RAW/cf_current.json
   - cash-flow-quickbooks-account periodStart=2025-01-01 periodEnd=2025-12-31
     Same minimal extraction → $RAW/cf_prior.json

3. Pull each individual month for the trend tab. For every month from
   $(date -u -d '12 months ago' +%Y-%m 2>/dev/null || echo '12 months back')
   through the most recent completed month, call:
     profit-loss-quickbooks-account periodStart=YYYY-MM-01 periodEnd=YYYY-MM-LASTDAY
   and save (totalIncome, grossProfit, totalExpenses, netIncome, periodStart,
   periodEnd) into $MONTHS_DIR/YYYY-MM.json.

4. After all files are written, run:
     ./scripts/refresh.sh build
---
EOF
    ;;

  build)
    PL_CURRENT=${PL_CURRENT:-$RAW/pl_2026_ytd.json}
    [ -f "$PL_CURRENT" ] || PL_CURRENT=$RAW/pl_current_ytd.json
    if [ ! -f "$PL_CURRENT" ]; then
      echo "Missing current-period P&L file. Run './scripts/refresh.sh prompt' first." >&2
      exit 2
    fi
    python3 scripts/build_snapshot.py \
      --pl-current "$PL_CURRENT" \
      --pl-prior  "$RAW/pl_2025.json" \
      --pl-prior-2 "$RAW/pl_2024.json" \
      --cf-current "$RAW/cf_current.json" \
      --cf-prior   "$RAW/cf_prior.json" \
      --months-dir "$MONTHS_DIR" \
      --as-of "$AS_OF" \
      --out data/snapshot.json
    echo "Snapshot rebuilt: data/snapshot.json (as of $AS_OF)" >&2
    ;;

  *)
    echo "Usage: $0 [prompt|cron|build]" >&2
    exit 1
    ;;
esac
