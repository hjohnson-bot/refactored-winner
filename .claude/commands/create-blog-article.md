---
allowed-tools: Read, Write, Edit, Bash(python3:*), Bash(mkdir:*), Bash(rm:*)
argument-hint: <component-path>
description: Create an SEO-optimized blog article (HTML + cover image + index entry) for a Claude Code component
---

# Create Blog Article for a Claude Code Component

Component path provided: **$ARGUMENTS**

## Purpose

Turn one Claude Code component (agent / MCP / skill / command / hook) into a
complete, SEO-optimized blog article for aitmpl.com. It produces three
artifacts: a cover image under `docs/blog/assets/`, an HTML article under
`docs/blog/<blog-id>/index.html`, and a new entry in the index
`docs/blog/blog-articles.json`. Run it after a component is added or updated and
you want it published on the blog.

**Relationship to the `blog-writer` agent:** `.claude/agents/blog-writer.md`
runs the *same* blog pipeline (same template, same JSON entry shape, same cover
spec). This command is the slash-command entry point for it. Keep the two
consistent — if you change one, change the other so they don't diverge or
contradict.

## Inputs / Preconditions

`$ARGUMENTS` is a component path relative to its type folder under
`cli-tool/components/`. Format and location per type:

| Type | `$ARGUMENTS` example | File on disk |
|---|---|---|
| Agent | `development-team/frontend-developer` | `cli-tool/components/agents/<path>.md` |
| MCP | `devtools/context7` (or `supabase`) | `cli-tool/components/mcps/<path>.json` |
| Skill | `productivity/nowait` | `cli-tool/components/skills/<path>/SKILL.md` |
| Command | `setup/ci-cd-pipeline` | `cli-tool/components/commands/<path>.md` |
| Hook | `git/auto-commit` | `cli-tool/components/hooks/<path>.md` |

A single-word path (no `/`) is usually an MCP, command, or skill — resolve it by
searching, don't assume.

**Env:** cover-image generation reads `GOOGLE_API_KEY` from the environment (used
by `scripts/generate_blog_images.py`). Never hardcode it; if it's unset the
script falls back to / fails on image generation — surface that to the user.

## Process

1. **Locate the component file.** Use `find`/`grep` under
   `cli-tool/components/` to resolve the real path and confirm the type — do not
   guess the extension or folder. If nothing matches, try the with/without-folder
   variants, then ask the user to verify the path. Stop if unresolved.
2. **Extract fields** from the file: `name`, `description`, `tools` (agents), and
   the key capabilities / focus areas from the body.
3. **Derive identifiers:**
   - **Blog ID** — path → `<name>-<type>` (e.g. `development-team/frontend-developer`
     → `frontend-developer-agent`; `supabase` → `supabase-mcp`; `productivity/nowait`
     → `nowait-skill`).
   - **Component Name** — human-readable (`frontend-developer` → `Frontend Developer`).
   - **Component Type** — uppercase (`AGENT`, `MCP`, `SKILL`, `COMMAND`, `HOOK`).
4. **Confirm with the user BEFORE writing anything.** Present the derived title,
   subtitle, tags, category, difficulty, and the capabilities/examples you plan
   to write. Only proceed once they approve — do not describe capabilities the
   component doesn't actually have.
5. **Generate the cover image first.** Add a temporary entry to
   `blog-articles.json` (see Output format) so the generator can find the
   component, then run `python3 scripts/generate_blog_images.py`. It writes
   `docs/blog/assets/<blog-id>-cover.png`.
6. **Write the HTML article** to `docs/blog/<blog-id>/index.html` (create the
   dir with `mkdir -p`). Copy the template `docs/blog/code-reviewer-agent/index.html`
   verbatim, then replace only the content-specific parts (see Output format).
7. **Finalize the index entry.** Read-modify-write `blog-articles.json`,
   replacing the temporary entry with the real one; keep it valid JSON.
8. **Report** the files written and the local URL (see Output format).

## Output format

### 1. HTML article

Copy `docs/blog/code-reviewer-agent/index.html` exactly and replace ONLY:
SEO meta (title, description, keywords, Open Graph), structured data
(`BlogPosting`), the `<h1 class="article-title">` / `<p class="article-subtitle">`
/ `<div class="article-tags">`, the cover image `src`/`alt`, and the body inside
`<div class="article-content-full">`. Keep everything else byte-for-byte: the
`class="header"` header, ASCII terminal logo, `id="copy-markdown-btn"` button,
`article-header → article-body → article-content-full` structure, "Explore
Components" banner, footer, and the three trailing scripts (CodeCopy,
MarkdownCopier, Mermaid). Do not create HTML from scratch, simplify, or
duplicate the scripts.

`<head>` skeleton (fill the bracketed slots):

