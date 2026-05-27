#!/usr/bin/env bash
# discover-claude-artifacts.sh
#
# Stage local Claude artifacts and reporting-related files into
# reporting-inventory/INBOX/ so a local Claude Code session can analyze them.
#
# READ-ONLY on source. Never deletes. Never reads file contents during
# discovery (only stat). Writes only inside reporting-inventory/.
#
# Usage:
#   bash reporting-inventory/scripts/discover-claude-artifacts.sh [options]
#
# Options:
#   --dry-run     Print what would be staged; don't touch anything.
#   --copy        Copy files instead of symlinking (default: symlink).
#   --age-days N  Only consider files modified in the last N days (default: 180).
#   --quiet       Suppress per-file output.
#   -h, --help    Show this help.
#
# Designed for macOS (bash 3.x, BSD find, BSD stat). Will also work on Linux
# with GNU coreutils.

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve workspace root (the directory containing reporting-inventory/)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
INBOX="${WORKSPACE_DIR}/INBOX"
MANIFEST="${INBOX}/_discovery-manifest.tsv"

if [[ ! -d "${INBOX}" ]]; then
  echo "ERROR: INBOX not found at ${INBOX}" >&2
  echo "       Run this script from a checkout that contains reporting-inventory/" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Parse args
# ---------------------------------------------------------------------------
DRY_RUN=0
MODE="symlink"   # symlink | copy
AGE_DAYS=180
QUIET=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=1; shift ;;
    --copy)      MODE="copy"; shift ;;
    --age-days)  AGE_DAYS="${2:-180}"; shift 2 ;;
    --quiet)     QUIET=1; shift ;;
    -h|--help)
      sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

log() { [[ $QUIET -eq 0 ]] && echo "$@" || true; }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
# BSD-vs-GNU stat shim (size + mtime epoch)
stat_size_mtime() {
  local f="$1"
  if stat -f '%z %m' "$f" >/dev/null 2>&1; then
    stat -f '%z %m' "$f"   # BSD/macOS
  else
    stat -c '%s %Y' "$f"   # GNU/Linux
  fi
}

# SHA-256 first 12 chars (portable: prefer shasum, fall back to sha256sum)
sha12() {
  local f="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" 2>/dev/null | awk '{print substr($1,1,12)}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" 2>/dev/null | awk '{print substr($1,1,12)}'
  else
    echo "nohash"
  fi
}

# Initialize manifest (overwritten each run for idempotency)
init_manifest() {
  if [[ $DRY_RUN -eq 1 ]]; then return 0; fi
  {
    printf 'timestamp\tsource_area\tsource_path\tsize_bytes\tmtime_epoch\tsha12\tstaged_path\n'
  } > "${MANIFEST}"
}

# Stage one file. Args: source_area, absolute_source_path
stage() {
  local area="$1" src="$2"
  [[ -e "$src" ]] || return 0
  [[ -f "$src" ]] || return 0  # skip dirs, sockets, etc.

  local base
  base="$(basename "$src")"

  # Prefix with first 8 chars of sha to avoid collisions across source folders
  local hash; hash="$(sha12 "$src")"
  local short="${hash:0:8}"
  local dest_dir="${INBOX}/${area}"
  local dest="${dest_dir}/${short}__${base}"

  local sm; sm="$(stat_size_mtime "$src")"
  local size="${sm%% *}"
  local mtime="${sm##* }"
  local now; now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [[ $DRY_RUN -eq 1 ]]; then
    log "[dry-run] ${area}/${short}__${base}  (${size}B)"
    return 0
  fi

  mkdir -p "$dest_dir"

  if [[ -e "$dest" || -L "$dest" ]]; then
    # Idempotent: skip if already staged
    log "[skip ] ${area}/${short}__${base}  (already staged)"
  else
    if [[ "$MODE" == "copy" ]]; then
      cp -p "$src" "$dest"
      log "[copy ] ${area}/${short}__${base}"
    else
      ln -s "$src" "$dest"
      log "[link ] ${area}/${short}__${base}"
    fi
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$now" "$area" "$src" "$size" "$mtime" "$hash" "$dest" >> "${MANIFEST}"
}

# Walk a directory tree applying a name pattern and age filter.
# Args: source_area, root_dir, [extra find predicates...]
walk() {
  local area="$1"; shift
  local root="$1"; shift
  [[ -d "$root" ]] || { log "[miss ] ${area}: ${root} not found"; return 0; }

  log ""
  log "── ${area} ── ${root}"

  # NUL-delimited to handle spaces in filenames; BSD find compatible.
  while IFS= read -r -d '' f; do
    stage "$area" "$f"
  done < <(find "$root" -type f -mtime "-${AGE_DAYS}" "$@" -print0 2>/dev/null)
}

