/**
 * Skills Library Manager & Multi-File Skill Editor
 * Manages modular skill packages (SKILL.md, scripts/, references/, assets/)
 * with In-DOM file exploration, code editing, and ZIP upload import.
 */

import { dialog } from './dialog.js';

export class SkillsManager {
  constructor(app) {
    this.app = app;
    this.skills = [];
    this.activeSkillId = null;
    this.activeFileId = null;
    this.activeSkillFiles = [];
    this.modalElem = null;

    this.initDOM();
  }

  initDOM() {
    // Check if modal container already exists
    let modal = document.getElementById('skills-library-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'skills-library-modal';
      modal.className = 'modal-overlay hidden';
      modal.innerHTML = `
        <div class="skills-modal-card">
          <!-- Header -->
          <div class="skills-modal-header">
            <div class="skills-header-left">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" style="stroke: var(--sky-core)" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                <path d="M12 6v6M9 9h6"/>
              </svg>
              <div class="skills-header-title-group">
                <h2 class="skills-title">Skills Library</h2>
                <span class="skills-subtitle">Modular Agent Capabilities & Runbooks</span>
              </div>
            </div>
            <div class="skills-header-right">
              <button type="button" class="btn btn-secondary" id="btn-skills-templates" title="Choose from Starter Templates">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                Templates
              </button>
              <button type="button" class="btn btn-secondary" id="btn-skills-upload-zip" title="Upload Skill package as ZIP">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload ZIP
              </button>
              <button type="button" class="btn btn-primary" id="btn-create-new-skill" title="Create a new skill">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New Skill
              </button>
              <input type="file" id="input-skill-zip-file" accept=".zip" style="display:none;" />
              <button type="button" class="btn-icon" id="btn-close-skills-modal" title="Close Skills Library">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          <!-- Body split: Skills Sidebar + Multi-File Workspace -->
          <div class="skills-modal-body">
            <!-- Left Sidebar: Skills List -->
            <div class="skills-sidebar">
              <div class="skills-search-box">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="skills-search-input" placeholder="Filter skills..." spellcheck="false" />
              </div>
              <div class="skills-list" id="skills-items-container">
                <!-- Dynamically populated -->
              </div>
            </div>

            <!-- Right Workspace: Multi-file Tree & Editor -->
            <div class="skills-workspace" id="skills-workspace-container">
              <!-- Dynamically populated based on active skill -->
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      this.modalElem = modal;
      this.bindEvents();
    } else {
      this.modalElem = modal;
    }
  }

  bindEvents() {
    document.getElementById('btn-close-skills-modal').addEventListener('click', () => this.close());
    this.modalElem.addEventListener('click', (e) => {
      if (e.target === this.modalElem) this.close();
    });

    document.getElementById('btn-create-new-skill').addEventListener('click', () => this.promptCreateSkill());
    
    const templatesBtn = document.getElementById('btn-skills-templates');
    if (templatesBtn) {
      templatesBtn.addEventListener('click', () => this.showTemplatesCatalog());
    }

    const fileInput = document.getElementById('input-skill-zip-file');
    document.getElementById('btn-skills-upload-zip').addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.handleZipUpload(file);
        fileInput.value = '';
      }
    });

    const searchInput = document.getElementById('skills-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.renderSkillsList(e.target.value.trim().toLowerCase());
      });
    }
  }

  async open() {
    this.modalElem.classList.remove('hidden');
    await this.fetchSkills();
    if (this.skills.length > 0 && !this.activeSkillId) {
      this.selectSkill(this.skills[0].id);
    } else if (this.activeSkillId) {
      this.selectSkill(this.activeSkillId);
    } else {
      this.renderEmptyWorkspace();
    }
  }

  close() {
    this.modalElem.classList.add('hidden');
  }

  getProjectId() {
    return this.app.currentProjectId || 'project-default';
  }

  async fetchSkills() {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(this.getProjectId())}/skills`);
      const data = await res.json();
      if (data.success) {
        this.skills = data.skills || [];
        this.renderSkillsList();
        return this.skills;
      }
    } catch (e) {
      console.error('Error fetching skills:', e);
    }
    return [];
  }

  renderSkillsList(filter = '') {
    const container = document.getElementById('skills-items-container');
    if (!container) return;

    const filtered = this.skills.filter(s => 
      s.name.toLowerCase().includes(filter) || (s.description && s.description.toLowerCase().includes(filter))
    );

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="skills-empty-state">
          <span>No skills found</span>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(s => {
      const isActive = s.id === this.activeSkillId;
      const fileCount = s.files ? s.files.length : 0;
      return `
        <div class="skill-nav-item ${isActive ? 'active' : ''}" data-id="${s.id}">
          <div class="skill-nav-header">
            <span class="skill-nav-name">${escapeHtml(s.name)}</span>
            <span class="skill-nav-badge">${fileCount} file${fileCount === 1 ? '' : 's'}</span>
          </div>
          <div class="skill-nav-desc">${escapeHtml(s.description || 'Modular skill runbook')}</div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.skill-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectSkill(item.dataset.id);
      });
    });
  }

  async selectSkill(skillId) {
    this.activeSkillId = skillId;
    this.renderSkillsList();

    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) {
      this.renderEmptyWorkspace();
      return;
    }

    // Fetch files for active skill
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillId)}/files`);
      const data = await res.json();
      if (data.success) {
        this.activeSkillFiles = data.files || [];
      }
    } catch (e) {
      console.error('Error fetching skill files:', e);
      this.activeSkillFiles = skill.files || [];
    }

    // Default to SKILL.md if present, or first file
    const skillMd = this.activeSkillFiles.find(f => f.file_path.toLowerCase() === 'skill.md');
    if (skillMd) {
      this.activeFileId = skillMd.id;
    } else if (this.activeSkillFiles.length > 0) {
      this.activeFileId = this.activeSkillFiles[0].id;
    } else {
      this.activeFileId = null;
    }

    this.renderWorkspace(skill);
  }

  renderWorkspace(skill) {
    const workspace = document.getElementById('skills-workspace-container');
    if (!workspace) return;

    const activeFile = this.activeSkillFiles.find(f => f.id === this.activeFileId);

    workspace.innerHTML = `
      <div class="skill-meta-bar">
        <div class="skill-meta-inputs">
          <div class="skill-meta-title-row">
            <span class="skill-meta-label">Skill:</span>
            <input type="text" class="skill-meta-name-input" id="active-skill-name-input" value="${escapeHtml(skill.name)}" spellcheck="false" />
            <button type="button" class="btn btn-secondary btn-sm" id="btn-save-skill-meta" title="Save skill name & description">Save</button>
            <button type="button" class="btn btn-danger btn-sm" id="btn-delete-skill" title="Delete skill">Delete</button>
          </div>
          <input type="text" class="skill-meta-desc-input" id="active-skill-desc-input" placeholder="Skill purpose & capabilities (used in discovery & routing)..." value="${escapeHtml(skill.description || '')}" />
        </div>
      </div>

      <div class="skill-files-split">
        <!-- File Explorer -->
        <div class="skill-files-tree-pane">
          <div class="skill-tree-header">
            <span class="skill-tree-title">Package Files</span>
            <button type="button" class="btn-icon btn-xs" id="btn-add-skill-file" title="Add file or runbook to skill">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
          <div class="skill-tree-list" id="skill-tree-list-container">
          </div>
        </div>

        <!-- File Editor Pane -->
        <div class="skill-file-editor-pane">
          ${activeFile ? `
            <div class="skill-file-tab-bar">
              <div class="skill-active-tab">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                <span class="tab-filename">${escapeHtml(activeFile.file_path)}</span>
              </div>
              <div class="skill-tab-actions">
                <button type="button" class="btn btn-primary btn-xs" id="btn-save-skill-file">Save File</button>
                ${activeFile.file_path.toLowerCase() !== 'skill.md' ? `
                  <button type="button" class="btn-icon btn-xs" id="btn-delete-skill-file" title="Delete this file">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                ` : ''}
              </div>
            </div>
            <div class="skill-editor-container">
              <textarea id="skill-file-textarea" class="skill-file-textarea" spellcheck="false">${escapeHtml(activeFile.content || '')}</textarea>
            </div>
          ` : `
            <div class="skill-editor-empty">
              <span>Select or create a file to view and edit its content</span>
            </div>
          `}
        </div>
      </div>
    `;

    // Render hierarchical tree structure
    const treeContainer = workspace.querySelector('#skill-tree-list-container');
    if (treeContainer) {
      this.renderSkillFileTree(treeContainer, skill);
    }

    // Bind Workspace events
    const nameInput = document.getElementById('active-skill-name-input');
    const descInput = document.getElementById('active-skill-desc-input');
    const btnSaveMeta = document.getElementById('btn-save-skill-meta');
    const btnDeleteSkill = document.getElementById('btn-delete-skill');
    const btnAddFile = document.getElementById('btn-add-skill-file');
    const btnSaveFile = document.getElementById('btn-save-skill-file');
    const btnDeleteFile = document.getElementById('btn-delete-skill-file');
    const fileTextarea = document.getElementById('skill-file-textarea');

    if (btnSaveMeta) {
      btnSaveMeta.addEventListener('click', async () => {
        const newName = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        const newDesc = descInput.value.trim();
        await this.updateSkillMeta(skill.id, newName, newDesc);
      });
    }

    if (btnDeleteSkill) {
      btnDeleteSkill.addEventListener('click', async () => {
        const confirmed = await dialog.confirm({
          title: 'Delete Skill Package',
          message: `Are you sure you want to delete skill "${skill.name}" and all its auxiliary files?`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          isDanger: true
        });
        if (confirmed) {
          await this.deleteSkill(skill.id);
        }
      });
    }

    if (btnAddFile) {
      btnAddFile.addEventListener('click', async () => {
        const filePath = await dialog.prompt({
          title: 'Add File to Skill',
          message: 'Enter relative file path (e.g. scripts/run.sh, references/docs.md, assets/template.json):',
          defaultValue: 'scripts/new_script.sh',
          confirmText: 'Create File'
        });
        if (filePath && filePath.trim()) {
          await this.createFile(skill.id, filePath.trim());
        }
      });
    }

    if (btnSaveFile && activeFile && fileTextarea) {
      btnSaveFile.addEventListener('click', async () => {
        await this.saveFileContent(activeFile.id, fileTextarea.value);
      });
    }

    if (btnDeleteFile && activeFile) {
      btnDeleteFile.addEventListener('click', async () => {
        const confirmed = await dialog.confirm({
          title: 'Delete File',
          message: `Are you sure you want to delete "${activeFile.file_path}"?`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          isDanger: true
        });
        if (confirmed) {
          await this.deleteFile(activeFile.id);
        }
      });
    }
  }

  buildSkillFileTree(files) {
    const root = { name: '', isDir: true, children: [] };

    files.forEach(file => {
      const parts = file.file_path.split('/').filter(Boolean);
      let curr = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = (i === parts.length - 1);

        if (isFile) {
          curr.children.push({
            id: file.id,
            name: part,
            path: file.file_path,
            isDir: false,
            isSkillMd: file.file_path.toLowerCase() === 'skill.md',
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

    // Sort nodes: SKILL.md first, then folders alphabetically, then other files alphabetically
    const sortTree = (node) => {
      if (!node.isDir) return;
      node.children.sort((a, b) => {
        if (a.isSkillMd) return -1;
        if (b.isSkillMd) return 1;
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortTree);
    };

    sortTree(root);
    return root;
  }

  renderSkillFileTree(container, skill) {
    if (!container) return;
    if (this.activeSkillFiles.length === 0) {
      container.innerHTML = `<div class="skill-tree-empty">No files in package</div>`;
      return;
    }

    container.innerHTML = '';
    const tree = this.buildSkillFileTree(this.activeSkillFiles);
    this.renderSkillTreeNode(tree, container, '', true, true, skill);
  }

  renderSkillTreeNode(node, container, prefix = '', isLast = true, isRoot = false, skill) {
    if (!isRoot) {
      const branchChar = isLast ? '└── ' : '├── ';
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');

      if (node.isDir) {
        const dirElem = document.createElement('div');
        dirElem.className = 'skill-tree-dir-node';
        dirElem.innerHTML = `
          <div class="skill-tree-dir-header">
            <span class="skill-tree-branch-guide">${escapeHtml(prefix)}${escapeHtml(branchChar)}</span>
            <svg class="tree-folder-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" style="stroke: var(--sky-core)" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="skill-tree-dir-name">${escapeHtml(node.name)}/</span>
          </div>
          <div class="skill-tree-dir-children"></div>
        `;
        container.appendChild(dirElem);
        const childrenContainer = dirElem.querySelector('.skill-tree-dir-children');

        node.children.forEach((child, idx) => {
          this.renderSkillTreeNode(child, childrenContainer, nextPrefix, idx === node.children.length - 1, false, skill);
        });
        return;
      } else {
        const isActive = node.id === this.activeFileId;
        const fileElem = document.createElement('div');
        fileElem.className = `skill-tree-file-node ${isActive ? 'active' : ''}`;
        fileElem.setAttribute('data-id', node.id);
        fileElem.setAttribute('title', node.path);
        fileElem.innerHTML = `
          <span class="skill-tree-branch-guide">${escapeHtml(prefix)}${escapeHtml(branchChar)}</span>
          <svg class="tree-file-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" style="stroke: ${node.isSkillMd ? 'var(--sky-core)' : 'var(--text-secondary)'}" stroke-width="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
          </svg>
          <span class="skill-tree-file-name ${node.isSkillMd ? 'is-skill-md' : ''}">${escapeHtml(node.name)}</span>
          ${node.ext ? `<span class="skill-tree-ext-badge">${escapeHtml(node.ext.replace('.', ''))}</span>` : ''}
        `;

        fileElem.addEventListener('click', () => {
          this.activeFileId = node.id;
          this.renderWorkspace(skill);
        });

        container.appendChild(fileElem);
        return;
      }
    }

    // Root node: render direct children
    node.children.forEach((child, idx) => {
      this.renderSkillTreeNode(child, container, prefix, idx === node.children.length - 1, false, skill);
    });
  }

  renderEmptyWorkspace() {
    const workspace = document.getElementById('skills-workspace-container');
    if (!workspace) return;

    workspace.innerHTML = `
      <div class="skill-workspace-empty-view">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" style="stroke: var(--border-active)" stroke-width="1.5">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <h3>No Skill Selected</h3>
        <p>Select a skill from the list or create a new skill package.</p>
        <button type="button" class="btn btn-primary btn-sm" id="btn-empty-new-skill">Create New Skill</button>
      </div>
    `;

    document.getElementById('btn-empty-new-skill')?.addEventListener('click', () => {
      this.promptCreateSkill();
    });
  }

  async promptCreateSkill() {
    const name = await dialog.prompt({
      title: 'New Skill Package',
      message: 'Enter a lowercase identifier for this skill (e.g. security-audit, git-workflow, deploy-runner):',
      defaultValue: 'new-skill',
      confirmText: 'Create Skill'
    });

    if (!name || !name.trim()) return;
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(this.getProjectId())}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          description: `Standardized instructions for ${cleanName}`
        })
      });
      const data = await res.json();
      if (data.success && data.skill) {
        await this.fetchSkills();
        this.selectSkill(data.skill.id);
      }
    } catch (e) {
      console.error('Error creating skill:', e);
      await dialog.alert({ title: 'Error', message: 'Failed to create skill package.' });
    }
  }

  async updateSkillMeta(skillId, name, description) {
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      const data = await res.json();
      if (data.success) {
        await this.fetchSkills();
        this.selectSkill(skillId);
      }
    } catch (e) {
      console.error('Error updating skill meta:', e);
    }
  }

  async deleteSkill(skillId) {
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        this.activeSkillId = null;
        await this.fetchSkills();
        if (this.skills.length > 0) {
          this.selectSkill(this.skills[0].id);
        } else {
          this.renderEmptyWorkspace();
        }
      }
    } catch (e) {
      console.error('Error deleting skill:', e);
    }
  }

  async createFile(skillId, filePath) {
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillId)}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: filePath,
          content: filePath.endsWith('.sh') ? '#!/usr/bin/env bash\nset -euo pipefail\n' : ''
        })
      });
      const data = await res.json();
      if (data.success && data.file) {
        await this.selectSkill(skillId);
        this.activeFileId = data.file.id;
        const skill = this.skills.find(s => s.id === skillId);
        if (skill) this.renderWorkspace(skill);
      }
    } catch (e) {
      console.error('Error creating file:', e);
    }
  }

  async saveFileContent(fileId, content) {
    const file = this.activeSkillFiles.find(f => f.id === fileId);
    if (!file) return;

    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(file.skill_id)}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: file.id,
          file_path: file.file_path,
          content
        })
      });
      const data = await res.json();
      if (data.success) {
        file.content = content;
        const saveBtn = document.getElementById('btn-save-skill-file');
        if (saveBtn) {
          const originalText = saveBtn.textContent;
          saveBtn.textContent = 'Saved!';
          saveBtn.classList.add('btn-accent');
          setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.classList.remove('btn-accent');
          }, 1500);
        }
      }
    } catch (e) {
      console.error('Error saving file:', e);
    }
  }

  async deleteFile(fileId) {
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(this.activeSkillId)}/files/${encodeURIComponent(fileId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        await this.selectSkill(this.activeSkillId);
      }
    } catch (e) {
      console.error('Error deleting file:', e);
    }
  }

  /**
   * Client-side simple ZIP unpacker using browser ArrayBuffer / DecompressionStream
   */
  async handleZipUpload(file) {
    const skillName = file.name.replace(/\.zip$/i, '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    
    try {
      const buffer = await file.arrayBuffer();
      const extractedFiles = await this.parseZipBuffer(buffer);

      if (extractedFiles.length === 0) {
        await dialog.alert({ title: 'Invalid ZIP', message: 'No valid files could be read from the uploaded ZIP archive.' });
        return;
      }

      const res = await fetch(`/api/projects/${encodeURIComponent(this.getProjectId())}/skills/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: skillName,
          description: `Imported skill package (${file.name})`,
          files: extractedFiles
        })
      });

      const data = await res.json();
      if (data.success && data.skill) {
        await this.fetchSkills();
        this.selectSkill(data.skill.id);
      }
    } catch (e) {
      console.error('Error processing ZIP upload:', e);
      await dialog.alert({ title: 'Import Failed', message: `Failed to import skill ZIP: ${e.message}` });
    }
  }

  /**
   * Minimal dependency-free PKZIP local header parser for text files
   */
  async parseZipBuffer(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const files = [];
    let offset = 0;

    while (offset < arrayBuffer.byteLength - 4) {
      const sig = view.getUint32(offset, true);
      if (sig === 0x04034b50) { // Local File Header Signature
        const compMethod = view.getUint16(offset + 8, true);
        const compSize = view.getUint32(offset + 18, true);
        const uncompSize = view.getUint32(offset + 22, true);
        const nameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);

        const nameBytes = new Uint8Array(arrayBuffer, offset + 30, nameLen);
        const rawFileName = new TextDecoder().decode(nameBytes);

        const dataOffset = offset + 30 + nameLen + extraLen;

        // Skip directories and macOS __MACOSX metadata
        if (!rawFileName.endsWith('/') && !rawFileName.includes('__MACOSX') && !rawFileName.startsWith('.')) {
          // Normalize clean relative path inside skill
          let cleanPath = rawFileName;
          // Strip top-level root folder if all files are inside a parent folder
          const parts = cleanPath.split('/');
          if (parts.length > 1 && parts[0].toLowerCase().includes('skill')) {
            cleanPath = parts.slice(1).join('/');
          }

          let content = '';
          if (compMethod === 0) { // Stored (Uncompressed)
            const fileBytes = new Uint8Array(arrayBuffer, dataOffset, uncompSize);
            content = new TextDecoder('utf-8', { fatal: false }).decode(fileBytes);
          } else if (compMethod === 8) { // Deflated
            try {
              const compBytes = new Uint8Array(arrayBuffer, dataOffset, compSize);
              if (typeof DecompressionStream !== 'undefined') {
                const ds = new DecompressionStream('deflate-raw');
                const writer = ds.writable.getWriter();
                writer.write(compBytes);
                writer.close();
                const response = new Response(ds.readable);
                content = await response.text();
              }
            } catch (decompErr) {
              console.warn(`Could not decompress ${rawFileName}:`, decompErr);
            }
          }

          if (content !== undefined) {
            files.push({
              file_path: cleanPath,
              content: content
            });
          }
        }

        offset = dataOffset + compSize;
      } else {
        offset++;
      }
    }

    return files;
  }

  async showTemplatesCatalog() {
    try {
      const res = await fetch('/api/skills/templates');
      const data = await res.json();
      if (!data.success || !data.templates) {
        throw new Error('Could not fetch starter templates');
      }

      const templates = data.templates;

      let modal = document.getElementById('skills-template-modal');
      if (modal) modal.remove();

      modal = document.createElement('div');
      modal.id = 'skills-template-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="skills-template-modal-card">
          <div class="template-modal-header">
            <div class="template-modal-title-group">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" style="stroke: var(--sky-core)" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
              </svg>
              <div>
                <h3 class="template-modal-title">Starter Skill Presets</h3>
                <p class="template-modal-subtitle">Instant, production-ready skill runbooks and scripts</p>
              </div>
            </div>
            <button type="button" class="btn-icon" id="btn-close-template-modal">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="template-modal-list">
            ${templates.map(t => `
              <div class="template-card" data-template="${escapeHtml(t.name)}">
                <div class="template-card-header">
                  <span class="template-name">${escapeHtml(t.name)}</span>
                  <span class="template-file-count">${t.files.length} files</span>
                </div>
                <p class="template-desc">${escapeHtml(t.description)}</p>
                <div class="template-files-preview">
                  ${t.files.map(f => `<span class="template-file-tag">${escapeHtml(f.file_path)}</span>`).join('')}
                </div>
                <div class="template-actions">
                  <button type="button" class="btn btn-primary btn-xs btn-use-template" data-template="${escapeHtml(t.name)}">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Use Template
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      modal.querySelector('#btn-close-template-modal').addEventListener('click', () => modal.remove());
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });

      modal.querySelectorAll('.btn-use-template').forEach(btn => {
        btn.addEventListener('click', async () => {
          const templateName = btn.dataset.template;
          btn.disabled = true;
          btn.textContent = 'Instantiating...';
          try {
            const createRes = await fetch(`/api/projects/${encodeURIComponent(this.getProjectId())}/skills/from-template`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ templateName })
            });
            const createData = await createRes.json();
            if (createData.success && createData.skill) {
              modal.remove();
              await this.fetchSkills();
              this.selectSkill(createData.skill.id);
            } else {
              throw new Error(createData.error || 'Failed to instantiate template');
            }
          } catch (err) {
            console.error('Template instantiation failed:', err);
            await dialog.alert({ title: 'Error', message: err.message });
            btn.disabled = false;
            btn.textContent = 'Use Template';
          }
        });
      });
    } catch (e) {
      console.error('Error opening template catalog:', e);
      await dialog.alert({ title: 'Error', message: 'Could not load template presets.' });
    }
  }
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
