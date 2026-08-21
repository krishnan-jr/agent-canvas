/**
 * In-DOM Project Import Modal
 * Allows uploading, previewing, and importing .agentcanvas / JSON project bundles.
 * Strictly vector SVG icons - No emojis in UI (per GEMINI.md standards)
 */

import { dialog } from './dialog.js';
import { escapeHtml } from './markdown.js';

export class ImportProjectModal {
  constructor(app) {
    this.app = app;
    this.parsedBundle = null;
    this.createElements();
    this.initEventListeners();
  }

  createElements() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'custom-dialog-overlay hidden';
    this.overlay.id = 'import-project-modal-overlay';
    this.overlay.innerHTML = `
      <div class="import-modal-card">
        <!-- Header -->
        <div class="import-modal-header">
          <div class="import-title-group">
            <div class="import-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" style="stroke: var(--sky-core)" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <h3 class="import-modal-title">Import Canvas Project</h3>
              <p class="import-modal-subtitle">Load a shared .agentcanvas or .json package into your workspace</p>
            </div>
          </div>
          <button id="import-btn-close" class="btn-icon" title="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="import-modal-body">
          <!-- Step 1: Drag & Drop / File Input -->
          <div id="import-dropzone" class="import-dropzone">
            <input type="file" id="import-file-input" class="hidden" accept=".agentcanvas,.json,application/json" />
            <div class="dropzone-inner">
              <svg class="dropzone-icon" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M12 12v9M8 17l4-4 4 4"/>
              </svg>
              <div class="dropzone-text">
                <span class="dropzone-primary">Click to browse or drop project bundle here</span>
                <span class="dropzone-secondary">Supports .agentcanvas, .canvas.json, and standard JSON export bundles</span>
              </div>
            </div>
          </div>

          <!-- Step 2: Package Preview & Inspection (hidden until file parsed) -->
          <div id="import-preview-pane" class="import-preview-pane hidden">
            <div class="preview-summary-card">
              <div class="preview-header-row">
                <div class="preview-name-wrap">
                  <span class="preview-badge">BUNDLE</span>
                  <h4 id="preview-project-name" class="preview-name">Project Name</h4>
                </div>
                <button id="import-btn-change-file" class="btn-xs btn-secondary" title="Select different file">Change File</button>
              </div>
              <p id="preview-project-desc" class="preview-desc">Project description...</p>
              
              <div class="preview-stats-row">
                <div class="preview-stat-item">
                  <span class="stat-num" id="preview-node-count">0</span>
                  <span class="stat-lbl">Agent Blocks</span>
                </div>
                <div class="preview-stat-item">
                  <span class="stat-num" id="preview-edge-count">0</span>
                  <span class="stat-lbl">Connections</span>
                </div>
                <div class="preview-stat-item">
                  <span class="stat-num" id="preview-skill-count">0</span>
                  <span class="stat-lbl">Skills Catalog</span>
                </div>
              </div>
            </div>

            <!-- Agents List Breakdown -->
            <div class="preview-agents-section">
              <div class="preview-section-title">Included Agent Squad:</div>
              <div id="preview-agents-list" class="preview-agents-grid"></div>
            </div>

            <!-- Import Settings -->
            <div class="import-settings-group">
              <div class="form-group">
                <label for="import-custom-name">Project Workspace Name</label>
                <input type="text" id="import-custom-name" class="form-input" placeholder="Project name" />
              </div>

              <div class="form-group">
                <label>Import Destination</label>
                <div class="import-radio-group">
                  <label class="radio-label">
                    <input type="radio" name="import-mode" value="new" checked />
                    <span>Create New Workspace</span>
                  </label>
                  <label class="radio-label">
                    <input type="radio" name="import-mode" value="overwrite" />
                    <span id="import-overwrite-label">Overwrite Current Project</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="import-modal-footer">
          <button id="import-btn-cancel" class="btn btn-secondary">Cancel</button>
          <button id="import-btn-submit" class="btn btn-primary" disabled>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import & Open Canvas
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    // Elements cache
    this.dropzone = document.getElementById('import-dropzone');
    this.fileInput = document.getElementById('import-file-input');
    this.previewPane = document.getElementById('import-preview-pane');
    this.btnSubmit = document.getElementById('import-btn-submit');
    this.inputCustomName = document.getElementById('import-custom-name');
    this.overwriteLabel = document.getElementById('import-overwrite-label');
  }

  initEventListeners() {
    // Close modal
    document.getElementById('import-btn-close').addEventListener('click', () => this.close());
    document.getElementById('import-btn-cancel').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Dropzone triggers
    this.dropzone.addEventListener('click', () => this.fileInput.click());

    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.handleFile(file);
    });

    // Drag & drop handlers
    this.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzone.classList.add('drag-active');
    });

    this.dropzone.addEventListener('dragleave', () => {
      this.dropzone.classList.remove('drag-active');
    });

    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzone.classList.remove('drag-active');
      const file = e.dataTransfer.files[0];
      if (file) this.handleFile(file);
    });

    // Change file button
    document.getElementById('import-btn-change-file').addEventListener('click', () => {
      this.resetFile();
      this.fileInput.click();
    });

    // Submit import
    this.btnSubmit.addEventListener('click', () => this.submitImport());
  }

  handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const json = JSON.parse(text);
        this.inspectBundle(json, file.name);
      } catch (err) {
        dialog.toast(`Invalid JSON file: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  }

  inspectBundle(bundle, filename) {
    const rawProject = bundle.project || {};
    const nodes = Array.isArray(bundle.nodes) ? bundle.nodes : [];
    const edges = Array.isArray(bundle.edges) ? bundle.edges : [];
    const skills = Array.isArray(bundle.skills) ? bundle.skills : [];

    if (nodes.length === 0 && !rawProject.name) {
      dialog.toast('Selected file does not contain valid Agent Canvas nodes or project metadata.', 'error');
      return;
    }

    this.parsedBundle = bundle;

    // Populate preview UI
    document.getElementById('preview-project-name').textContent = rawProject.name || filename.replace(/\.(agentcanvas|canvas\.json|json)$/i, '');
    document.getElementById('preview-project-desc').textContent = rawProject.description || 'No description provided.';
    document.getElementById('preview-node-count').textContent = nodes.length;
    document.getElementById('preview-edge-count').textContent = edges.length;
    document.getElementById('preview-skill-count').textContent = skills.length;

    this.inputCustomName.value = rawProject.name || filename.replace(/\.(agentcanvas|canvas\.json|json)$/i, '');

    // Current project for overwrite label
    const currentProj = this.app.projectManager?.getActiveProject();
    if (currentProj) {
      this.overwriteLabel.textContent = `Overwrite Current Workspace ("${currentProj.name}")`;
    }

    // Populate agent badges list
    const agentsList = document.getElementById('preview-agents-list');
    agentsList.innerHTML = '';

    nodes.forEach(node => {
      // Parse role from frontmatter if present
      let role = 'agent';
      if (node.content && node.content.includes('role:')) {
        const match = node.content.match(/role:\s*([a-zA-Z0-9_-]+)/i);
        if (match) role = match[1].toLowerCase();
      }

      const item = document.createElement('div');
      item.className = 'preview-agent-chip';
      item.innerHTML = `
        <span class="role-dot role-${escapeHtml(role)}"></span>
        <span class="agent-chip-title">${escapeHtml(node.title || node.filename)}</span>
        <span class="agent-chip-role">${escapeHtml(role)}</span>
      `;
      agentsList.appendChild(item);
    });

    // Show preview pane, hide dropzone, enable submit
    this.dropzone.classList.add('hidden');
    this.previewPane.classList.remove('hidden');
    this.btnSubmit.disabled = false;
  }

  resetFile() {
    this.parsedBundle = null;
    this.fileInput.value = '';
    this.previewPane.classList.add('hidden');
    this.dropzone.classList.remove('hidden');
    this.btnSubmit.disabled = true;
  }

  async submitImport() {
    if (!this.parsedBundle) return;

    const mode = document.querySelector('input[name="import-mode"]:checked')?.value || 'new';
    const customName = this.inputCustomName.value.trim();
    const currentProj = this.app.projectManager?.getActiveProject();

    if (mode === 'overwrite' && currentProj) {
      const confirmed = await dialog.confirm({
        title: 'Overwrite Project Workspace',
        message: `Are you sure you want to completely overwrite workspace "${currentProj.name}" with the imported project? All current blocks will be replaced.`,
        confirmText: 'Overwrite',
        cancelText: 'Cancel',
        isDanger: true
      });
      if (!confirmed) return;
    }

    this.btnSubmit.disabled = true;
    this.btnSubmit.textContent = 'Importing...';

    try {
      const payload = {
        bundle: this.parsedBundle,
        mode,
        name: customName || null,
        targetProjectId: mode === 'overwrite' ? currentProj?.id : null
      };

      const res = await fetch('/api/projects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (result.success && result.project) {
        dialog.toast(`Project "${result.project.name}" imported successfully (${result.nodeCount} blocks, ${result.edgeCount} connections)`, 'success');
        this.close();

        // Refresh projects and select the imported project
        if (this.app.projectManager) {
          await this.app.projectManager.loadProjects();
          this.app.projectManager.selectProject(result.project.id);
        }
      } else {
        dialog.toast(`Import failed: ${result.error || 'Unknown error'}`, 'error');
        this.btnSubmit.disabled = false;
        this.btnSubmit.textContent = 'Import & Open Canvas';
      }
    } catch (err) {
      dialog.toast(`Import error: ${err.message}`, 'error');
      this.btnSubmit.disabled = false;
      this.btnSubmit.textContent = 'Import & Open Canvas';
    }
  }

  open() {
    this.resetFile();
    const currentProj = this.app.projectManager?.getActiveProject();
    if (currentProj) {
      this.overwriteLabel.textContent = `Overwrite Current Workspace ("${currentProj.name}")`;
    }
    this.overlay.classList.remove('hidden');
  }

  close() {
    this.overlay.classList.add('hidden');
    this.btnSubmit.textContent = 'Import & Open Canvas';
  }
}
