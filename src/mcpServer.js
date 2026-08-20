/**
 * Model Context Protocol (MCP) Server for Agent Canvas Orchestrator
 * Provides complete autonomous control over projects, agents, graph edges,
 * skills catalog, live workflow execution, diagnostics, and multi-target exports.
 * 
 * Supports dual transports:
 * 1. STDIO (JSON-RPC 2.0 over process.stdin/stdout)
 * 2. HTTP/SSE (via export handler in server.js)
 */

import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  db,
  getAllProjects,
  getProjectById,
  createProject,
  deleteProject,
  getNodesByProject,
  getNodeById,
  saveNode,
  deleteNode,
  getEdgesByProject,
  getEdgeById,
  saveEdge,
  deleteEdge,
  getSkillsByProject,
  getSkillById,
  getSkillByName,
  getSkillFiles,
  saveSkill,
  saveSkillFile,
  deleteSkill,
  WORKSPACE_DIR
} from './db.js';

import {
  syncNodeToDisk,
  removeNodeFromDisk,
  syncDiskToDatabase,
  syncAllToDisk,
  getProjectDirPath
} from './fileSync.js';

import { validateAgentSchema, parseAgentYaml } from './validator.js';
import { transpileProject, SUPPORTED_TARGETS } from './exporters/index.js';
import { executeWorkflowStream, parseAgentFrontmatter, resumeApprovalSession } from './llmRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MCP Protocol Constants
const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = {
  name: 'agent-canvas-orchestrator',
  version: '1.0.0'
};

// =============================================================================
// Tool Definitions (25 Comprehensive Autonomous Tools)
// =============================================================================

