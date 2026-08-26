/**
 * In-DOM Custom Dialog & Toast System (Obsidian Canvas Dark Theme)
 * Strictly vector SVG icons - No emojis in UI (per GEMINI.md standards)
 */

import { classifyEdge } from './edgeSemantics.js';

class DialogManager {
  constructor() {
    this.createElements();
  }

  createElements() {
    // Dialog overlay container
    this.overlay = document.createElement('div');
    this.overlay.className = 'custom-dialog-overlay hidden';
    this.overlay.id = 'custom-main-dialog-overlay';
    this.overlay.innerHTML = `
      <div class="custom-dialog-card">
        <div class="custom-dialog-header">
          <div class="custom-dialog-icon" id="cd-icon"></div>
          <h3 class="custom-dialog-title" id="cd-title">Confirm Action</h3>
        </div>
        <div class="custom-dialog-body" id="cd-body">
          <p id="cd-message">Are you sure you want to proceed?</p>
          <div id="cd-input-wrapper" class="hidden">
            <input type="text" id="cd-input" class="custom-dialog-input" spellcheck="false" />
          </div>
        </div>
        <div class="custom-dialog-actions" id="cd-actions">
          <button id="cd-btn-delete" class="btn btn-danger hidden">Delete Connection</button>
          <div class="action-spacer"></div>
          <button id="cd-btn-cancel" class="btn btn-secondary">Cancel</button>
          <button id="cd-btn-confirm" class="btn btn-primary">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    // Edge Inspector Overlay
    this.edgeOverlay = document.createElement('div');
    this.edgeOverlay.className = 'custom-dialog-overlay hidden';
    this.edgeOverlay.id = 'edge-config-overlay';
    this.edgeOverlay.innerHTML = `
      <div class="custom-dialog-card edge-config-card">
        <div class="custom-dialog-header">
          <div class="custom-dialog-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" style="stroke: var(--blue-core)" stroke-width="2">
              <path d="M10 6.5h4M6.5 10v4M17.5 10v4M10 17.5h4"/>
            </svg>
          </div>
          <div>
            <h3 class="custom-dialog-title">Decision Branch & Routing</h3>
            <p class="custom-dialog-sub">Configure condition, verdict triggers, and retry limits</p>
          </div>
        </div>

        <div class="custom-dialog-body">
          <div class="form-group">
            <label>Branch Condition</label>
            <div class="edge-type-selector">
              <button type="button" class="edge-type-btn" data-type="pass">
                <span class="type-dot dot-pass"></span>
                <div class="type-info">
                  <span class="type-name">Pass / Approved</span>
                  <span class="type-desc">Triggers on success / approval</span>
                </div>
              </button>
              <button type="button" class="edge-type-btn" data-type="fail">
                <span class="type-dot dot-fail"></span>
                <div class="type-info">
                  <span class="type-name">Fail / Retry Loop</span>
                  <span class="type-desc">Triggers loopback with feedback</span>
                </div>
              </button>
              <button type="button" class="edge-type-btn" data-type="default">
                <span class="type-dot dot-default"></span>
                <div class="type-info">
                  <span class="type-name">Default / Next</span>
                  <span class="type-desc">Standard forward execution</span>
                </div>
              </button>
            </div>
          </div>

          <div class="form-group" style="margin-top: 14px;">
            <label for="ec-label">Edge Label</label>
            <input type="text" id="ec-label" class="custom-dialog-input" placeholder="e.g. Approved, Reject & Refine, Delegate" />
          </div>

          <div class="form-group hidden" id="ec-retries-group" style="margin-top: 14px;">
            <label for="ec-retries">Max Retries (Feedback Loop Guardrail)</label>
            <input type="number" id="ec-retries" class="custom-dialog-input" min="1" max="10" value="3" />
          </div>
        </div>

        <div class="custom-dialog-actions">
          <button id="ec-btn-delete" class="btn btn-danger">Delete Connection</button>
          <div class="action-spacer"></div>
          <button id="ec-btn-cancel" class="btn btn-secondary">Cancel</button>
          <button id="ec-btn-save" class="btn btn-primary">Save Changes</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.edgeOverlay);