```html
<title>[Component Name] for Claude Code: [Key Technologies] Expert AI Assistant</title>
<meta name="description" content="Install the [Component Name] for Claude Code to [main benefit]. AI-powered [type] for [key features].">
<meta name="keywords" content="Claude Code [type], [Component Name], Claude Code [tech1], [tech2], AI [domain] development">
<meta property="og:title" content="[Component Name] for Claude Code: [Key Technologies]">
<meta property="og:description" content="Install the [Component Name] for Claude Code...">
<!-- JSON-LD BlogPosting: headline, keywords, articleSection "Claude Code [Type]s",
     about[] includes Claude Code (Thing + SoftwareApplication) -->
```

**Paths (all relative):** cover `../assets/<blog-id>-cover.png`; CSS
`../../css/styles.css`, `../../css/blog.css`; nav `../index.html` (blog home),
`../../index.html` (main site).

**Body sections, in order:** "What is the [Component Name]?" (2-3 sentences,
names Claude Code + type) → Mermaid diagram (3-4 nodes, `style B fill:#F97316`;
no `/` or `\` in labels) → Key Capabilities (5-7 bullets) → Installation
(`npx claude-code-templates@latest --<type> <folder/name>` — always full path —
plus the `.claude/<type>s/<name>.<ext>` file tree) → How to Use → 3 Usage
Examples → Official Documentation. Every `code.claude.com` link MUST carry
`?utm_source=aitmpl&utm_medium=referral&utm_campaign=blog`.

**SEO musts:** title has "Claude Code" + component name + 1-2 techs; H1 matches
title; first paragraph names Claude Code; first tag and first 3 keywords lead
with "Claude Code [type]"; structured data includes Claude Code as both Thing
and SoftwareApplication. (Note: skills auto-activate — they are NOT slash
commands.)

### 2. Cover image

`docs/blog/assets/<blog-id>-cover.png`, generated by
`scripts/generate_blog_images.py` (reads `GOOGLE_API_KEY` from env). Referenced
in the article as `../assets/<blog-id>-cover.png` and in the index as
`assets/<blog-id>-cover.png`.

### 3. blog-articles.json entry

Append exactly this object (read-modify-write; do not duplicate an existing
`id`):

```json
{
  "id": "[blog-id]",
  "title": "[Component Name] for Claude Code: [Subtitle with Technologies]",
  "description": "Complete guide to the [Component Name] - [what it does]. [Key benefits].",
  "url": "[blog-id]/",
  "image": "assets/[blog-id]-cover.png",
  "category": "[Agents|MCP|Skills|Development|Automation]",
  "publishDate": "[YYYY-MM-DD]",
  "readTime": "4 min read",
  "tags": ["Claude Code", "[Type]", "[Tech1]", "[Tech2]", "[Tech3]"],
  "difficulty": "basic|intermediate|advanced",
  "featured": true,
  "order": [next available order number]
}
```

Category: Agents→`Agents`, MCPs→`MCP`, Skills→`Skills`, Commands→`Development`,
Hooks→`Automation`. Difficulty: `basic` (no config), `intermediate` (some
setup), `advanced` (complex workflows).

### 4. Final summary (printed on success)

```
✅ Blog article created successfully!

📁 Files created:
   - docs/blog/[blog-id]/index.html
   - docs/blog/assets/[blog-id]-cover.png

📝 Updated:
   - docs/blog/blog-articles.json

🔗 View locally:
   http://localhost:8000/blog/[blog-id]/

🚀 Ready to commit and deploy!
```

## Examples

Component `development-team/frontend-developer` (an agent at
`cli-tool/components/agents/development-team/frontend-developer.md`) →

- Article: `docs/blog/frontend-developer-agent/index.html`
- Cover: `docs/blog/assets/frontend-developer-agent-cover.png`
- Index entry:

```json
{
  "id": "frontend-developer-agent",
  "title": "Frontend Developer for Claude Code: React & Responsive UI Expert AI",
  "description": "Complete guide to the Frontend Developer agent - build React UIs, manage state, and optimize performance in Claude Code.",
  "url": "frontend-developer-agent/",
  "image": "assets/frontend-developer-agent-cover.png",
  "category": "Agents",
  "publishDate": "2026-07-13",
  "readTime": "4 min read",
  "tags": ["Claude Code", "Agent", "React", "Frontend", "TypeScript"],
  "difficulty": "basic",
  "featured": true,
  "order": 42
}
```

Install command in the article body: `npx claude-code-templates@latest --agent development-team/frontend-developer`.

## Never do

- **Don't write any file before the user confirms** the title, tags, and
  planned content (Process step 4).
- **Don't corrupt or duplicate `blog-articles.json`.** Read-modify-write it,
  keep it valid JSON, and never create a second entry with the same `id`.
- **Never hardcode the image-gen API key** — it comes from `GOOGLE_API_KEY` in
  the environment.
- **Don't invent capabilities** the component doesn't have, and keep examples
  specific to what it actually does.
- **Don't overwrite an existing article** at `docs/blog/<blog-id>/` without
  telling the user it already exists and confirming.
- **Don't build custom HTML** or simplify/remove/duplicate the template's header,
  footer, or three trailing scripts — copy the template and edit only the
  content slots.
