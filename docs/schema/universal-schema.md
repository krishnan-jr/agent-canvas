# Universal Agent Markdown Schema

Each agent in Agent Canvas is defined by a standalone Markdown file (`.md`) containing a YAML frontmatter header followed by the agent's instructions.

---

## Visual Deep Editor

![Deep Markdown Editor](/images/agent-editor.png)

---

## Schema Specification

```markdown
---
name: evaluator
role: evaluator
model: claude-3-5-haiku
description: Quality auditor verifying test coverage, lint checks, and policy compliance.
tools: [bash, file_reader]
skills: [security-audit]
routes:
  - on: pass
    target: deployer.md
  - on: fail
    target: coder.md
    max_retries: 3
globs: ["src/**/*.js", "tests/**/*.test.js"]
temperature: 0.2
---

# Quality Guardrail & Evaluator

You are an automated quality auditor. Inspect test coverage, lint compliance, and security policies before releasing code changes.
```

---

## Property Definitions

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| **`name`** | `string` | Recommended | Human-readable unique identifier for the agent block. |
| **`role`** | `string` | Optional | Semantic universal classification (`orchestrator`, `assistant`, `researcher`, `evaluator`, `router`, `coder`, `tool`). |
| **`model`** | `string` | Optional | Target LLM model identifier (e.g. `gemini-2.5-pro`, `claude-3-7-sonnet`, `gpt-4o`). |
| **`description`** | `string` | Recommended | Concise capability summary used for semantic discovery, rule matching, and slash command descriptions. |
| **`tools`** | `string[]` | Optional | Array of permitted tool abilities (e.g. `file_reader`, `file_writer`, `grep_search`, `bash`, `web_search`). |
| **`skills`** | `string[]` | Optional | Array of modular skill packages linked to this agent from the Skills Library. |
| **`routes`** | `object[]` | Optional | Array of conditional transition edges (`on: pass | fail | next`, `target: <node>.md`, `max_retries: <int>`). |
| **`globs`** | `string[]` | Optional | Contextual file matching patterns (Cursor-native). |
| **`temperature`** | `number` | Optional | Sampling randomness parameter (`0.0` to `1.0`). |

---

## Validation & AST Linter Rules

The Deep Markdown Editor runs an automated AST parser on every keystroke:
1. **Duplicate Key Prevention**: Detects duplicate YAML keys in the frontmatter, reports exact line numbers, and displays an inline warning banner.
2. **Dynamic Property Chips**: Toolbar pills reflect the presence of fields:
   - `✓ <field>`: Field exists in frontmatter. Clicking jumps directly to that line in the editor.
   - `+ <field>`: Field is absent. Clicking cleanly inserts the property at the top of the YAML block.
3. **Strict Clean Line Formatting**: Adding or removing properties maintains strictly one clean newline between frontmatter (`---`) and Markdown body.
