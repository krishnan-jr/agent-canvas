# MCP Client Configuration Guides

Connect your favorite AI coding assistant directly to **Agent Canvas** using the configurations below.

> [!TIP]
> **Dynamic Path Resolution**: When running Agent Canvas, click **MCP Server (22 Tools)** in the top navigation **•••** menu to view and copy pre-filled configurations with the exact absolute path dynamically resolved for your current machine.

---

## 1. Claude Desktop

Add Agent Canvas to your `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agent-canvas": {
      "command": "node",
      "args": ["/absolute/path/to/agent-canvas/src/mcpServer.js"]
    }
  }
}
```

---

## 2. Cursor IDE

Add Agent Canvas to `.cursor/mcp.json` (project-level or global `~/.cursor/mcp.json`):

```json
{
  "mcp": {
    "agent-canvas": {
      "type": "local",
      "command": ["node", "/absolute/path/to/agent-canvas/src/mcpServer.js"],
      "enabled": true
    }
  }
}
```

---

## 3. OpenCode

Add Agent Canvas to `opencode.json` (project root) or `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "agent-canvas": {
      "type": "local",
      "command": ["node", "/absolute/path/to/agent-canvas/src/mcpServer.js"],
      "enabled": true
    }
  }
}
```

---

## 4. Claude Code CLI

Register the MCP server via the Claude Code CLI:

```bash
claude mcp add agent-canvas --command="node" --args="/absolute/path/to/agent-canvas/src/mcpServer.js"
```

---

## 5. Google Antigravity (AGY)

Add Agent Canvas to your Antigravity workspace MCP configuration:

```json
{
  "mcpServers": {
    "agent-canvas": {
      "command": "node",
      "args": ["/absolute/path/to/agent-canvas/src/mcpServer.js"]
    }
  }
}
```

---

## 6. HTTP / Server-Sent Events (SSE)

For webhooks or remote clients, the server exposes native SSE endpoints:
- **SSE Stream**: `http://localhost:3000/api/mcp/sse`
- **POST Messages**: `http://localhost:3000/api/mcp/message`
