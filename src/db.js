import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'canvas.db');
export const WORKSPACE_DIR = process.env.WORKSPACE_DIR || path.join(__dirname, '..', 'workspace');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys for performance and data integrity
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT 'project-default',
    filename TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    x REAL NOT NULL DEFAULT 100,
    y REAL NOT NULL DEFAULT 100,
    width REAL NOT NULL DEFAULT 320,
    height REAL NOT NULL DEFAULT 380,
    color TEXT DEFAULT '#202024',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT 'project-default',
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    source_handle TEXT DEFAULT 'bottom',
    target_handle TEXT DEFAULT 'top',
    edge_type TEXT DEFAULT 'default',
    condition TEXT DEFAULT '',
    max_retries INTEGER DEFAULT 3,
    label TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(source_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY(target_id) REFERENCES nodes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS execution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    node_id TEXT,
    status TEXT NOT NULL,
    message TEXT,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT 'project-default',
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS skill_files (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    content TEXT NOT NULL,
    is_binary INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE CASCADE
  );
`);

// Migration helper: check if columns exist in nodes/edges
try {
  const nodeCols = db.prepare(`PRAGMA table_info(nodes)`).all();
  if (!nodeCols.some(col => col.name === 'project_id')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN project_id TEXT NOT NULL DEFAULT 'project-default';`);
  }
} catch (e) {}

try {
  const edgeCols = db.prepare(`PRAGMA table_info(edges)`).all();
  if (!edgeCols.some(col => col.name === 'project_id')) {
    db.exec(`ALTER TABLE edges ADD COLUMN project_id TEXT NOT NULL DEFAULT 'project-default';`);
  }
  if (!edgeCols.some(col => col.name === 'edge_type')) {
    db.exec(`ALTER TABLE edges ADD COLUMN edge_type TEXT DEFAULT 'default';`);
  }
  if (!edgeCols.some(col => col.name === 'condition')) {
    db.exec(`ALTER TABLE edges ADD COLUMN condition TEXT DEFAULT '';`);
  }
  if (!edgeCols.some(col => col.name === 'max_retries')) {
    db.exec(`ALTER TABLE edges ADD COLUMN max_retries INTEGER DEFAULT 3;`);
  }
} catch (e) {}

// --- PROJECT HELPERS ---

export function getAllProjects() {
  const stmt = db.prepare(`
    SELECT 
      p.*,
      COUNT(DISTINCT n.id) AS node_count,
      COUNT(DISTINCT e.id) AS edge_count
    FROM projects p
    LEFT JOIN nodes n ON n.project_id = p.id
    LEFT JOIN edges e ON e.project_id = p.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `);
  return stmt.all();
}

export function getProjectById(id) {
  const stmt = db.prepare(`
    SELECT 
      p.*,
      COUNT(DISTINCT n.id) AS node_count,
      COUNT(DISTINCT e.id) AS edge_count
    FROM projects p
    LEFT JOIN nodes n ON n.project_id = p.id
    LEFT JOIN edges e ON e.project_id = p.id
    WHERE p.id = ?
    GROUP BY p.id
  `);
  return stmt.get(id);
}

export function getProjectBySlug(slug) {
  if (!slug) return null;
  const stmt = db.prepare(`SELECT * FROM projects WHERE slug = ? OR id = ?`);
  return stmt.get(slug, slug);
}

