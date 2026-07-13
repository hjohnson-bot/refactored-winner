---
allowed-tools: Bash(df:*), Bash(du:*), Bash(npm cache clean:*), Bash(brew cleanup:*), Bash(rm:*), Bash(find:*), Bash(docker system prune:*)
argument-hint: [--aggressive] | [--maximum]
description: Clean system caches (npm, Homebrew, Yarn, browsers, Python/ML) to free disk space
---

# System Cache Cleanup

Clean temporary files and caches to free disk space: $ARGUMENTS

## Purpose

Reclaim disk space by clearing rebuildable caches on the user's **macOS** machine. Run it interactively when disk space is low; pick a level with the flag below. Higher levels touch more (browsers, Docker) so read the level's warnings before running.

## Preconditions / Arguments

- **Platform:** macOS (paths assume `~/Library/Caches` and `~/.cache`). No arguments = conservative.
- **`$ARGUMENTS`:**
  - *(none)* → **Conservative** (Option 1): package-manager caches only, always safe.
  - `--aggressive` → **Aggressive** (Option 2): conservative + browser and dev-tool caches. Close browsers first.
  - `--maximum` → **Maximum** (Option 3): aggressive + Docker prune (with warning) + *lists* stale `node_modules` for manual review.
- **Assumptions:** these are all rebuildable caches — nothing here is a source of truth. Docker prune and any `node_modules` deletion are the only destructive actions, and Maximum only *lists* `node_modules`, never deletes them.

## Current Disk Usage

- **Disk space**: !`df -h / | tail -1`
- **npm cache**: !`du -sh ~/.npm 2>/dev/null || echo "Not found"`
- **Yarn cache**: !`du -sh ~/Library/Caches/Yarn 2>/dev/null || echo "Not found"`
- **Homebrew cache**: !`brew cleanup -n 2>/dev/null | head -5 || echo "Homebrew not installed"`

## Cleanup Options

### Option 1: Conservative Cleanup (default)

Safe cleanup of package-manager caches that rebuild automatically:

```bash
df -h / | tail -1 | awk '{print "Before: " $4 " free"}'
echo "Cleaning npm cache..."
npm cache clean --force
echo "Cleaning Homebrew..."
brew cleanup
echo "Cleaning Yarn cache..."
rm -rf ~/Library/Caches/Yarn
df -h / | tail -1 | awk '{print "After: " $4 " free"}'
```

### Option 2: Aggressive Cleanup (`--aggressive`)

Conservative plus browser and development-tool caches. **Close browsers first.**

```bash
# Conservative first
npm cache clean --force
brew cleanup
rm -rf ~/Library/Caches/Yarn

echo "Cleaning browser caches..."
rm -rf ~/Library/Caches/Google
rm -rf ~/Library/Caches/com.operasoftware.Opera
rm -rf ~/Library/Caches/Firefox
rm -rf ~/Library/Caches/Mozilla
rm -rf ~/Library/Caches/zen
rm -rf ~/Library/Caches/Arc

echo "Cleaning development caches..."
rm -rf ~/Library/Caches/JetBrains
rm -rf ~/Library/Caches/pnpm
rm -rf ~/.cache/puppeteer
rm -rf ~/.cache/selenium

echo "Cleaning Python/ML caches..."
rm -rf ~/.cache/uv
rm -rf ~/.cache/huggingface
rm -rf ~/.cache/torch
rm -rf ~/.cache/whisper

df -h / | tail -1 | awk '{print "After aggressive cleanup: " $4 " free"}'
```

### Option 3: Maximum Cleanup (`--maximum`)

Aggressive plus Docker. **Warn the user before the Docker prune** — it removes all stopped containers, unused images, and volumes. `node_modules` are only *listed*, never deleted.

```bash
# Aggressive first
npm cache clean --force
brew cleanup
rm -rf ~/Library/Caches/Yarn
rm -rf ~/Library/Caches/{Google,com.operasoftware.Opera,Firefox,Mozilla,zen,Arc,JetBrains,pnpm}
rm -rf ~/.cache/{puppeteer,selenium,uv,huggingface,torch,whisper}

# Docker — confirm with the user BEFORE running this line
echo "Cleaning Docker (removes stopped containers, unused images, volumes)..."
docker system prune -af --volumes 2>/dev/null || echo "Docker not running or not installed"

# node_modules — LIST ONLY, never auto-delete
echo "Finding node_modules directories (review and delete manually if needed)..."
find ~ -name "node_modules" -type d -prune 2>/dev/null | head -20

df -h / | tail -1 | awk '{print "After maximum cleanup: " $4 " free"}'
```

## Execution Steps

1. **Determine level** from `$ARGUMENTS` (none → Option 1, `--aggressive` → Option 2, `--maximum` → Option 3).
2. **Safety checks:** confirm permissions; ask the user to close browsers for Option 2+; explicitly warn and get confirmation before the Docker prune in Option 3.
3. **Execute** the selected option, showing progress per step and handling missing dirs/permissions gracefully.
4. **Report** disk space before/after, space recovered, and what was cleaned.

## Important Notes

- **Conservative** — always safe; caches rebuild on next use; no app impact.
- **Aggressive** — close browsers first; browser + ML caches re-download on next use.
- **Maximum** — Docker prune removes containers/images/volumes (warn first); `node_modules` are listed only, deleted manually by the user.

## Recovery

All cleared caches rebuild automatically: npm/Yarn on next `install`, Homebrew on next `brew install`, browsers on next session, Python/ML on next model use, Docker via `docker pull`.

## Examples

**`/cleanup-cache`** (conservative):

```
Before: 18Gi free
Cleaning npm cache...
Cleaning Homebrew...
Cleaning Yarn cache...
After: 24Gi free
Freed ~6Gi (npm, Homebrew, Yarn).
```

**`/cleanup-cache --maximum`** (after user confirms the Docker prune):

```
...aggressive steps...
Cleaning Docker (removes stopped containers, unused images, volumes)...
Total reclaimed space: 9.2GB
Finding node_modules directories (review and delete manually if needed):
  ~/projects/old-app/node_modules
  ~/projects/archive/node_modules
After maximum cleanup: 41Gi free
node_modules above were NOT deleted — remove manually if you no longer need them.
```

## Never do

- **Never** auto-delete `node_modules` at any level — Maximum only lists them for manual review.
- **Never** run the Docker prune without warning the user and getting confirmation first.
- **Never** `rm -rf` anything outside cache locations (`~/Library/Caches/*`, `~/.cache/*`, `~/.npm`) — never source code, documents, or config.
- **Never** delete `.env` files, credentials, or app data; only rebuildable caches.
- **Never** escalate past the level the user's flag selected (no Docker/browser wipes on a plain `/cleanup-cache`).
