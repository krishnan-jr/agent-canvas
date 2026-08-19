/**
 * In-DOM Custom Dialog & Toast System (Obsidian Canvas Dark Theme)
 * Strictly vector SVG icons - No emojis in UI (per GEMINI.md standards)
 */

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
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#3b82f6" stroke-width="2">
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
  }

  confirm({ title = 'Confirm Action', message = 'Are you sure?', confirmText = 'OK', cancelText = 'Cancel', isDanger = true }) {
    return new Promise((resolve) => {
      this.titleElem.textContent = title;
      this.messageElem.textContent = message;
      this.inputWrapper.classList.add('hidden');
      this.btnDelete.classList.add('hidden');
      
      this.iconElem.innerHTML = isDanger
        ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ef4444" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`
        : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

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

  prompt({ title = 'Edit', message = '', defaultValue = '', placeholder = '', showDelete = false, confirmText = 'Save' }) {
    return new Promise((resolve) => {
      this.titleElem.textContent = title;
      this.messageElem.textContent = message;
      this.inputWrapper.classList.remove('hidden');
      this.inputElem.value = defaultValue;
      this.inputElem.placeholder = placeholder;
      
      this.iconElem.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;

      this.btnConfirm.textContent = confirmText;
      this.btnConfirm.className = 'btn btn-primary';
      this.btnCancel.textContent = 'Cancel';

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

      const handleKey = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve({ action: 'cancel' });
        } else if (e.key === 'Enter') {
          cleanup();
          resolve({ action: 'save', value: this.inputElem.value });
        }
      };

      window.addEventListener('keydown', handleKey);

      this.btnCancel.onclick = () => {
        cleanup();
        resolve({ action: 'cancel' });
      };

      this.btnConfirm.onclick = () => {
        cleanup();
        resolve({ action: 'save', value: this.inputElem.value });
      };

      this.btnDelete.onclick = () => {
        cleanup();
        resolve({ action: 'delete' });
      };

      this.overlay.onclick = (e) => {
        if (e.target === this.overlay) {
          cleanup();
          resolve({ action: 'cancel' });
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
      let selectedType = edge.edge_type || 'default';
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

  toast(message, type = 'info', duration = 3200) {
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#3b82f6" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
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
