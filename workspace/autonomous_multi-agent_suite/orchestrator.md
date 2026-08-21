---
name: orchestrator
role: orchestrator
tools: [file_reader, web_search]
skills: [git-workflow]
temperature: 0.2
routes:
  - on: next
    target: evaluator.md
    label: "Dispatch Task"
---

# Task Orchestrator

Agent instructions and execution guidance.