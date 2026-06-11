#!/usr/bin/env bash
# TEST STUB for MDG_REPULL_CMD — simulates a re-pull by restoring the correct
# source file from a backup dir (BACKUP, default /tmp/mdg_raw_backup). On the
# real host, MDG_REPULL_CMD is a Claude/MCP pull instead; this just proves the
# self-heal loop in dry_run.sh.
#   usage: mock_repull.sh <token>   token = jobs:<offset> | pl | cf | bs | ar | ap
set -euo pipefail
BACKUP="${MDG_RAW_BACKUP:-/tmp/mdg_raw_backup}"
RAW="$(cd "$(dirname "$0")/../build/raw" && pwd)"
tok="${1:?token required}"
case "$tok" in
  jobs:*) off="${tok#jobs:}"
          if [ "$off" = "0" ]; then f="knowify_jobs_active.json"; else f="knowify_jobs_p$((off/100+1)).json"; fi ;;
  pl) f="qb_pl_2026_ytd.json" ;;
  cf) f="qb_cf_2026_ytd.json" ;;
  bs) f="qb_balance_sheet.json" ;;
  ar) f="qb_ar_aging_summary.json" ;;
  ap) f="qb_ap_aging_summary.json" ;;
  *)  echo "mock_repull: unknown token $tok" >&2; exit 2 ;;
esac
if [ -f "$BACKUP/$f" ]; then cp "$BACKUP/$f" "$RAW/$f"; echo "mock repull restored $f"; else echo "mock repull: no backup for $f" >&2; exit 3; fi
