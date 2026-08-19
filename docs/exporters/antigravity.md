# Antigravity (AGY) Transpiler

Transpiles universal agents into Google Antigravity project rules (`GEMINI.md`) and modular skill packages (`.gemini/antigravity/skills/<agent>/SKILL.md`).

---

## File Structure

```
├── GEMINI.md                                  # Multi-agent master routing matrix
└── .gemini/
    └── antigravity/
        └── skills/
            ├── orchestrator/
            │   └── SKILL.md                   # Skill runbook for supervisor
            ├── evaluator/
            │   └── SKILL.md                   # Skill runbook for quality guardrail
            └── coder/
                └── SKILL.md                   # Skill runbook for coder
```

---

## Transpilation Mapping

1. **Subagent Delegation Directives (`invoke_subagent`)**:
   Routing connections from the canvas are converted into Antigravity subagent invocation steps:
   ```markdown
   ## Subagent Delegation Matrix

   - **Evaluator**: Invoke subagent `evaluator` when code changes are ready for audit.
     - On **PASS**: Advance workflow to `deployer`.
     - On **FAIL**: Delegate back to `coder` (Maximum retries: 3).
   ```

2. **Skill Bundle Generation (`SKILL.md`)**:
   Each agent file is transpiled into a standalone skill package directory with YAML frontmatter specifying tool permissions, role, and instructions.
