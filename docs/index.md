---
layout: home

hero:
  name: "Agent Canvas"
  text: "Visual Multi-Agent Orchestrator"
  tagline: "Visual workflow environment and multi-target transpiler for universal Markdown (.md) AI agents."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Universal Schema
      link: /schema/universal-schema
    - theme: alt
      text: Multi-Target Exporters
      link: /exporters/

features:
  - title: Visual Multi-Agent DAG Canvas
    details: Infinite pan and zoom canvas with interactive bezier connections, draggable port terminals, conditional Pass/Fail pills, and radar minimap.
  - title: Universal Markdown Schema
    details: Every agent block is backed by standalone human-readable Markdown with YAML frontmatter, synced bidirectionally to local disk.
  - title: Multi-Target Transpilation
    details: One-click transpilation to Claude Code, OpenCode, Cursor, Antigravity, OpenAI Codex, and Universal Raw execution runners.
  - title: Zero-Dependency Pure Node
    details: Built with native ES Modules on Node 26, using node:sqlite DatabaseSync with WAL journal mode and node:zlib archive bundling.
  - title: Model Context Protocol (MCP)
    details: 22 native tool endpoints allowing external AI agents (Claude Desktop, Cursor, OpenCode, Antigravity) to orchestrate canvases programmatically.
  - title: In-DOM Directory Browser
    details: Export directly to custom disk destinations with interactive folder navigation, breadcrumbs, and folder creation without native dialogs.
---

## Visual Architecture

![Agent Canvas Overview](/images/canvas-overview.png)

## Why Agent Canvas?

Agent Canvas bridges the gap between **visual DAG orchestration** and **codebase file persistence**. Rather than locking workflows into proprietary database formats or rigid cloud platforms:

1. **Every block is a `.md` file**: Your agents live directly in your codebase.
2. **Compile to any harness**: Seamlessly switch between Claude Code slash commands, OpenCode DAG protocols, Cursor `.mdc` rules, and Antigravity subagent skills.
3. **Inspect with MCP**: Connect your favorite AI programming assistants directly to the visual canvas to build and optimize workflows cooperatively.
