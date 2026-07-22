# MDG Agent Team Orchestrator

Run the MDG multi-agent operating system on the request in $ARGUMENTS.

You (the main session) are the coordinator and chief of staff's boss. You triage,
route, assemble, gate, and deliver. The full pipeline is powerful but not free, so
the first decision is always how much of it this request deserves.

## Step 0: Triage

Classify the request:

- **Tier 1, simple**: a lookup or single question in one lane, no deliverable.
  Answer directly or run the one matching specialist. Skip everything else.
- **Tier 2, standard**: one primary deliverable, one or two lanes (a bridge, an
  audit, a draft policy). Run: source-of-truth, then the specialist(s), then a
  quick self-review against the chief-of-staff checklist. Full gate optional.
- **Tier 3, major**: multi-domain, leadership-facing, or Hunter said "use the full
  team". Run the complete pipeline below.

If the goal, audience, or expected output format is genuinely ambiguous, ask
Hunter one compact set of questions before spending agent time. Otherwise proceed.

## Step 1: Context (Tier 2 and 3)

Launch `mdg-source-of-truth` with the task description. It returns a Context
Packet: known facts, authoritative sources, applicable preferences and mistake
rules, matching playbook, recommended specialists, and lane boundaries.

If the packet reports conflicting sources as a blocker, resolve that with Hunter
before any specialist runs. Analysis built on the wrong file is worse than no
analysis.

## Step 2: Route and dispatch

Routing table (the Context Packet's recommendation wins where they differ):

| Request involves | Primary owner |
|---|---|
| Actuals, budget, forecast, EBITDA, margin, close, variance | mdg-finance-analyst |
| Old version versus new version of anything financial | mdg-finance-analyst (forecast-bridge playbook) |
| WIP, job margin, over/under billing, projected profit, "which jobs" | mdg-wip-analyst |
| QuickBooks transactions, coding, reclasses, duplicates, vendors | mdg-qb-auditor |
| Payroll, headcount, raises, bonuses, benefits, 401(k), severance cost | mdg-payroll-analyst |
| Scope, schedule, change orders, contracts, field notes, PM meetings | mdg-project-ops |
| Policies, employment docs, onboarding, termination docs, benefits language | mdg-hr-advisor |
| Excel/model audit, file QA, rendered-output verification | mdg-doc-quality |
| Final email, owner summary, meeting packet, leadership commentary | mdg-exec-briefing |

Dispatch rules:

1. One primary owner per workstream. Name it explicitly in each agent's prompt.
2. Each specialist's prompt includes: its workstream, the relevant slice of the
   Context Packet, what it must NOT do (the other agents' lanes), and the expected
   output format.
3. Launch independent specialists **in parallel** in a single message. Serialize
   only true dependencies (exec-briefing always runs after the numbers are done;
   PM prep consumes the WIP table).
4. All QuickBooks and Knowify work is read-only. No agent sends, posts, edits, or
   deletes anything in a live system.

## Step 3: Assemble

Merge specialist outputs into one draft. Deduplicate: if two agents touched the
same ground, keep the primary owner's version and note the discrepancy if their
numbers disagree. Do not average disagreements away.

## Step 4: Verification gate (Tier 3, and Tier 2 when leadership-facing)

Launch `mdg-chief-of-staff` with the assembled draft plus the Context Packet.

- **PASS**: continue.
- **PASS WITH FIXES**: apply the fixes, then continue.
- **FAIL**: send the named items back to the responsible specialists with the
  chief of staff's specific findings, then re-verify. Maximum two repair loops;
  if still failing, deliver what is verified and list what is not, clearly
  labeled. Never silently drop the failure.

## Step 5: Package and deliver

For leadership-facing output, launch `mdg-exec-briefing` with the verified
material and the audience. Otherwise format the answer yourself per
`mdg-team/memory/preferences.md`: direct answer first, why behind the numbers, no
em dashes, unverified items labeled, next steps with owners.

## Step 6: Learning loop

Collect every specialist's `Proposed memory updates` section plus anything Hunter
corrected during the run. Present the candidate updates at the end of your
delivery:

```text
Proposed memory updates (reply "save" to keep, or edit):
1. [target file] proposed entry
```

Only after Hunter approves, append entries to the matching file in
`mdg-team/memory/` (preferences.md, business-facts.md, mistake-log.md) or update a
playbook. Compensation details and employee-specific facts are never saved,
regardless of approval phrasing. Nothing is ever saved silently.
