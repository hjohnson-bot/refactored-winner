---
allowed-tools: Bash(git:*), Bash(mkdir:*), Bash(ls:*), Bash(cat:*), Bash(basename:*), Bash(pwd:*), Bash(sed:*)
argument-hint: task 1 | task 2 | task 3
description: Create parallel git worktrees for multi-task development with Ghostty panels
---

# Worktree Parallel Init

Create multiple git worktrees for parallel development: $ARGUMENTS

## Purpose

Set up one git worktree per task so the user can work on several tasks at once, each in its own Ghostty terminal panel running its own Claude instance. **Run this from the main working tree** (the first entry of `git worktree list`) — not from inside an existing worktree.

## Preconditions / Arguments

- **cwd:** the main working tree of a git repo (first line of `git worktree list`).
- **`$ARGUMENTS`:** one or more task descriptions separated by `|` (pipe). Example: `add login page | fix auth bug | write docs`. If empty, ask the user for tasks via AskUserQuestion.
- **Assumptions (macOS/Ghostty):** panel split shortcuts and the `../worktrees/` sibling layout assume the user's macOS + Ghostty setup.

Definitions:
- **Main working tree** — the primary checkout, listed first by `git worktree list`.
- **Branch name** — `wt/<kebab-case-task>` (max 50 chars, lowercase alphanumeric + hyphens).
- **Worktree dir** — `../worktrees/<repo-name>/wt-<kebab-case-task>` (sibling of the repo).

## Process

### Step 1: Validate Environment

1. Confirm a git repo: `git rev-parse --is-inside-work-tree`.
2. Confirm this is the **main working tree**, not a worktree: compare `pwd` to the first entry of `git worktree list`. If they differ, warn and stop — worktrees should be created from the main repo.
3. Get the repo name: `basename $(git rev-parse --show-toplevel)`.
4. Get the main branch: `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'` — if that fails, default to `main`.
5. Ensure the working tree is clean: `git status --porcelain`. If dirty, warn and ask before continuing.
6. Fetch latest: `git fetch origin`.

### Step 2: Parse Tasks

Split `$ARGUMENTS` on `|`. If empty, use AskUserQuestion to collect tasks. For each task: trim whitespace, derive the `wt/<kebab>` branch name and `../worktrees/<repo>/wt-<kebab>` dir. Skip any task whose branch already exists (report it as skipped).

### Step 3: Create Worktrees

For each task:

1. Create the parent dir if needed: `mkdir -p ../worktrees/<repo-name>`.
2. Create the worktree from the fetched base:
   ```bash
   git worktree add -b wt/<name> ../worktrees/<repo-name>/wt-<name> origin/<main-branch>
   ```
3. Write `.worktree-task.md` in the new worktree root:
   ```markdown
   # Worktree Task

   **Branch:** wt/<name>
   **Task:** <original task description>
   **Created:** <ISO date>
   **Source repo:** <absolute path to main repo>
   ```

### Step 4: Check for Dependencies

If a lockfile exists in the repo root, note that each new worktree may need an install:
- `package-lock.json` → `npm install`
- `yarn.lock` → `yarn install`
- `pnpm-lock.yaml` → `pnpm install`
- `bun.lockb` → `bun install`

### Step 5: Output Summary

Print this exact block (one row per worktree):

```
Worktrees Created
──────────────────────────────────
| # | Task | Branch | Path |
|---|------|--------|------|
| 1 | <task> | wt/<name> | ../worktrees/<repo>/wt-<name> |

Open each in a Ghostty panel:
# Panel 1: <task description>
cd <absolute-path-to-worktree> && claude

# Note: run <package-manager> install in each worktree before starting (if a lockfile was detected)
──────────────────────────────────
```

Then remind the user:
- Open a new Ghostty panel with `Cmd+D` (split right) or `Cmd+Shift+D` (split down).
- When a task is done, run `/worktree-deliver` from that worktree to commit, push, and open a PR.
- After merging all PRs, run `/worktree-cleanup --all` from the main repo.

## Examples

**`$ARGUMENTS` = `add login page | fix auth timeout`** (repo `refactored-winner`, base `main`):

```
Worktrees Created
──────────────────────────────────
| # | Task | Branch | Path |
|---|------|--------|------|
| 1 | add login page | wt/add-login-page | ../worktrees/refactored-winner/wt-add-login-page |
| 2 | fix auth timeout | wt/fix-auth-timeout | ../worktrees/refactored-winner/wt-fix-auth-timeout |

Open each in a Ghostty panel:
# Panel 1: add login page
cd /home/user/worktrees/refactored-winner/wt-add-login-page && claude

# Panel 2: fix auth timeout
cd /home/user/worktrees/refactored-winner/wt-fix-auth-timeout && claude

# Note: run npm install in each worktree before starting
──────────────────────────────────
```

## Never do

- **Never** run from inside an existing worktree — always create from the main working tree.
- **Never** branch off local `HEAD` when `origin/<main>` was fetched; base new worktrees on `origin/<main-branch>`.
- **Never** commit or auto-install dependencies here — this command only scaffolds worktrees.
- **Never** overwrite or reuse an existing `wt/*` branch; skip and report it instead.
- **Never** create worktrees inside the repo tree itself — keep them under the `../worktrees/<repo>/` sibling directory.
