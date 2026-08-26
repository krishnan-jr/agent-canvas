import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getAllProjects,
  getProjectById,
  getProjectBySlug,
  getNodesByProject,
  getOutgoingEdgesForNode,
  getNodeById,
  saveNode,
  deleteNode,
  getAllSkills,
  getSkillByName,
  getSkillFiles,
  syncAllSkillsToDisk,
  saveSkill,
  saveSkillFile
} from './db.js';
import { eventBus } from './eventBus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WORKSPACE_DIR = process.env.WORKSPACE_DIR || path.join(__dirname, '..', 'workspace');

if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

// Tracking recent server-initiated writes to suppress echo loops
const recentServerWrites = new Map();
const debounceTimers = new Map();
const DEBOUNCE_MS = 150;

export function markServerWrite(filePath) {
  if (!filePath) return;
  const norm = path.normalize(filePath);
  recentServerWrites.set(norm, Date.now() + 1500);
}

export function isRecentServerWrite(filePath) {
  if (!filePath) return false;
  const norm = path.normalize(filePath);
  const expiry = recentServerWrites.get(norm);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    recentServerWrites.delete(norm);
    return false;
  }
  return true;
}

// Get project folder path
export function getProjectDirPath(project) {
  const folderName = project.slug || project.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const projectDir = path.join(WORKSPACE_DIR, folderName);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  return projectDir;
}

// Format YAML frontmatter with routes
export function injectRoutesIntoContent(content = '', outgoingEdges = []) {
  if (!outgoingEdges || outgoingEdges.length === 0) {
    // If no outgoing edges, remove existing routes block from frontmatter if present
    return content.replace(/(\nroutes:\s*\n(?:\s+-\s+[^\n]+\n(?:\s+[^\n]+\n)*)*)/g, '');
  }

  // Build routes YAML block
  let routesYaml = '\nroutes:\n';
  for (const edge of outgoingEdges) {
    const targetNode = getNodeById(edge.target_id);
    const targetFilename = targetNode ? targetNode.filename : `${edge.target_id}.md`;
    const trigger = edge.condition || (edge.edge_type === 'feedback_loop' ? 'fail' : 'pass');
    
    routesYaml += `  - on: ${trigger}\n`;
    routesYaml += `    target: ${targetFilename}\n`;
    if (edge.label) {
      routesYaml += `    label: "${edge.label}"\n`;
    }
    if (trigger === 'fail' || trigger === 'reject' || edge.edge_type === 'feedback_loop') {
      routesYaml += `    max_retries: ${edge.max_retries || 5}\n`;
    }
  }

  // Check if content already has frontmatter
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    let fmBody = fmMatch[1];
    // Remove existing routes: section cleanly
    fmBody = fmBody.replace(/\nroutes:\s*\n(?:\s+-\s+[^\n]+\n(?:\s+[^\n]+\n)*)*/g, '').trimEnd();
    const updatedFm = `---\n${fmBody}\n${routesYaml.trimStart()}---`;
    return content.replace(/^---\r?\n[\s\S]*?\r?\n---/, updatedFm);
  } else {
    // Add new frontmatter header
    return `---${routesYaml}---\n\n${content}`;
  }
}

// Sync single node to its project folder on disk
export function syncNodeToDisk(node) {
  const project = getProjectById(node.project_id);
  if (!project) return;

  const projectDir = getProjectDirPath(project);
  const outgoing = getOutgoingEdgesForNode(node.id);
  const enrichedContent = injectRoutesIntoContent(node.content || '', outgoing);

  const filename = node.filename.endsWith('.md') ? node.filename : `${node.filename}.md`;
  const filePath = path.join(projectDir, filename);
  markServerWrite(filePath);
  fs.writeFileSync(filePath, enrichedContent, 'utf-8');

  // Also write/update workflow.js in project directory
  syncProjectWorkflowScript(project);
}

