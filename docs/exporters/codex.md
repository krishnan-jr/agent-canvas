# OpenAI Codex / Assistants Transpiler

Transpiles universal agents into OpenAI Assistants v2 schemas (`codex.json`) and system prompt instructions (`instructions/<agent>.md`).

---

## File Structure

```
├── codex.json                     # OpenAI Assistants v2 definition schema
└── instructions/
    ├── orchestrator.md            # System prompt for orchestrator assistant
    ├── evaluator.md               # System prompt for evaluator assistant
    └── coder.md                   # System prompt for coder assistant
```

---

## Transpilation Mapping

1. **`codex.json` Schema**:
   Converts universal agent nodes into an array of OpenAI Assistant configurations:
   ```json
   {
     "assistants": [
       {
         "id": "evaluator",
         "name": "Evaluator",
         "model": "gpt-4o",
         "instructions_file": "instructions/evaluator.md",
         "temperature": 0.2,
         "tools": [
           { "type": "code_interpreter" },
           { "type": "file_search" }
         ]
       }
     ]
   }
   ```

2. **Tool Mapping**:
   Maps Agent Canvas standard tools (`bash`, `file_reader`, `file_writer`) to OpenAI native capabilities (`code_interpreter`, `file_search`, `function`).
