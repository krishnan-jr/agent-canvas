# Cursor Rules Transpiler

Transpiles universal agents into `.cursorrules` and modular contextual rules (`.cursor/rules/<agent>.mdc`).

---

## File Structure

```
├── .cursorrules                   # Global project rules & agent routing overview
└── .cursor/
    └── rules/
        ├── evaluator.mdc          # Targeted contextual rule file
        └── coder.mdc              # Implementation rule file
```

---

## Transpilation Mapping

1. **Contextual Triggering via `globs`**:
   Agents with `globs` defined are transpiled into `.cursor/rules/<name>.mdc` with `alwaysApply: false` so Cursor only activates the agent when editing matching files:
   ```markdown
   ---
   description: Quality auditor verifying test coverage and lint rules.
   globs: ["src/**/*.js", "tests/**/*.test.js"]
   alwaysApply: false
   ---

   # Quality Guardrail Rules

   Enforce unit tests and security validation for matching source files.
   ```

2. **Master `.cursorrules` File**:
   Contains project-level architectural context, tool guidelines, and routing rules for the root orchestrator.
