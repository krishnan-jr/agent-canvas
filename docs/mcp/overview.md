# Model Context Protocol (MCP) Server

Agent Canvas includes a high-performance **Model Context Protocol (MCP) Server** exposing 25 built-in tool actions, dynamic resource providers, and autonomous prompt templates. External AI agents can inspect, create, modify, simulate, and export multi-agent canvases programmatically over STDIO or HTTP/SSE transports.

---

## Visual MCP Server Modal

![MCP Server Modal](/images/mcp-server.png)

---

## 25 Built-in MCP Tool Endpoints

### 1. Projects & Workspaces
- **`list_projects`**: Retrieve all visual canvas projects and their active metadata.
- **`get_project`**: Fetch the full topology of a project (nodes, connections, skills).
- **`create_project`**: Initialize a new multi-agent workspace.
- **`delete_project`**: Delete a project vault and all associated canvas blocks.
- **`sync_workspace`**: Trigger bidirectional SQLite $\leftrightarrow$ Disk `.md` synchronization.

### 2. Agents & Blocks
- **`list_agents`**: List all agent `.md` blocks in the active project.
- **`get_agent`**: Retrieve full YAML frontmatter and markdown body of an agent.
- **`create_agent`**: Create a new agent node with position, role, and markdown instructions.
- **`update_agent`**: Modify an agent's frontmatter properties or instructions.
- **`delete_agent`**: Remove an agent block and disconnect its routes.

### 3. Routing & Connections
- **`create_edge`**: Wire a transition edge between two agents with conditional decision labels (`pass`, `fail`, `next`).
- **`update_edge`**: Modify transition conditions, max retry limits, labels, or connection port handles.
- **`delete_edge`**: Disconnect a routing edge.
- **`auto_layout_graph`**: Execute automatic topological DAG alignment on the canvas.

### 4. Modular Skills Catalog
- **`list_skills`**: Query all available skills in the catalog.
- **`get_skill`**: Read the `SKILL.md` content and bundled assets of a skill package.
- **`create_skill`**: Register a new modular skill package.
- **`delete_skill`**: Remove a skill from the catalog.

### 5. Workflow Simulation & Execution
- **`run_workflow`**: Execute an autonomous multi-agent simulation run across the graph.
- **`get_workflow_trace`**: Fetch execution telemetry and step-by-step logs.
- **`submit_approval_decision`**: Provide human-in-the-loop approval at gatekeeper nodes.

### 6. Diagnostics & Multi-Target Export
- **`lint_graph`**: Run topology diagnostics for broken links, missing agents, or invalid YAML.
- **`list_export_targets`**: List all supported target platforms and master file formats.
- **`preview_export`**: Dry-run transpilation to Claude Code, OpenCode, Cursor, Antigravity, or Codex.
- **`export_workflow`**: Transpile and write multi-agent files directly to disk.

---

## MCP Prompts

The MCP server provides standard parameterized prompt templates (`prompts/list` and `prompts/get`):
- **`generate_multi_agent_pipeline`**: Guides the AI assistant in designing and generating an end-to-end multi-agent workflow.
- **`audit_project_readiness`**: Automates linting and multi-target export readiness evaluation.
- **`execute_and_refine_workflow`**: Runs workflow simulation and generates routing refinement recommendations.

---

## MCP Resources

Exposes real-time graph data and configurations via standard `canvas://` resource URIs:
- `canvas://projects`: Complete projects catalog.
- `canvas://projects/:projectId`: Project topology, nodes, edges, and stats.
- `canvas://projects/:projectId/nodes/:nodeId`: Direct Markdown source of an agent block.
- `canvas://projects/:projectId/export/:target`: Live transpiled output for any target platform.
