# Installation & Quick Start

Get up and running with **Agent Canvas** in under two minutes.

---

## Prerequisites

- **Node.js**: Version 20.0.0 or later (Node 22 or Node 26 recommended for native `node:sqlite` support).
- **Package Manager**: `npm` (included with Node.js).
- **Web Browser**: Any modern evergreen browser (Chrome, Safari, Firefox, Edge, Arc, Brave).

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/agent-canvas.git
cd agent-canvas
```

### 2. Launch the Application

```bash
# Start server
npm start

# Or start in watch mode for development
npm run dev
```

### 3. Open the Canvas

Navigate to `http://localhost:3000` in your web browser.

---

## Available Scripts

| Command | Action |
| :--- | :--- |
| `npm start` | Launches the primary server at `http://localhost:3000`. |
| `npm run dev` | Starts server in watch mode (`node --watch src/server.js`). |
| `npm run mcp` | Starts the standalone Model Context Protocol (MCP) server over Standard I/O. |
| `npm run docs:dev` | Starts the VitePress documentation server locally on `http://localhost:5173`. |
| `npm run docs:build` | Compiles the static documentation site to `docs/.vitepress/dist`. |
| `npm run docs:preview` | Previews the compiled documentation build locally. |

---

## Creating Your First Agent Vault

1. **Create a Project**: Click the project breadcrumb dropdown in the top-left corner (`/ Project Name`) and click **+ New Project**. Enter a project title like `customer_support_squad`.
2. **Add Agent Blocks**: Click **+ New .md Block** in the top navigation bar.
3. **Configure Agent Frontmatter**:
   - Double-click any block to open the **Deep Markdown Editor**.
   - Select a role from the dropdown (`orchestrator`, `assistant`, `researcher`, etc.).
   - Define capabilities, permitted tools (`file_reader`, `bash`, `web_search`), and temperature.
4. **Connect Agents**:
   - Drag from the port handle (`top`, `bottom`, `left`, `right`) of the source agent to the target agent.
   - Click the connection pill to configure transition decisions (`pass`, `fail`, `next`) or max retry counts.
5. **Export to Your Target Harness**:
   - Click **⤓ Export** to open the **Multi-Target Export Studio**.
   - Select your desired provider tab (e.g. Claude Code or OpenCode).
   - Click **Export to Workspace Disk** or **Download ZIP Bundle**.