export const MCP_TOOLS = [
  // --- A. Project & Workspace Management ---
  {
    name: 'list_projects',
    description: 'Lists all agent canvas project workspaces with node counts, edge counts, and metadata.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'create_project',
    description: 'Creates a new agent canvas project workspace and initializes disk workspace directory.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the project (e.g., "E-Commerce Multi-Agent Suite")' },
        slug: { type: 'string', description: 'URL-friendly slug (e.g., "ecommerce-suite")' },
        description: { type: 'string', description: 'Description of the multi-agent workflow purpose' }
      },
      required: ['name']
    }
  },
  {
    name: 'get_project',
    description: 'Retrieves full metadata, all agent blocks, bezier connections, and skills for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' }
      }
    }
  },
  {
    name: 'delete_project',
    description: 'Deletes a project workspace, its database records, and mirrored disk files.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID to delete' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'sync_workspace',
    description: 'Triggers bidirectional synchronization between the SQLite database and on-disk mirrored .md markdown agent files in ./workspace/.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID to sync (default: "project-default")' },
        direction: {
          type: 'string',
          enum: ['from-disk', 'to-disk', 'bidirectional'],
          description: 'Sync direction: "from-disk" imports external .md edits; "to-disk" flushes SQLite nodes; "bidirectional" reconciles both (default: "bidirectional")'
        }
      }
    }
  },

  // --- B. Agent & Orchestrator Blocks ---
  {
    name: 'list_agents',
    description: 'Lists all agent blocks in a project with parsed frontmatter (role, model, tools, skills, routes).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' }
      }
    }
  },
  {
    name: 'get_agent',
    description: 'Retrieves complete markdown content, parsed YAML frontmatter, coordinates, and edge connections for a specific agent.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'The unique ID of the agent block' },
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' }
      },
      required: ['nodeId']
    }
  },
  {
    name: 'create_agent',
    description: 'Creates a new universal agent .md block with YAML frontmatter, system prompt instructions, position, and mirrors it to disk.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' },
        title: { type: 'string', description: 'Human-readable title (e.g., "Security Auditor")' },
        filename: { type: 'string', description: 'Filename on disk (e.g., "auditor.md")' },
        content: { type: 'string', description: 'Full Markdown content including YAML frontmatter (---) and instructions' },
        role: { type: 'string', description: 'Role: orchestrator | assistant | researcher | evaluator | router | coder | tool' },
        model: { type: 'string', description: 'Model identifier (e.g., "gemini-3.7-flash", "claude-3-5-sonnet", "gpt-4o")' },
        tools: { type: 'array', items: { type: 'string' }, description: 'Allowed tools (e.g., ["bash", "file_writer", "web_search"])' },
        skills: { type: 'array', items: { type: 'string' }, description: 'Linked skill package names (e.g., ["git-workflow", "security-audit"])' },
        x: { type: 'number', description: 'X canvas coordinate (default: 100)' },
        y: { type: 'number', description: 'Y canvas coordinate (default: 100)' },
        color: { type: 'string', description: 'Card surface color hex code' }
      },
      required: ['title', 'filename']
    }
  },
  {
    name: 'update_agent',
    description: 'Updates an existing agent block markdown content, title, frontmatter parameters, or canvas position.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'The unique ID of the agent block to update' },
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' },
        title: { type: 'string', description: 'Updated title' },
        filename: { type: 'string', description: 'Updated filename' },
        content: { type: 'string', description: 'Updated markdown content' },
        x: { type: 'number', description: 'Updated X coordinate' },
        y: { type: 'number', description: 'Updated Y coordinate' },
        color: { type: 'string', description: 'Updated color hex code' }
      },
      required: ['nodeId']
    }
  },
  {
    name: 'delete_agent',
    description: 'Removes an agent block from the canvas, cascades connected edges, and deletes the mirror file on disk.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'The unique ID of the agent block to delete' },
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' }
      },
      required: ['nodeId']
    }
  },

  // --- C. Graph Routing & Edges ---
  {
    name: 'create_edge',
    description: 'Creates a bezier transition connection between two agent nodes with conditional routing logic.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' },
        sourceId: { type: 'string', description: 'Source agent node ID' },
        targetId: { type: 'string', description: 'Target agent node ID' },
        condition: { type: 'string', description: 'Transition condition (e.g. "pass", "fail", "next", "approval")' },
        edgeType: { type: 'string', description: 'Edge type: "default" | "conditional" | "feedback_loop"' },
        label: { type: 'string', description: 'Visual label on edge (e.g., "Pass -> Deploy", "Reject & Refine")' },
        maxRetries: { type: 'number', description: 'Maximum retry loops for fail condition (default: 3)' },
        sourceHandle: { type: 'string', description: 'Port terminal: "top" | "bottom" | "left" | "right"' },
        targetHandle: { type: 'string', description: 'Port terminal: "top" | "bottom" | "left" | "right"' }
      },
      required: ['sourceId', 'targetId']
    }
  },
  {
    name: 'update_edge',
    description: 'Updates an existing transition connection edge parameters (condition, label, edgeType, maxRetries, port terminals).',
    inputSchema: {
      type: 'object',
      properties: {
        edgeId: { type: 'string', description: 'Unique ID of the edge to update' },
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' },
        condition: { type: 'string', description: 'Updated condition ("pass", "fail", "next", "approval", etc.)' },
        edgeType: { type: 'string', description: 'Updated edge type: "default" | "conditional" | "feedback_loop"' },
        label: { type: 'string', description: 'Updated visual label on edge' },
        maxRetries: { type: 'number', description: 'Updated maximum retry loops' },
        sourceHandle: { type: 'string', description: 'Updated port terminal: "top" | "bottom" | "left" | "right"' },
        targetHandle: { type: 'string', description: 'Updated port terminal: "top" | "bottom" | "left" | "right"' }
      },
      required: ['edgeId']
    }
  },
  {
    name: 'delete_edge',
    description: 'Removes a transition connection edge between agent nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        edgeId: { type: 'string', description: 'Unique ID of the edge to delete' },
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' }
      },
      required: ['edgeId']
    }
  },
  {
    name: 'auto_layout_graph',
    description: 'Executes topological sorting and re-positions all canvas blocks in clean horizontal/vertical pipeline order.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' }
      }
    }
  },

  // --- D. Skills Catalog & Packages ---
  {
    name: 'list_skills',
    description: 'Lists all available linked skill packages, their SKILL.md descriptions, and bundled files.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' }
      }
    }
  },
  {
    name: 'get_skill',
    description: 'Retrieves complete SKILL.md runbook instructions and all bundled reference assets/scripts for a skill.',
    inputSchema: {
      type: 'object',
      properties: {
        skillId: { type: 'string', description: 'Unique ID of the skill' },
        name: { type: 'string', description: 'Name of the skill (e.g., "git-workflow")' },
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' }
      }
    }
  },
  {
    name: 'create_skill',
    description: 'Creates a new linked skill package with SKILL.md instructions, description, and bundled reference files.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' },
        name: { type: 'string', description: 'Unique skill name identifier (e.g., "security-audit")' },
        description: { type: 'string', description: 'Short summary of the skill capabilities' },
        skillMdContent: { type: 'string', description: 'Full Markdown content for SKILL.md' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Relative path (e.g., "references/rules.md" or "scripts/audit.sh")' },
              content: { type: 'string', description: 'File text content' }
            },
            required: ['filePath', 'content']
          },
          description: 'Optional bundled reference files and scripts'
        }
      },
      required: ['name', 'skillMdContent']
    }
  },
  {
    name: 'delete_skill',
    description: 'Deletes a skill package and its files from the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        skillId: { type: 'string', description: 'Unique ID of the skill to delete' },
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' }
      },
      required: ['skillId']
    }
  },

  // --- E. Workflow Execution & Testing ---
  {
    name: 'run_workflow',
    description: 'Autonomously executes the multi-agent DAG workflow, traverses decision loops, and returns complete step traces, verdicts, token telemetry, and estimated cost.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' },
        maxSteps: { type: 'number', description: 'Maximum step executions allowed (default: 25)' }
      }
    }
  },
  {
    name: 'get_workflow_trace',
    description: 'Retrieves detailed execution traces, injected skill packages, and outputs for recent workflow runs.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' },
        limit: { type: 'number', description: 'Number of logs to retrieve (default: 20)' }
      }
    }
  },
  {
    name: 'submit_approval_decision',
    description: 'Submits an approval decision or rerouting command for a workflow paused at a Human-in-the-Loop decision gate.',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'The active execution run ID' },
        action: { type: 'string', enum: ['approve', 'reject'], description: 'Decision action' },
        modifiedPayload: { type: 'string', description: 'Optional revised payload if overriding agent output' }
      },
      required: ['runId', 'action']
    }
  },

  // --- F. Diagnostics & Multi-Target Transpiler ---
  {
    name: 'lint_graph',
    description: 'Runs comprehensive validation and diagnostics across all agents and edges in the project (checks orphan nodes, infinite loops, missing skill runbooks, duplicate YAML keys, and target platform readiness).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' }
      }
    }
  },
  {
    name: 'list_export_targets',
    description: 'Lists all supported AI platform transpiler targets (Claude Code, OpenCode, Cursor, Antigravity, OpenAI Codex, Universal Raw) with their master configuration files and routing behaviors.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'preview_export',
    description: 'Generates a dry-run preview of all transpiled files, directory tree, and routing rules for a target platform without writing to disk.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' },
        target: { 
          type: 'string', 
          enum: ['claude-code', 'opencode', 'cursor', 'antigravity', 'codex', 'universal'],
          description: 'Target export platform'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'export_workflow',
    description: 'Transpiles the multi-agent canvas workflow into provider-native configurations (Claude Code, OpenCode, Cursor, Antigravity, OpenAI Codex, or Universal Raw bundle) and writes to disk.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (default: "project-default")' },
        target: { 
          type: 'string', 
          enum: ['claude-code', 'opencode', 'cursor', 'antigravity', 'codex', 'universal'],
          description: 'Target export platform'
        },
        outputDir: { type: 'string', description: 'Optional custom export directory' }
      },
      required: ['target']
    }
  }
];

