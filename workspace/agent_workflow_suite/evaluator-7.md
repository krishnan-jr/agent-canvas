---
role: evaluator
model: claude-3-5-haiku
temperature: 0.1
routes:
  - on: fail
    target: assistant-3.md
    label: "Reject & Refine"
    max_retries: 3
  - on: pass
    target: router-4.md
    label: "Approved"
---

# Evaluator & Guardrails

Verifies factual consistency, policy compliance, and test verification before delivering output.

- [x] Check schema validation
- [x] Enforce safety constraints
- [x] Assert output completeness
