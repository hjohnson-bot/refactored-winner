# Deploy — automated nightly refresh (the runnable pieces)

Ready-to-deploy files for **Option C** (full SOP: [`../SOP_Automated_Refresh.md`](../SOP_Automated_Refresh.md)).
Put these on the always-on Windows gateway host.

| File | Role |
|---|---|
| `refresh_job.cmd` | The nightly job: pull → `refresh.sh build` → **validate** → promote CSVs to the Power BI landing folder. Aborts (no promote) if validation fails. |
| `install_task.ps1` | Registers `refresh_job.cmd` as a Windows Scheduled Task (daily 03:30, service account, auto-retry). |
| `../scripts/validate_refresh.py` | Phase-7 gate: asserts the model ties to QuickBooks + Knowify; exit 1 blocks promotion. |

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