// =============================================================================
// Resource Definitions
// =============================================================================

export const MCP_RESOURCES = [
  {
    uri: 'canvas://projects',
    name: 'Canvas Projects List',
    description: 'List of all agent canvas workspace projects with metadata',
    mimeType: 'application/json'
  },
  {
    uri: 'canvas://skills',
    name: 'Canvas Skills Catalog',
    description: 'All registered skill packages and their SKILL.md contents',
    mimeType: 'application/json'
  },
  {
    uri: 'canvas://targets',
    name: 'Supported Export Targets',
    description: 'Registry of all supported multi-target AI harnesses and file formats',
    mimeType: 'application/json'
  }
];

// =============================================================================
// Prompt Definitions
// =============================================================================

export const MCP_PROMPTS = [
  {
    name: 'generate_multi_agent_pipeline',
    description: 'Designs an autonomous multi-agent pipeline with Orchestrator, Assistant, Evaluator, and Router nodes for a given objective.',
    arguments: [
      { name: 'projectId', description: 'Target project ID (default: "project-default")', required: false },
      { name: 'objective', description: 'The high-level goal or workflow to build', required: true },
      { name: 'domain', description: 'Domain focus (e.g. software development, security auditing, customer support, research)', required: false }
    ]
  },
  {
    name: 'audit_project_readiness',
    description: 'Runs linter diagnostics and evaluates multi-target export readiness (Claude Code, Cursor, OpenCode, Antigravity).',
    arguments: [
      { name: 'projectId', description: 'Project ID to audit (default: "project-default")', required: false },
      { name: 'targetPlatform', description: 'Target AI harness (claude-code, opencode, cursor, antigravity, codex, universal)', required: false }
    ]
  },
  {
    name: 'execute_and_refine_workflow',
    description: 'Runs the multi-agent DAG simulation, inspects verdicts, and generates edge refinement recommendations for rejected steps.',
    arguments: [
      { name: 'projectId', description: 'Project ID to execute (default: "project-default")', required: false },
      { name: 'maxSteps', description: 'Maximum step limit (default: 25)', required: false }
    ]
  }
];

// =============================================================================
// Tool Call Handlers
// =============================================================================

