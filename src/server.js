import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getNodesByProject,
  getNodeById,
  saveNode,
  deleteNode,
  getEdgesByProject,
  saveEdge,
  deleteEdge,
  getSkillsByProject,
  getSkillById,
  getSkillByName,
  saveSkill,
  deleteSkill,
  getSkillFiles,
  saveSkillFile,
  deleteSkillFile,
  syncAllSkillsToDisk,
  SKILL_TEMPLATES
} from './db.js';
import {
  syncNodeToDisk,
  removeNodeFromDisk,
  syncAllToDisk,
  WORKSPACE_DIR,
  generateWorkflowScript,
  syncDiskToDatabase
} from './fileSync.js';
import {
  transpileProject,
  exportToDisk,
  exportToZip,
  SUPPORTED_TARGETS
} from './exporters/index.js';
import { validateAgentSchema, validateGraphTopology } from './validator.js';
import { executeWorkflowStream, resumeApprovalSession } from './llmRunner.js';
import { handleMcpMessage } from './mcpServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    // ==========================================
    // PROJECTS API
    // ==========================================

    // GET /api/projects
    if (pathname === '/api/projects' && method === 'GET') {
      const projects = getAllProjects();
      return sendJson(res, 200, { success: true, projects });
    }

    // POST /api/projects
    if (pathname === '/api/projects' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.name) {
        return sendJson(res, 400, { success: false, error: 'Project name is required' });
      }
      const project = createProject(body);
      getProjectDirPath(project);
      return sendJson(res, 201, { success: true, project });
    }

    // GET /api/projects/:id
    const singleProjMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (singleProjMatch && method === 'GET') {
      const id = decodeURIComponent(singleProjMatch[1]);
      const project = getProjectById(id);
      if (!project) return sendJson(res, 404, { success: false, error: 'Project not found' });
      return sendJson(res, 200, { success: true, project });
    }

    // PUT /api/projects/:id
    if (singleProjMatch && method === 'PUT') {
      const id = decodeURIComponent(singleProjMatch[1]);
      const body = await parseJsonBody(req);
      const project = updateProject(id, body);
      if (!project) return sendJson(res, 404, { success: false, error: 'Project not found' });
      return sendJson(res, 200, { success: true, project });
    }

    // DELETE /api/projects/:id
    if (singleProjMatch && method === 'DELETE') {
      const id = decodeURIComponent(singleProjMatch[1]);
      const existing = getProjectById(id);
      if (existing) {
        removeProjectDir(existing);
      }
      deleteProject(id);
      return sendJson(res, 200, { success: true, id });
    }

    // ==========================================
    // PROJECT-SCOPED NODES & EDGES
    // ==========================================

    // GET /api/projects/:id/nodes
    const nodesMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/nodes$/);
    if (nodesMatch && method === 'GET') {
      const projectId = decodeURIComponent(nodesMatch[1]);
      const nodes = getNodesByProject(projectId);
      return sendJson(res, 200, { success: true, nodes });
    }

    // POST /api/projects/:id/nodes
    if (nodesMatch && method === 'POST') {
      const projectId = decodeURIComponent(nodesMatch[1]);
      const body = await parseJsonBody(req);
      body.project_id = projectId;
      if (!body.id) {
        body.id = `node-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      }
      const node = saveNode(body, projectId);
      syncNodeToDisk(node);
      return sendJson(res, 201, { success: true, node });
    }

    // GET /api/projects/:id/edges
    const edgesMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/edges$/);
    if (edgesMatch && method === 'GET') {
      const projectId = decodeURIComponent(edgesMatch[1]);
      const edges = getEdgesByProject(projectId);
      return sendJson(res, 200, { success: true, edges });
    }

    // POST /api/projects/:id/edges
    if (edgesMatch && method === 'POST') {
      const projectId = decodeURIComponent(edgesMatch[1]);
      const body = await parseJsonBody(req);
      body.project_id = projectId;
      if (!body.id) {
        body.id = `edge-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      }
      const edge = saveEdge(body, projectId);
      
      // Update source node markdown file frontmatter with routes
      const sourceNode = getNodeById(edge.source_id);
      if (sourceNode) {
        syncNodeToDisk(sourceNode);
      }

      return sendJson(res, 201, { success: true, edge });
    }

    // GET /api/projects/:id/files (Read project markdown and workflow script on disk)
    const filesMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/files$/);
    if (filesMatch && method === 'GET') {
      const projectId = decodeURIComponent(filesMatch[1]);
      const project = getProjectById(projectId);
      if (!project) return sendJson(res, 404, { success: false, error: 'Project not found' });

      const dir = getProjectDirPath(project);
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.md') || f === 'workflow.js')
        .map(f => {
          const filePath = path.join(dir, f);
          const content = fs.readFileSync(filePath, 'utf-8');
          const stat = fs.statSync(filePath);
          return {
            filename: f,
            size: stat.size,
            mtime: stat.mtimeMs,
            content
          };
        });
      return sendJson(res, 200, { success: true, files });
    }

    // ==========================================
    // GENERIC NODE & EDGE OPERATIONS
    // ==========================================

    // PUT /api/nodes/:id
    if (pathname.startsWith('/api/nodes/') && method === 'PUT') {
      const id = decodeURIComponent(pathname.replace('/api/nodes/', ''));
      const body = await parseJsonBody(req);
      body.id = id;
      const node = saveNode(body, body.project_id);
      syncNodeToDisk(node);
      return sendJson(res, 200, { success: true, node });
    }

    // DELETE /api/nodes/:id
    if (pathname.startsWith('/api/nodes/') && method === 'DELETE') {
      const id = decodeURIComponent(pathname.replace('/api/nodes/', ''));
      const existing = getNodeById(id);
      if (existing) {
        removeNodeFromDisk(existing);
      }
      deleteNode(id);
      return sendJson(res, 200, { success: true, id });
    }

    // DELETE /api/edges/:id
    if (pathname.startsWith('/api/edges/') && method === 'DELETE') {
      const id = decodeURIComponent(pathname.replace('/api/edges/', ''));
      const existing = getEdgesByProject('project-default').find(e => e.id === id);
      deleteEdge(id);
      if (existing) {
        const sourceNode = getNodeById(existing.source_id);
        if (sourceNode) syncNodeToDisk(sourceNode);
      }
      return sendJson(res, 200, { success: true, id });
    }

    // POST /api/projects/:id/sync/from-disk (Reads external disk edits into SQLite)
    const syncFromDiskMatch = pathname.match(/^\/api\/projects\/([^/]+)\/sync\/from-disk$/);
    if (syncFromDiskMatch && method === 'POST') {
      const projectId = decodeURIComponent(syncFromDiskMatch[1]);
      const result = syncDiskToDatabase(projectId);
      return sendJson(res, 200, { success: true, ...result });
    }

    // GET /api/projects/:id/skills
    const skillsListMatch = pathname.match(/^\/api\/projects\/([^/]+)\/skills$/);
    if (skillsListMatch && method === 'GET') {
      const projectId = decodeURIComponent(skillsListMatch[1]);
      const skills = getSkillsByProject(projectId);
      return sendJson(res, 200, { success: true, skills });
    }

    // POST /api/projects/:id/skills (Create skill)
    if (skillsListMatch && method === 'POST') {
      const projectId = decodeURIComponent(skillsListMatch[1]);
      const body = await parseJsonBody(req);
      const name = (body.name || 'new-skill').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const description = body.description || '';
      
      const skill = saveSkill({
        name,
        description
      }, projectId);

      // Create default SKILL.md if not exists
      const defaultSkillMd = body.skillMd || `---
name: ${name}
description: ${description || `Standardized instructions for ${name}`}
---

# ${name.toUpperCase()}

Detailed runbook and instructions for this skill.
`;
      saveSkillFile({
        skill_id: skill.id,
        file_path: 'SKILL.md',
        content: defaultSkillMd
      });

      const updated = getSkillById(skill.id);
      return sendJson(res, 201, { success: true, skill: updated });
    }

    // POST /api/projects/:id/skills/upload (Upload skill with multiple files)
    const skillsUploadMatch = pathname.match(/^\/api\/projects\/([^/]+)\/skills\/upload$/);
    if (skillsUploadMatch && method === 'POST') {
      const projectId = decodeURIComponent(skillsUploadMatch[1]);
      const body = await parseJsonBody(req);
      const name = (body.name || 'imported-skill').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const description = body.description || '';
      const files = Array.isArray(body.files) ? body.files : [];

      const skill = saveSkill({
        name,
        description
      }, projectId);

      let hasSkillMd = false;
      for (const f of files) {
        if (f.file_path && f.content !== undefined) {
          saveSkillFile({
            skill_id: skill.id,
            file_path: f.file_path,
            content: f.content
          });
          if (f.file_path.toLowerCase() === 'skill.md') hasSkillMd = true;
        }
      }

      if (!hasSkillMd) {
        saveSkillFile({
          skill_id: skill.id,
          file_path: 'SKILL.md',
          content: `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name.toUpperCase()}\n`
        });
      }

      const updated = getSkillById(skill.id);
      return sendJson(res, 201, { success: true, skill: updated });
    }

    // GET /api/skills/templates (List built-in starter templates)
    if (pathname === '/api/skills/templates' && method === 'GET') {
      return sendJson(res, 200, { success: true, templates: SKILL_TEMPLATES });
    }

    // POST /api/projects/:id/skills/from-template (Instantiate skill from template)
    const skillFromTemplateMatch = pathname.match(/^\/api\/projects\/([^/]+)\/skills\/from-template$/);
    if (skillFromTemplateMatch && method === 'POST') {
      const projectId = decodeURIComponent(skillFromTemplateMatch[1]);
      const body = await parseJsonBody(req);
      const templateName = (body.templateName || '').trim().toLowerCase();
      const template = SKILL_TEMPLATES.find(t => t.name.toLowerCase() === templateName);
      if (!template) {
        return sendJson(res, 404, { success: false, error: `Skill template "${templateName}" not found.` });
      }

      const skill = saveSkill({
        name: template.name,
        description: template.description
      }, projectId);

      for (const f of template.files) {
        saveSkillFile({
          skill_id: skill.id,
          file_path: f.file_path,
          content: f.content
        });
      }

      const updated = getSkillById(skill.id);
      return sendJson(res, 201, { success: true, skill: updated });
    }

    // PUT /api/skills/:id
    const skillDetailMatch = pathname.match(/^\/api\/skills\/([^/]+)$/);
    if (skillDetailMatch && method === 'PUT') {
      const id = decodeURIComponent(skillDetailMatch[1]);
      const body = await parseJsonBody(req);
      const existing = getSkillById(id);
      if (!existing) {
        return sendJson(res, 404, { success: false, error: 'Skill not found' });
      }
      const updated = saveSkill({
        ...existing,
        name: body.name ? body.name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') : existing.name,
        description: body.description !== undefined ? body.description : existing.description
      }, existing.project_id);
      return sendJson(res, 200, { success: true, skill: updated });
    }

    // DELETE /api/skills/:id
    if (skillDetailMatch && method === 'DELETE') {
      const id = decodeURIComponent(skillDetailMatch[1]);
      deleteSkill(id);
      return sendJson(res, 200, { success: true, id });
    }

    // GET /api/skills/:id/files
    const skillFilesMatch = pathname.match(/^\/api\/skills\/([^/]+)\/files$/);
    if (skillFilesMatch && method === 'GET') {
      const id = decodeURIComponent(skillFilesMatch[1]);
      const files = getSkillFiles(id);
      return sendJson(res, 200, { success: true, files });
    }

    // POST /api/skills/:id/files (Save / update file in skill)
    if (skillFilesMatch && method === 'POST') {
      const id = decodeURIComponent(skillFilesMatch[1]);
      const body = await parseJsonBody(req);
      const filePath = (body.file_path || 'file.txt').replace(/^\/+/, '');
      const content = body.content !== undefined ? body.content : '';

      const file = saveSkillFile({
        id: body.id,
        skill_id: id,
        file_path: filePath,
        content: content
      });
      return sendJson(res, 200, { success: true, file });
    }

    // DELETE /api/skills/:id/files/:fileId
    const skillFileDelMatch = pathname.match(/^\/api\/skills\/([^/]+)\/files\/([^/]+)$/);
    if (skillFileDelMatch && method === 'DELETE') {
      const fileId = decodeURIComponent(skillFileDelMatch[2]);
      deleteSkillFile(fileId);
      return sendJson(res, 200, { success: true, fileId });
    }

    // POST /api/workspace/sync
    if (pathname === '/api/workspace/sync' && method === 'POST') {
      syncAllToDisk();
      syncAllSkillsToDisk();
      return sendJson(res, 200, { success: true, message: 'All projects and skills synchronized with disk' });
    }

    // POST /api/projects/:id/export/preview
    const previewMatch = pathname.match(/^\/api\/projects\/([^/]+)\/export\/preview$/);
    if (previewMatch && method === 'POST') {
      const projectId = decodeURIComponent(previewMatch[1]);
      const body = await parseJsonBody(req);
      const target = body.target || 'claude-code';
      const project = getProjectById(projectId);
      const nodes = getNodesByProject(projectId);
      const edges = getEdgesByProject(projectId);
      const skills = getSkillsByProject(projectId);

      const files = transpileProject(target, project, nodes, edges, skills);
      return sendJson(res, 200, {
        success: true,
        target,
        files,
        supportedTargets: SUPPORTED_TARGETS
      });
    }

    // POST /api/projects/:id/export/disk
    const diskMatch = pathname.match(/^\/api\/projects\/([^/]+)\/export\/disk$/);
    if (diskMatch && method === 'POST') {
      const projectId = decodeURIComponent(diskMatch[1]);
      const body = await parseJsonBody(req);
      const target = body.target || 'claude-code';
      const project = getProjectById(projectId);
      const nodes = getNodesByProject(projectId);
      const edges = getEdgesByProject(projectId);
      const skills = getSkillsByProject(projectId);

      const result = exportToDisk(target, project, nodes, edges, WORKSPACE_DIR, skills);
      return sendJson(res, 200, result);
    }

    // GET /api/projects/:id/export/zip
    const zipMatch = pathname.match(/^\/api\/projects\/([^/]+)\/export\/zip$/);
    if (zipMatch && method === 'GET') {
      const projectId = decodeURIComponent(zipMatch[1]);
      const target = url.searchParams.get('target') || 'claude-code';
      const project = getProjectById(projectId);
      const nodes = getNodesByProject(projectId);
      const edges = getEdgesByProject(projectId);
      const skills = getSkillsByProject(projectId);

      const zipBuffer = exportToZip(target, project, nodes, edges, skills);
      const slug = project ? (project.slug || project.id) : 'project';
      const filename = `${slug}-${target}-export.zip`;

      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length
      });
      return res.end(zipBuffer);
    }

    // POST /api/validate (Validates markdown frontmatter schema)
    if (pathname === '/api/validate' && method === 'POST') {
      const body = await parseJsonBody(req);
      const content = body.content || '';
      const filename = body.filename || 'agent.md';
      const result = validateAgentSchema(content, filename);
      return sendJson(res, 200, { success: true, ...result });
    }

    // POST /api/validate/graph (Validate entire graph topology and routes)
    if (pathname === '/api/validate/graph' && method === 'POST') {
      const body = await parseJsonBody(req);
      const projectId = body.projectId || 'project-default';
      const nodes = getNodesByProject(projectId);
      const edges = getEdgesByProject(projectId);
      const skills = getSkillsByProject(projectId);
      const result = validateGraphTopology(nodes, edges, skills);
      return sendJson(res, 200, { success: true, ...result });
    }

    // GET or POST /api/orchestrate/run-stream (Real-time SSE Live LLM / Sandbox Runner)
    if (pathname === '/api/orchestrate/run-stream' && (method === 'GET' || method === 'POST')) {
      let projectId = 'project-default';
      if (method === 'GET') {
        const urlObj = new URL(req.url, `http://localhost:${PORT}`);
        projectId = urlObj.searchParams.get('projectId') || 'project-default';
      } else {
        const body = await parseJsonBody(req);
        projectId = body.projectId || 'project-default';
      }

      const nodes = getNodesByProject(projectId);
      const edges = getEdgesByProject(projectId);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      const sendEvent = (event, data) => {
        try {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (e) {}
      };

      try {
        await executeWorkflowStream(nodes, edges, projectId, sendEvent);
      } catch (err) {
        sendEvent('error', { message: err.message });
      } finally {
        res.end();
      }
      return;
    }

    // POST /api/orchestrate/approve (Human-in-the-Loop Gate Resumption)
    if (pathname === '/api/orchestrate/approve' && method === 'POST') {
      const body = await parseJsonBody(req);
      const { runId, action, modifiedPayload } = body;
      const resumed = resumeApprovalSession(runId, action, modifiedPayload);
      return sendJson(res, 200, { success: resumed });
    }

    // GET /api/mcp/sse (Model Context Protocol SSE Transport)
    if (pathname === '/api/mcp/sse' && method === 'GET') {
      const sessionId = `mcp-ses-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(`event: endpoint\ndata: /api/mcp/message?sessionId=${sessionId}\n\n`);
      return;
    }

    // POST /api/mcp/message or /api/mcp (Model Context Protocol JSON-RPC Handler)
    if ((pathname === '/api/mcp/message' || pathname === '/api/mcp') && method === 'POST') {
      const body = await parseJsonBody(req);
      const mcpResponse = await handleMcpMessage(body);
      if (!mcpResponse) {
        return sendJson(res, 204, {});
      }
      return sendJson(res, 200, mcpResponse);
    }

    // POST /api/orchestrate/simulate (Enhanced with Conditional Decision Loops & Retries)
    if (pathname === '/api/orchestrate/simulate' && method === 'POST') {
      const body = await parseJsonBody(req);
      const projectId = body.projectId || 'project-default';
      const nodes = getNodesByProject(projectId);
      const edges = getEdgesByProject(projectId);

      if (nodes.length === 0) {
        return sendJson(res, 200, { success: true, steps: [] });
      }

      // Build graph adjacency
      const outgoing = {};
      const incoming = {};
      nodes.forEach(n => {
        outgoing[n.id] = [];
        incoming[n.id] = [];
      });
      edges.forEach(e => {
        if (outgoing[e.source_id]) outgoing[e.source_id].push(e);
        if (incoming[e.target_id]) incoming[e.target_id].push(e);
      });

      // Find start node (orchestrator or node with no incoming edges)
      let startNode = nodes.find(n => (n.content.includes('role: orchestrator') || n.title.toLowerCase().includes('welcome') || n.title.toLowerCase().includes('orchestrator')) && incoming[n.id].length === 0);
      if (!startNode) {
        startNode = nodes.find(n => incoming[n.id].length === 0) || nodes[0];
      }

      const executionSteps = [];
      let currentNodeId = startNode.id;
      let stepIndex = 1;
      const retryCounts = {};
      const maxSteps = 20; // Guard against runaway loops

      while (currentNodeId && stepIndex <= maxSteps) {
        const node = nodes.find(n => n.id === currentNodeId);
        if (!node) break;

        const isReviewer = node.content.includes('role: reviewer') || node.content.includes('role: evaluator') || node.title.toLowerCase().includes('evaluator') || node.title.toLowerCase().includes('reviewer');
        
        // Find outgoing branches
        const outEdges = outgoing[currentNodeId] || [];
        const passEdge = outEdges.find(e => e.edge_type === 'pass');
        const failEdge = outEdges.find(e => e.edge_type === 'fail');
        const defaultEdges = outEdges.filter(e => e.edge_type === 'default' || !e.edge_type);

        let chosenEdge = null;
        let verdict = 'SUCCESS';
        let feedback = '';

        if (isReviewer && failEdge) {
          const retries = (retryCounts[node.id] || 0) + 1;
          retryCounts[node.id] = retries;
          const maxAllowed = failEdge.max_retries || 3;

          if (retries <= 1) {
            // First iteration: Rejection / Retry loop
            verdict = 'REJECTED';
            feedback = `Reviewer identified policy gaps on iteration ${retries}. Triggering feedback loop to revision agent.`;
            chosenEdge = failEdge;
          } else {
            // Subsequent iteration: Pass / Approved
            verdict = 'APPROVED';
            feedback = `All guardrails and tests passed on iteration ${retries}.`;
            chosenEdge = passEdge || defaultEdges[0];
          }
        } else if (passEdge) {
          verdict = 'APPROVED';
          chosenEdge = passEdge;
        } else if (defaultEdges.length > 0) {
          chosenEdge = defaultEdges[0];
        }

        executionSteps.push({
          step: stepIndex,
          nodeId: node.id,
          nodeTitle: node.title,
          filename: node.filename,
          status: verdict === 'REJECTED' ? 'retry_loop' : 'completed',
          verdict,
          feedback,
          activeEdgeId: chosenEdge ? chosenEdge.id : null,
          edgeType: chosenEdge ? (chosenEdge.edge_type || 'default') : 'none',
          tokens: Math.floor((node.content.length / 4) + Math.random() * 40),
          durationMs: Math.floor(180 + Math.random() * 250),
          output: verdict === 'REJECTED' 
            ? `[Step ${stepIndex}] ${node.title} -> ${verdict}: ${feedback}`
            : `[Step ${stepIndex}] ${node.title} executed instructions successfully.`
        });

        if (chosenEdge) {
          currentNodeId = chosenEdge.target_id;
        } else {
          // Terminal node reached
          break;
        }

        stepIndex++;
      }

      return sendJson(res, 200, { success: true, steps: executionSteps });
    }

    // ==========================================
    // STATIC FILE SERVING
    // ==========================================
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      const stream = fs.createReadStream(filePath);
      return stream.pipe(res);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  } catch (error) {
    console.error('Server error:', error);
    sendJson(res, 500, { success: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n[INFO] Agent Canvas Server running on Node.js ${process.version}`);
  console.log(`[INFO] URL: http://localhost:${PORT}`);
  console.log(`[INFO] Workspace directory: ${WORKSPACE_DIR}`);
});
