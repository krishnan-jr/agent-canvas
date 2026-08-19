/**
 * In-DOM Multi-Target Export Studio
 * Platform targets: Claude Code, OpenCode, Cursor, Antigravity, Codex, Universal Raw
 * Strictly vector SVG icons - No emojis in UI (per GEMINI.md standards)
 */

import { dialog } from './dialog.js';
import { escapeHtml } from './markdown.js';

export class ExportStudio {
  constructor(app) {
    this.app = app;
    this.currentTarget = 'claude-code';
    this.currentFiles = [];
    this.selectedFileIndex = 0;
    this.createElements();
  }

  createElements() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'custom-dialog-overlay hidden';
    this.overlay.id = 'export-studio-overlay';
    this.overlay.innerHTML = `
      <div class="export-studio-card">
        <!-- Header -->
        <div class="export-studio-header">
          <div class="export-title-group">
            <div class="export-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#38bdf8" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <div>
              <h3 class="export-title">Multi-Target Export Studio</h3>
              <p class="export-subtitle">Transpile universal markdown agents into platform-native configurations</p>
            </div>
          </div>
          <button id="es-btn-close" class="btn-icon" title="Close Export Studio">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Target Tabs -->
        <div class="export-tabs-bar" id="es-tabs-container">
          <button class="export-tab active" data-target="claude-code">
            <span class="tab-indicator"></span>
            Claude Code
          </button>
          <button class="export-tab" data-target="opencode">
            <span class="tab-indicator"></span>
            OpenCode
          </button>
          <button class="export-tab" data-target="cursor">
            <span class="tab-indicator"></span>
            Cursor (.mdc)
          </button>
          <button class="export-tab" data-target="antigravity">
            <span class="tab-indicator"></span>
            Antigravity (AGY)
          </button>
          <button class="export-tab" data-target="codex">
            <span class="tab-indicator"></span>
            Codex / OpenAI
          </button>
          <button class="export-tab" data-target="universal">
            <span class="tab-indicator"></span>
            Universal Raw
          </button>
        </div>

        <!-- Compact Summary & Breakdown Banner -->
        <div class="export-summary-banner">
          <div class="summary-desc-row">
            <svg class="summary-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#38bdf8" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span id="es-info-text">Transpiles agent definitions to CLAUDE.md project guidelines and .claude/commands/ subagents.</span>
          </div>
          <div class="summary-breakdown-row" id="es-breakdown-bar">
            <div class="breakdown-col">
              <span class="breakdown-tag native">Native</span>
              <div class="breakdown-chips" id="es-native-chips"></div>
            </div>
            <div class="breakdown-col">
              <span class="breakdown-tag transpiled">Transpiled</span>
              <div class="breakdown-chips" id="es-transpiled-chips"></div>
            </div>
            <div class="breakdown-col">
              <span class="breakdown-tag sanitized">Sanitized</span>
              <div class="breakdown-chips" id="es-sanitized-chips"></div>
            </div>
          </div>
        </div>

        <!-- Main Split View (File Tree + Code Preview) -->
        <div class="export-studio-body">
          <!-- Left: File Tree -->
          <div class="export-filetree-pane">
            <div class="pane-header">
              <span class="pane-title">Generated Files</span>
              <span id="es-file-count" class="badge-count">0 files</span>
            </div>
            <div class="export-file-list" id="es-file-list"></div>
          </div>

          <!-- Right: Code Viewer -->
          <div class="export-code-pane">
            <div class="pane-header">
              <div class="preview-header-left">
                <span id="es-current-filename" class="preview-filename">CLAUDE.md</span>
                <span id="es-file-meta" class="preview-file-meta">0 lines</span>
              </div>
              <div class="preview-header-actions">
                <button id="es-btn-copy" class="btn btn-secondary btn-sm" title="Copy file content to clipboard">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Copy Content
                </button>
              </div>
            </div>
            <pre class="export-code-preview"><code id="es-code-view">Select a target to preview</code></pre>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="export-studio-footer">
          <div class="export-footer-left">
            <span class="footer-meta">Target: <strong id="es-project-name">Active Project</strong></span>
          </div>
          <div class="export-footer-actions">
            <button id="es-btn-disk" class="btn btn-secondary">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              Export to Workspace Disk
            </button>
            <button id="es-btn-zip" class="btn btn-primary">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download ZIP Bundle
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.bindEvents();
  }

  bindEvents() {
    // Close button
    document.getElementById('es-btn-close').addEventListener('click', () => {
      this.close();
    });

    // Close on overlay click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Tab switching
    const tabs = this.overlay.querySelectorAll('.export-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTarget = tab.dataset.target;
        this.loadPreview();
      });
    });

    // Copy file content
    document.getElementById('es-btn-copy').addEventListener('click', () => {
      const activeFile = this.currentFiles[this.selectedFileIndex];
      if (activeFile && activeFile.content) {
        navigator.clipboard.writeText(activeFile.content);
        dialog.toast(`Copied ${activeFile.path} to clipboard`, 'info');
      }
    });

    // Export to Disk
    document.getElementById('es-btn-disk').addEventListener('click', () => {
      this.exportToDisk();
    });

    // Download ZIP
    document.getElementById('es-btn-zip').addEventListener('click', () => {
      this.downloadZip();
    });
  }

  open() {
    const activeProject = this.app.projectManager.getActiveProject();
    document.getElementById('es-project-name').textContent = activeProject ? activeProject.name : 'Active Project';
    this.overlay.classList.remove('hidden');
    this.loadPreview();
  }

  close() {
    this.overlay.classList.add('hidden');
  }

  async loadPreview() {
    const projectId = this.app.currentProjectId;
    const infoText = document.getElementById('es-info-text');

    const breakdowns = {
      'claude-code': {
        desc: 'Transpiles agent definitions to CLAUDE.md project guidelines and .claude/commands/ subagents.',
        native: ['name', 'description', 'allowed-tools', 'model'],
        transpiled: ['routes → Slash command delegation & CLAUDE.md routing table'],
        sanitized: ['temperature (CLI config)', 'globs (Documented in context table)']
      },
      'opencode': {
        desc: 'Generates AGENTS.md multi-agent coordination protocol and .opencode/ agents workflow.',
        native: ['name', 'role', 'model', 'tools', 'temperature'],
        transpiled: ['routes → Native Mermaid DAG in AGENTS.md'],
        sanitized: ['globs (Cursor-only)', 'alwaysApply']
      },
      'cursor': {
        desc: 'Generates .cursor/rules/*.mdc MDC rule files (with description & globs) and .cursorrules.',
        native: ['description', 'globs', 'alwaysApply: false'],
        transpiled: ['routes → Contextual MDC Rule Handoff instructions'],
        sanitized: ['model & tools (Managed by Cursor IDE controls)']
      },
      'antigravity': {
        desc: 'Generates GEMINI.md project design standards and .gemini/antigravity/skills/<agent>/SKILL.md bundles.',
        native: ['name', 'description', 'tools'],
        transpiled: ['routes → Skill Delegation in SKILL.md & GEMINI.md'],
        sanitized: ['globs (Mapped to hierarchical directory rules)', 'temperature']
      },
      'codex': {
        desc: 'Generates codex.json OpenAI Assistant schemas with functions and instructions/ markdown.',
        native: ['name', 'model', 'description', 'temperature', 'tools (OpenAI Function Schemas)'],
        transpiled: ['routes → Assistant Routing Schema in codex.json'],
        sanitized: ['globs', 'alwaysApply']
      },
      'universal': {
        desc: 'Raw universal markdown vault with YAML frontmatter routes and workflow.js execution engine.',
        native: ['role', 'model', 'description', 'tools', 'routes', 'globs', 'temperature'],
        transpiled: ['routes → Standalone Node.js workflow.js engine'],
        sanitized: ['None (All properties preserved)']
      }
    };

    const current = breakdowns[this.currentTarget] || breakdowns['claude-code'];
    infoText.textContent = current.desc;

    // Render Breakdown Chips
    const nativeContainer = document.getElementById('es-native-chips');
    const transpiledContainer = document.getElementById('es-transpiled-chips');
    const sanitizedContainer = document.getElementById('es-sanitized-chips');

    if (nativeContainer) {
      nativeContainer.innerHTML = current.native.map(n => `<span class="breakdown-chip native">${n}</span>`).join('');
    }
    if (transpiledContainer) {
      transpiledContainer.innerHTML = current.transpiled.map(t => `<span class="breakdown-chip transpiled">${t}</span>`).join('');
    }
    if (sanitizedContainer) {
      sanitizedContainer.innerHTML = current.sanitized.map(s => `<span class="breakdown-chip sanitized">${s}</span>`).join('');
    }

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/export/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: this.currentTarget })
      });
      const data = await res.json();

      if (data.success && data.files) {
        this.currentFiles = data.files;
        this.selectedFileIndex = 0;
        this.renderFileTree();
        this.renderCodePreview();
      }
    } catch (err) {
      console.error('Failed to load export preview:', err);
      dialog.toast(`Failed to load export preview: ${err.message}`, 'error');
    }
  }

  buildFileTree(files) {
    const root = { name: '', isDir: true, children: [] };

    files.forEach((file, index) => {
      const parts = file.path.split('/');
      let curr = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = (i === parts.length - 1);

        if (isFile) {
          curr.children.push({
            name: part,
            path: file.path,
            isDir: false,
            fileIndex: index,
            ext: part.includes('.') ? '.' + part.split('.').pop() : ''
          });
        } else {
          let dirNode = curr.children.find(c => c.isDir && c.name === part);
          if (!dirNode) {
            dirNode = {
              name: part,
              isDir: true,
              children: []
            };
            curr.children.push(dirNode);
          }
          curr = dirNode;
        }
      }
    });

    // Compact single-child directory chains (e.g. .gemini -> antigravity -> skills)
    const compactTree = (node) => {
      if (!node.isDir) return node;
      node.children = node.children.map(compactTree);

      while (node.name !== '' && node.children.length === 1 && node.children[0].isDir) {
        const onlyChild = node.children[0];
        node.name = `${node.name}/${onlyChild.name}`;
        node.children = onlyChild.children;
      }
      return node;
    };

    return compactTree(root);
  }

  renderFileTree() {
    const listElem = document.getElementById('es-file-list');
    const countElem = document.getElementById('es-file-count');
    listElem.innerHTML = '';
    countElem.textContent = `${this.currentFiles.length} files`;

    const tree = this.buildFileTree(this.currentFiles);
    this.renderTreeNode(tree, listElem, '', true, true);
  }

  renderTreeNode(node, container, prefix = '', isLast = true, isRoot = false) {
    if (!isRoot) {
      const branchChar = isLast ? '└── ' : '├── ';
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');

      if (node.isDir) {
        const dirElem = document.createElement('div');
        dirElem.className = 'tree-dir-node';
        dirElem.innerHTML = `
          <div class="tree-dir-header">
            <span class="tree-branch-guide">${prefix}${branchChar}</span>
            <svg class="tree-folder-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#38bdf8" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="tree-dir-title">${node.name}/</span>
          </div>
          <div class="tree-dir-children"></div>
        `;
        container.appendChild(dirElem);
        const childrenContainer = dirElem.querySelector('.tree-dir-children');

        node.children.forEach((child, idx) => {
          this.renderTreeNode(child, childrenContainer, nextPrefix, idx === node.children.length - 1, false);
        });
        return;
      } else {
        const isSelected = node.fileIndex === this.selectedFileIndex;
        const fileElem = document.createElement('div');
        fileElem.className = `tree-file-node ${isSelected ? 'active' : ''}`;
        fileElem.setAttribute('data-file-index', node.fileIndex);
        fileElem.setAttribute('title', node.path);
        fileElem.innerHTML = `
          <span class="tree-branch-guide">${prefix}${branchChar}</span>
          <svg class="tree-file-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <span class="tree-file-title">${node.name}</span>
          <span class="tree-ext-badge">${node.ext}</span>
        `;

        fileElem.addEventListener('click', () => {
          this.selectedFileIndex = node.fileIndex;
          this.overlay.querySelectorAll('.tree-file-node, .tree-root-file-node').forEach(el => el.classList.remove('active'));
          fileElem.classList.add('active');
          this.renderCodePreview();
        });

        container.appendChild(fileElem);
        return;
      }
    }

    // Root level files and directories
    node.children.forEach((child, idx) => {
      if (!child.isDir) {
        const isSelected = child.fileIndex === this.selectedFileIndex;
        const fileElem = document.createElement('div');
        fileElem.className = `tree-root-file-node ${isSelected ? 'active' : ''}`;
        fileElem.setAttribute('data-file-index', child.fileIndex);
        fileElem.setAttribute('title', child.path);
        fileElem.innerHTML = `
          <svg class="tree-file-icon root-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <span class="tree-file-title">${child.name}</span>
          <span class="tree-root-badge">Root</span>
        `;

        fileElem.addEventListener('click', () => {
          this.selectedFileIndex = child.fileIndex;
          this.overlay.querySelectorAll('.tree-file-node, .tree-root-file-node').forEach(el => el.classList.remove('active'));
          fileElem.classList.add('active');
          this.renderCodePreview();
        });

        container.appendChild(fileElem);
      } else {
        this.renderTreeNode(child, container, '', idx === node.children.length - 1, false);
      }
    });
  }

  renderCodePreview() {
    const codeElem = document.getElementById('es-code-view');
    const filenameElem = document.getElementById('es-current-filename');
    const metaElem = document.getElementById('es-file-meta');
    const activeFile = this.currentFiles[this.selectedFileIndex];

    if (!activeFile) {
      filenameElem.textContent = 'No files';
      if (metaElem) metaElem.textContent = '0 lines';
      codeElem.textContent = '// No preview available';
      return;
    }

    filenameElem.textContent = activeFile.path;
    const lines = (activeFile.content || '').split('\n');
    if (metaElem) metaElem.textContent = `${lines.length} line${lines.length === 1 ? '' : 's'}`;
    codeElem.textContent = activeFile.content || '';
  }

  async exportToDisk() {
    const activeProject = this.app.projectManager ? this.app.projectManager.getActiveProject() : null;
    const projSlug = activeProject ? (activeProject.slug || activeProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')) : 'project';
    const targetDirDefault = `./workspace/${projSlug}/export_${this.currentTarget.replace(/-/g, '_')}`;

    const promptRes = await dialog.browseDirectory({
      title: 'Export to Workspace Disk',
      message: `Browse or select destination folder on disk to write ${this.currentFiles.length} generated files:`,
      initialPath: targetDirDefault,
      confirmText: 'Export Files',
      projectBookmark: {
        name: `Project (${projSlug})`,
        path: `./workspace/${projSlug}`
      }
    });

    if (promptRes.action !== 'confirm' || !promptRes.path) {
      return;
    }

    const chosenPath = promptRes.path.trim();
    const projectId = this.app.currentProjectId;

    try {
      dialog.toast(`Writing ${this.currentFiles.length} files to disk...`, 'info');
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/export/disk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: this.currentTarget,
          customPath: chosenPath
        })
      });
      const data = await res.json();

      if (data.success) {
        dialog.toast(`Successfully exported ${data.filesCount} files to ${data.outDir}`, 'success');
      } else {
        dialog.toast(`Export failed: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('Export to disk failed:', err);
      dialog.toast(`Export failed: ${err.message}`, 'error');
    }
  }

  downloadZip() {
    const projectId = this.app.currentProjectId;
    const url = `/api/projects/${encodeURIComponent(projectId)}/export/zip?target=${encodeURIComponent(this.currentTarget)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectId}_export_${this.currentTarget}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    dialog.toast(`Initiated ZIP download for ${this.currentTarget}`, 'info');
  }
}