export async function executeToolCall(toolName, args = {}) {
  const projectId = args.projectId || 'project-default';

  switch (toolName) {
    // --- Projects ---
    case 'list_projects': {
      const projects = getAllProjects();
      return { success: true, count: projects.length, projects };
    }

    case 'create_project': {
      const id = `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const project = createProject({
        id,
        name: args.name,
        description: args.description || ''
      });
      return { success: true, message: `Project '${args.name}' created`, project };
    }

    case 'get_project': {
      const project = getProjectById(projectId) || { id: projectId, name: 'Default Project', slug: 'default' };
      const nodes = getNodesByProject(projectId);
      const edges = getEdgesByProject(projectId);
      const skills = getSkillsByProject(projectId);
      return {
        success: true,
        project,
        stats: {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          skillCount: skills.length
        },
        nodes: nodes.map(n => ({ id: n.id, title: n.title, filename: n.filename, position: { x: n.x, y: n.y } })),
        edges: edges.map(e => ({ id: e.id, source: e.source_id, target: e.target_id, condition: e.condition, label: e.label }))
      };
    }

    case 'delete_project': {
      if (args.projectId === 'project-default') {
        throw new Error('Cannot delete the default project workspace.');
      }
      deleteProject(args.projectId);
      return { success: true, message: `Project ${args.projectId} deleted` };
    }

    case 'sync_workspace': {
      const direction = args.direction || 'bidirectional';
      let resultMessage = '';

      if (direction === 'from-disk' || direction === 'bidirectional') {
        const diskCount = syncDiskToDatabase(projectId);
        resultMessage += `Imported ${diskCount} files from disk. `;
      }
      if (direction === 'to-disk' || direction === 'bidirectional') {
        syncAllToDisk();
        resultMessage += `Flushed SQLite database nodes to disk.`;
      }

      return {
        success: true,
        projectId,
        direction,
        message: resultMessage.trim()
      };
    }

    // --- Agents ---
    case 'list_agents': {
      const nodes = getNodesByProject(projectId);
      const agents = nodes.map(n => {
        const parsed = parseAgentFrontmatter(n.content);
        return {
          id: n.id,
          title: n.title,
          filename: n.filename,
          role: parsed.role,
          model: parsed.model,
          tools: parsed.tools,
          skills: parsed.skills,
          routes: parsed.routes,
          temperature: parsed.temperature,
          position: { x: n.x, y: n.y, width: n.width, height: n.height }
        };
      });
      return { success: true, count: agents.length, agents };
    }

    case 'get_agent': {
      const node = getNodeById(args.nodeId);
      if (!node) throw new Error(`Agent node '${args.nodeId}' not found.`);
      const parsed = parseAgentFrontmatter(node.content);
      const edges = getEdgesByProject(projectId);
      const incoming = edges.filter(e => e.target_id === node.id);
      const outgoing = edges.filter(e => e.source_id === node.id);

      return {
        success: true,
        agent: {
          ...node,
          parsedFrontmatter: parsed,
          incomingEdges: incoming,
          outgoingEdges: outgoing
        }
      };
    }

    case 'create_agent': {
      const id = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      let fullContent = args.content;

      if (!fullContent) {
        const toolsYaml = args.tools && args.tools.length > 0 ? `[${args.tools.join(', ')}]` : '[]';
        const skillsYaml = args.skills && args.skills.length > 0 ? `[${args.skills.join(', ')}]` : '[]';
        fullContent = [
          '---',
          `name: ${args.filename.replace(/\.md$/, '')}`,
          `role: ${args.role || 'assistant'}`,
          `model: ${args.model || 'gemini-3.7-flash'}`,
          `tools: ${toolsYaml}`,
          `skills: ${skillsYaml}`,
          `temperature: ${args.temperature !== undefined ? args.temperature : 0.2}`,
          '---',
          '',
          `# ${args.title}`,
          '',
          'Agent instructions and execution guidance.'
        ].join('\n');
      }

      const nodeData = {
        id,
        project_id: projectId,
        title: args.title,
        filename: args.filename.endsWith('.md') ? args.filename : `${args.filename}.md`,
        content: fullContent,
        x: args.x !== undefined ? args.x : 120,
        y: args.y !== undefined ? args.y : 120,
        width: 320,
        height: 380,
        color: args.color || '#202024'
      };

      const node = saveNode(nodeData, projectId);
      syncNodeToDisk(node);

      return { success: true, message: `Agent '${args.title}' created successfully`, node };
    }

    case 'update_agent': {
      const existing = getNodeById(args.nodeId);
      if (!existing) throw new Error(`Agent '${args.nodeId}' not found.`);

      const updateData = {
        id: existing.id,
        project_id: projectId,
        title: args.title !== undefined ? args.title : existing.title,
        filename: args.filename !== undefined ? args.filename : existing.filename,
        content: args.content !== undefined ? args.content : existing.content,
        x: args.x !== undefined ? args.x : existing.x,
        y: args.y !== undefined ? args.y : existing.y,
        width: existing.width,
        height: existing.height,
        color: args.color !== undefined ? args.color : existing.color
      };

      const updated = saveNode(updateData, projectId);
      syncNodeToDisk(updated);

      return { success: true, message: `Agent '${args.nodeId}' updated`, node: updated };
    }

    case 'delete_agent': {
      const existing = getNodeById(args.nodeId);
      if (!existing) throw new Error(`Agent '${args.nodeId}' not found.`);

      removeNodeFromDisk(existing);
      deleteNode(args.nodeId);

      return { success: true, message: `Agent '${args.nodeId}' deleted` };
    }

    // --- Edges & Routing ---
    case 'create_edge': {
      const id = `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const edge = saveEdge({
        id,
        project_id: projectId,
        source_id: args.sourceId,
        target_id: args.targetId,
        source_handle: args.sourceHandle || 'right',
        target_handle: args.targetHandle || 'left',
        edge_type: args.edgeType || (args.condition === 'fail' ? 'feedback_loop' : 'default'),
        condition: args.condition || '',
        max_retries: args.maxRetries || 3,
        label: args.label || (args.condition === 'fail' ? 'Reject & Refine' : args.condition === 'pass' ? 'Pass' : 'Step flow')
      }, projectId);

      return { success: true, message: 'Edge created successfully', edge };
    }

    case 'update_edge': {
      const existing = getEdgeById(args.edgeId);
      if (!existing) throw new Error(`Edge '${args.edgeId}' not found.`);

      const updatedEdge = saveEdge({
        id: existing.id,
        project_id: projectId,
        source_id: existing.source_id,
        target_id: existing.target_id,
        source_handle: args.sourceHandle !== undefined ? args.sourceHandle : existing.source_handle,
        target_handle: args.targetHandle !== undefined ? args.targetHandle : existing.target_handle,
        edge_type: args.edgeType !== undefined ? args.edgeType : existing.edge_type,
        condition: args.condition !== undefined ? args.condition : existing.condition,
        max_retries: args.maxRetries !== undefined ? args.maxRetries : existing.max_retries,
        label: args.label !== undefined ? args.label : existing.label
      }, projectId);

      return { success: true, message: `Edge '${args.edgeId}' updated successfully`, edge: updatedEdge };
    }

    case 'delete_edge': {
      deleteEdge(args.edgeId);
      return { success: true, message: `Edge '${args.edgeId}' deleted` };
    }

    case 'auto_layout_graph': {
      const nodes = getNodesByProject(projectId);
      const edges = getEdgesByProject(projectId);

      // Topological layering layout
      const inDegree = {};
      const adj = {};
      nodes.forEach(n => {
        inDegree[n.id] = 0;
        adj[n.id] = [];
      });
      edges.forEach(e => {
        if (inDegree[e.target_id] !== undefined) inDegree[e.target_id]++;
        if (adj[e.source_id]) adj[e.source_id].push(e.target_id);
      });

      const layers = [];
      let currentQueue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
      if (currentQueue.length === 0 && nodes.length > 0) currentQueue = [nodes[0].id];

      const visited = new Set(currentQueue);

      while (currentQueue.length > 0) {
        layers.push([...currentQueue]);
        const nextQueue = [];
        for (const u of currentQueue) {
          for (const v of adj[u] || []) {
            if (!visited.has(v)) {
              visited.add(v);
              nextQueue.push(v);
            }
          }
        }
        currentQueue = nextQueue;
      }

      // Add remaining orphan nodes
      const remaining = nodes.filter(n => !visited.has(n.id)).map(n => n.id);
      if (remaining.length > 0) layers.push(remaining);

      // Update node coordinates
      let layoutChanges = 0;
      const startX = 80;
      const startY = 100;
      const colWidth = 380;
      const rowHeight = 420;

      layers.forEach((layer, colIdx) => {
        layer.forEach((nodeId, rowIdx) => {
          const node = nodes.find(n => n.id === nodeId);
          if (node) {
            const newX = startX + colIdx * colWidth;
            const newY = startY + rowIdx * rowHeight;
            saveNode({ ...node, x: newX, y: newY }, projectId);
            layoutChanges++;
          }
        });
      });

      return { success: true, message: `Auto-layout arranged ${layoutChanges} nodes across ${layers.length} pipeline layers` };
    }

    // --- Skills Catalog ---
    case 'list_skills': {
      const skills = getSkillsByProject(projectId);
      return { success: true, count: skills.length, skills };
    }

    case 'get_skill': {
      let skill = null;
      if (args.skillId) skill = getSkillById(args.skillId);
      else if (args.name) skill = getSkillByName(projectId, args.name);

      if (!skill) throw new Error(`Skill '${args.skillId || args.name}' not found.`);
      return { success: true, skill, files: skill.files || [] };
    }

    case 'create_skill': {
      const id = `skill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const savedSkill = saveSkill({
        id,
        project_id: projectId,
        name: args.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
        description: args.description || ''
      }, projectId);

      // Save SKILL.md
      saveSkillFile({
        skill_id: savedSkill.id,
        file_path: 'SKILL.md',
        content: args.skillMdContent,
        is_binary: 0
      });

      // Save additional files
      if (args.files && Array.isArray(args.files)) {
        for (const file of args.files) {
          saveSkillFile({
            skill_id: savedSkill.id,
            file_path: file.filePath,
            content: file.content,
            is_binary: 0
          });
        }
      }

      const fullSkill = getSkillById(savedSkill.id);

      return { success: true, message: `Skill '${args.name}' registered successfully`, skill: fullSkill };
    }

    case 'delete_skill': {
      const skill = getSkillById(args.skillId);
      if (!skill) throw new Error(`Skill '${args.skillId}' not found.`);

      deleteSkill(args.skillId);
      return { success: true, message: `Skill '${skill.name}' deleted` };
    }

    // --- Workflow Execution & Testing ---
    case 'run_workflow': {
      const nodes = getNodesByProject(projectId);
      const edges = getEdgesByProject(projectId);

      if (nodes.length === 0) throw new Error(`Project '${projectId}' has no agent blocks.`);

      const collectedSteps = [];

      const sendEvent = (eventName, data) => {
        if (eventName === 'node_finish') {
          collectedSteps.push(data);
        }
      };

      await executeWorkflowStream(nodes, edges, projectId, sendEvent);

      const totalTokens = collectedSteps.reduce((acc, s) => acc + (s.tokens || 0), 0);
      const totalCost = collectedSteps.reduce((acc, s) => acc + (s.cost || 0), 0);
      const totalDuration = collectedSteps.reduce((acc, s) => acc + (s.durationMs || 0), 0);

      return {
        success: true,
        totalStages: collectedSteps.length,
        summary: {
          totalTokens,
          totalCostUsd: Number(totalCost.toFixed(6)),
          cumulativeDurationMs: totalDuration,
          verdictStatus: collectedSteps.some(s => s.verdict === 'REJECTED') ? 'COMPLETED_WITH_RETRIES' : 'SUCCESS'
        },
        stages: collectedSteps.map(s => ({
          step: s.step,
          agentNode: s.nodeTitle,
          role: s.role,
          model: s.model,
          verdict: s.verdict,
          tokens: s.tokens,
          cost: s.cost,
          durationMs: s.durationMs,
          outputSnippet: s.output ? s.output.slice(0, 180) + '...' : ''
        }))
      };
    }

    case 'get_workflow_trace': {
      const stmt = db.prepare(`
        SELECT * FROM execution_logs
        WHERE project_id = ?
        ORDER BY id DESC
        LIMIT ?
      `);
      const logs = stmt.all(projectId, args.limit || 20);
      return { success: true, count: logs.length, logs };
    }

    case 'submit_approval_decision': {
      const resumed = resumeApprovalSession(args.runId, args.action, args.modifiedPayload);
      if (!resumed) {
        throw new Error(`Active approval session for run '${args.runId}' not found or already completed.`);
      }
      return { success: true, message: `Decision '${args.action}' applied to run ${args.runId}` };
    }

    // --- Diagnostics & Exporter ---
    case 'lint_graph': {
      const nodes = getNodesByProject(projectId);
      const edges = getEdgesByProject(projectId);
      const skills = getSkillsByProject(projectId);

      const skillNameSet = new Set(skills.map(s => s.name.toLowerCase()));
      const incomingCount = {};
      const outgoingCount = {};
      nodes.forEach(n => {
        incomingCount[n.id] = 0;
        outgoingCount[n.id] = 0;
      });
      edges.forEach(e => {
        if (incomingCount[e.target_id] !== undefined) incomingCount[e.target_id]++;
        if (outgoingCount[e.source_id] !== undefined) outgoingCount[e.source_id]++;
      });

      const diagnostics = {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        isHealthy: true,
        errors: [],
        warnings: [],
        agentAudits: []
      };

      nodes.forEach(node => {
        const schema = validateAgentSchema(node.content, node.filename);
        const { frontmatter } = parseAgentYaml(node.content);

        const audit = {
          id: node.id,
          title: node.title,
          filename: node.filename,
          role: frontmatter.role || 'unassigned',
          valid: schema.valid,
          issues: []
        };

        // Check frontmatter errors
        if (schema.errors && schema.errors.length > 0) {
          schema.errors.forEach(e => {
            diagnostics.errors.push(`[${node.filename}] Line ${e.line}: ${e.message}`);
            audit.issues.push(e.message);
          });
          diagnostics.isHealthy = false;
        }

        // Check missing skills
        if (frontmatter.skills && Array.isArray(frontmatter.skills)) {
          frontmatter.skills.forEach(sk => {
            if (typeof sk === 'string' && !skillNameSet.has(sk.toLowerCase())) {
              const msg = `Referenced skill '${sk}' is not registered in skills catalog`;
              diagnostics.warnings.push(`[${node.filename}] ${msg}`);
              audit.issues.push(msg);
            }
          });
        }

        // Check isolated orphans
        if (incomingCount[node.id] === 0 && outgoingCount[node.id] === 0 && nodes.length > 1) {
          const msg = `Orphan node: has no incoming or outgoing connections`;
          diagnostics.warnings.push(`[${node.filename}] ${msg}`);
          audit.issues.push(msg);
        }

        diagnostics.agentAudits.push(audit);
      });

      return { success: true, diagnostics };
    }

    case 'list_export_targets': {
      return {
        success: true,
        targets: [
          {
            id: 'claude-code',
            name: 'Claude Code',
            masterFile: 'CLAUDE.md',
            agentDir: '.claude/commands/',
            description: 'Transpiles tools to allowed-tools and configures slash command orchestration.'
          },
          {
            id: 'opencode',
            name: 'OpenCode',
            masterFile: 'AGENTS.md',
            agentDir: '.opencode/agents/',
            description: 'Compiles transition routing into native Mermaid DAG diagrams with sanitized frontmatter.'
          },
          {
            id: 'cursor',
            name: 'Cursor IDE',
            masterFile: '.cursorrules',
            agentDir: '.cursor/rules/',
            description: 'Generates .mdc contextual rules with glob triggers and descriptions.'
          },
          {
            id: 'antigravity',
            name: 'Google Antigravity (AGY)',
            masterFile: 'GEMINI.md',
            agentDir: '.gemini/antigravity/skills/',
            description: 'Compiles transitions into invoke_subagent delegation directives and decision gates.'
          },
          {
            id: 'codex',
            name: 'OpenAI Codex / Assistants v2',
            masterFile: 'codex.json',
            agentDir: 'instructions/',
            description: 'Transpiles tools to OpenAI tool schemas with model and temperature bindings.'
          },
          {
            id: 'universal',
            name: 'Universal Raw Vault',
            masterFile: 'workflow.js',
            agentDir: './',
            description: 'Preserves raw markdown vaults with a standalone Node.js DAG execution runner.'
          }
        ]
      };
    }

    case 'preview_export': {
      const project = getProjectById(projectId) || { id: projectId, name: 'Default Project', slug: 'default' };
      const nodes = getNodesByProject(projectId);
      const edges = getEdgesByProject(projectId);
      const allSkills = getSkillsByProject(projectId);

      const exportFiles = transpileProject(args.target, project, nodes, edges, allSkills);
      const fileList = Array.isArray(exportFiles) ? exportFiles : (exportFiles.files || []);

      return {
        success: true,
        target: args.target,
        totalFiles: fileList.length,
        tree: fileList.map(f => f.path),
        filesPreview: fileList.map(f => ({
          path: f.path,
          language: f.language,
          contentSnippet: f.content.slice(0, 300) + (f.content.length > 300 ? '\n...' : '')
        }))
      };
    }

    case 'export_workflow': {
      const project = getProjectById(projectId) || { id: projectId, name: 'Default Project', slug: 'default' };
      const nodes = getNodesByProject(projectId);
      const edges = getEdgesByProject(projectId);
      const allSkills = getSkillsByProject(projectId);

      const exportFiles = transpileProject(args.target, project, nodes, edges, allSkills);
      const targetDir = args.outputDir || path.join(WORKSPACE_DIR, project.slug || 'default', `export_${args.target}`);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const writtenFiles = [];
      for (const file of (Array.isArray(exportFiles) ? exportFiles : (exportFiles.files || []))) {
        const fullPath = path.join(targetDir, file.path);
        const parentDir = path.dirname(fullPath);
        if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
        fs.writeFileSync(fullPath, file.content, 'utf8');
        writtenFiles.push(file.path);
      }

      return {
        success: true,
        target: args.target,
        outputDirectory: targetDir,
        totalFiles: writtenFiles.length,
        files: writtenFiles
      };
    }

    default:
      throw new Error(`Unknown tool '${toolName}'`);
  }
}

