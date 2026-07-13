---
allowed-tools: Bash(git:*), Bash(rm:*), Bash(ls:*), Bash(pwd:*), Bash(grep:*)
argument-hint: --all | --branch wt/name | --dry-run
description: Remove merged worktrees and their branches from the main repo
---

# Worktree Cleanup

Remove worktrees and branches that have been merged: $ARGUMENTS

## Purpose

Tear down finished worktrees and delete their merged `wt/*` branches (local + remote), then prune stale worktree metadata. **Run this from the main repository** — never from inside a worktree.

## Preconditions / Arguments

- **cwd:** the main working tree (first entry of `git worktree list`). Refuse if run from a worktree.
- **`$ARGUMENTS`:**
  - `--all` — clean up every **merged** `wt/*` worktree and branch.
  - `--branch wt/<name>` — clean up one specific worktree/branch (only if merged).
  - `--dry-run` — show the table of what *would* happen and stop; change nothing.
  - *(no args)* — list `wt/*` worktrees and ask which merged ones to clean.
- **Merged** means merged into `origin/<main-branch>` (see Step 3). Unmerged branches are always skipped.

## Process

### Step 1: Validate Environment

1. Confirm this is the **main working tree** (first entry of `git worktree list`). If inside a worktree, warn and stop: "Run `/worktree-cleanup` from the main repo, not from a worktree."
2. Fetch and prune: `git fetch origin --prune`.
3. Determine the main branch (`main`/`master`) as in `/worktree-init`.

### Step 2: Parse Arguments

Read `$ARGUMENTS` for `--all`, `--branch wt/<name>`, or `--dry-run`. With no args, list worktrees and ask.

### Step 3: Identify Worktrees

1. `git worktree list`.
2. `git branch --list 'wt/*'`.
3. Merged locals: `git branch --merged origin/<main-branch> | grep 'wt/'`.
4. Merged remotes: `git branch -r --merged origin/<main-branch> | grep 'origin/wt/'`.

A branch is eligible only if it appears in the merged lists. Ignore any branch that does not match `wt/*`.

### Step 4: Display Status

```
| Branch | Worktree Path | Merged? | Action |
|--------|--------------|---------|--------|
| wt/login-page | ../worktrees/repo/wt-login-page | Yes | Will remove |
| wt/auth-bug   | ../worktrees/repo/wt-auth-bug   | No  | Skipped (not merged) |
```

### Step 5: Confirm and Execute

If `--dry-run`, show the table and stop. Otherwise use AskUserQuestion to confirm (skip the prompt only when `--all` targets exclusively merged branches).

For each **merged** worktree/branch:

1. Remove the worktree (no `--force`):
   ```bash
   git worktree remove <path>
   ```
   If it fails (dirty worktree), **warn and skip** — never force.
2. Delete the local branch with the safe flag:
   ```bash
   git branch -d wt/<name>
   ```
   `-d` refuses unmerged branches by design; if it refuses, skip and report.
3. Delete the remote branch:
   ```bash
   git push origin --delete wt/<name>
   ```
   If the remote branch is already gone, ignore the error silently.

### Step 6: Prune

```bash
git worktree prune
```

### Step 7: Summary

Print this exact block:

```
Cleanup Complete
──────────────────────────────────
Removed:  <N> worktree(s)
Deleted:  <N> local branch(es)
Deleted:  <N> remote branch(es)
Skipped:  <N> unmerged branch(es)
──────────────────────────────────
```

If any unmerged branches were skipped, list them and suggest:
- Merge the PR first, then run cleanup again, **or**
- If the work is truly abandoned, the user can manually `git worktree remove --force <path>` and `git branch -D wt/<name>` — but this command will not do that for them.

## Examples

**`$ARGUMENTS` = `--all`**, one merged + one unmerged:

```
| Branch | Worktree Path | Merged? | Action |
|--------|--------------|---------|--------|
| wt/add-login-page | ../worktrees/refactored-winner/wt-add-login-page | Yes | Will remove |
| wt/fix-auth-timeout | ../worktrees/refactored-winner/wt-fix-auth-timeout | No | Skipped (not merged) |

Cleanup Complete
──────────────────────────────────
Removed:  1 worktree(s)
Deleted:  1 local branch(es)
Deleted:  1 remote branch(es)
Skipped:  1 unmerged branch(es)
──────────────────────────────────
Skipped (not merged): wt/fix-auth-timeout — merge its PR first, then re-run.
```

**`$ARGUMENTS` = `--dry-run`** prints the table above and stops without changing anything.

## Never do

- **Never** force-remove a dirty worktree (`git worktree remove --force`) — warn and skip.
- **Never** use `git branch -D` on unmerged branches; only `git branch -d` (safe) here.
- **Never** delete branches that don't match `wt/*` — leave `main`, `master`, feature branches, and any non-worktree branch untouched.
- **Never** run from inside a worktree — only from the main working tree.
- **Never** delete a worktree/branch that isn't in the merged lists, even with `--all`.
