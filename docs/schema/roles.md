# Accepted Universal Roles

Universal roles establish the semantic execution boundaries and delegation behaviors of agents across various LLM harnesses.

---

## Role Summary Table

| Role | Badge Color | Category | Core Purpose |
| :--- | :--- | :--- | :--- |
| **`orchestrator`** | `#38bdf8` (Sky Blue) | Supervisor | Master supervisor coordinating workflows, scheduling tasks, and managing subagent delegation. |
| **`assistant`** | `#64748b` (Slate Gray) | Conversational | General conversational agent executing interactive queries, explaining concepts, formulating plans. |
| **`researcher`** | `#818cf8` (Indigo) | Read-only | Read-only explorer gathering codebase context, documentation, and external web search data. |
| **`evaluator`** | `#10b981` (Emerald) | Guardrail | Quality gatekeeper auditing test coverage, lint checks, policy compliance, and security guardrails. |
| **`router`** | `#f59e0b` (Amber) | Decision Node | Decision node evaluating conditions, branching paths, validating pass/fail states, and managing retries. |
| **`coder`** | `#a855f7` (Purple) | Engineer | Implementation engineer focused on writing, editing, refactoring, and fixing code. |
| **`tool`** | `#71717a` (Zinc Gray) | Utility | Specialized deterministic utility agent executing discrete bash scripts or single tool calls. |
| **`(None)`** | `#94a3b8` (Muted) | Unconstrained | General standalone agent without specific role constraints. |

---

## Detailed Role Guides

### 1. Orchestrator
- **Transpilation Impact**: Root entry point in Claude Code (`CLAUDE.md`), OpenCode root node, and Antigravity supervisor.
- **Recommended Tools**: `file_reader`, `grep_search`, `find_files`.
- **System Constraints**: In any multi-agent project, there should typically only be **one** orchestrator node.

### 2. Evaluator
- **Transpilation Impact**: Mapped as a verification step before downstream deployment or commit.
- **Recommended Tools**: `bash` (to run test suites and linters), `file_reader`.
- **Routing**: Emits `on: pass` to advance to deployment or `on: fail` with a retry limit to loop back to `coder`.

### 3. Router
- **Transpilation Impact**: Transpiled to branching decision logic in OpenCode Mermaid DAGs and Antigravity conditional delegates.
- **Recommended Temperature**: `0.0` or `0.1` for deterministic decision outcomes.

### 4. Unconstrained (No Role)
- **Selection**: Choose `none` from the role dropdown.
- **Behavior**: The `role:` line is cleanly omitted from the frontmatter. The agent functions as a general-purpose prompt block without semantic harness specialization.
