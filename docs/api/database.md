# SQLite Database Schema

Agent Canvas uses Node.js 26 native **`node:sqlite`** (`DatabaseSync`) for local persistence with zero external binary dependencies.

---

## Performance & Concurrency

- **Engine**: `node:sqlite` (`DatabaseSync`)
- **Journal Mode**: `PRAGMA journal_mode = WAL;` (Write-Ahead Logging for high-throughput reads and concurrent writes)
- **Foreign Key Constraints**: `PRAGMA foreign_keys = ON;`
- **File Location**: `./data/agent_canvas.sqlite` (or `canvas.db`)

---

## Schema Tables

### `projects` Table
```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### `nodes` Table
```sql
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### `edges` Table
```sql
CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  from_node TEXT NOT NULL,
  to_node TEXT NOT NULL,
  from_port TEXT DEFAULT 'right',
  to_port TEXT DEFAULT 'left',
  label TEXT DEFAULT '',
  data TEXT DEFAULT '{}',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (from_node) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_node) REFERENCES nodes(id) ON DELETE CASCADE
);
```

### `skills` Table
```sql
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### `execution_logs` Table
```sql
CREATE TABLE IF NOT EXISTS execution_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL,
  output TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```
