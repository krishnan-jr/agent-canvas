# Introduction & Architecture

**Agent Canvas** is an open-source visual workflow environment and multi-harness compiler for building, orchestrating, and executing autonomous multi-agent AI systems.

---

## Core Philosophy

### 1. Markdown-First Architecture
Every agent block rendered on the visual canvas corresponds 1:1 with a standalone Markdown (`.md`) file on disk in `./workspace/<project-slug>/`. The agent's instructions, operational constraints, tool whitelist, and semantic routing rules reside in a clean YAML frontmatter header.

### 2. Dual-Mirroring Synchronization
Agent Canvas maintains real-time bidirectional synchronization between two persistence layers:
- **Fast Local SQLite Engine**: Powered by Node's native `node:sqlite` (`DatabaseSync`) in Write-Ahead Logging (`WAL`) mode for instantaneous graph queries and canvas telemetry.
- **On-Disk File Mirror**: Standard `.md` files residing on your workspace filesystem. You can edit them in VS Code, Cursor, Neovim, or the Canvas Editor—changes synchronize bidirectionally without data loss.

### 3. Multi-Target Transpilation
Rather than enforcing a proprietary runtime format, Agent Canvas transpiles universal Markdown agents into platform-native configurations across all modern AI developer tools:
- **Claude Code**: Transpiles to `CLAUDE.md` guidelines and `.claude/commands/*.md` slash subagents.
- **OpenCode**: Transpiles to `AGENTS.md` and Mermaid DAG workflows (`.opencode/agents/*.md`).
- **Cursor**: Transpiles to `.cursorrules` and `.cursor/rules/*.mdc` contextual glob triggers.
- **Antigravity (AGY)**: Transpiles to `GEMINI.md` routing matrices and `.gemini/antigravity/skills/*/SKILL.md`.
- **Codex / OpenAI**: Transpiles to `codex.json` (Assistants v2 schema) and `instructions/*.md`.
- **Universal Raw**: Transpiles to a standalone `workflow.js` DAG execution engine.

---

## System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                      Agent Canvas Frontend                    │
│   Canvas Engine  •  AST Schema Editor  •  Export Studio UI    │
└───────────────▲───────────────────────────────▲───────────────┘
                │ REST API / SSE                │ MCP Tools (22)
┌───────────────▼───────────────────────────────▼───────────────┐
│                   Agent Canvas Server Engine                  │
│       src/server.js  •  src/database.js  •  src/mcpServer.js   │
└───────┬───────────────────────────────┬───────────────────────┘
        │                               │
┌───────▼───────────────────────┐ ┌─────▼───────────────────────┐
│     SQLite WAL Database       │ │   Workspace File Vault      │
│  (Projects, Nodes, Edges)     │ │   (./workspace/*/*.md)      │
└───────────────────────────────┘ └─────────────────────────────┘
        │
┌───────▼───────────────────────────────────────────────────────┐
│                  Multi-Target Transpiler Layer                │
│   Claude Code • OpenCode • Cursor • Antigravity • Codex • Raw │
└───────────────────────────────────────────────────────────────┘
```

---

## Design System Standards

In accordance with project guidelines:
- **Strict No Emojis Policy**: Zero emojis anywhere in user interface elements, buttons, headers, dialogs, badges, tooltips, or chips.
- **Obsidian Dark Aesthetic**: Canvas background (`#141416`), cards (`#1c1c22`), subtle borders (`#2d2d35`), and sky blue accent (`#38bdf8`).
- **In-DOM Dialogs**: All modals, alerts, confirmations, directory browsers, and tooltips render inside the DOM with backdrop blur. Native browser popups (`alert`, `confirm`, `prompt`) are strictly avoided.