// Remove node file from project folder on disk
export function removeNodeFromDisk(node) {
  if (!node) return;
  const project = getProjectById(node.project_id);
  if (!project) return;

  const folderName = project.slug || project.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const filename = node.filename.endsWith('.md') ? node.filename : `${node.filename}.md`;
  const filePath = path.join(WORKSPACE_DIR, folderName, filename);
  markServerWrite(filePath);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  syncProjectWorkflowScript(project);
}

// Remove entire project folder when project is deleted
export function removeProjectDir(project) {
  if (!project) return;
  const folderName = project.slug || project.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const projectDir = path.join(WORKSPACE_DIR, folderName);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

// Generate standalone executable workflow.js runner
export function generateWorkflowScript(project, nodes, edges) {
  return `/**
 * Standalone Autonomous Agent Workflow Execution Engine
 * Project: ${project.name}
 * Generated: ${new Date().toISOString()}
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple YAML frontmatter parser
function parseAgentMarkdown(content) {
  const match = content.match(/^---\\r?\\n([\\s\\S]*?)\\r?\\n---/);
  if (!match) return { meta: {}, prompt: content };

  const yamlText = match[1];
  const prompt = content.replace(/^---\\r?\\n[\\s\\S]*?\\r?\\n---/, '').trim();
  const meta = {};
  
  // Basic line-based YAML reader
  yamlText.split('\\n').forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length > 0) {
      meta[key.trim()] = rest.join(':').trim();
    }
  });

  return { meta, prompt };
}

export class AgentWorkflowRunner {
  constructor() {
    this.projectDir = __dirname;
  }

  async run(initialContext = {}) {
    console.log('[START] Launching workflow for project: ${project.name}');
    
    // Topologically traverse agents based on routes
    let currentAgent = 'Welcome.md';
    let iterationContext = { ...initialContext, step: 1, history: [], retries: {} };

    while (currentAgent) {
      const filePath = path.join(this.projectDir, currentAgent);
      if (!fs.existsSync(filePath)) {
        console.log(\`[STOP] Agent file not found: \${currentAgent}\`);
        break;
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      const { meta, prompt } = parseAgentMarkdown(raw);

      console.log(\`\\n[STEP \${iterationContext.step}] Running Agent: \${currentAgent} (Role: \${meta.role || 'agent'})\`);
      
      // Simulate LLM execution / evaluation
      const result = await this.executeAgent(currentAgent, meta, prompt, iterationContext);
      iterationContext.history.push({ agent: currentAgent, result });

      // Determine next route (pass, fail/retry, or default)
      const nextAgent = this.resolveNextRoute(currentAgent, result, iterationContext);
      if (!nextAgent) {
        console.log(\`[COMPLETE] Workflow finished successfully at \${currentAgent}.\`);
        break;
      }

      currentAgent = nextAgent;
      iterationContext.step++;
    }

    return iterationContext;
  }

  async executeAgent(filename, meta, prompt, context) {
    // In production, integrate your LLM call (e.g. Gemini / Claude / OpenAI)
    const isReviewer = (meta.role || '').toLowerCase().includes('reviewer') || (meta.role || '').toLowerCase().includes('evaluator');
    
    if (isReviewer) {
      // If previous retry occurred, approve on 2nd iteration
      const retryCount = context.retries[filename] || 0;
      if (retryCount >= 1) {
        return { verdict: 'APPROVED', feedback: 'All requirements verified and validated.' };
      } else {
        context.retries[filename] = 1;
        return { verdict: 'REJECTED', feedback: 'Edge cases missing in implementation plan.' };
      }
    }

    return { verdict: 'SUCCESS', output: 'Task processed successfully.' };
  }

  resolveNextRoute(currentAgent, result, context) {
    // Dynamic routing resolution
    if (result.verdict === 'REJECTED') {
      console.log(\`  >> [FAIL/RETRY BRANCH] Rejection triggered: "\${result.feedback}"\`);
      return 'assistant-3.md'; // Loopback target
    } else {
      console.log(\`  >> [PASS/NEXT BRANCH] Transitioning to downstream agent...\`);
      return null; // Terminal step or next agent
    }
  }
}

// Execute standalone when run directly via node
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runner = new AgentWorkflowRunner();
  runner.run({ user_intent: 'Execute autonomous agent pipeline' });
}
`;
}

// Write workflow.js into the project's folder
export function syncProjectWorkflowScript(project) {
  if (!project) return;
  const projectDir = getProjectDirPath(project);
  const nodes = getNodesByProject(project.id);
  const outgoingEdges = [];
  nodes.forEach(n => {
    outgoingEdges.push(...getOutgoingEdgesForNode(n.id));
  });

  const script = generateWorkflowScript(project, nodes, outgoingEdges);
  fs.writeFileSync(path.join(projectDir, 'workflow.js'), script, 'utf-8');
}

// Sync all projects and their nodes to disk, and all global skills
export function syncAllToDisk() {
  const projects = getAllProjects();
  for (const project of projects) {
    const projectDir = getProjectDirPath(project);
    const nodes = getNodesByProject(project.id);
    for (const node of nodes) {
      const outgoing = getOutgoingEdgesForNode(node.id);
      const enrichedContent = injectRoutesIntoContent(node.content || '', outgoing);
      const filename = node.filename.endsWith('.md') ? node.filename : `${node.filename}.md`;
      const filePath = path.join(projectDir, filename);
      fs.writeFileSync(filePath, enrichedContent, 'utf-8');
    }
    syncProjectWorkflowScript(project);
  }

  // Also sync global skills catalog to workspace/skills/
  syncAllSkillsToDisk();
}

// Read files from ./workspace/ and sync back to SQLite
export function syncDiskToDatabase(projectId) {
  const project = getProjectById(projectId);
  if (!project) return { updated: 0, created: 0 };

  const projectDir = getProjectDirPath(project);
  if (!fs.existsSync(projectDir)) return { updated: 0, created: 0 };

  const existingNodes = getNodesByProject(projectId);
  const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.md'));

  let updated = 0;
  let created = 0;

  for (const file of files) {
    const filePath = path.join(projectDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const existing = existingNodes.find(n => n.filename === file);

    if (existing) {
      if (existing.content !== content) {
        saveNode({
          ...existing,
          content
        }, projectId);
        updated++;
      }
    } else {
      saveNode({
        filename: file,
        title: file.replace('.md', ''),
        content,
        x: 140 + (existingNodes.length + created) * 60,
        y: 120,
        width: 320,
        height: 380,
        color: '#202024'
      }, projectId);
      created++;
    }
  }

  return { updated, created };
}

// Handle external file changes detected by fs.watch
export function handleDiskFileChange(relPath) {
  if (!relPath) return;
  const normalized = relPath.replace(/\\/g, '/');
  const fullPath = path.join(WORKSPACE_DIR, normalized);

  if (isRecentServerWrite(fullPath)) return;

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return;

  const firstSegment = parts[0];
  const fileName = parts[parts.length - 1];

  // Ignore OS metadata and temporary editor swap files
  if (
    fileName.startsWith('.') ||
    fileName === 'Thumbs.db' ||
    fileName.startsWith('~') ||
    fileName.endsWith('.tmp') ||
    fileName.endsWith('.swp')
  ) {
    return;
  }

  // Case 1: Global Skills directory -> workspace/skills/<skill-name>/...
  if (firstSegment === 'skills' && parts.length >= 2) {
    const skillName = parts[1];
    const skillRelPath = parts.slice(2).join('/');

    if (fs.existsSync(fullPath)) {
      try {
        const isDir = fs.statSync(fullPath).isDirectory();
        if (!isDir && skillRelPath) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          let skill = getSkillByName(skillName);
          if (!skill) {
            skill = saveSkill({ name: skillName, description: 'Imported from workspace/skills' });
          }
          const existingFiles = getSkillFiles(skill.id);
          const existingFile = existingFiles.find(f => f.file_path.toLowerCase() === skillRelPath.toLowerCase());
          if (existingFile && existingFile.content === content) {
            return; // Content is already synchronized, suppress echo
          }
          markServerWrite(fullPath);
          saveSkillFile({
            skill_id: skill.id,
            file_path: skillRelPath,
            content
          });
          eventBus.broadcast('skills_updated', {
            skillName,
            filePath: skillRelPath,
            action: 'file_updated'
          });
        }
      } catch (e) {}
    }
    return;
  }

  // Case 2: Project workspace directory -> workspace/<project-slug>/<agent>.md
  if (firstSegment !== 'skills' && parts.length === 2 && fileName.endsWith('.md')) {
    const projectSlug = firstSegment;
    const agentFilename = fileName;

    // Ignore workflow.js runner script
    if (agentFilename === 'workflow.js') return;

    const project = getProjectBySlug(projectSlug);
    if (!project) return;

    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const nodes = getNodesByProject(project.id);
        const existing = nodes.find(n => n.filename.toLowerCase() === agentFilename.toLowerCase());

        if (existing) {
          if (existing.content !== content) {
            const updatedNode = {
              ...existing,
              content
            };
            saveNode(updatedNode, project.id);
            eventBus.broadcast('node_updated', {
              projectId: project.id,
              nodeId: existing.id,
              node: updatedNode
            });
          }
        } else {
          const newNode = saveNode({
            project_id: project.id,
            filename: agentFilename,
            title: agentFilename.replace(/\.md$/, ''),
            content,
            x: 120 + (nodes.length * 60) % 600,
            y: 120 + (Math.floor(nodes.length / 10) * 80),
            width: 320,
            height: 380,
            color: '#202024'
          }, project.id);

          eventBus.broadcast('graph_updated', {
            projectId: project.id,
            action: 'node_created',
            node: newNode
          });
        }
      } catch (e) {}
    } else {
      // File deleted on disk
      const nodes = getNodesByProject(project.id);
      const existing = nodes.find(n => n.filename.toLowerCase() === agentFilename.toLowerCase());
      if (existing) {
        deleteNode(existing.id);
        eventBus.broadcast('graph_updated', {
          projectId: project.id,
          action: 'node_deleted',
          nodeId: existing.id
        });
      }
    }
  }
}

