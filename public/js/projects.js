/**
 * Project Management Module
 * Strictly vector SVG icons - No emojis in UI (per GEMINI.md standards)
 */

import { dialog } from './dialog.js';

export class ProjectManager {
  constructor({ onProjectSelect }) {
    this.onProjectSelect = onProjectSelect;
    this.projects = [];
    this.activeProjectId = localStorage.getItem('agent_active_project_id') || 'project-default';

    this.initDOM();
    this.initEventListeners();
  }

  initDOM() {
    // Project Hub Modal overlay
    this.modal = document.createElement('div');
    this.modal.className = 'project-modal-overlay hidden';
    this.modal.id = 'project-hub-modal';
    this.modal.innerHTML = `
      <div class="project-modal-card">
        <div class="project-modal-header">
          <div class="project-header-left">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" style="stroke: var(--blue-core)" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <div>
              <h2 class="project-modal-title">Agent Projects</h2>
              <p class="project-modal-subtitle">Select or create an isolated workspace for orchestrating agents</p>
            </div>
          </div>
          <div class="project-header-actions">
            <button id="btn-import-project-trigger" class="btn btn-secondary" title="Import Canvas Project (.agentcanvas / JSON)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Import Project
            </button>
            <button id="btn-create-project-trigger" class="btn btn-primary">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              New Project
            </button>
            <button id="btn-close-project-modal" class="btn-icon" title="Close">✕</button>
          </div>
        </div>

        <!-- Create Project Form (collapsible) -->
        <div id="create-project-pane" class="create-project-pane hidden">
          <div class="create-pane-inner">
            <h4 class="create-pane-title">Create New Project</h4>
            <div class="form-group">
              <label for="new-project-name">Project Name</label>
              <input type="text" id="new-project-name" class="form-input" placeholder="e.g., Customer Support Squad, Code Reviewer Pipeline" />
            </div>
            <div class="form-group">
              <label for="new-project-desc">Description (optional)</label>
              <input type="text" id="new-project-desc" class="form-input" placeholder="e.g., Autonomous multi-agent pipeline for customer escalations" />
            </div>
            <div class="create-pane-actions">
              <button id="btn-cancel-create-project" class="btn btn-secondary">Cancel</button>
              <button id="btn-submit-create-project" class="btn btn-primary">Create Project</button>
            </div>
          </div>
        </div>

        <!-- Projects Grid List -->
        <div class="project-modal-body">
          <div class="project-list-grid" id="project-list-container">
            <!-- Rendered dynamically -->
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.modal);

    this.projectListContainer = document.getElementById('project-list-container');
    this.createPane = document.getElementById('create-project-pane');
    this.inputName = document.getElementById('new-project-name');
    this.inputDesc = document.getElementById('new-project-desc');
  }

  initEventListeners() {
    // Project modal open / close
    document.getElementById('btn-close-project-modal').addEventListener('click', () => {
      this.closeModal();
    });

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    // Import project trigger
    const btnImport = document.getElementById('btn-import-project-trigger');
    if (btnImport) {
      btnImport.addEventListener('click', () => {
        this.closeModal();
        if (window.app?.importModal) {
          window.app.importModal.open();
        }
      });
    }

    // Create project trigger
    document.getElementById('btn-create-project-trigger').addEventListener('click', () => {
      this.createPane.classList.toggle('hidden');
      if (!this.createPane.classList.contains('hidden')) {
        this.inputName.value = '';
        this.inputDesc.value = '';
        setTimeout(() => this.inputName.focus(), 50);
      }
    });

    document.getElementById('btn-cancel-create-project').addEventListener('click', () => {
      this.createPane.classList.add('hidden');
    });

    document.getElementById('btn-submit-create-project').addEventListener('click', () => {
      this.handleCreateProject();
    });

    this.inputName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleCreateProject();
    });
  }

  async loadProjects() {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      this.projects = data.projects || [];

      // Validate active project
      if (!this.projects.some(p => p.id === this.activeProjectId) && this.projects.length > 0) {
        this.activeProjectId = this.projects[0].id;
        localStorage.setItem('agent_active_project_id', this.activeProjectId);
      }

      this.updateHeaderDisplay();
      this.renderProjectCards();
      return this.getActiveProject();
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      return null;
    }
  }

  getActiveProject() {
    return this.projects.find(p => p.id === this.activeProjectId) || this.projects[0] || null;
  }

  selectProject(projectId) {
    if (this.activeProjectId === projectId) {
      this.closeModal();
      return;
    }
    this.activeProjectId = projectId;
    localStorage.setItem('agent_active_project_id', projectId);
    this.updateHeaderDisplay();
    this.closeModal();

    if (this.onProjectSelect) {
      this.onProjectSelect(this.getActiveProject());
    }
  }

  updateHeaderDisplay() {
    const active = this.getActiveProject();
    const nameElem = document.getElementById('header-project-name');
    if (nameElem) {
      nameElem.textContent = active ? active.name : 'Select Project';
    }
  }

  renderProjectCards() {
    this.projectListContainer.innerHTML = '';

    if (this.projects.length === 0) {
      this.projectListContainer.innerHTML = `
        <div class="empty-projects-state">
          <p>No projects found. Click "New Project" above to create your first agent workspace.</p>
        </div>
      `;
      return;
    }

    for (const project of this.projects) {
      const isCurrent = project.id === this.activeProjectId;
      const card = document.createElement('div');
      card.className = `project-card ${isCurrent ? 'active' : ''}`;
      card.innerHTML = `
        <div class="project-card-top">
          <div class="project-card-header">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" style="stroke: ${isCurrent ? 'var(--blue-core)' : 'var(--text-muted)'}" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <div class="project-card-title-group">
              <h3 class="project-card-title">${this.escape(project.name)}</h3>
              ${isCurrent ? '<span class="project-badge-active">Active</span>' : ''}
            </div>
          </div>
          <div class="project-card-actions">
            <button class="card-action-btn btn-export-project" title="Export Project (.agentcanvas bundle)">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <button class="card-action-btn btn-delete-project" title="Delete Project">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <p class="project-card-desc">${this.escape(project.description || 'No description provided.')}</p>

        <div class="project-card-footer">
          <div class="project-metrics">
            <span class="metric-pill">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              ${project.node_count || 0} blocks
            </span>
            <span class="metric-pill">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 6.5h4M6.5 10v4M17.5 10v4M10 17.5h4"/></svg>
              ${project.edge_count || 0} connections
            </span>
          </div>
          <span class="project-date">${new Date(project.updated_at).toLocaleDateString()}</span>
        </div>
      `;

      // Select project on click
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-action-btn')) return;
        this.selectProject(project.id);
      });

      // Export project action
      const btnExport = card.querySelector('.btn-export-project');
      btnExport.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = `/api/projects/${encodeURIComponent(project.id)}/export/bundle?download=1`;
        dialog.toast(`Exporting "${project.name}" as .agentcanvas bundle`, 'info');
      });

      // Delete project action
      const btnDelete = card.querySelector('.btn-delete-project');
      btnDelete.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (this.projects.length <= 1) {
          dialog.toast('Cannot delete the only project.', 'error');
          return;
        }
        const confirmed = await dialog.confirm({
          title: 'Delete Project',
          message: `Are you sure you want to delete project "${project.name}" and all its agent blocks?`,
          confirmText: 'Delete Project',
          isDanger: true
        });

        if (confirmed) {
          await this.handleDeleteProject(project.id);
        }
      });

      this.projectListContainer.appendChild(card);
    }
  }

  async handleCreateProject() {
    const name = this.inputName.value.trim();
    const description = this.inputDesc.value.trim();

    if (!name) {
      dialog.toast('Project name cannot be empty', 'error');
      this.inputName.focus();
      return;
    }

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      const data = await res.json();

      if (data.success && data.project) {
        dialog.toast(`Project "${data.project.name}" created`, 'success');
        this.createPane.classList.add('hidden');
        await this.loadProjects();
        this.selectProject(data.project.id);
      } else {
        dialog.toast(`Failed: ${data.error || 'Could not create project'}`, 'error');
      }
    } catch (err) {
      dialog.toast(`Error creating project: ${err.message}`, 'error');
    }
  }

  async handleDeleteProject(id) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        dialog.toast('Project deleted', 'info');
        if (this.activeProjectId === id) {
          const remaining = this.projects.filter(p => p.id !== id);
          this.activeProjectId = remaining.length > 0 ? remaining[0].id : 'project-default';
          localStorage.setItem('agent_active_project_id', this.activeProjectId);
        }
        await this.loadProjects();
        if (this.onProjectSelect) {
          this.onProjectSelect(this.getActiveProject());
        }
      }
    } catch (err) {
      dialog.toast(`Failed to delete project: ${err.message}`, 'error');
    }
  }

  openModal() {
    this.createPane.classList.add('hidden');
    this.renderProjectCards();
    this.modal.classList.remove('hidden');
  }

  closeModal() {
    this.modal.classList.add('hidden');
  }

  escape(str = '') {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
