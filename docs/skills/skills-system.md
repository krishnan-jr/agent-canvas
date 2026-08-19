# Modular Skills System

Agent Canvas includes a modular **Skills Catalog** that allows you to package, share, and link specialized runbooks, scripts, and policy documentation across multiple agents.

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

## Linking Skills to Agents

1. **Via Deep Editor**: Click the **Link Skills** dropdown button in the editor toolbar and select one or more skills from the catalog.
2. **Via YAML Frontmatter**: Add the skill slug directly to the `skills` array:
   ```yaml
   skills: [security-audit, git-workflow]
   ```
3. **Transpilation**: When exporting, skills linked to agents are automatically bundled into provider-native skills directories (e.g. `.gemini/antigravity/skills/` or `.opencode/skills/`).
