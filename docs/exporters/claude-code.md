# Claude Code Transpiler

Transpiles universal agents into project guidelines (`CLAUDE.md`) and subagent slash commands (`.claude/commands/<agent>.md`).

---

## File Structure

```
├── CLAUDE.md                      # Project architecture & slash commands table
└── .claude/
    └── commands/
        ├── orchestrator.md        # /orchestrator command definition
        ├── evaluator.md           # /evaluator command definition
        └── coder.md               # /coder command definition
```

---

## Transpilation Mapping

1. **Tool Permissions**:
   The `tools` array is mapped to a comma-separated `allowed-tools` string:
   ```yaml
   # Input
   tools: [file_reader, bash, grep_search]

   # Transpiled Output
   allowed-tools: file_reader, bash, grep_search
   ```

2. **Master `CLAUDE.md` Orchestration Table**:
   Generates a routing directory describing all available slash commands and when Claude Code should trigger or delegate to them:
   ```markdown
   # Project Multi-Agent Guidelines

   ## Available Slash Commands

   | Command | Role | Allowed Tools | Description |
   | :--- | :--- | :--- | :--- |
   | `/orchestrator` | `orchestrator` | `file_reader, grep_search` | Coordinates multi-agent workflows. |
   | `/evaluator` | `evaluator` | `bash, file_reader` | Audits test coverage and lints. |
   | `/coder` | `coder` | `file_writer, bash` | Implements bugfixes and code changes. |
   ```

3. **Slash Command Subagent Files**:
   Each `.claude/commands/<agent>.md` file receives sanitized frontmatter and execution instructions formatted for Claude Code.
