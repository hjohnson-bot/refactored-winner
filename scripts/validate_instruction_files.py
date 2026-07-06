#!/usr/bin/env python3
"""
Validate the repo's instruction files: CLAUDE.md, .claude/commands/*.md,
.claude/agents/*.md.

Checks
  1. Frontmatter: every command/agent file with a leading `---` block must
     parse as YAML; agents must have name+description; commands must have
     description (allowed-tools strongly recommended).
  2. Paths: every repo-relative path referenced in an instruction file must
     exist on disk (the check that would have caught `docs_to_claude/`).
  3. Secrets: no literal-looking secret substrings anywhere.
  4. Consistency: no bare `python scripts/` invocations (must be python3);
     deployer's documented deploy.sh args must be accepted by deploy.sh.

Exit 0 = all green. Exit 1 = failures printed.

Run:  python3 scripts/validate_instruction_files.py
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAILURES: list[str] = []
WARNINGS: list[str] = []


def fail(msg: str) -> None:
    FAILURES.append(msg)


def warn(msg: str) -> None:
    WARNINGS.append(msg)


def instruction_files() -> list[Path]:
    files = [ROOT / "CLAUDE.md"]
    files += sorted((ROOT / ".claude" / "commands").glob("*.md"))
    files += sorted((ROOT / ".claude" / "agents").glob("*.md"))
    return [f for f in files if f.exists()]


# --------------------------------------------------------------------------
# 1. Frontmatter
# --------------------------------------------------------------------------

def parse_frontmatter(text: str):
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end == -1:
        return None
    return text[4:end]


def check_frontmatter() -> None:
    try:
        import yaml
    except ImportError:
        warn("PyYAML not installed — frontmatter YAML-parse check skipped (pip install pyyaml)")
        yaml = None

    for f in instruction_files():
        if f.name == "CLAUDE.md":
            continue
        text = f.read_text(encoding="utf-8")
        fm = parse_frontmatter(text)
        kind = f.parent.name  # commands | agents
        if fm is None:
            fail(f"{f.relative_to(ROOT)}: missing YAML frontmatter block")
            continue
        if yaml:
            try:
                data = yaml.safe_load(fm) or {}
                if not isinstance(data, dict):
                    raise ValueError("frontmatter is not a mapping")
            except Exception:
                # Claude Code's parser is lenient (agent descriptions embed
                # `Examples: <example>…` which strict YAML rejects). Fall back
                # to line-based parsing; only fail if even that lacks the keys.
                data = _lenient_frontmatter(fm)
                warn(f"{f.relative_to(ROOT)}: frontmatter is not strict YAML (Claude Code tolerates this; strict parsers won't)")
        else:
            data = _lenient_frontmatter(fm)
        if kind == "agents":
            for req in ("name", "description"):
                if req not in data:
                    fail(f"{f.relative_to(ROOT)}: agent frontmatter missing `{req}`")
        elif kind == "commands":
            if "description" not in data:
                fail(f"{f.relative_to(ROOT)}: command frontmatter missing `description`")
            if "allowed-tools" not in data:
                warn(f"{f.relative_to(ROOT)}: command has no `allowed-tools` (recommended)")


def _lenient_frontmatter(fm: str) -> dict:
    """Claude Code's own frontmatter parser is line-based and tolerates things
    strict YAML doesn't (agent descriptions embedding `Examples: <example>...`).
    Mirror that: top-level `key: value` lines only."""
    data = {}
    for line in fm.splitlines():
        m = re.match(r"^([A-Za-z][\w\-]*):\s*(.*)$", line)
        if m:
            data[m.group(1)] = m.group(2)
    return data


# --------------------------------------------------------------------------
# 2. Referenced paths exist
# --------------------------------------------------------------------------

# Repo-relative path candidates: dir/file tokens with an extension or a
# known top-level prefix. Deliberately conservative to avoid false hits on
# example/template text.
PATH_RE = re.compile(
    r"(?<![\w/${\-])("
    r"(?:cli-tool|cfo-dashboard|mdg-powerbi|dashboard|docs|docu|api|scripts|database|cloudflare-workers|templates|\.github|\.claude)"
    r"/[A-Za-z0-9_./\-]+"
    r")"
)

# Things that look like paths but are templates/outputs/examples.
IGNORE_PATTERNS = [
    r"\[", r"\]", r"\{", r"\}", r"\$", r"<", r">", r"\*", r"…", r"\.\.\.",
    r"blog/assets/", r"blog-id", r"component-path", r"your-", r"example",
    r"finance-refresh/",  # branch name pattern
    r"docs/component-reviews-queue\.json",  # created on demand by linear-tracker fallback
    r"\.claude/scripts/",  # runtime install location on user machines
    r"\.claude/(skills|settings|mcps|hooks)(/|$)",  # install destinations on USER machines (component-migrator writes there at runtime)
    r"cli-tool/components/(agents|commands|mcps|skills|hooks|settings)/\.\.\.",
]
IGNORE_RE = re.compile("|".join(IGNORE_PATTERNS))

# Documented-but-generated (exist only after a build/refresh) — warn, not fail.
GENERATED_OK = re.compile(
    r"^(cfo-dashboard/(downloads|data)/|mdg-powerbi/(output|build|data|deploy|powerbi)/|docs/components\.json)"
)


def check_paths() -> None:
    for f in instruction_files():
        text = f.read_text(encoding="utf-8")
        for m in PATH_RE.finditer(text):
            token = m.group(1).rstrip(".,;:)`'\"")
            if IGNORE_RE.search(token):
                continue
            # Trim trailing sentence artifacts
            token = token.rstrip("/")
            p = ROOT / token
            if p.exists():
                continue
            # Section-relative paths: docs sections about cfo-dashboard/ and
            # mdg-powerbi/ use `scripts/...` relative to that directory.
            if token.startswith("scripts/") and any(
                (ROOT / prefix / token).exists()
                for prefix in ("cfo-dashboard", "mdg-powerbi")
            ):
                continue
            if GENERATED_OK.match(token):
                warn(f"{f.relative_to(ROOT)}: generated path not present yet: {token}")
                continue
            fail(f"{f.relative_to(ROOT)}: referenced path does not exist: {token}")


# --------------------------------------------------------------------------
# 3. Secrets
# --------------------------------------------------------------------------

SECRET_RES = [
    re.compile(r"ghp_[A-Za-z0-9]{10,}"),
    re.compile(r"gho_[A-Za-z0-9]{10,}"),
    re.compile(r"sk-[A-Za-z0-9]{16,}"),
    re.compile(r"sk_live_[A-Za-z0-9]{8,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"AIzaSy[A-Za-z0-9_\-]{10,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"postgresql://\w+:[^@\s{$]+@"),
]


# Low-entropy patterns that legitimately appear as backticked documentation
# examples (the reviewer documenting what it scans for; dummy user:pass URLs).
DOC_EXAMPLE_OK = [
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"postgresql://(user|USER|username)[:]"),
]

# Literal placeholder credentials that are always documentation, never real.
ALWAYS_DUMMY = re.compile(r"postgresql://user:pass@host")


def check_secrets() -> None:
    for f in instruction_files():
        for line in f.read_text(encoding="utf-8").splitlines():
            for rx in SECRET_RES:
                for m in rx.finditer(line):
                    tok = m.group(0)
                    if ALWAYS_DUMMY.search(line):
                        continue
                    is_doc_example = any(ok.match(tok) for ok in DOC_EXAMPLE_OK)
                    # Low-entropy doc examples on a line that code-quotes them
                    # (backtick) or inside a fenced example are fine.
                    if is_doc_example and ("`" in line or line.startswith(("#", "-", " ", "\t"))):
                        continue
                    fail(f"{f.relative_to(ROOT)}: secret-looking string: {tok[:24]}…")


# --------------------------------------------------------------------------
# 4. Consistency
# --------------------------------------------------------------------------

def check_consistency() -> None:
    # 4a. bare `python scripts/...` anywhere in instruction files
    for f in instruction_files():
        for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"(?<!\w)python (?!3)[\w./\-]*scripts/", line):
                fail(f"{f.relative_to(ROOT)}:{i}: bare `python` — use `python3`: {line.strip()[:80]}")

    # 4b. deployer's documented deploy.sh args must be in deploy.sh's case arms
    deployer = ROOT / ".claude" / "agents" / "deployer.md"
    deploy_sh = ROOT / "scripts" / "deploy.sh"
    if deployer.exists() and deploy_sh.exists():
        documented = set(re.findall(r"deploy\.sh (\w+)", deployer.read_text()))
        case_line = re.search(r"^\s*(\"\"\|[\w|]+)\)", deploy_sh.read_text(), re.M)
        accepted = set()
        if case_line:
            accepted = {a.strip('"') for a in case_line.group(1).split("|") if a.strip('"')}
        bad = documented - accepted
        if bad:
            fail(f".claude/agents/deployer.md documents deploy.sh args not accepted by the script: {sorted(bad)} (accepted: {sorted(accepted)})")


# --------------------------------------------------------------------------

def main() -> int:
    check_frontmatter()
    check_paths()
    check_secrets()
    check_consistency()

    files = instruction_files()
    print(f"Checked {len(files)} instruction files.")
    for w in WARNINGS:
        print(f"  WARN  {w}")
    if FAILURES:
        for e in FAILURES:
            print(f"  FAIL  {e}")
        print(f"\n{len(FAILURES)} failure(s).")
        return 1
    print("All instruction-file checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
