# Project Guidelines & Architecture Standards

## 1. UI / UX Design Standards

### Strict No Emojis Policy
- **Never use emojis** in any user interface elements, including buttons, headers, navigation bars, modals, dialogs, badges, notifications, tooltips, chips, tabs, or status indicators.
- Use clean, minimalist **vector SVG icons** (Lucide / Obsidian line style) or clear typographic labels.
- Maintain a polished, high-contrast, developer-focused aesthetic (Obsidian / Linear design system).

### Design System & Visual Hierarchy
- **Color Palette**: Curated dark surfaces:
  - Canvas Background: `#141416`
  - Cards & Panes: `#1c1c22` / `#16161d`
  - Subtle Borders: `#2d2d35` / `#333342`
  - Semantic Accents: Sky Blue (`#38bdf8`), Emerald (`#10b981`), Indigo (`#6366f1`), Amber (`#f59e0b`), Crimson (`#ef4444`).
- **Typography**: Clean sans-serif (`Inter`) for UI controls and layout; monospace (`JetBrains Mono`) for markdown frontmatter, code blocks, file tree paths, and tokens.
- **In-DOM Dialogs & Overlays**: All modals, alerts, confirmations, export dialogs, and floating tooltips must render inside the DOM with backdrop blur. **Never trigger native browser popups (`alert`, `confirm`, `prompt`)**.
- **Directory Tree Visualization**: In export and file previews, render hierarchies using standard monospaced branch guide connectors (`├── `, `└── `, `│   `) with compact folder chains.

---

## 2. Universal Agent Markdown Schema

Each agent block is backed by a standalone Markdown file with a YAML frontmatter header:

```markdown
---
name: evaluator
role: evaluator
model: claude-3-5-sonnet
description: Quality auditor enforcing test coverage and lint verification.
tools: [bash, file_reader]
routes:
  - on: pass
    target: deployer.md
  - on: fail
    target: coder.md
    max_retries: 3
globs: ["src/**/*.js", "tests/**/*.test.js"]
temperature: 0.1
---

# Evaluator & Guardrails

Verifies factual consistency, policy compliance, and test suite verification.
```

### Schema Properties & Roles
- **`role`**: Universal classification (`orchestrator`, `assistant`, `researcher`, `evaluator`, `router`, `coder`, `tool`).
- **`model`**: Target LLM model identifier (e.g. `gemini-2.5-pro`, `claude-3-7-sonnet`, `gpt-4o`).
- **`description`**: Core capability statement used for semantic discovery, rule matching, and slash command descriptions.
- **`tools`**: Array of permitted tool abilities (e.g. `file_reader`, `web_search`, `bash`, `file_writer`, `browser_page`).
- **`routes`**: Array of conditional transition edges (`on: pass | fail | next`, `target: <node>.md`, `max_retries: <int>`).
- **`globs`**: File pattern triggers for contextual agent invocation (Cursor-native).
- **`temperature`**: Sampling randomness parameter (`0.0` to `1.0`).

### Validation & Linter Rules
- **Duplicate Key Prevention**: Frontmatter parsers must detect duplicate YAML keys, report exact line numbers, and prevent duplicate chip insertions in the editor toolbar.
- **Dynamic Property Chips**: Property pills dynamically indicate existence (`✓ <field>` when present, `+ <field>` when available) and jump directly to the target line in the markdown editor upon selection.

---

## 3. Multi-Target Exporter Architecture

The platform provides multi-harness transpilation, compiling universal markdown agents into provider-native configurations:

| Target Platform | Master Root Configuration | Agent Files & Locations | Decision & Routing Transpilation |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `CLAUDE.md` (Project Context & Routing Table) | `.claude/commands/<agent>.md` | `tools` transpiled to `allowed-tools` string; routes documented for slash command orchestration. |
| **OpenCode** | `AGENTS.md` (Multi-Agent Protocol & Mermaid DAG) | `.opencode/agents/<agent>.md` | `routes` transpiled into native Mermaid DAG (`graph TD`); frontmatter sanitized for OpenCode compatibility. |
| **Cursor** | `.cursorrules` (Project Rules) | `.cursor/rules/<agent>.mdc` | `globs` and `description` retained with `alwaysApply: false` for contextual semantic triggering. |
| **Antigravity (AGY)** | `GEMINI.md` (Master Multi-Agent Routing Matrix) | `.gemini/antigravity/skills/<agent>/SKILL.md` | `routes` transpiled to `invoke_subagent` delegation directives and PASS / FAIL decision loops. |
| **Codex / OpenAI** | `codex.json` (OpenAI Assistants v2 Schema) | `instructions/<agent>.md` | `tools` transpiled to OpenAI tool call schemas; `model` and `temperature` mapped to run parameters. |
| **Universal Raw** | `workflow.js` (Standalone Execution Engine) | `<agent>.md` | Raw vault preservation with standalone Node.js DAG execution runner. |

---

## 4. Architecture & Implementation Standards

### Node.js & Runtime
- Pure **ES Modules** (`"type": "module"`) on **Node 26**.
- Dependency-free packaging: Native `node:zlib` zip bundler without third-party compression libraries.

### Persistence & Data Layer
- Native **`node:sqlite`** (`DatabaseSync`) with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and Foreign Key enforcement.
- Schema tables: `projects`, `nodes`, `edges`, `execution_logs`.

### Workspace Mirroring
- Real-time bidirectional synchronization between canvas blocks in SQLite and on-disk `.md` files in `./workspace/<project-slug>/`.

### Canvas Interaction Engine
- Non-blocking background hit-testing: Clicking anywhere on empty canvas space (up to 1px from block borders) enables smooth drag-to-pan.
- Navigation shortcuts: Middle-click or `Space + Left Click` for universal canvas panning; scroll wheel for proportional zoom around mouse coordinates.
- Interactive bezier connection routing with dynamic pass/fail decision pills and draggable port terminals (`top`, `bottom`, `left`, `right`).

### Documentation System Standards (VitePress)
- Comprehensive local documentation site built with VitePress located in `./docs/`.
- Served directly by the main application server on the same port at `/docs/` (`http://localhost:3000/docs/`).
- Strictly enforce the **No Emojis Policy** across all documentation markdown files, navigation headers, sidebars, badges, and callout boxes.
- Matched dark theme palette: Canvas Background (`#141416`), Card Panels (`#1c1c22`), Subtle Borders (`#2d2d35`), Sky Blue Accent (`#38bdf8`), and `JetBrains Mono` for code blocks.