# ---------------------------------------------------------------------------
# Discovery plan
# ---------------------------------------------------------------------------
init_manifest

log "discover-claude-artifacts.sh"
log "  workspace : ${WORKSPACE_DIR}"
log "  inbox     : ${INBOX}"
log "  mode      : ${MODE}${DRY_RUN:+   (DRY RUN)}"
log "  age limit : last ${AGE_DAYS} days"

# 1. Claude Desktop / Claude Cowork application support
for dir in \
  "${HOME}/Library/Application Support/Claude" \
  "${HOME}/Library/Application Support/Claude Code" \
  "${HOME}/Library/Application Support/Claude Cowork" \
  "${HOME}/Library/Application Support/com.anthropic.claude" ; do
  walk "claude-desktop" "$dir" \
    \( -name '*.json' -o -name '*.md' -o -name '*.txt' -o -name '*.html' \
       -o -name '*.pdf' -o -name '*.csv' -o -name '*.xlsx' \)
done

# 2. Claude Code local memory & project transcripts
walk "claude-code-projects" "${HOME}/.claude/projects" \
  \( -name '*.jsonl' -o -name '*.json' -o -name '*.md' \)
walk "claude-code-memory" "${HOME}/.claude/memory" \
  \( -name '*' \)
walk "claude-code-todos" "${HOME}/.claude/todos" \
  \( -name '*' \)
walk "claude-code-plans" "${HOME}/.claude/plans" \
  \( -name '*.md' \)

# 3. Desktop — recent business-document file types
walk "desktop" "${HOME}/Desktop" \
  \( -name '*.xlsx' -o -name '*.xls' -o -name '*.xlsm' -o -name '*.csv' \
     -o -name '*.pdf' -o -name '*.md' -o -name '*.docx' -o -name '*.doc' \
     -o -name '*.numbers' -o -name '*.pages' -o -name '*.txt' \)

# 4. Downloads — recent business-document file types
walk "downloads" "${HOME}/Downloads" \
  \( -name '*.xlsx' -o -name '*.xls' -o -name '*.xlsm' -o -name '*.csv' \
     -o -name '*.pdf' -o -name '*.md' -o -name '*.docx' -o -name '*.doc' \
     -o -name '*.numbers' -o -name '*.pages' -o -name '*.txt' \)

# 5. Documents — recent business-document file types
walk "documents" "${HOME}/Documents" \
  \( -name '*.xlsx' -o -name '*.xls' -o -name '*.xlsm' -o -name '*.csv' \
     -o -name '*.pdf' -o -name '*.md' -o -name '*.docx' -o -name '*.doc' \
     -o -name '*.numbers' -o -name '*.pages' -o -name '*.txt' \)

# 6. Documents subfolders matching reporting keywords (anything inside,
#    regardless of file extension — these folders are likely full of source data)
KEYWORDS=(
  "*Report*" "*report*"
  "*TI*" "*Tenant*"
  "*MF*" "*Multi*Family*" "*MultiFamily*"
  "*Midwest*" "*MDG*"
  "*Knowify*"
  "*QuickBooks*" "*QBO*"
  "*Steve*"
  "*CFO*"
  "*Forecast*" "*Projection*"
  "*Cash*Flow*"
  "*Budget*"
)
for kw in "${KEYWORDS[@]}"; do
  while IFS= read -r -d '' folder; do
    walk "documents-keyword" "$folder"
  done < <(find "${HOME}/Documents" -type d -iname "$kw" -print0 2>/dev/null)
done

# 7. iCloud Drive Desktop & Documents (if user has iCloud Drive enabled)
ICLOUD_BASE="${HOME}/Library/Mobile Documents/com~apple~CloudDocs"
if [[ -d "$ICLOUD_BASE" ]]; then
  walk "icloud-desktop" "${ICLOUD_BASE}/Desktop" \
    \( -name '*.xlsx' -o -name '*.csv' -o -name '*.pdf' -o -name '*.md' \
       -o -name '*.docx' -o -name '*.numbers' \)
  walk "icloud-documents" "${ICLOUD_BASE}/Documents" \
    \( -name '*.xlsx' -o -name '*.csv' -o -name '*.pdf' -o -name '*.md' \
       -o -name '*.docx' -o -name '*.numbers' \)
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
log ""
if [[ $DRY_RUN -eq 1 ]]; then
  log "Dry run complete. Re-run without --dry-run to stage."
else
  if [[ -f "${MANIFEST}" ]]; then
    staged="$(grep -cv '^timestamp' "${MANIFEST}" 2>/dev/null || echo 0)"
  else
    staged=0
  fi
  log "Staged ${staged} files. Manifest: ${MANIFEST}"
  log ""
  log "Next: launch local Claude Code in this repo and ask it to process INBOX/."
fi
