# MDG Agent Team

A working multi-agent operating system for Midwest Design Group finance, project, HR, and
document work, built natively on Claude Code. This is the production version of the
23-agent design drafted in the July 2026 planning conversation, rebuilt so it actually
runs against live data instead of describing itself on paper.

## Why this version is different from the original design

The original blueprint had three structural problems this build fixes:

1. **No data access.** The OpenAI Agents SDK starter had no connection to QuickBooks,
   Knowify, or the forecast files. Every specialist would have produced confident,
   unverifiable numbers. Here, the specialists call the live QuickBooks and Knowify MCP
   tools that are already connected to Claude Code sessions, and read the repo's own
   data (`cfo-dashboard/data/snapshot.json`, AJR exports).

2. **Agents were confused with workflows.** Month-End Close, Forecast Bridge, and
   QuickBooks Coding Audit are not people, they are repeatable processes. They live in
   `mdg-team/playbooks/` and any specialist can execute them. This cut 23 agents down
   to 10 without losing a single capability.

3. **The management layer ran on every request.** Chief of Staff, then Source of Truth,
   then Coordinator, before any work started, is three round trips of pure latency.
   Here the `/mdg` command triages first: simple questions go straight to one
   specialist, and the full pipeline only runs for multi-domain work.

## Architecture

```text
Hunter
  -> /mdg command (triage + routing + assembly, runs in the main session)
      -> mdg-source-of-truth   (context packet: memory, playbooks, files, prior mistakes)
      -> specialists in parallel, one owner per workstream
           mdg-finance-analyst    budget, actuals, forecast, EBITDA, bridges, close
           mdg-wip-analyst        WIP, job margin, over/under billing, cost to complete
           mdg-qb-auditor         transaction coding, duplicates, reclass proposals
           mdg-payroll-analyst    payroll, headcount, raises, bonuses, benefits, taxes
           mdg-project-ops        scope, schedule, change orders, contracts, PM prep
           mdg-hr-advisor         policies, lifecycle docs, benefits explanations
           mdg-doc-quality        Excel/PDF/doc QA, formulas, rendering verification
      -> mdg-chief-of-staff    (verification gate: tie-outs, duplication, risk, gaps)
      -> mdg-exec-briefing     (final packaging in Hunter's voice)
      -> proposed memory updates (saved only after Hunter approves)
```

## Quick start

```text
/mdg Review June actuals versus budget. Identify top variances, explain why each
happened, and draft leadership commentary.
```

Or invoke a single specialist directly when you know the lane:

```text
Use the mdg-wip-analyst agent to review active jobs for margin fade and WIP issues.
```

## Directory layout

| Path | Purpose |
|---|---|
| `.claude/agents/mdg-*.md` | The 10 agents (auto-discovered by Claude Code) |
| `.claude/commands/mdg.md` | `/mdg` orchestrator: triage, routing, QA gate, delivery |
| `.claude/commands/mdg-retro.md` | `/mdg-retro` learning loop: proposes memory updates |
| `mdg-team/memory/business-facts.md` | Stable MDG facts (divisions, targets, jobs, people) |
| `mdg-team/memory/preferences.md` | How Hunter wants work done |
| `mdg-team/memory/mistake-log.md` | Corrections that must never repeat |
| `mdg-team/playbooks/*.md` | Repeatable workflows any specialist executes |

## The learning loop (how agents actually improve)

Agents do not learn on their own. The loop is:

1. Every specialist ends its report with a `Proposed memory updates` section.
2. The `/mdg` command surfaces them to Hunter at delivery time.
3. Only after Hunter approves does the main session append them to the memory files.
4. `mdg-source-of-truth` reads those files at the start of every future run, so the
   next output starts from everything already learned.

Run `/mdg-retro` weekly or after a big deliverable to mine the session for
preferences, corrections, and reusable process steps that were not captured live.

## Standing safety rules (all agents)

1. QuickBooks and Knowify access is **read-only**. Reclasses, invoices, payroll
   changes, and list edits are proposals for a human to make in the live system.
2. Nothing is emailed, sent, deleted, or posted externally without Hunter's approval.
3. Every number in a final output ties to a named source or is labeled **unverified**.
4. Sensitive HR and compensation content never enters memory files without approval.
5. Facts, assumptions, risks, and recommendations are always separated.

## Use case library

The 15 original use cases all still work; the routing is just automatic now.

| Ask | Who runs |
|---|---|
| Monthly close review | finance-analyst (month-end-close playbook) + qb-auditor + wip-analyst + exec-briefing |
| Reforecast / what changed | finance-analyst (forecast-bridge playbook) + wip-analyst |
| QuickBooks transaction cleanup | qb-auditor (qb-coding-audit playbook) |
| Project profitability review | wip-analyst (wip-review playbook) + project-ops |
| Payroll and headcount bridge | payroll-analyst (payroll-bridge playbook) |
| Budget target explanation | finance-analyst |
| Excel model audit | doc-quality + finance-analyst |
| Severance / policy drafting | hr-advisor + payroll-analyst for cost impact |
| Onboarding packet | hr-advisor + project-ops for field content |
| Termination documentation review | hr-advisor (organizes facts; never decides) |
| Leadership meeting packet | full pipeline, exec-briefing packages |
| Email / owner update drafting | exec-briefing |
| Field notes to issue log | project-ops |
| PM meeting prep | wip-analyst + project-ops |
| Account coding cleanup | qb-auditor |
