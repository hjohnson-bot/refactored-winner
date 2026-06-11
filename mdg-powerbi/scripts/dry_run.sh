#!/usr/bin/env bash
# Dry-run / smoke test for the self-healing refresh (scripts/refresh_safe.py).
# Demonstrates three scenarios against a temp landing folder, then restores the
# repo's raw inputs so nothing is left modified.
#
#   ./scripts/dry_run.sh            # run all three scenarios
#   ./scripts/dry_run.sh healthy    # only the happy path
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
RAW="$ROOT/build/raw"
BACKUP="/tmp/mdg_raw_backup"
LANDING="/tmp/MDG_landing"
export MDG_RAW_BACKUP="$BACKUP"

scenario="${1:-all}"

setup() {
  rm -rf "$BACKUP" "$LANDING"; mkdir -p "$BACKUP" "$LANDING"
  cp "$RAW"/*.json "$BACKUP"/ 2>/dev/null || true
  echo "previous-good-run" > "$LANDING/_marker.txt"   # represents yesterday's data
}
restore() { cp "$BACKUP"/knowify_jobs_*.json "$RAW"/ 2>/dev/null || true; }
hr() { printf '%s\n' "------------------------------------------------------------------"; }

setup

if [ "$scenario" = "all" ] || [ "$scenario" = "healthy" ]; then
  hr; echo "SCENARIO A — healthy refresh (expect PASS, promote)"; hr
  MDG_LANDING="$LANDING" python3 "$HERE/refresh_safe.py"
  echo "Landing CSVs: $(ls "$LANDING"/*.csv 2>/dev/null | wc -l)"
  [ "$scenario" = "healthy" ] && { restore; exit 0; }
fi

hr; echo "SCENARIO B — corrupted Knowify page (duplicate) WITH re-pull configured"; echo "             (expect: self-heal, then PASS, then promote)"; hr
rm -f "$LANDING"/*.csv                                  # reset landing to 'yesterday'
cp "$RAW/knowify_jobs_p2.json" "$RAW/knowify_jobs_p3.json"   # break it: p3 := p2 (dup)
MDG_LANDING="$LANDING" MDG_REPULL_CMD="$ROOT/deploy/mock_repull.sh" python3 "$HERE/refresh_safe.py"
echo "Landing CSVs after B: $(ls "$LANDING"/*.csv 2>/dev/null | wc -l)  (expected 16 — promoted after heal)"
restore

hr; echo "SCENARIO C — same corruption but NO re-pull wired (expect: blocked + exact fix, no promote)"; hr
rm -f "$LANDING"/*.csv
cp "$RAW/knowify_jobs_p2.json" "$RAW/knowify_jobs_p3.json"   # break it again
MDG_LANDING="$LANDING" MDG_MAX_RETRIES=1 python3 "$HERE/refresh_safe.py"; rc=$?
echo "Exit code: $rc  (1 = correctly blocked)"
echo "Landing CSVs after C: $(ls "$LANDING"/*.csv 2>/dev/null | wc -l)  (expected 0 — yesterday's data preserved)"
restore

hr; echo "Dry run complete. Repo raw inputs restored."; rm -rf "$BACKUP" "$LANDING"
