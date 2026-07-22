# MDG Retro: Learning and Efficiency Review

Run the MDG team's learning loop on recent work. This replaces the original
design's "Efficiency and Optimization Agent that constantly watches" (impossible)
with something that actually compounds: a periodic review that mines real evidence
and writes approved lessons to the team's memory files.

Use weekly, after a major deliverable, or whenever Hunter corrects the same thing
twice. Scope: $ARGUMENTS (default: this session's conversation).

## Step 1: Gather evidence

Review, as available: this session's conversation and corrections from Hunter,
recent MDG deliverables in the repo, the current contents of
`mdg-team/memory/*.md`, and the playbooks in `mdg-team/playbooks/`.

## Step 2: Mine four categories

1. **Preferences**: anything Hunter corrected about tone, format, structure, or
   delivery that is not yet in `preferences.md`.
2. **Business facts**: stable facts that surfaced and were confirmed (new jobs,
   classifications, targets, system-of-record changes). Facts still unconfirmed
   get the `[verify]` tag.
3. **Mistakes**: anything that had to be redone, and the rule that would have
   prevented it. One rule per mistake, written so an agent can follow it
   mechanically.
4. **Process**: steps that were invented on the fly and will recur. These become
   playbook edits or a new playbook in `mdg-team/playbooks/`.

## Step 3: Efficiency findings

Separately, report:

1. Repeated prompts or workflows that deserve a playbook or a scheduled job
   (note `schedule.json` already runs `/knowify-report` nightly; recurring
   pulls can ride the same mechanism).
2. Places two agents did overlapping work, with the lane fix.
3. Manual steps that a script in this repo could replace.
4. Estimated time saved per month for each, so Hunter can pick by ROI.

## Step 4: Propose, then save on approval

Present everything as a numbered list of concrete diffs:

```text
Proposed updates (reply with numbers to save, or edit):
1. preferences.md: add "..."
2. mistake-log.md: add entry "YYYY-MM-DD slug ..."
3. playbooks/forecast-bridge.md: add step "..."
4. NEW playbook: pm-weekly-checkin.md (draft below)
```

Apply only what Hunter approves, exactly as approved. Hard rules: no compensation
or employee-specific details in memory files, no unverified numbers stored as
facts, nothing saved silently.