// =============================================================================
// Resource Reader Handlers
// =============================================================================

export async function readResourceUri(uri) {
  if (uri === 'canvas://projects') {
    const projects = getAllProjects();
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(projects, null, 2)
        }
      ]
    };
  }

  if (uri === 'canvas://targets') {
    const targets = await executeToolCall('list_export_targets');
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(targets, null, 2)
        }
      ]
    };
  }

  if (uri === 'canvas://skills') {
    const skills = getSkillsByProject('project-default');
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(skills, null, 2)
        }
      ]
    };
  }

  // Dynamic parameterized URIs
  // 1. canvas://projects/:projectId
  const projectMatch = uri.match(/^canvas:\/\/projects\/([^/]+)$/);
  if (projectMatch) {
    const pId = projectMatch[1];
    const project = getProjectById(pId);
    if (!project) throw new Error(`Project '${pId}' not found.`);
    const nodes = getNodesByProject(pId);
    const edges = getEdgesByProject(pId);
    const skills = getSkillsByProject(pId);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ project, stats: { nodeCount: nodes.length, edgeCount: edges.length, skillCount: skills.length }, nodes, edges, skills }, null, 2)
        }
      ]
    };
  }

  // 2. canvas://projects/:projectId/nodes
  const nodesMatch = uri.match(/^canvas:\/\/projects\/([^/]+)\/nodes$/);
  if (nodesMatch) {
    const pId = nodesMatch[1];
    const nodes = getNodesByProject(pId);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(nodes, null, 2)
        }
      ]
    };
  }

  // 3. canvas://projects/:projectId/nodes/:nodeId
  const nodeMatch = uri.match(/^canvas:\/\/projects\/([^/]+)\/nodes\/([^/]+)$/);
  if (nodeMatch) {
    const pId = nodeMatch[1];
    const nId = nodeMatch[2];
    const node = getNodeById(nId);
    if (!node) throw new Error(`Node '${nId}' not found in project '${pId}'.`);
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: node.content
        }
      ]
    };
  }

  // 4. canvas://projects/:projectId/skills
  const skillsMatch = uri.match(/^canvas:\/\/projects\/([^/]+)\/skills$/);
  if (skillsMatch) {
    const pId = skillsMatch[1];
    const skills = getSkillsByProject(pId);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(skills, null, 2)
        }
      ]
    };
  }

  // 5. canvas://projects/:projectId/skills/:skillName
  const skillMatch = uri.match(/^canvas:\/\/projects\/([^/]+)\/skills\/([^/]+)$/);
  if (skillMatch) {
    const pId = skillMatch[1];
    const sName = skillMatch[2];
    const skill = getSkillByName(pId, sName) || getSkillById(sName);
    if (!skill) throw new Error(`Skill '${sName}' not found in project '${pId}'.`);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(skill, null, 2)
        }
      ]
    };
  }

  // 6. canvas://projects/:projectId/export/:target
  const exportMatch = uri.match(/^canvas:\/\/projects\/([^/]+)\/export\/([^/]+)$/);
  if (exportMatch) {
    const pId = exportMatch[1];
    const target = exportMatch[2];
    const project = getProjectById(pId);
    if (!project) throw new Error(`Project '${pId}' not found.`);
    const nodes = getNodesByProject(pId);
    const edges = getEdgesByProject(pId);
    const skills = getSkillsByProject(pId);
    const result = transpileProject(target, project, nodes, edges, skills);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  throw new Error(`Resource URI '${uri}' not found.`);
}

