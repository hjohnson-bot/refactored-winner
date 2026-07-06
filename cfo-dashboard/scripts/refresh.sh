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
    YEAR=$(date -u +%Y)
    PRIOR=$((YEAR - 1))
    PRIOR2=$((YEAR - 2))
    cat <<EOF
Preferred: run the /cfo-refresh command in Claude Code — it does all of the
below plus gap-filling and verification. Otherwise paste this prompt into
Claude Code (which must have the QuickBooks MCP enabled):

---
Refresh the CFO dashboard data files. Working directory: $(pwd)

For each call, save the raw JSON to the indicated file using the Write tool.

1. Confirm the QuickBooks connection:
   - Call the QuickBooks MCP company-info tool (no args).

2. Pull the period totals:
   - profit-loss-quickbooks-account periodStart=$PRIOR2-01-01 periodEnd=$PRIOR2-12-31
     Save to $RAW/pl_$PRIOR2.json
   - profit-loss-quickbooks-account periodStart=$PRIOR-01-01 periodEnd=$PRIOR-12-31
     Save to $RAW/pl_$PRIOR.json
   - profit-loss-quickbooks-account periodStart=$YEAR-01-01 periodEnd=$AS_OF
     Save to $RAW/pl_${YEAR}_ytd.json
   - cash-flow-quickbooks-account periodStart=$YEAR-01-01 periodEnd=$AS_OF
     Extract operatingActivities, investingActivities, financingActivities,
     netCashIncrease, cashAtBeginning, cashAtEnd, plus the Net Income row,
     and write a minimal JSON to $RAW/cf_current.json
   - cash-flow-quickbooks-account periodStart=$PRIOR-01-01 periodEnd=$PRIOR-12-31
     Same minimal extraction → $RAW/cf_prior.json

3. Pull each individual month for the trend tab. For every COMPLETED month in
   the last 13 that is missing from $MONTHS_DIR/, call:
     profit-loss-quickbooks-account periodStart=YYYY-MM-01 periodEnd=YYYY-MM-LASTDAY
   and save (totalIncome, grossProfit, totalExpenses, netIncome, periodStart,
   periodEnd) into $MONTHS_DIR/YYYY-MM.json. Never pull the in-progress month.

4. Optional (keeps the Benchmark/Pipeline/Customers tabs fresh):
   - benchmarking-quickbooks-account → $RAW/benchmark.json
   - sales-by-customer summary for the current year → $RAW/customers.json
     (match the existing file's shape)
   - invoice billing cadence for the current year → $RAW/pipeline.json
     (match the existing file's shape)

5. After all files are written, run:
     ./scripts/refresh.sh build
---
EOF
    ;;

  build)
    YEAR=$(date -u +%Y)
    PRIOR=$((YEAR - 1))
    PRIOR2=$((YEAR - 2))
    PL_CURRENT=${PL_CURRENT:-$RAW/pl_${YEAR}_ytd.json}
    # Legacy name written by older prompt-mode refreshes; prefer whichever is newer.
    if [ -f "$RAW/pl_current_ytd.json" ]; then
      if [ ! -f "$PL_CURRENT" ] || [ "$RAW/pl_current_ytd.json" -nt "$PL_CURRENT" ]; then
        PL_CURRENT=$RAW/pl_current_ytd.json
      fi
    fi
    if [ ! -f "$PL_CURRENT" ]; then
      echo "Missing current-period P&L file ($RAW/pl_${YEAR}_ytd.json)." >&2
      echo "Run /cfo-refresh in Claude Code, or './scripts/refresh.sh prompt'." >&2
      exit 2
    fi
    # Optional inputs: only pass the ones that exist so the snapshot never
    # silently loses benchmark/pipeline/customers data that was pulled before.
    EXTRA=()
    [ -f "$RAW/benchmark.json" ] && EXTRA+=(--benchmark "$RAW/benchmark.json")
    [ -f "$RAW/pipeline.json" ]  && EXTRA+=(--pipeline  "$RAW/pipeline.json")
    [ -f "$RAW/customers.json" ] && EXTRA+=(--customers "$RAW/customers.json")
    python3 scripts/build_snapshot.py \
      --pl-current "$PL_CURRENT" \
      --pl-prior  "$RAW/pl_${PRIOR}.json" \
      --pl-prior-2 "$RAW/pl_${PRIOR2}.json" \
      --cf-current "$RAW/cf_current.json" \
      --cf-prior   "$RAW/cf_prior.json" \
      --months-dir "$MONTHS_DIR" \
      --as-of "$AS_OF" \
      --out data/snapshot.json \
      ${EXTRA[@]+"${EXTRA[@]}"}
    echo "Snapshot rebuilt: data/snapshot.json (as of $AS_OF)" >&2
    ;;

  *)
    echo "Usage: $0 [prompt|cron|build]" >&2
    exit 1
    ;;
esac