export function createProject({ id, name, description = '' }) {
  const now = Date.now();
  const projectId = id || `project-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

  const stmt = db.prepare(`
    INSERT INTO projects (id, name, slug, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(projectId, name, slug, description, now, now);
  return getProjectById(projectId);
}

export function updateProject(id, { name, description }) {
  const now = Date.now();
  const existing = getProjectById(id);
  if (!existing) return null;

  const newName = name || existing.name;
  const newSlug = newName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const newDesc = description !== undefined ? description : existing.description;

  const stmt = db.prepare(`
    UPDATE projects
    SET name = ?, slug = ?, description = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(newName, newSlug, newDesc, now, id);
  return getProjectById(id);
}

export function deleteProject(id) {
  const stmt = db.prepare(`DELETE FROM projects WHERE id = ?`);
  return stmt.run(id);
}

// --- NODE HELPERS ---

export function getNodesByProject(projectId) {
  const stmt = db.prepare(`SELECT * FROM nodes WHERE project_id = ? ORDER BY created_at ASC`);
  return stmt.all(projectId);
}

export function getNodeById(id) {
  const stmt = db.prepare(`SELECT * FROM nodes WHERE id = ?`);
  return stmt.get(id);
}

export function saveNode(node, projectId = 'project-default') {
  const now = Date.now();
  const targetProjectId = node.project_id || projectId;
  const id = node.id || `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const existing = node.id ? getNodeById(node.id) : null;

  if (existing) {
    const stmt = db.prepare(`
      UPDATE nodes 
      SET filename = ?, title = ?, content = ?, x = ?, y = ?, width = ?, height = ?, color = ?, project_id = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      node.filename || existing.filename,
      node.title || existing.title,
      node.content ?? existing.content,
      node.x ?? existing.x,
      node.y ?? existing.y,
      node.width ?? existing.width,
      node.height ?? existing.height,
      node.color ?? existing.color,
      targetProjectId,
      now,
      node.id
    );
    db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(now, targetProjectId);
    return getNodeById(node.id);
  } else {
    const stmt = db.prepare(`
      INSERT INTO nodes (id, project_id, filename, title, content, x, y, width, height, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      targetProjectId,
      node.filename || `${node.title || 'agent'}.md`,
      node.title || 'Agent Block',
      node.content || '# Agent\n\nAgent definition here.',
      node.x ?? 100,
      node.y ?? 100,
      node.width ?? 320,
      node.height ?? 380,
      node.color || '#202024',
      now,
      now
    );
    db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(now, targetProjectId);
    return getNodeById(id);
  }
}

export function deleteNode(id) {
  const existing = getNodeById(id);
  if (existing) {
    db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(Date.now(), existing.project_id);
  }
  const stmt = db.prepare(`DELETE FROM nodes WHERE id = ?`);
  return stmt.run(id);
}

// --- EDGE HELPERS ---

export function getEdgesByProject(projectId) {
  const stmt = db.prepare(`SELECT * FROM edges WHERE project_id = ? ORDER BY created_at ASC`);
  return stmt.all(projectId);
}

export function getEdgeById(id) {
  const stmt = db.prepare(`SELECT * FROM edges WHERE id = ?`);
  return stmt.get(id);
}

export function getOutgoingEdgesForNode(nodeId) {
  const stmt = db.prepare(`SELECT * FROM edges WHERE source_id = ?`);
  return stmt.all(nodeId);
}

export function saveEdge(edge, projectId = 'project-default') {
  const now = Date.now();
  const targetProjectId = edge.project_id || projectId;
  const id = edge.id || `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO edges (id, project_id, source_id, target_id, source_handle, target_handle, edge_type, condition, max_retries, label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    targetProjectId,
    edge.source_id,
    edge.target_id,
    edge.source_handle || 'bottom',
    edge.target_handle || 'top',
    edge.edge_type || 'default',
    edge.condition || '',
    edge.max_retries !== undefined ? edge.max_retries : 3,
    edge.label || '',
    now
  );
  db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(now, targetProjectId);
  const getStmt = db.prepare(`SELECT * FROM edges WHERE id = ?`);
  return getStmt.get(id);
}

export function deleteEdge(id) {
  const stmt = db.prepare(`DELETE FROM edges WHERE id = ?`);
  return stmt.run(id);
}

// --- SKILL HELPERS (GLOBAL SKILLS CATALOG) ---

export function getAllSkills() {
  const stmt = db.prepare(`SELECT * FROM skills ORDER BY created_at ASC`);
  const skills = stmt.all();
  return skills.map(s => {
    const files = getSkillFiles(s.id);
    return {
      ...s,
      files
    };
  });
}

export function getSkillsByProject(projectId = 'project-default') {
  return getAllSkills();
}

export function getSkillById(id) {
  const stmt = db.prepare(`SELECT * FROM skills WHERE id = ?`);
  const skill = stmt.get(id);
  if (!skill) return null;
  skill.files = getSkillFiles(skill.id);
  return skill;
}

export function getSkillByName(nameOrProjectId, maybeName) {
  const targetName = (maybeName !== undefined ? maybeName : nameOrProjectId || '').trim().toLowerCase();
  const stmt = db.prepare(`SELECT * FROM skills WHERE LOWER(name) = LOWER(?)`);
  const skill = stmt.get(targetName);
  if (!skill) return null;
  skill.files = getSkillFiles(skill.id);
  return skill;
}

export function saveSkill(skill, projectId = 'project-default') {
  const now = Date.now();
  let targetProjectId = skill.project_id || projectId || 'project-default';
  if (targetProjectId === 'global' || !db.prepare(`SELECT id FROM projects WHERE id = ?`).get(targetProjectId)) {
    targetProjectId = 'project-default';
  }
  const id = skill.id || `skill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const cleanName = (skill.name || 'skill').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');

  const existing = db.prepare(`SELECT * FROM skills WHERE id = ? OR LOWER(name) = LOWER(?)`).get(id, cleanName);

  if (existing) {
    db.prepare(`
      UPDATE skills 
      SET name = ?, description = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanName, skill.description !== undefined ? skill.description : existing.description, now, existing.id);
    const updatedSkill = getSkillById(existing.id);
    syncSkillToDisk(updatedSkill);
    return updatedSkill;
  } else {
    db.prepare(`
      INSERT INTO skills (id, project_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, targetProjectId, cleanName, skill.description || '', now, now);
    const newSkill = getSkillById(id);
    syncSkillToDisk(newSkill);
    return newSkill;
  }
}

export function deleteSkill(id) {
  const skill = getSkillById(id);
  if (!skill) return false;

  // Delete from disk
  deleteSkillFromDisk(skill);

  // Delete files and skill record
  db.prepare(`DELETE FROM skill_files WHERE skill_id = ?`).run(id);
  db.prepare(`DELETE FROM skills WHERE id = ?`).run(id);
  return true;
}

export function getSkillFiles(skillId) {
  const stmt = db.prepare(`SELECT * FROM skill_files WHERE skill_id = ? ORDER BY file_path ASC`);
  return stmt.all(skillId);
}

export function getSkillFileById(fileId) {
  const stmt = db.prepare(`SELECT * FROM skill_files WHERE id = ?`);
  return stmt.get(fileId);
}

export function saveSkillFile(file) {
  const now = Date.now();
  const id = file.id || `sfile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  
  const existing = db.prepare(`SELECT * FROM skill_files WHERE id = ?`).get(id);

  if (existing) {
    db.prepare(`
      UPDATE skill_files
      SET file_path = ?, content = ?, is_binary = ?, updated_at = ?
      WHERE id = ?
    `).run(file.file_path, file.content, file.is_binary ? 1 : 0, now, id);
  } else {
    // Check if file_path already exists for this skill
    const samePath = db.prepare(`SELECT id FROM skill_files WHERE skill_id = ? AND file_path = ?`).get(file.skill_id, file.file_path);
    if (samePath) {
      db.prepare(`
        UPDATE skill_files
        SET content = ?, is_binary = ?, updated_at = ?
        WHERE id = ?
      `).run(file.content, file.is_binary ? 1 : 0, now, samePath.id);
      const skill = getSkillById(file.skill_id);
      if (skill) syncSkillToDisk(skill);
      return getSkillFileById(samePath.id);
    }

    db.prepare(`
      INSERT INTO skill_files (id, skill_id, file_path, content, is_binary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, file.skill_id, file.file_path, file.content, file.is_binary ? 1 : 0, now, now);
  }

  const skill = getSkillById(file.skill_id);
  if (skill) {
    db.prepare(`UPDATE skills SET updated_at = ? WHERE id = ?`).run(now, skill.id);
    syncSkillToDisk(skill);
  }

  return getSkillFileById(id);
}

export function deleteSkillFile(fileId) {
  const file = getSkillFileById(fileId);
  if (!file) return false;

  const skill = getSkillById(file.skill_id);
  db.prepare(`DELETE FROM skill_files WHERE id = ?`).run(fileId);

  if (skill) {
    // Delete file from disk
    const diskPath = path.join(WORKSPACE_DIR, 'skills', skill.name, file.file_path);
    if (fs.existsSync(diskPath)) {
      try { fs.unlinkSync(diskPath); } catch (e) {}
    }
    syncSkillToDisk(skill);
  }
  return true;
}

export function syncSkillToDisk(skill) {
  if (!skill || !skill.name) return;

  const skillDir = path.join(WORKSPACE_DIR, 'skills', skill.name);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  const files = getSkillFiles(skill.id);
  for (const f of files) {
    const fullPath = path.join(skillDir, f.file_path);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (fs.existsSync(fullPath)) {
      try {
        const diskContent = fs.readFileSync(fullPath, 'utf8');
        if (diskContent === (f.content || '')) {
          continue;
        }
      } catch (e) {}
    }

    fs.writeFileSync(fullPath, f.content || '', 'utf8');
  }
}

export function deleteSkillFromDisk(skill) {
  if (!skill || !skill.name) return;

  const skillDir = path.join(WORKSPACE_DIR, 'skills', skill.name);
  if (fs.existsSync(skillDir)) {
    try {
      fs.rmSync(skillDir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`[WARN] Could not remove skill directory ${skillDir}:`, e.message);
    }
  }
}

export function syncAllSkillsToDisk() {
  const skills = getAllSkills();
  for (const s of skills) {
    syncSkillToDisk(s);
  }
}

export function seedInitialData() {
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM projects`);
  const { count } = countStmt.get();
  
  if (count === 0) {
    const defaultProject = {
      id: 'project-default',
      name: 'Agent Workflow Suite',
      description: 'Primary orchestration pipeline for autonomous agents and tools.'
    };
    createProject(defaultProject);

    const welcomeNode = {
      id: 'node-welcome',
      project_id: 'project-default',
      filename: 'Welcome.md',
      title: 'Welcome',
      content: `---
role: orchestrator
model: gemini-3.7-flash
tools: [file_reader, web_search]
status: ready
---

# Welcome

This is your new vault for **Agent Orchestration**.

- Make a note of something, [create a link](#), or connect agent blocks.
- Drag from any port to orchestrate workflows.
- Edit markdown in-place or simulate execution!

When you are ready, delete this note and make the workflow your own.`,
      x: 650,
      y: 120,
      width: 320,
      height: 380,
      color: '#202024'
    };

    const hiNode = {
      id: 'node-hi',
      project_id: 'project-default',
      filename: 'hi.md',
      title: 'hi',
      content: `---
role: assistant
model: claude-3-5-sonnet
status: active
---

# hi

uhni

\`\`\`json
{
  "task": "orchestrate",
  "status": "ready",
  "temperature": 0.2
}
\`\`\`
`,
      x: 140,
      y: 620,
      width: 320,
      height: 380,
      color: '#202024'
    };

    saveNode(welcomeNode, 'project-default');
    saveNode(hiNode, 'project-default');

    const edge = {
      id: 'edge-1',
      project_id: 'project-default',
      source_id: 'node-hi',
      target_id: 'node-welcome',
      source_handle: 'top',
      target_handle: 'bottom',
      edge_type: 'pass',
      label: 'Trigger Flow'
    };

    saveEdge(edge, 'project-default');
    console.log('[INFO] Seeded default project with Obsidian-style canvas nodes.');
  }

  // Seed default skills if none exist
  const skillCountStmt = db.prepare(`SELECT COUNT(*) as count FROM skills`);
  const skillCount = skillCountStmt.get().count;
  if (skillCount === 0) {
    const gitSkill = {
      id: 'skill-git-workflow',
      name: 'git-workflow',
      description: 'Standardized conventional commit formats, branching strategy, and pull request runbooks.'
    };
    saveSkill(gitSkill, 'project-default');

    saveSkillFile({
      skill_id: gitSkill.id,
      file_path: 'SKILL.md',
      content: `---
name: git-workflow
description: Standardized conventional commit formats, branching strategy, and pull request runbooks.
---

# Git Workflow & Commit Guidelines

Enforces team git practices across commits, branch naming, and atomic PRs.

## Commit Conventions
- \`feat: <subject>\` for user-facing features
- \`fix: <subject>\` for bug fixes
- \`refactor: <subject>\` for code structure changes without logic change
- \`test: <subject>\` for test coverage updates

## PR Verification
Run the verification script before opening a pull request.
`
    });

    saveSkillFile({
      skill_id: gitSkill.id,
      file_path: 'scripts/verify_branch.sh',
      content: `#!/usr/bin/env bash
# Verifies branch naming and uncommitted changes
set -euo pipefail

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
echo "Current branch: $CURRENT_BRANCH"
`
    });

    saveSkillFile({
      skill_id: gitSkill.id,
      file_path: 'references/conventions.md',
      content: `# Conventional Commits Reference

| Type | Purpose | Example |
| :--- | :--- | :--- |
| \`feat\` | New feature | \`feat: add skills drawer\` |
| \`fix\` | Bug fix | \`fix: canvas hit testing\` |
| \`docs\` | Documentation | \`docs: update GEMINI.md\` |
`
    });
    console.log('[INFO] Seeded default git-workflow skill.');
  }

  // Deduplicate existing duplicate skills by name if any (keep richest / most recent)
  try {
    const allSkills = db.prepare(`SELECT * FROM skills ORDER BY updated_at DESC, created_at DESC`).all();
    const seenSkillNames = new Map();
    for (const s of allSkills) {
      const key = s.name.toLowerCase();
      if (seenSkillNames.has(key)) {
        const canonicalId = seenSkillNames.get(key);
        // Reassign files from duplicate skill to canonical skill if not already present
        const dupFiles = db.prepare(`SELECT * FROM skill_files WHERE skill_id = ?`).all(s.id);
        for (const df of dupFiles) {
          const hasCanonicalFile = db.prepare(`SELECT id FROM skill_files WHERE skill_id = ? AND LOWER(file_path) = LOWER(?)`).get(canonicalId, df.file_path);
          if (!hasCanonicalFile) {
            db.prepare(`UPDATE skill_files SET skill_id = ? WHERE id = ?`).run(canonicalId, df.id);
          } else {
            db.prepare(`DELETE FROM skill_files WHERE id = ?`).run(df.id);
          }
        }
        db.prepare(`DELETE FROM skills WHERE id = ?`).run(s.id);
      } else {
        seenSkillNames.set(key, s.id);
      }
    }
  } catch (err) {
    console.warn('[WARN] Skill deduplication check:', err.message);
  }
}

export const SKILL_TEMPLATES = [
  {
    name: 'git-workflow',
    description: 'Standardized conventional commit formats, branching strategy, and pull request runbooks.',
    files: [
      {
        file_path: 'SKILL.md',
        content: `---\nname: git-workflow\ndescription: Standardized conventional commit formats, branching strategy, and pull request runbooks.\n---\n\n# Git Workflow & Commit Guidelines\n\nEnforces team git practices across commits, branch naming, and atomic PRs.\n\n## Commit Conventions\n- \`feat: <subject>\` for user-facing features\n- \`fix: <subject>\` for bug fixes\n- \`refactor: <subject>\` for code structure changes without logic change\n- \`test: <subject>\` for test coverage updates\n`
      },
      {
        file_path: 'scripts/verify_branch.sh',
        content: `#!/usr/bin/env bash\n# Verifies branch naming and uncommitted changes\nset -euo pipefail\n\nCURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")\necho "Current branch: $CURRENT_BRANCH"\n`
      },
      {
        file_path: 'references/conventions.md',
        content: `# Conventional Commits Reference\n\n| Type | Purpose | Example |\n| :--- | :--- | :--- |\n| \`feat\` | New feature | \`feat: add skills drawer\` |\n| \`fix\` | Bug fix | \`fix: canvas hit testing\` |\n| \`docs\` | Documentation | \`docs: update GEMINI.md\` |\n`
      }
    ]
  },
  {
    name: 'test-runner',
    description: 'Automated test suite execution, coverage verification, and failure triage runbooks.',
    files: [
      {
        file_path: 'SKILL.md',
        content: `---\nname: test-runner\ndescription: Automated test suite execution, coverage verification, and failure triage runbooks.\n---\n\n# Test Runner & Quality Gate\n\nExecutes unit and integration test suites before committing or deploying.\n\n## Verification Steps\n1. Run \`scripts/run_tests.sh\`\n2. Inspect failing test traces\n3. Verify test coverage standards\n`
      },
      {
        file_path: 'scripts/run_tests.sh',
        content: `#!/usr/bin/env bash\n# Run test suite and check exit codes\nset -euo pipefail\necho "[INFO] Executing test suite..."\nnode --test || npm test\n`
      },
      {
        file_path: 'references/test_matrix.md',
        content: `# Test Matrix & Mocking Rules\n\n- Unit tests: mock external network calls\n- Integration tests: use in-memory SQLite instances\n- Assert 100% path coverage on critical decision routes\n`
      }
    ]
  },
  {
    name: 'security-audit',
    description: 'Automated static analysis, dependency vulnerability scanning, and secret leak prevention.',
    files: [
      {
        file_path: 'SKILL.md',
        content: `---\nname: security-audit\ndescription: Automated static analysis, dependency vulnerability scanning, and secret leak prevention.\n---\n\n# Security Audit & Policy Gate\n\nScans codebase for hardcoded secrets, dangerous regexes, and vulnerable dependencies.\n\n## Policy Checks\n- Never commit .env or API keys\n- Sanitize SQL inputs\n- Enforce CORS / CSRF protections\n`
      },
      {
        file_path: 'scripts/scan_secrets.sh',
        content: `#!/usr/bin/env bash\n# Scan for hardcoded API keys and tokens\nset -euo pipefail\necho "[SECURITY] Scanning workspace for credential patterns..."\n`
      },
      {
        file_path: 'references/owasp_rules.md',
        content: `# OWASP Top 10 Security Checklist\n\n1. Injection Prevention\n2. Broken Authentication\n3. Sensitive Data Exposure\n4. XML External Entities (XXE)\n5. Broken Access Control\n`
      }
    ]
  },
  {
    name: 'web-research',
    description: 'Structured search query formulation, document extraction, and citation verification.',
    files: [
      {
        file_path: 'SKILL.md',
        content: `---\nname: web-research\ndescription: Structured search query formulation, document extraction, and citation verification.\n---\n\n# Web Research & Citation Guide\n\nFormulates multi-angle search queries and verifies citation consistency across sources.\n`
      },
      {
        file_path: 'scripts/fetch_doc.py',
        content: `#!/usr/bin/env python3\n# Clean markdown extractor from HTML source\nimport sys\nprint("Document extraction helper ready.")\n`
      },
      {
        file_path: 'references/citations_guide.md',
        content: `# Citation & Fact-Checking Guide\n\n- Primary sources prioritized\n- Record original timestamp and author\n- Cross-verify factual claims across at least two references\n`
      }
    ]
  },
  {
    name: 'sqlite-migrations',
    description: 'WAL-mode database schema migrations, index optimization, and rollback runbooks.',
    files: [
      {
        file_path: 'SKILL.md',
        content: `---\nname: sqlite-migrations\ndescription: WAL-mode database schema migrations, index optimization, and rollback runbooks.\n---\n\n# SQLite Migrations & Schema Ops\n\nManages atomic schema migrations using native Node 26 node:sqlite DatabaseSync.\n`
      },
      {
        file_path: 'scripts/migrate.js',
        content: `import { DatabaseSync } from 'node:sqlite';\nconsole.log("[DB] Executing migration step...");\n`
      },
      {
        file_path: 'references/schema_rules.md',
        content: `# SQLite Performance & Schema Rules\n\n- Always enable PRAGMA journal_mode = WAL;\n- Enforce PRAGMA foreign_keys = ON;\n- Add composite indices on high-cardinality lookup columns\n`
      }
    ]
  }
];

// Initialize DB schema & seed on module load
seedInitialData();
