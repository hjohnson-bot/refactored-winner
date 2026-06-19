# Deploy — automated nightly refresh (the runnable pieces)

Ready-to-deploy files for **Option C** (full SOP: [`../SOP_Automated_Refresh.md`](../SOP_Automated_Refresh.md)).
Put these on the always-on Windows gateway host.

| File | Role |
|---|---|
| `refresh_job.cmd` | The nightly job: pull → **self-healing** build/validate/promote (`refresh_safe.py`) → CSVs land for Power BI. |
| `install_task.ps1` | Registers `refresh_job.cmd` as a Windows Scheduled Task (daily 03:30, service account, auto-retry). |
| `../scripts/refresh_safe.py` | **Self-healing orchestrator**: build → validate → on failure *diagnose + auto-fix + rebuild*, loop, then promote. Escalates only when it can't heal — with the exact fix. |
| `../scripts/validate_refresh.py` | Phase-7 gate: asserts the model ties to QuickBooks + Knowify; exit 1 blocks promotion. |
| `../scripts/dry_run.sh` | Smoke test: proves healthy → self-heal → blocked-with-solution on this host. |
| `mock_repull.sh` | Test stub for `MDG_REPULL_CMD` used by `dry_run.sh`. |

## Self-healing (don't just report failures — fix them)

When a check fails, `refresh_safe.py` **diagnoses the cause and applies a targeted fix
before alerting**:

| Failing check | Auto-fix |
|---|---|
| Knowify job pages incomplete (e.g. a paging race dropped a page) | re-pull the exact offsets with a stable order, rebuild, re-validate |
| Revenue / Net Income don't tie to QB | re-pull QB P&L + Cash Flow, rebuild |
| A/R or A/P don't tie to the balance sheet | re-pull balance sheet + the aging report, rebuild |

Auto-fixes need `REPULL_CMD` set (a token-aware re-pull: `<cmd> jobs:200` etc.). Without
it, the job still **prints the precise manual fix** and preserves yesterday's good data —
it never silently publishes broken numbers. Validate the loop on the host:

```
./scripts/dry_run.sh      # Scenario A healthy, B self-heal, C blocked-with-solution
```

## 15-minute setup

1. **Clone** the repo to the host and check out the branch:
   ```
   git clone <repo-url> C:\MDG\repo
   cd C:\MDG\repo && git checkout claude/mdg-power-bi-dashboard-AHC6d
   ```
2. **Edit `refresh_job.cmd`** — set `REPO`, `LANDING`, `BASH` (Git Bash path), `LOGDIR`,
   and `PULL_CMD` (your data-pull command; leave blank to rebuild from existing
   `build\raw\` while you wire up the pull).
3. **Test the build + gate manually** (no schedule yet):
   ```
   C:\MDG\repo\mdg-powerbi\deploy\refresh_job.cmd
   ```
   Check `C:\MDG\logs\refresh_*.log` ends with `[DONE]`, and that `LANDING` now holds the CSVs.
4. **Wire the pull** (`PULL_CMD`): a headless Claude Code run that executes the steps from
   `scripts\refresh.sh prompt` and saves raw JSON to `build\raw\` — *or* your native
   QB/Knowify CSV exports (SOP Phase 2A / 2B).
5. **Schedule it** (elevated PowerShell):
   ```
   powershell -ExecutionPolicy Bypass -File C:\MDG\repo\mdg-powerbi\deploy\install_task.ps1
   ```
6. **Point Power BI at `LANDING`** and set scheduled refresh to **04:00** (SOP Phases 3–6).

## Validation gate behavior

`validate_refresh.py` reads `data/_reconciliation.json` and passes only when YTD revenue
and net income tie to QuickBooks, trade A/R and A/P tie to the balance sheet, and every
Knowify job page was captured. On failure the job logs `[FAIL] validation gate - NOT
promoting CSVs` and leaves the previous good CSVs in `LANDING` untouched. Add an email/Teams
alert in the `:fail` block of `refresh_job.cmd`.

> Test it yourself anywhere: `python scripts/validate_refresh.py` → prints a PASS/FAIL table.
