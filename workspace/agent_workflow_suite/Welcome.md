---
role: orchestrator
model: gemini-3.7-flash
tools: [file_reader, web_search]
description: Primary orchestration block for coordinating task dispatch.
skills: [git-workflow, security-audit]
routes:
  - on: default
    target: assistant-3.md
    label: "Delegate Goal"
  - on: default
    target: assistant-3.md
    label: "Step flow"
  - on: default
    target: assistant-3.md
    label: "Step flow"
  - on: default
    target: assistant-3.md
    label: "Step flow"
---

# Welcome

This is your new vault for **Agent Orchestration**.

- Make a note of something, [create a link](#), or connect agent blocks.
- Drag from any port to orchestrate workflows.
- Edit markdown in-place or simulate execution!

When you are ready, delete this note and make the workflow your own.