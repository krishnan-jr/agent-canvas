# REST API Reference

The Agent Canvas backend server (`src/server.js`) exposes a lightweight REST API for interacting with projects, nodes, edges, skills, and filesystem directories.

---

## Projects API

### `GET /api/projects`
List all projects.

### `POST /api/projects`
Create a new project.
- **Request Body**:
  ```json
  {
    "name": "Customer Support Squad",
    "description": "Multi-agent squad handling customer issues"
  }
  ```

### `GET /api/projects/:id`
Fetch single project metadata.

### `DELETE /api/projects/:id`
Delete a project and all associated blocks.

---

## Graph Topology API

### `GET /api/projects/:id/nodes`
List all agent blocks in a project.

### `POST /api/projects/:id/nodes`
Create a new agent block.
- **Request Body**:
  ```json
  {
    "filename": "evaluator.md",
    "title": "Evaluator",
    "content": "---\nrole: evaluator\n---\n\n# Evaluator",
    "x": 250,
    "y": 120,
    "width": 280,
    "height": 220
  }
  ```

### `PUT /api/projects/:id/nodes/:nodeId`
Update an existing agent node.

### `DELETE /api/projects/:id/nodes/:nodeId`
Delete an agent node.

---

## Connections API

### `GET /api/projects/:id/edges`
List all routing connections.

### `POST /api/projects/:id/edges`
Create a connection edge.
- **Request Body**:
  ```json
  {
    "fromNode": "orchestrator-id",
    "toNode": "evaluator-id",
    "fromPort": "right",
    "toPort": "left",
    "label": "on: pass"
  }
  ```

### `DELETE /api/projects/:id/edges/:edgeId`
Delete a connection edge.

---

## Export & Transpilation API

### `GET /api/projects/:id/export/preview?target=claude-code`
Dry-run transpilation preview of generated files without writing to disk.

### `POST /api/projects/:id/export`
Transpiles and writes files directly to disk.
- **Request Body**:
  ```json
  {
    "target": "claude-code",
    "customPath": "./workspace/my_export_dir"
  }
  ```

### `GET /api/projects/:id/export/zip?target=claude-code`
Streams a standard `.zip` archive containing the transpiled project files.

---

## Filesystem Directory API

### `GET /api/filesystem/directories?path=./workspace`
Browse folders on disk for the In-DOM Directory Browser.

### `POST /api/filesystem/mkdir`
Create a new directory on disk.
- **Request Body**:
  ```json
  {
    "path": "./workspace/new_feature_dir"
  }
  ```