// Start native recursive workspace watcher
let workspaceWatcher = null;

export function startWorkspaceWatcher() {
  if (workspaceWatcher) return workspaceWatcher;
  if (!fs.existsSync(WORKSPACE_DIR)) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  }

  try {
    workspaceWatcher = fs.watch(WORKSPACE_DIR, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      const key = filename.replace(/\\/g, '/');
      if (debounceTimers.has(key)) {
        clearTimeout(debounceTimers.get(key));
      }

      const timer = setTimeout(() => {
        debounceTimers.delete(key);
        try {
          handleDiskFileChange(key);
        } catch (err) {
          console.warn('[WARN] Error processing disk change for', key, err.message);
        }
      }, DEBOUNCE_MS);

      debounceTimers.set(key, timer);
    });

    if (workspaceWatcher && typeof workspaceWatcher.unref === 'function') {
      workspaceWatcher.unref();
    }

    workspaceWatcher.on('error', (err) => {
      console.warn('[WARN] Workspace watcher error:', err.message);
    });
  } catch (err) {
    console.warn('[WARN] Could not initialize recursive fs.watch on workspace directory:', err.message);
  }

  return workspaceWatcher;
}

export function stopWorkspaceWatcher() {
  if (workspaceWatcher) {
    try {
      workspaceWatcher.close();
    } catch (_) {}
    workspaceWatcher = null;
  }
}

// Initial disk synchronization and start watcher
syncAllToDisk();
startWorkspaceWatcher();

