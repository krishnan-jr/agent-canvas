# OpenCode Interpreter Transpiler

Transpiles universal agents into the OpenCode multi-agent protocol (`AGENTS.md`) and subagent definitions (`.opencode/agents/<agent>.md`).

---

## File Structure

```
├── AGENTS.md                      # Multi-agent protocol & Mermaid DAG
└── .opencode/
    └── agents/
        ├── orchestrator.md
        ├── evaluator.md
        └── coder.md
```

---

## Transpilation Mapping

1. **Mermaid DAG Generation**:
   The canvas topology and connection edges are compiled directly into a Mermaid flowchart block within `AGENTS.md`:
   ```markdown
   # Autonomous Multi-Agent Suite - OpenCode Multi-Agent Protocol

   ## Execution Flow Graph

   ```mermaid
   graph TD
     orchestrator["orchestrator.md (orchestrator)"] --> evaluator["evaluator.md (evaluator)"]
     evaluator -- "on: fail" --> coder["coder.md (coder)"]
     evaluator -- "on: pass" --> deployer["deployer.md (assistant)"]
   ```
   ```

2. **Agent Schema Sanitization**:
   - `model` is retained.
   - `tools` are sanitized.
   - `mode` is determined (`primary` for root orchestrator, `subagent` for all other nodes).