    // Directory Browser Overlay
    this.dirBrowserOverlay = document.createElement('div');
    this.dirBrowserOverlay.className = 'custom-dialog-overlay hidden';
    this.dirBrowserOverlay.id = 'custom-dir-browser-overlay';
    this.dirBrowserOverlay.innerHTML = `
      <div class="custom-dialog-card dir-browser-card">
        <div class="custom-dialog-header">
          <div class="custom-dialog-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" style="stroke: var(--sky-core)" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <h3 class="custom-dialog-title" id="db-title">Export Destination Folder</h3>
            <p class="custom-dialog-sub" id="db-sub">Browse and select destination folder on disk</p>
          </div>
        </div>

        <div class="dir-browser-bookmarks">
          <span class="db-bookmarks-label">Quick Jump:</span>
          <div class="db-bookmarks-list" id="db-bookmarks-list"></div>
        </div>

        <div class="dir-browser-nav-bar">
          <button type="button" class="btn btn-secondary btn-xs" id="db-btn-up" title="Go to parent directory">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
            <span>Up</span>
          </button>
          <div class="dir-browser-breadcrumbs" id="db-breadcrumbs"></div>
          <button type="button" class="btn btn-secondary btn-xs" id="db-btn-mkdir-toggle" title="Create new subfolder here">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            <span>New Folder</span>
          </button>
        </div>

        <!-- Inline New Folder Creator Row -->
        <div class="db-new-folder-row hidden" id="db-new-folder-row">
          <input type="text" id="db-new-folder-input" class="custom-dialog-input db-mkdir-input" placeholder="New folder name..." />
          <button type="button" class="btn btn-primary btn-xs" id="db-btn-create-folder">Create</button>
          <button type="button" class="btn btn-secondary btn-xs" id="db-btn-cancel-folder">Cancel</button>
        </div>

        <!-- Directory Explorer List Pane -->
        <div class="dir-browser-list" id="db-dir-list"></div>

        <!-- Selected Destination Path -->
        <div class="dir-browser-selected-row">
          <label for="db-selected-path" class="db-selected-label">Target Destination Path on Disk:</label>
          <input type="text" id="db-selected-path" class="custom-dialog-input db-path-input" spellcheck="false" placeholder="/path/to/destination" />
        </div>

        <div class="custom-dialog-actions">
          <button id="db-btn-cancel" class="btn btn-secondary">Cancel</button>
          <button id="db-btn-confirm" class="btn btn-primary">Export Files</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.dirBrowserOverlay);

    // Toast container
    this.toastContainer = document.createElement('div');
    this.toastContainer.className = 'toast-container';
    document.body.appendChild(this.toastContainer);

    // DOM references
    this.titleElem = document.getElementById('cd-title');
    this.messageElem = document.getElementById('cd-message');
    this.inputWrapper = document.getElementById('cd-input-wrapper');
    this.inputElem = document.getElementById('cd-input');
    this.btnCancel = document.getElementById('cd-btn-cancel');
    this.btnConfirm = document.getElementById('cd-btn-confirm');
    this.btnDelete = document.getElementById('cd-btn-delete');
    this.iconElem = document.getElementById('cd-icon');

    // Directory browser DOM references
    this.dbTitle = document.getElementById('db-title');
    this.dbSub = document.getElementById('db-sub');
    this.dbBookmarksList = document.getElementById('db-bookmarks-list');
    this.dbBreadcrumbs = document.getElementById('db-breadcrumbs');
    this.dbBtnUp = document.getElementById('db-btn-up');
    this.dbBtnMkdirToggle = document.getElementById('db-btn-mkdir-toggle');
    this.dbNewFolderRow = document.getElementById('db-new-folder-row');
    this.dbNewFolderInput = document.getElementById('db-new-folder-input');
    this.dbBtnCreateFolder = document.getElementById('db-btn-create-folder');
    this.dbBtnCancelFolder = document.getElementById('db-btn-cancel-folder');
    this.dbDirList = document.getElementById('db-dir-list');
    this.dbPathInput = document.getElementById('db-selected-path');
    this.dbBtnCancel = document.getElementById('db-btn-cancel');
    this.dbBtnConfirm = document.getElementById('db-btn-confirm');
  }

  alert(arg1, arg2, arg3) {
    let title = 'Notice';
    let message = '';
    let buttonText = 'OK';

    if (typeof arg1 === 'object' && arg1 !== null) {
      title = arg1.title || 'Notice';
      message = arg1.message || '';
      buttonText = arg1.buttonText || arg1.confirmText || 'OK';
    } else {
      if (arg1) title = arg1;
      if (arg2) message = arg2;
      if (arg3) buttonText = arg3;
    }

    return new Promise((resolve) => {
      this.titleElem.textContent = title;
      if (typeof message === 'string' && message.includes('<') && message.includes('>')) {
        this.messageElem.innerHTML = message;
      } else {
        this.messageElem.textContent = message;
      }
      this.inputWrapper.classList.add('hidden');
      this.btnDelete.classList.add('hidden');
      this.btnCancel.classList.add('hidden');

      this.iconElem.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" style="stroke: var(--sky-core)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

      this.btnConfirm.textContent = buttonText;
      this.btnConfirm.className = 'btn btn-primary';

      this.overlay.classList.remove('hidden');

      const cleanup = () => {
        this.overlay.classList.add('hidden');
        this.btnCancel.classList.remove('hidden');
        window.removeEventListener('keydown', handleKey);
      };

      const handleKey = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') {
          cleanup();
          resolve(true);
        }
      };

      window.addEventListener('keydown', handleKey);

      this.btnConfirm.onclick = () => {
        cleanup();
        resolve(true);
      };

      this.overlay.onclick = (e) => {
        if (e.target === this.overlay) {
          cleanup();
          resolve(true);
        }
      };

      setTimeout(() => this.btnConfirm.focus(), 50);
    });
  }

  confirm(options = {}) {
    let title = 'Confirm Action';
    let message = 'Are you sure?';
    let confirmText = 'OK';
    let cancelText = 'Cancel';
    let isDanger = true;

    if (typeof options === 'string') {
      message = options;
    } else if (typeof options === 'object' && options !== null) {
      if (options.title !== undefined) title = options.title;
      if (options.message !== undefined) message = options.message;
      if (options.confirmText !== undefined) confirmText = options.confirmText;
      if (options.cancelText !== undefined) cancelText = options.cancelText;
      if (options.isDanger !== undefined) isDanger = options.isDanger;
    }

    return new Promise((resolve) => {
      this.titleElem.textContent = title;
      this.messageElem.textContent = message;
      this.inputWrapper.classList.add('hidden');
      this.btnDelete.classList.add('hidden');
      this.btnCancel.classList.remove('hidden');
      
      this.iconElem.innerHTML = isDanger
        ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" style="stroke: var(--red-core)" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`
        : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" style="stroke: var(--blue-core)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

