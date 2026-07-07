---
allowed-tools: Bash(git:*), Bash(cat:*), Bash(pwd:*), Bash(ls:*)
description: Check current worktree status, branch, and assigned task
---

# Worktree Status Check

Verify the current worktree environment and show task details.

## Instructions

You are inside a worktree (or the main repo). Gather and display the current status clearly.

### Step 1: Detect Worktree

1. Get the current directory: `pwd`
2. List all worktrees: `git worktree list`
3. Determine if the current directory is a worktree (not the main working tree). The main working tree is listed first in `git worktree list` output — if the current path matches the first entry, this is the main repo, not a worktree.

If this is **not** a worktree, inform the user:
> You're in the main repository, not a worktree. Use `/worktree-init` to create worktrees.

Then list any existing worktrees and exit.

### Step 2: Show Branch Info

1. Get current branch: `git branch --show-current`
2. Verify it follows the `wt/*` naming convention
3. Show how many commits ahead of origin/main: `git rev-list --count origin/main..HEAD`

### Step 3: Read Task

1. Check if `.worktree-task.md` exists in the worktree root
2. If it exists, read and display its contents
3. If it doesn't exist, note that no task file was found (may have been created manually)

### Step 4: Show Working Status

Run and display:
1. `git status --short` — show modified, staged, and untracked files
2. `git diff --stat` — show a summary of unstaged changes

### Step 5: Display Summary

Present a clean summary:

```
Worktree Status
──────────────────────────────────
Branch:    wt/<name>
Task:      <task description from .worktree-task.md>
Commits:   <N> ahead of main
Modified:  <N> files
Staged:    <N> files
Untracked: <N> files
──────────────────────────────────
```

If there are changes ready to deliver, suggest: "Run `/worktree-deliver` when you're ready to commit, push, and create a PR."

### Edge Cases

- **`origin/main` doesn't exist locally** (never fetched): use `git rev-list --count main..HEAD` or report "unknown" for the ahead count — don't error out.
- **Branch doesn't follow `wt/*`**: still show the full status; just add a note that this worktree wasn't created by `/worktree-init`.

### Do NOT

- Do NOT modify anything — this command is read-only, always.
- Do NOT run `git fetch` (network) unless the user asks — report from local state.

### Example of a great result

```
Worktree Status
──────────────────────────────────
Branch:    wt/fix-login-bug
Task:      Fix login bug where session expires immediately
Commits:   3 ahead of main
Modified:  2 files
Staged:    0 files
Untracked: 1 file
──────────────────────────────────
Run /worktree-deliver when you're ready to commit, push, and create a PR.
```
