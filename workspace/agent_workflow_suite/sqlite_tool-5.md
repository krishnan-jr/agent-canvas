---
role: tool
type: sqlite_query
database: canvas.db
routes:
  - on: default
    target: researcher-6.md
    label: "Step flow"
  - on: default
    target: researcher-6.md
    label: "Step flow"
  - on: default
    target: researcher-6.md
    label: "Next"
---

# SQLite Query Tool

Provides structured query capabilities over native `node:sqlite` storage.

```sql
SELECT id, filename, created_at 
FROM nodes 
ORDER BY updated_at DESC;
```
