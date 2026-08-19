---
name: orchestrator
role: orchestrator
model: gemini-3.7-flash
tools: [file_reader, web_search]
skills: [git-workflow]
temperature: 0.2
routes:
  - on: default
    target: evaluator.md
    label: "Dispatch Task"
    condition: "next"
---

# Task Orchestrator

Agent instructions and execution guidance.