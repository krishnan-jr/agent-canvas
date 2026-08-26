/**
 * Canvas Project Bundle Exporter & Importer
 * Handles portable serialization and deserialization of complete Agent Canvas projects (.agentcanvas / JSON)
 * including all agent blocks, bezier connections, coordinates, and modular skills catalog.
 */

import {
  db,
  getProjectById,
  getAllProjects,
  createProject,
  updateProject,
  getNodesByProject,
  saveNode,
  deleteNode,
  getEdgesByProject,
  saveEdge,
  deleteEdge,
  getSkillsByProject,
  saveSkill,
  saveSkillFile,
  deleteSkill
} from './db.js';

import {
  syncAllToDisk,
  getProjectDirPath
} from './fileSync.js';

/**
 * Serializes an entire project workspace into a portable Canvas bundle
 */
export function exportProjectBundle(projectId = 'project-default') {
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error(`Project with ID "${projectId}" not found.`);
  }

  const nodes = getNodesByProject(projectId);
  const edges = getEdgesByProject(projectId);
  const skills = getSkillsByProject(projectId);

  return {
    $schema: 'https://agentcanvas.dev/schema/v1/project.json',
    format: 'agentcanvas-bundle',
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    generator: 'Agent Canvas v1.0.0',
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description || ''
    },
    nodes: nodes.map(n => ({
      id: n.id,
      filename: n.filename,
      title: n.title,
      content: n.content || '',
      x: n.x ?? 100,
      y: n.y ?? 100,
      width: n.width ?? 320,
      height: n.height ?? 380,
      color: n.color || '#202024'
    })),
    edges: edges.map(e => ({
      id: e.id,
      source_id: e.source_id,
      target_id: e.target_id,
      source_handle: e.source_handle || 'bottom',
      target_handle: e.target_handle || 'top',
      edge_type: e.edge_type || 'default',
      condition: e.condition || '',
      max_retries: e.max_retries ?? 3,
      label: e.label || ''
    })),
    skills: skills.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description || '',
      files: (s.files || []).map(f => ({
        file_path: f.file_path,
        content: f.content || '',
        is_binary: f.is_binary || 0
      }))
    }))
  };
}

/**
 * Imports a portable Canvas bundle (.agentcanvas / JSON) and initializes a full workspace
 */
export function importProjectBundle(bundleData, options = {}) {
  if (!bundleData || typeof bundleData !== 'object') {
    throw new Error('Invalid project bundle: Payload must be a valid JSON object.');
  }

  const rawProject = bundleData.project || {};
  const rawNodes = Array.isArray(bundleData.nodes) ? bundleData.nodes : [];
  const rawEdges = Array.isArray(bundleData.edges) ? bundleData.edges : [];
  const rawSkills = Array.isArray(bundleData.skills) ? bundleData.skills : [];

  if (rawNodes.length === 0 && !rawProject.name) {
    throw new Error('Invalid project bundle: Missing project metadata or agent nodes.');
  }

  const mode = options.mode === 'overwrite' ? 'overwrite' : 'new';
  let targetProjectId;
  let targetProject;

  if (mode === 'overwrite' && options.targetProjectId) {
    targetProjectId = options.targetProjectId;
    targetProject = getProjectById(targetProjectId);
    if (!targetProject) {
      throw new Error(`Target project "${targetProjectId}" to overwrite does not exist.`);
    }

    // Clean existing nodes and edges for this project
    const existingNodes = getNodesByProject(targetProjectId);
    existingNodes.forEach(n => deleteNode(n.id));

    const existingEdges = getEdgesByProject(targetProjectId);
    existingEdges.forEach(e => deleteEdge(e.id));

    // Update title/description if provided
    if (options.name || rawProject.name) {
      updateProject(targetProjectId, {
        name: options.name || rawProject.name || targetProject.name,
        description: options.description !== undefined ? options.description : rawProject.description
      });
      targetProject = getProjectById(targetProjectId);
    }
  } else {
    // Mode: new workspace
    targetProjectId = `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const baseName = options.name || rawProject.name || 'Imported Agent Pipeline';
    const baseDesc = options.description !== undefined ? options.description : (rawProject.description || 'Imported from Agent Canvas package.');

    targetProject = createProject({
      id: targetProjectId,
      name: baseName,
      description: baseDesc
    });
  }

  // Node ID mapping: Old ID in bundle -> New ID in SQLite
  const nodeIdMap = new Map();
  const importedNodes = [];

  for (const rawNode of rawNodes) {
    const newNodeId = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    nodeIdMap.set(rawNode.id, newNodeId);

    const nodeData = {
      id: newNodeId,
      project_id: targetProjectId,
      filename: rawNode.filename || `${rawNode.title || 'agent'}.md`,
      title: rawNode.title || 'Agent',
      content: rawNode.content || '# Agent\n\nAgent definition.',
      x: typeof rawNode.x === 'number' ? rawNode.x : 100,
      y: typeof rawNode.y === 'number' ? rawNode.y : 100,
      width: rawNode.width || 320,
      height: rawNode.height || 380,
      color: rawNode.color || '#202024'
    };

    const saved = saveNode(nodeData, targetProjectId);
    importedNodes.push(saved);
  }

  // Import Edges
  const importedEdges = [];
  for (const rawEdge of rawEdges) {
    const newSourceId = nodeIdMap.get(rawEdge.source_id) || rawEdge.source_id;
    const newTargetId = nodeIdMap.get(rawEdge.target_id) || rawEdge.target_id;

    // Verify both endpoints exist in imported project
    if (!nodeIdMap.has(rawEdge.source_id) && !importedNodes.some(n => n.id === newSourceId)) continue;
    if (!nodeIdMap.has(rawEdge.target_id) && !importedNodes.some(n => n.id === newTargetId)) continue;

    const newEdgeId = `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const edgeData = {
      id: newEdgeId,
      project_id: targetProjectId,
      source_id: newSourceId,
      target_id: newTargetId,
      source_handle: rawEdge.source_handle || 'bottom',
      target_handle: rawEdge.target_handle || 'top',
      edge_type: rawEdge.edge_type || 'default',
      condition: rawEdge.condition || '',
      max_retries: rawEdge.max_retries ?? 3,
      label: rawEdge.label || ''
    };

    const saved = saveEdge(edgeData, targetProjectId);
    importedEdges.push(saved);
  }

  // Import Skills
  const importedSkills = [];
  for (const rawSkill of rawSkills) {
    const newSkillId = `skill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const skillData = {
      id: newSkillId,
      project_id: targetProjectId,
      name: rawSkill.name || 'custom-skill',
      description: rawSkill.description || ''
    };

    const savedSkill = saveSkill(skillData, targetProjectId);

    if (Array.isArray(rawSkill.files)) {
      for (const file of rawSkill.files) {
        saveSkillFile({
          id: `sfile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          skill_id: newSkillId,
          file_path: file.file_path || 'SKILL.md',
          content: file.content || '# Skill\n\nInstructions',
          is_binary: file.is_binary ? 1 : 0
        });
      }
    }
    importedSkills.push(savedSkill);
  }

  // Resync full workspace disk mirror
  syncAllToDisk(targetProjectId);

  const updatedProject = getProjectById(targetProjectId);

  return {
    success: true,
    project: updatedProject,
    nodeCount: importedNodes.length,
    edgeCount: importedEdges.length,
    skillCount: importedSkills.length
  };
}
