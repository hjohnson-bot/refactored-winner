# SOP — Automated Refresh for the MDG Executive Dashboard (Option C)

**Owner:** VP Financial Operations (Hunter Johnson)
**Purpose:** Make the dashboard update on a schedule with **zero manual clicks**, so the
CEO/CFO always open current numbers. This is the genuine "automatically links and
updates" behavior from the build spec §9.
**Scope:** the data pull → CSV landing zone → On-premises Data Gateway → Power BI
Service scheduled refresh → published App, plus monitoring, validation, and rollback.

> Until Option C is live, keep using **Option B** (one command): pull fresh data, then
> `./scripts/refresh.sh build`. Option C automates exactly that loop.

---

## 0. End-state architecture

```
 ┌─────────────────────────────┐     nightly      ┌──────────────────────────┐
 │ Data-pull job (scheduled)   │  ───────────────▶ │ Landing folder           │
 │ • QuickBooks Online (MCP)   │  writes build/raw │  …\MDG\PowerBI\data\*.csv │
 │ • Knowify JobsReport (MCP)  │  + runs           └─────────────┬────────────┘
 │ • runs refresh.sh build     │   build scripts                 │ (read by)
 └─────────────────────────────┘                                 ▼
                                              ┌───────────────────────────────┐
                                              │ On-premises Data Gateway       │
                                              │ (standard mode) on an always-  │
                                              │ on Windows host                │
                                              └─────────────┬─────────────────┘
                                                            ▼
                              ┌───────────────────────────────────────────────┐
                              │ Power BI Service — dataset (scheduled refresh) │
                              │ → Report → App (CEO/CFO, read-only)            │
                              └───────────────────────────────────────────────┘
```

Two moving parts to stand up: **(A)** a scheduled job that lands fresh CSVs, and
**(B)** the Power BI Service refresh that reads them through the gateway. Do A first.

---

## Phase 1 — Prerequisites (one-time)

| # | Item | Notes |
|--|--|--|
|1.1| **Power BI Pro** (or Premium Per User / capacity) for every viewer + the publisher | Pro = up to 8 scheduled refreshes/day; PPU/Premium = up to 48. |
|1.2| An **always-on Windows host** (a server, VM, or a PC that never sleeps) | Runs the gateway **and** the data-pull job. A cloud Windows VM is ideal. |
|1.3| **Power BI Desktop** installed (to author/republish the report) | Windows only. |
|1.4| **Python 3.11+** on the host | To run `refresh.sh` / the build scripts. |
|1.5| A **service account** (e.g. `bi-refresh@midwest-designgroup.com`) | Owns the gateway, the dataset, and the schedule. Avoids breakage when a person leaves. |
|1.6| **Claude Code** access for the service account (for the MCP pull) **or** native QB/Knowify CSV exports | See Phase 2 for the two options. |
|1.7| A fixed **landing folder**, e.g. `C:\MDG\PowerBI\data` | The contract between the pull job and Power BI. Back it up. |

---

## Phase 2 — Automate the data pull (Part A)

The live data flows through the **QuickBooks + Knowify MCP** connection, which lives in
a Claude Code session. Choose **2A** (faithful to today's setup) or **2B** (no MCP
dependency). Both end by running `refresh.sh build`, which regenerates the CSVs the
gateway serves.

### Option 2A — Scheduled Claude Code session (recommended; mirrors today)
1. On the host, clone the repo and check out the dashboard branch:
   ```
   git clone <repo-url> C:\MDG\repo
   cd C:\MDG\repo && git checkout claude/mdg-power-bi-dashboard-AHC6d
   ```
2. Save the pull instructions to a prompt file:
   ```
   bash mdg-powerbi/scripts/refresh.sh prompt > C:\MDG\pull_prompt.txt
   ```
3. Create a **recurring Claude Code session** (Claude Code on the web supports scheduled
   triggers; or run headless `claude` via Task Scheduler) that, on each run:
   a. executes the QuickBooks + Knowify MCP pulls in `pull_prompt.txt`, saving raw JSON
      to `mdg-powerbi/build/raw/` (and `months/` for completed months);
   b. runs `bash mdg-powerbi/scripts/refresh.sh build`;
   c. copies `mdg-powerbi/data\*.csv` to the landing folder `C:\MDG\PowerBI\data`;
   d. commits + pushes (optional, for audit history).
4. Schedule it **nightly at 03:30 host time** (before the 4:00 AM Power BI refresh).