// =============================================================================
// Unified JSON-RPC Message Dispatcher (Used by STDIO and HTTP/SSE)
// =============================================================================

export async function handleMcpMessage(request) {
  if (!request || typeof request !== 'object') {
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request' }
    };
  }

  const { id, method, params } = request;

  // Handle notifications (no id returned)
  if (method === 'notifications/initialized') {
    return null;
  }

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: true },
              resources: { listChanged: true, subscribe: false },
              prompts: { listChanged: true }
            },
            serverInfo: SERVER_INFO
          }
        };
      }

      case 'ping': {
        return {
          jsonrpc: '2.0',
          id,
          result: {}
        };
      }

      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOLS
          }
        };
      }

      case 'tools/call': {
        if (!params || !params.name) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing tool name in params' }
          };
        }

        try {
          const toolResult = await executeToolCall(params.name, params.arguments || {});
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
                }
              ]
            }
          };
        } catch (toolError) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Tool Error: ${toolError.message}`
                }
              ]
            }
          };
        }
      }

      case 'resources/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            resources: MCP_RESOURCES
          }
        };
      }

      case 'resources/read': {
        if (!params || !params.uri) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing resource uri in params' }
          };
        }
        const resourceResult = await readResourceUri(params.uri);
        return {
          jsonrpc: '2.0',
          id,
          result: resourceResult
        };
      }

      case 'prompts/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            prompts: MCP_PROMPTS
          }
        };
      }

      case 'prompts/get': {
        if (!params || !params.name) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing prompt name in params' }
          };
        }

        const args = params.arguments || {};
        const projectId = args.projectId || 'project-default';

        if (params.name === 'generate_multi_agent_pipeline') {
          const objective = args.objective || 'Build an autonomous multi-agent system';
          const domain = args.domain || 'Software Engineering';
          return {
            jsonrpc: '2.0',
            id,
            result: {
              description: `Generate multi-agent pipeline for "${objective}" in ${domain}`,
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `Please design and construct an autonomous multi-agent workflow in project '${projectId}' to achieve the following objective:\n\nObjective: ${objective}\nDomain: ${domain}\n\nSteps to perform using agent-canvas MCP tools:\n1. Call 'list_agents' or 'get_project' to inspect existing nodes in project '${projectId}'.\n2. Call 'create_agent' for each agent role (e.g. Orchestrator supervisor, Worker specialist, Evaluator guardrail, Router decision node).\n3. Wire transition paths using 'create_edge' with appropriate conditions ('pass', 'fail', 'next') and retry loops.\n4. Call 'auto_layout_graph' to arrange nodes cleanly.\n5. Call 'lint_graph' to assert that all schema rules and connection paths are valid.`
                  }
                }
              ]
            }
          };
        }

        if (params.name === 'audit_project_readiness') {
          const target = args.targetPlatform || 'claude-code';
          return {
            jsonrpc: '2.0',
            id,
            result: {
              description: `Audit project '${projectId}' readiness for target '${target}'`,
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `Please audit project '${projectId}' for deployment readiness:\n\n1. Call 'lint_graph' for project '${projectId}' to check YAML syntax, missing skills, duplicate keys, and orphan nodes.\n2. Call 'preview_export' with target='${target}' to inspect generated provider-native configurations.\n3. Report a summary of validation status, potential edge loop warnings, and export recommendations.`
                  }
                }
              ]
            }
          };
        }

        if (params.name === 'execute_and_refine_workflow') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              description: `Execute and refine DAG in project '${projectId}'`,
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `Please run and analyze the execution flow for project '${projectId}':\n\n1. Call 'run_workflow' to execute the multi-agent graph.\n2. Inspect stage outputs, token usage, and verdicts.\n3. If any stage failed or was rejected, review the agent instructions or refine transition routing using 'update_edge' or 'update_agent'.`
                  }
                }
              ]
            }
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Unknown prompt '${params.name}'` }
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method '${method}' not found` }
        };
    }
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: `Internal error: ${err.message}` }
    };
  }
}

// =============================================================================
// STDIO Main Loop
// =============================================================================

function startStdioServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const request = JSON.parse(trimmed);
      const response = await handleMcpMessage(request);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (e) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: `Parse error: ${e.message}` }
        }) + '\n'
      );
    }
  });

  process.stderr.write('[MCP Server] Agent Canvas Orchestrator STDIO Server active (25 tools)\n');
}

// If executed directly from CLI (e.g. `node src/mcpServer.js`), start STDIO
if (process.argv[1] && process.argv[1].endsWith('mcpServer.js')) {
  startStdioServer();
}
