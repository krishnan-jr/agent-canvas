---
name: security-audit
description: Automated static analysis, dependency vulnerability scanning, and secret leak prevention.
---

# Security Audit & Policy Gate

Scans codebase for hardcoded secrets, dangerous regexes, and vulnerable dependencies.

## Policy Checks
- Never commit .env or API keys
- Sanitize SQL inputs
- Enforce CORS / CSRF protections
