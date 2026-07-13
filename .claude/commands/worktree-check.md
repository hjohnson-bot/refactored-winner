---
allowed-tools: Bash(git:*), Bash(cat:*), Bash(pwd:*), Bash(ls:*)
description: Check the current worktree's branch, task, and uncommitted status
---

# Worktree Status Check

Verify the current worktree environment and show task details.

## Purpose

Show, at a glance, which worktree you're in, its branch, its assigned task, and how much uncommitted/undelivered work it holds. **Run this from inside a worktree** (created by `/worktree-init`); it also degrades gracefully if run from the main repo.

## Preconditions / Arguments

- **cwd:** ideally a worktree dir under `../worktrees/<repo>/`. No arguments.
- **Main working tree** — the first entry of `git worktree list`. If `pwd` matches it, you're in the main repo, not a worktree.
- **Assumptions:** read-only; this command never modifies files, stages, or commits.

## Process

### Step 1: Detect Worktree

1. Get the current dir: `pwd`.
2. List worktrees: `git worktree list`.
3. If `pwd` matches the **first** entry (the main working tree), inform the user:
   > You're in the main repository, not a worktree. Use `/worktree-init` to create worktrees.

   Then list any existing `wt/*` worktrees and stop.

### Step 2: Show Branch Info

1. Current branch: `git branch --show-current`.
2. Verify it matches the `wt/*` convention; note if it doesn't (may be a manually created worktree).
3. Commits ahead of base: `git rev-list --count origin/<main-branch>..HEAD` (detect `<main-branch>` as in `/worktree-init`; fall back to `origin/main`).

### Step 3: Read Task

1. Check for `.worktree-task.md` in the worktree root.
2. If present, read and display it.
3. If absent, note that no task file was found (worktree may have been created manually).

### Step 4: Show Working Status

Display:
1. `git status --short` — modified, staged, and untracked files.
2. `git diff --stat` — summary of unstaged changes.

### Step 5: Display Summary

Print this exact block:

```
Worktree Status
──────────────────────────────────
Branch:    wt/<name>
Task:      <task from .worktree-task.md, or "none found">
Commits:   <N> ahead of <main-branch>
Modified:  <N> files
Staged:    <N> files
Untracked: <N> files
──────────────────────────────────
```

If there are changes ahead of the base or uncommitted work, suggest:
> Run `/worktree-deliver` when you're ready to commit, push, and create a PR.

## Examples

**Inside `wt-add-login-page`, 2 commits ahead, 1 modified file:**

```
Worktree Status
──────────────────────────────────
Branch:    wt/add-login-page
Task:      add login page
Commits:   2 ahead of main
Modified:  1 files
Staged:    0 files
Untracked: 0 files
──────────────────────────────────
Run /worktree-deliver when you're ready to commit, push, and create a PR.
```

**Run from the main repo:**

```
You're in the main repository, not a worktree. Use /worktree-init to create worktrees.
Existing worktrees:
- wt/add-login-page   ../worktrees/refactored-winner/wt-add-login-page
- wt/fix-auth-timeout ../worktrees/refactored-winner/wt-fix-auth-timeout
```

## Never do

- **Never** stage, commit, push, or modify any file — this command is strictly read-only.
- **Never** report a branch as "ahead" without comparing against `origin/<main-branch>`.
- **Never** claim a worktree is a task worktree if its branch doesn't match `wt/*` — flag it instead.
