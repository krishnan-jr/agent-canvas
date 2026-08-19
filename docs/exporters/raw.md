# Universal Raw Runner

Preserves raw Markdown vaults exactly as configured on the canvas and includes a standalone, zero-dependency Node.js DAG execution engine (`workflow.js`).

---

## File Structure

```
├── workflow.js                    # Standalone DAG execution engine (ES Modules)
├── orchestrator.md                # Raw universal agent markdown file
├── evaluator.md                   # Raw universal agent markdown file
└── coder.md                       # Raw universal agent markdown file
```

---

## Running Standalone Workflows

The generated `workflow.js` uses native Node.js ES Modules to simulate or execute multi-agent workflows locally without requiring external orchestrators:

```bash
# Execute local workflow
node workflow.js

# Execute with step-by-step trace output
node workflow.js --trace
```

---

## Execution Logic

`workflow.js` parses the YAML frontmatter of each `.md` file, resolves dependencies based on `routes`, and executes agent steps sequentially:
1. Detects the root supervisor node (`orchestrator`).
2. Evaluates conditional route pills (`on: pass`, `on: fail`, `on: next`).
3. Tracks retry counters against `max_retries`.
4. Emits formatted terminal execution logs.
