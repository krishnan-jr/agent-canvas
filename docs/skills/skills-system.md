# Modular Skills System

Agent Canvas includes a centralized, **Global Skills Catalog** that allows you to package, share, and link specialized runbooks, scripts, and policy documentation across all projects and agent squads in your workspace.

---

## Global Skills Architecture

Skills are maintained globally across the entire Agent Canvas environment:
- **Global Availability**: Every skill created, imported, or uploaded is available to all projects.
- **Disk Mirroring**: Skills are saved to `workspace/skills/<skill-name>/` with live bidirectional synchronization.
- **Progressive Transpilation**: When exporting any project, only the skills explicitly referenced by that project's agents are packaged into target provider formats (such as `.gemini/antigravity/skills/` or `.claude/skills/`).

---

## Skill Package Structure

Every skill is a standalone directory conforming to the universal skill standard:

```
skills/security-audit/
├── SKILL.md                       # Required: Main runbook & instructions
├── references/                    # Optional: Reference policies and guidelines
│   └── policies.md
└── scripts/                       # Optional: Automated bash/node scripts
    └── check_vulnerabilities.sh
```

---

## `SKILL.md` Specification

```markdown
---
name: security-audit
description: Audits dependencies for known CVEs and verifies authentication policies.
tools: [bash, file_reader]
---

# Security Audit Skill

Execute vulnerability checks against dependencies and inspect token handling logic.
```

---

## ZIP Package Upload & Import

Skill packages can be imported directly into the global library via ZIP archive upload:
1. Click **Skills Library** in the header navigation.
2. Click **Upload ZIP** and select any `.zip` archive containing a `SKILL.md` and optional supporting files.
3. The server extracts all files (supporting Deflate and uncompressed formats with Central Directory header validation) and registers the package globally.

---

## Linking Skills to Agents

1. **Via Deep Editor**: Click the **Link Skills** dropdown button in the editor toolbar and select one or more skills from the global catalog.
2. **Via YAML Frontmatter**: Add the skill slug directly to the `skills` array:
   ```yaml
   skills: [security-audit, git-workflow]
   ```
3. **Transpilation**: When exporting, skills linked to agents are automatically bundled into provider-native skills directories (e.g. `.gemini/antigravity/skills/` or `.opencode/skills/`).
