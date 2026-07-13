---
allowed-tools: Bash(git:*), Bash(gh:*), Bash(rm:*), Bash(cat:*), Bash(pwd:*), Bash(ls:*)
description: Commit, push, and open a PR from the current worktree
---

# Worktree Deliver

Commit all work, push, and create a pull request from the current worktree.

## Purpose

Package the work in the current worktree into a commit, push the branch, and open a PR. **Run this from inside the worktree** whose work you want to deliver (a `wt/*` branch created by `/worktree-init`).

## Preconditions / Arguments

- **cwd:** the worktree to deliver. No arguments.
- **Main working tree** — the first entry of `git worktree list`; if `pwd` matches it, refuse (deliver from a worktree, not the main repo).
- **Requires:** `gh` authenticated (`gh auth status`) and a writable `origin` remote.
- **Assumptions:** the branch should follow `wt/*`; warn and confirm if it doesn't.

## Process

### Step 1: Validate Environment

1. Confirm this is a worktree, not the main working tree, via `git worktree list`. If it's the main repo, stop and tell the user to run from a worktree.
2. Current branch: `git branch --show-current`.
3. If the branch doesn't match `wt/*`, warn and ask before continuing.
4. Read `.worktree-task.md` (if present) to recover the original task description **before** deleting it in Step 3.

### Step 2: Review Changes

1. `git diff --stat` and `git diff --cached --stat` — show all changes.
2. `git status --short` — full picture, including untracked files.
3. If there is nothing to deliver (clean tree AND no commits ahead of base), inform the user and stop.

### Step 3: Clean Up Task File

Remove the task file so it never lands in the commit:

```bash
rm -f .worktree-task.md
```

### Step 4: Confirm Files to Commit

Use AskUserQuestion to show what will be committed (list modified, added, untracked files). Before proposing to stage, scan for anything that must not be committed — `.env` / secret files, credentials, tokens, keys, large binaries — and exclude them by default, calling out anything skipped.

Options:
- "Stage all changes" — stage everything (minus the excluded secrets above).
- "Let me choose" — user specifies which files to include.

### Step 5: Stage and Commit

1. Stage the confirmed files with `git add` (never `git add -A` blindly if secrets were flagged).
2. Determine the conventional commit type from the diff:
   - `feat:` new functionality/files/exports/endpoints
   - `fix:` bug fixes, corrected behavior
   - `refactor:` restructuring without behavior change
   - `docs:` docs only
   - `test:` tests only
   - `chore:` build/config/maintenance
3. Generate `<type>: <subject>` (subject max 72 chars) from the task description + a summary of the actual diff.
4. Show the message via AskUserQuestion: "Use this message" / "Let me write my own". If the user writes their own, validate conventional-commit format (warn but allow).
5. Always include a short body (2-3 bullets if multi-change) and the standard co-author line.
6. Commit with a HEREDOC:
   ```bash
   git commit -m "$(cat <<'EOF'
   <type>: <subject>

   - <bullet>
   - <bullet>

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

### Step 6: Push

```bash
git push -u origin HEAD
```

The `-u` sets upstream on first push. On any other failure, show the error and suggest a fix (e.g. `git pull --rebase` if the remote moved).

### Step 7: Create Pull Request

1. Determine the base branch (`main`/`master`) as in `/worktree-init`.
2. Open the PR:
   ```bash
   gh pr create --base <main-branch> --title "<PR title>" --body "$(cat <<'EOF'
   ## Summary

   <bullets from task description + diff>

   ## Original Task

   <task description from .worktree-task.md>

   ## Changes

   <git diff --stat summary>

   ---
   Created from worktree `wt/<name>` using `/worktree-deliver`
   EOF
   )"
   ```
3. Display the PR URL prominently.

### Step 8: Next Steps

Tell the user:
- PR is ready at `<URL>`.
- After merging, run `/worktree-cleanup` from the main repo.
- This panel can be closed.

## Examples

**Deliver `wt/fix-auth-timeout`, one changed file:**

```
Reviewing changes on wt/fix-auth-timeout...
 src/auth/session.js | 12 +++++---
Proposed commit: fix: extend auth session timeout to 30m
[confirmed] Committed 1 file.
Pushed wt/fix-auth-timeout → origin.

PR opened:
https://github.com/acme/refactored-winner/pull/482

Next: after merge, run /worktree-cleanup from the main repo.
```

## Never do

- **Never** commit `.worktree-task.md` — always `rm -f` it first (Step 3).
- **Never** commit `.env` files, secrets, tokens, keys, or credentials; exclude and warn.
- **Never** deliver from the main working tree — only from a `wt/*` worktree.
- **Never** use `git add -A` when secrets were flagged; stage explicit paths.
- **Never** force-push (`--force`); if the push is rejected, surface the error and suggest a rebase.
- **Never** invent a task description if `.worktree-task.md` is missing — derive the PR body from the diff instead.
