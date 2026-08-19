# Model Context Protocol (MCP) Server

Agent Canvas includes a high-performance **Model Context Protocol (MCP) Server** exposing 22 built-in tool actions. External AI agents can inspect, create, modify, simulate, and export multi-agent canvases programmatically.

---

## Visual MCP Server Modal

![MCP Server Modal](/images/mcp-server.png)

---

## 22 Built-in MCP Tool Endpoints

### 1. Projects & Workspaces
- **`list_projects`**: Retrieve all visual canvas projects and their active metadata.
- **`get_project`**: Fetch the full topology of a project (nodes, connections, skills).
- **`create_project`**: Initialize a new multi-agent workspace.
- **`delete_project`**: Delete a project vault and all associated canvas blocks.

### 2. Agents & Blocks
- **`list_agents`**: List all agent `.md` blocks in the active project.
- **`get_agent`**: Retrieve full YAML frontmatter and markdown body of an agent.
- **`create_agent`**: Create a new agent node with position, role, and markdown instructions.
- **`update_agent`**: Modify an agent's frontmatter properties or instructions.
- **`delete_agent`**: Remove an agent block and disconnect its routes.

### 3. Routing & Connections
- **`create_edge`**: Wire a transition edge between two agents with conditional decision labels (`pass`, `fail`, `next`).
- **`delete_edge`**: Disconnect a routing edge.
- **`auto_layout_graph`**: Execute automatic topological DAG alignment on the canvas.

### 4. Modular Skills Catalog
- **`list_skills`**: Query all available skills in the catalog.
- **`get_skill`**: Read the `SKILL.md` content of a skill package.
- **`create_skill`**: Register a new modular skill package.
- **`delete_skill`**: Remove a skill from the catalog.

### 5. Workflow Simulation & Execution
- **`run_workflow`**: Execute an autonomous multi-agent simulation run across the graph.
- **`get_workflow_trace`**: Fetch execution telemetry and step-by-step logs.
- **`submit_approval_decision`**: Provide human-in-the-loop approval at gatekeeper nodes.

### 6. Diagnostics & Multi-Target Export
- **`lint_graph`**: Run topology diagnostics for broken links, missing agents, or invalid YAML.
- **`preview_export`**: Dry-run transpilation to Claude Code, OpenCode, Cursor, Antigravity, or Codex.
- **`export_workflow`**: Transpile and write multi-agent files directly to disk.