### Option 2B — Native exports (no MCP)
If you prefer to remove the Claude/MCP dependency:
1. **QuickBooks**: schedule the needed reports (P&L YTD, Balance Sheet, A/R Aging
   Summary, A/P Aging Summary, Statement of Cash Flows) to email/export as CSV, or use
   the QBO API with the service account. Land them in `C:\MDG\QB_Exports\`.
2. **Knowify**: export the Advanced Jobs Report (AJR) to CSV (or via API) to
   `C:\MDG\Knowify_Exports\`.
3. Adapt `build_dashboard.py`'s parsers to read those CSVs instead of the MCP JSON
   (the transforms — division mapping, AR de-dup, profit-fade — stay identical).
4. Run `refresh.sh build` and copy `data\*.csv` to the landing folder.

> **Validation gate (either option):** `build_dashboard.py` prints the reconciliation and
> writes `data/_reconciliation.json`. The job MUST check that YTD revenue ties to the QB
> P&L and A/R ties to the balance sheet before promoting the CSVs (see Phase 7).

### Schedule the job (Windows Task Scheduler)
1. **Task Scheduler ▸ Create Task** → run whether user is logged on or not, as the
   service account, highest privileges.
2. **Trigger:** Daily, 03:30.
3. **Action:** `Program = C:\Program Files\Git\bin\bash.exe`,
   `Arguments = -lc "cd /c/MDG/repo/mdg-powerbi && ./scripts/refresh.sh build && cp data/*.csv /c/MDG/PowerBI/data/"`
   (or wrap 2A/2B steps in one `refresh_job.cmd`).
4. **Settings:** "If the task fails, restart every 10 min, up to 3 times."

---

## Phase 3 — Install & configure the On-premises Data Gateway (Part B)

1. Sign in to <https://powerbi.microsoft.com> as the **service account**.
2. **Download ▸ Data Gateway** → install the **standard mode** gateway (NOT personal —
   standard supports scheduling, sharing, and multiple datasets) on the always-on host.
3. Launch the installer → **sign in** with the service account →
   **Register a new gateway on this computer** → name it `MDG-BI-Gateway` → set a
   **recovery key** and store it in the password manager.
4. Confirm status shows **"The gateway is online and ready to be used."**
5. Keep the host's Windows + gateway auto-updates on (gateway needs monthly updates).

---

## Phase 4 — Publish the dataset & report

1. On a Windows machine, build the `.pbix` from the kit (see `README.md`): open
   `powerbi/model.bim` in **Tabular Editor**, set the `DataFolder` parameter to
   `C:\MDG\PowerBI\data`, **Save to** a new Power BI Desktop model; apply
   `MDG_Theme.json`; lay out the report pages per spec §7.
2. **File ▸ Publish** → choose/create the workspace **"MDG Executive"**.
3. Confirm the dataset + report appear in the workspace in the Service.

---

## Phase 5 — Bind the dataset to the gateway

1. Service ▸ **Settings (gear) ▸ Manage connections and gateways**.
2. **New connection** under `MDG-BI-Gateway`:
   - **Connection type:** Folder (or File system).
   - **Path:** `C:\MDG\PowerBI\data`.
   - **Authentication:** Windows, the service account credentials.
   - **Privacy level:** Organizational.
3. Go to the **dataset ▸ Settings ▸ Gateway and cloud connections**:
   - Toggle **"Use an On-premises data gateway"** → map the folder data source to the
     connection from step 2.
4. Under **Parameters**, set `DataFolder = C:\MDG\PowerBI\data` (must match the gateway
   host's real path exactly, backslashes and all).
5. **Apply** and run **Refresh now** once to confirm a green success.

---

## Phase 6 — Configure scheduled refresh

1. Dataset ▸ **Settings ▸ Refresh ▸ Scheduled refresh** → **On**.
2. **Time zone:** America/Indianapolis.
3. **Add time:** **04:00** (after the 03:30 pull job). Add a second slot (e.g. 13:00)
   if the team wants a mid-day update — Pro allows up to 8/day.
4. **Send refresh failure notifications to:** the service account **and** Hunter.
5. Save. The first scheduled run confirms the end-to-end loop.

---

## Phase 7 — Validation gate (runs every cycle)

The pull job must **block promotion of bad data**. After `build_dashboard.py`:
1. Read `data/_reconciliation.json` and assert:
   - `periods.YTD2026.revenue` == `qb_pl_income` (QB P&L) within $1.
   - `periods.YTD2026.netIncome` == `qb_cf_netincome` (QB cash flow) within $1.
   - `ar_trade_total` == `ar_balance_sheet` within $50; `ap_total` == `ap_balance_sheet`.
   - `jobs` == `qb_jobs_total` (all Knowify pages captured — watch the pagination race).
2. If any assertion fails, **do not copy CSVs to the landing folder**; alert instead.
   Example guard (add to the job):
   ```python
   import json,sys
   r=json.load(open("data/_reconciliation.json"))
   ok = abs(r["periods"]["YTD2026"]["revenue"]-r["qb_pl_income"])<1 \
     and abs(r["ar_trade_total"]-r["ar_balance_sheet"])<50 \
     and r["jobs"]==r["qb_jobs_total"]
   sys.exit(0 if ok else 1)
   ```
3. The dashboard's **Data Health** sheet/page surfaces the same ties for human review.

---

## Phase 8 — Publish as an App (consumption experience)

1. Workspace ▸ **Create app** → name "MDG Executive Financial Dashboard".
2. **Audience:** add the CEO and CFO (and yourself) as **viewers**; hide the
   Job/PM drillthrough pages from the nav if desired.
3. Publish. Share the App link. Viewers get a clean, read-only, auto-updating report.

### Role-level security (optional, per spec §8)
1. Power BI Desktop ▸ **Modeling ▸ Manage roles**: create **PM** role with
   `Dim_PM[PMName] = USERPRINCIPALNAME()` (or an email→PM lookup); **Executive** role = no filter.
2. Republish. Service ▸ dataset ▸ **Security** → add members to each role.
3. **Test ▸ "View as"** before sharing. RLS filters data, not pages — pair with App
   audiences to hide pages.

---

## Phase 9 — Monitoring & alerting

| Signal | Where | Action |
|--|--|--|
| Refresh failure | Service emails (Phase 6.4) + dataset **Refresh history** | Open history → see error → Phase 11. |
| Gateway offline | Manage connections and gateways → status | Restart the gateway service on the host. |
| Pull job failure | Task Scheduler history / job log | Re-run; check MCP/QB/Knowify auth. |
| Stale data | Dashboard **Data Health** "Last refresh" + reconciliation ties | If ties break, the validation gate (Phase 7) should have blocked it. |

Set a calendar reminder to **review Refresh history weekly** for the first month.

---

## Phase 10 — Rollback / disaster recovery

1. **Bad data promoted:** the landing folder is versioned by the nightly commit (Option
   2A) — restore the prior `data\*.csv` from git (`git checkout <prev> -- mdg-powerbi/data`)
   into the landing folder and **Refresh now**.
2. **Gateway host dies:** install the gateway on a replacement host using the stored
   **recovery key** (Phase 3.3) to recover the same gateway; re-point the path.
3. **Service outage:** the last successful refresh remains visible; no action needed.
4. **Full rebuild:** the repo + `refresh.sh build` reproduce every artifact from
   `build/raw/`.

---

## Phase 11 — Troubleshooting

| Symptom | Likely cause | Fix |
|--|--|--|
| Refresh fails: "DataFolder path not found" | Service `DataFolder` parameter ≠ host path | Set parameter to the exact gateway-host path (Phase 5.4). |
| Refresh fails: gateway not reachable | Gateway offline / host asleep | Set host to never sleep; restart "On-premises data gateway service". |
| Numbers stale though refresh "succeeded" | Pull job didn't update CSVs | Check Task Scheduler ran 03:30; check the validation gate didn't block. |
| A/R suddenly ~3× too high | Knowify/QB aging parent+sub double-count | The de-dup (`parentId="0"`) handles this; confirm it wasn't bypassed. |
| Job count dropped / a page duplicated | Knowify report cursor race on parallel paging | Pull pages **sequentially** with a stable `ProjectId DESC` order (already in `refresh.sh prompt`). |
| Credentials expired | QB/Knowify/MCP token lapsed | Re-auth the service account; rotate per security policy. |

---

## Phase 12 — Responsibilities & cadence

| Task | Owner | Cadence |
|--|--|--|
| Pull job + landing CSVs | service account (automated) | nightly 03:30 |
| Scheduled refresh | Power BI Service (automated) | nightly 04:00 |
| Review refresh history | VP Fin Ops | weekly (then monthly) |
| Gateway/host patching | IT | monthly |
| Re-auth tokens / rotate secrets | IT + VP Fin Ops | per policy (≤90 days) |
| Validate quarter-end ties | VP Fin Ops | quarterly |

**Security:** never store QB/Knowify/Power BI secrets in the repo or CSVs; use the
service account's credential store / the gateway's encrypted credentials. The CSVs
contain financials — keep the landing folder and workspace access restricted to the
finance audience.

---

*Once Phases 1–8 are complete, the dashboard refreshes itself nightly: the pull job lands
validated CSVs, the gateway exposes them, and the Power BI Service rebuilds the model and
App on schedule — no manual steps.*
