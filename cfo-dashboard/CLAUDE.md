# CLAUDE.md — CFO Dashboard

Every value renders from `data/snapshot.json` — there are **no hardcoded numbers**.

## Monthly refresh flow

```bash
cd cfo-dashboard
./scripts/refresh.sh prompt   # prints a copy/paste prompt for Claude Code
# Paste into Claude Code — it pulls live P&L + Cash Flow via the QuickBooks
# MCP and saves each response under data/raw/ and data/raw/months/
./scripts/refresh.sh build    # build_snapshot.py → data/snapshot.json
# Open index.html (re-reads snapshot.json on load)
```

**Only Claude Code has QuickBooks MCP access** — the dashboard itself never
calls QuickBooks directly. Keep `data/raw/` as the verifiable source of truth;
all formulas are documented in both `README.md` and `ACCOUNT_MAP.md`.

`ACCOUNT_MAP.md` is the audit map: every QuickBooks account → dashboard tab/KPI.
