# Reporting Inventory Workspace

A working folder for Steve's request (post-lunch email): a comprehensive
inventory of every report, projection, analysis, and recurring spreadsheet
model Hunter is currently running for **TI (Tenant Improvement)**,
**MF (Multi-Family)**, and the Company rollup (Midwest Design Group LLC).

## ⚠️ Two-session workflow (cloud → local)

This workspace was scaffolded in a **cloud Claude Code session** (running in
an ephemeral VM, no access to your Mac). The real file ingestion needs to
happen in a **local Claude Code session on your Mac** so that
`~/Desktop`, `~/Documents`, `~/Downloads`, Claude Desktop / Claude Cowork /
Claude Code memory directories are all reachable.

```
┌──────────────────────────┐   git push    ┌──────────────────────────┐
│  Cloud session (this)    │  ───────────► │  Local session (your Mac)│
│  • scaffolds folders     │               │  • runs discovery script │
│  • writes templates      │               │  • populates INBOX/      │
│  • seeds inventory.md    │               │  • fills inventory.md    │
│  • opens draft PR        │               │  • builds drafts/*.xlsx/pdf
└──────────────────────────┘               └──────────────────────────┘
```

## Folder layout

```
reporting-inventory/
├── README.md                         ← you are here
├── INBOX/                            drop ANY file here (git-ignored)
├── notes/                            per-file analysis notes (git-ignored)
├── templates/
│   └── report-entry-template.md      the 14-field per-report template
├── scripts/
│   └── discover-claude-artifacts.sh  Mac-only: scan local dirs → stage into INBOX/
├── drafts/                           polished outputs for Steve
│   ├── cover-memo.md                 1-page memo + 5 talking points
│   └── inventory.csv                 header-row CSV (populated later)
└── inventory.md                      living single-source-of-truth inventory
```

## How to run the local session

After this draft PR lands (or before — the branch is pushed):

```bash
# 1. On your Mac, pull the branch
cd ~/where/refactored-winner/lives
git fetch origin
git checkout claude/reporting-inventory-analysis-oEMkp
git pull

# 2. (Optional) preview what the discovery script would stage
bash reporting-inventory/scripts/discover-claude-artifacts.sh --dry-run

# 3. Stage local Claude artifacts + reporting files into INBOX/
bash reporting-inventory/scripts/discover-claude-artifacts.sh

# 4. Launch local Claude Code in this repo
claude
```

In that local session, tell Claude:

> Read `reporting-inventory/README.md`. Walk every file in
> `reporting-inventory/INBOX/`, write per-file analysis to
> `reporting-inventory/notes/`, and populate
> `reporting-inventory/inventory.md` using the template at
> `reporting-inventory/templates/report-entry-template.md`. Ask me
> clarifying questions when you can't infer requester / time commitment /
> overlap. Finally, build the Excel and PDF deliverables in
> `reporting-inventory/drafts/`.

## The 7 fields Steve asked for, per report

1. Who requested it
2. Purpose / reason
3. Frequency
4. Approximate time commitment (prep + maintain)
5. Owner of underlying data and of final output
6. Classification: operationally critical / informational / discretionary
7. Known overlap or duplication with other reports

The template captures these 7 + 7 useful extras for your own management.

## Why INBOX/ and notes/ are git-ignored

Source materials may contain financials, employee names, customer data, or
partner-level numbers. The folder *structure* ships in git so the workspace
is reproducible; the *contents* stay on your machine. Only `inventory.md`,
`drafts/`, and `templates/` are committed.

If you need to share specific source files with the team, copy them somewhere
else outside `INBOX/`.

## Status checklist

- [x] Workspace scaffolded (cloud session)
- [x] Inventory seeded with reports inferable from `cfo-dashboard/`
- [ ] Local discovery script executed
- [ ] All known reports captured in `inventory.md`
- [ ] Clarifying questions resolved
- [ ] `drafts/inventory.xlsx`, `drafts/inventory.csv`, `drafts/cover-memo.pdf` built
- [ ] Final deliverable sent to Steve