      this.btnConfirm.textContent = confirmText;
      this.btnConfirm.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';
      this.btnCancel.textContent = cancelText;

      this.overlay.classList.remove('hidden');

      const cleanup = () => {
        this.overlay.classList.add('hidden');
        window.removeEventListener('keydown', handleKey);
      };

      const handleKey = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve(false);
        } else if (e.key === 'Enter') {
          cleanup();
          resolve(true);
        }
      };

      window.addEventListener('keydown', handleKey);

      this.btnCancel.onclick = () => {
        cleanup();
        resolve(false);
      };

      this.btnConfirm.onclick = () => {
        cleanup();
        resolve(true);
      };

      this.overlay.onclick = (e) => {
        if (e.target === this.overlay) {
          cleanup();
          resolve(false);
        }
      };

      setTimeout(() => this.btnConfirm.focus(), 50);
    });
  }

  prompt(options = {}) {
    let title = 'Edit';
    let message = '';
    let defaultValue = '';
    let placeholder = '';
    let showDelete = false;
    let confirmText = 'Save';

    if (typeof options === 'string') {
      message = options;
    } else if (typeof options === 'object' && options !== null) {
      if (options.title !== undefined) title = options.title;
      if (options.message !== undefined) message = options.message;
      if (options.defaultValue !== undefined) defaultValue = options.defaultValue;
      if (options.placeholder !== undefined) placeholder = options.placeholder;
      if (options.showDelete !== undefined) showDelete = options.showDelete;
      if (options.confirmText !== undefined) confirmText = options.confirmText;
    }

    return new Promise((resolve) => {
      this.titleElem.textContent = title;
      this.messageElem.textContent = message;
      this.inputWrapper.classList.remove('hidden');
      this.inputElem.value = defaultValue;
      this.inputElem.placeholder = placeholder;
      
      this.iconElem.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" style="stroke: var(--sky-core)" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;

      this.btnConfirm.textContent = confirmText;
      this.btnConfirm.className = 'btn btn-primary';
      this.btnCancel.textContent = 'Cancel';
      this.btnCancel.classList.remove('hidden');

      if (showDelete) {
        this.btnDelete.classList.remove('hidden');
      } else {
        this.btnDelete.classList.add('hidden');
      }

      this.overlay.classList.remove('hidden');

      const cleanup = () => {
        this.overlay.classList.add('hidden');
        window.removeEventListener('keydown', handleKey);
      };

      const handleConfirm = () => {
        cleanup();
        const val = this.inputElem.value;
        if (showDelete) {
          resolve({ action: 'save', value: val });
        } else {
          resolve(val);
        }
      };

      const handleCancel = () => {
        cleanup();
        if (showDelete) {
          resolve({ action: 'cancel' });
        } else {
          resolve(null);
        }
      };

      const handleDelete = () => {
        cleanup();
        resolve({ action: 'delete' });
      };

      const handleKey = (e) => {
        if (e.key === 'Escape') {
          handleCancel();
        } else if (e.key === 'Enter') {
          handleConfirm();
        }
      };

      window.addEventListener('keydown', handleKey);

      this.btnCancel.onclick = handleCancel;
      this.btnConfirm.onclick = handleConfirm;
      this.btnDelete.onclick = handleDelete;

      this.overlay.onclick = (e) => {
        if (e.target === this.overlay) {
          handleCancel();
        }
      };

      setTimeout(() => {
        this.inputElem.focus();
        this.inputElem.select();
      }, 50);
    });
  }

  edgeConfig(edge) {
    return new Promise((resolve) => {
      // Use the same classifier as the renderer, so an edge that displays green/red because
      // its verdict was inferred opens with that type preselected. Saving then pins the
      // inference into edge_type instead of leaving it ambiguous.
      let selectedType = classifyEdge(edge);
      const labelInput = document.getElementById('ec-label');
      const retriesInput = document.getElementById('ec-retries');
      const retriesGroup = document.getElementById('ec-retries-group');
      const btnSave = document.getElementById('ec-btn-save');
      const btnCancel = document.getElementById('ec-btn-cancel');
      const btnDelete = document.getElementById('ec-btn-delete');
      const typeBtns = this.edgeOverlay.querySelectorAll('.edge-type-btn');

      labelInput.value = edge.label || (selectedType === 'pass' ? 'Approved' : (selectedType === 'fail' ? 'Reject & Refine' : 'Next'));
      retriesInput.value = edge.max_retries !== undefined ? edge.max_retries : 3;

      const updateTypeUI = () => {
        typeBtns.forEach(btn => {
          if (btn.dataset.type === selectedType) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
        if (selectedType === 'fail') {
          retriesGroup.classList.remove('hidden');
        } else {
          retriesGroup.classList.add('hidden');
        }
      };

      typeBtns.forEach(btn => {
        btn.onclick = () => {
          selectedType = btn.dataset.type;
          updateTypeUI();
        };
      });

      updateTypeUI();
      this.edgeOverlay.classList.remove('hidden');

      const cleanup = () => {
        this.edgeOverlay.classList.add('hidden');
        window.removeEventListener('keydown', handleKey);
      };

      const handleKey = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve({ action: 'cancel' });
        }
      };

      window.addEventListener('keydown', handleKey);

      btnCancel.onclick = () => {
        cleanup();
        resolve({ action: 'cancel' });
      };

      btnDelete.onclick = () => {
        cleanup();
        resolve({ action: 'delete' });
      };

      btnSave.onclick = () => {
        cleanup();
        resolve({
          action: 'save',
          edge_type: selectedType,
          label: labelInput.value.trim() || (selectedType === 'pass' ? 'PASS' : (selectedType === 'fail' ? 'FAIL' : 'NEXT')),
          max_retries: parseInt(retriesInput.value, 10) || 3
        });
      };

      this.edgeOverlay.onclick = (e) => {
        if (e.target === this.edgeOverlay) {
          cleanup();
          resolve({ action: 'cancel' });
        }
      };
    });
  }

  browseDirectory({
    title = 'Export Destination Folder',
    message = 'Browse or select target destination folder on disk to write files:',
    initialPath = './workspace',
    confirmText = 'Export Files',
    projectBookmark = null
  }) {
    return new Promise((resolve) => {
      this.dbTitle.textContent = title;
      this.dbSub.textContent = message;
      this.dbBtnConfirm.textContent = confirmText;

      let currentBrowsingDir = initialPath;
      let selectedPath = initialPath;
      let lastParentDir = null;

      this.dbPathInput.value = selectedPath;
      this.dbNewFolderRow.classList.add('hidden');
      this.dbNewFolderInput.value = '';

      const render = (data) => {
        currentBrowsingDir = data.absolutePath;
        lastParentDir = data.parentPath;
        this.dbBtnUp.disabled = !data.parentPath;

        // Render Breadcrumbs
        const crumbs = data.breadcrumbs || [];
        this.dbBreadcrumbs.innerHTML = crumbs.map((c, i) => `
          <button type="button" class="db-crumb ${i === crumbs.length - 1 ? 'active' : ''}" data-path="${c.path}">${c.name || '/'}</button>
        `).join('<span class="db-crumb-sep">/</span>');

        this.dbBreadcrumbs.querySelectorAll('.db-crumb').forEach(btn => {
          btn.addEventListener('click', () => {
            loadDir(btn.dataset.path);
          });
        });

        // Render Bookmarks
        const bms = [...(data.bookmarks || [])];
        if (projectBookmark && !bms.some(b => b.path === projectBookmark.path)) {
          bms.unshift(projectBookmark);
        }
        this.dbBookmarksList.innerHTML = bms.map(b => `
          <button type="button" class="db-bm-btn" data-path="${b.path}" title="${b.path}">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span>${b.name}</span>
          </button>
        `).join('');

        this.dbBookmarksList.querySelectorAll('.db-bm-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            loadDir(btn.dataset.path);
          });
        });

        // Render Directory list
        if (!data.directories || data.directories.length === 0) {
          this.dbDirList.innerHTML = `
            <div class="db-empty-state">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" style="stroke: var(--border-active)" stroke-width="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <div class="db-empty-text">No subfolders in this directory</div>
              <div class="db-empty-sub">Files will be exported directly into <code>${data.currentPath}</code></div>
            </div>
          `;
          return;
        }

        this.dbDirList.innerHTML = data.directories.map(d => `
          <div class="db-dir-item ${selectedPath === d.path ? 'selected' : ''}" data-path="${d.path}">
            <div class="db-dir-icon">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" style="stroke: var(--sky-core)" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <span class="db-dir-name">${d.name}</span>
            <button type="button" class="btn-icon db-btn-enter" title="Open directory">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        `).join('');

        this.dbDirList.querySelectorAll('.db-dir-item').forEach(item => {
          const itemPath = item.dataset.path;
          item.addEventListener('click', (e) => {
            if (e.target.closest('.db-btn-enter')) {
              loadDir(itemPath);
              return;
            }
            this.dbDirList.querySelectorAll('.db-dir-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedPath = itemPath;
            this.dbPathInput.value = selectedPath;
          });

          item.addEventListener('dblclick', () => {
            loadDir(itemPath);
          });
        });
      };

      const loadDir = async (pathStr) => {
        try {
          this.dbDirList.innerHTML = `<div class="db-loading">Loading directory contents...</div>`;
          const res = await fetch(`/api/filesystem/directories?path=${encodeURIComponent(pathStr)}`);
          const data = await res.json();
          if (data.success) {
            selectedPath = data.currentPath || data.absolutePath;
            this.dbPathInput.value = selectedPath;
            render(data);
          } else {
            this.dbDirList.innerHTML = `<div class="db-error">${data.error || 'Failed to read directory'}</div>`;
          }
        } catch (err) {
          this.dbDirList.innerHTML = `<div class="db-error">${err.message}</div>`;
        }
      };

      this.dbBtnUp.onclick = () => {
        if (lastParentDir) {
          loadDir(lastParentDir);
        }
      };

      this.dbBtnMkdirToggle.onclick = () => {
        this.dbNewFolderRow.classList.toggle('hidden');
        if (!this.dbNewFolderRow.classList.contains('hidden')) {
          this.dbNewFolderInput.focus();
        }
      };

      this.dbBtnCancelFolder.onclick = () => {
        this.dbNewFolderRow.classList.add('hidden');
        this.dbNewFolderInput.value = '';
      };

      this.dbBtnCreateFolder.onclick = async () => {
        const folderName = this.dbNewFolderInput.value.trim();
        if (!folderName) return;
        try {
          const res = await fetch('/api/filesystem/mkdir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parentPath: currentBrowsingDir, folderName })
          });
          const data = await res.json();
          if (data.success) {
            this.dbNewFolderRow.classList.add('hidden');
            this.dbNewFolderInput.value = '';
            this.toast(`Created folder "${folderName}"`, 'success');
            await loadDir(data.createdPath);
          } else {
            this.toast(data.error || 'Failed to create folder', 'error');
          }
        } catch (err) {
          this.toast(err.message, 'error');
        }
      };

      this.dbNewFolderInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.dbBtnCreateFolder.click();
        } else if (e.key === 'Escape') {
          this.dbBtnCancelFolder.click();
        }
      };

      const cleanup = () => {
        this.dirBrowserOverlay.classList.add('hidden');
        window.removeEventListener('keydown', handleKey);
      };

      const handleKey = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve({ action: 'cancel' });
        } else if (e.key === 'Enter' && document.activeElement !== this.dbNewFolderInput) {
          cleanup();
          resolve({ action: 'confirm', path: this.dbPathInput.value.trim() });
        }
      };

      window.addEventListener('keydown', handleKey);

      this.dbBtnCancel.onclick = () => {
        cleanup();
        resolve({ action: 'cancel' });
      };

      this.dbBtnConfirm.onclick = () => {
        cleanup();
        resolve({ action: 'confirm', path: this.dbPathInput.value.trim() });
      };

      this.dirBrowserOverlay.onclick = (e) => {
        if (e.target === this.dirBrowserOverlay) {
          cleanup();
          resolve({ action: 'cancel' });
        }
      };

      this.dirBrowserOverlay.classList.remove('hidden');
      loadDir(initialPath);
    });
  }

  toast(message, type = 'info', duration = 3200) {
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" style="stroke: var(--emerald-core)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" style="stroke: var(--red-core)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" style="stroke: var(--blue-core)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-text">${message}</span>
    `;

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }
}

export const dialog = new DialogManager();
