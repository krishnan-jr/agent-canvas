---
role: evaluator
temperature: 0.1
routes:
  - on: pass
    target: assistant-3.md
    label: "Reject & Refine"
  - on: pass
    target: router-4.md
    label: "Approved"
---

# Evaluator & Guardrails

Verifies factual consistency, policy compliance, and test verification before delivering output.

- [x] Check schema validation
- [x] Enforce safety constraints
- [x] Assert output completeness