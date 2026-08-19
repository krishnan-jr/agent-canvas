# Multi-Target Exporters

The **Multi-Target Exporter Studio** compiles universal Markdown agent graphs into provider-native configuration files for all major AI coding platforms.

---

## Visual Export Studio

![Multi-Target Export Studio](/images/export-studio.png)

---

## Provider Comparison Matrix

| Target Platform | Master Configuration | Agent Sub-Files | Routing Transpilation |
| :--- | :--- | :--- | :--- |
| **[Claude Code](/exporters/claude-code)** | `CLAUDE.md` | `.claude/commands/<agent>.md` | `tools` transpiled to `allowed-tools`; routes documented for slash command orchestration. |
| **[OpenCode](/exporters/opencode)** | `AGENTS.md` | `.opencode/agents/<agent>.md` | `routes` transpiled into native Mermaid DAG (`graph TD`); frontmatter sanitized for OpenCode. |
| **[Cursor](/exporters/cursor)** | `.cursorrules` | `.cursor/rules/<agent>.mdc` | `globs` and `description` retained with `alwaysApply: false` for contextual semantic triggering. |
| **[Antigravity (AGY)](/exporters/antigravity)** | `GEMINI.md` | `.gemini/antigravity/skills/<agent>/SKILL.md` | `routes` transpiled to `invoke_subagent` delegation directives and PASS / FAIL decision loops. |
| **[Codex / OpenAI](/exporters/codex)** | `codex.json` | `instructions/<agent>.md` | `tools` transpiled to OpenAI tool call schemas; `model` and `temperature` mapped to run parameters. |
| **[Universal Raw](/exporters/raw)** | `workflow.js` | `<agent>.md` | Raw vault preservation with standalone Node.js DAG execution runner. |

---

## Exporting Options

### 1. Export to Workspace Disk
Writes all generated files directly into a destination folder on your local filesystem using the built-in [In-DOM Directory Browser](/guide/canvas-editor).

![Directory Browser](/images/directory-browser.png)

### 2. Download ZIP Bundle
Packages the entire transpiled project directory into a standard `.zip` archive on the fly using pure Node.js `node:zlib` compression.
