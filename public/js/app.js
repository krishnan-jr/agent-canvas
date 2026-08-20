import { CanvasEngine } from './canvas.js';
import { OrchestrationRunner } from './orchestrator.js';
import { renderMarkdown, estimateTokens, escapeHtml } from './markdown.js';
import { dialog } from './dialog.js';
import { ProjectManager } from './projects.js';
import { ExportStudio } from './exportStudio.js';
import { SkillsManager } from './skillsManager.js';
import { validateAgentSchema, validateGraphTopology, parseAgentYaml, FIELD_DOCUMENTATION, UNIVERSAL_ROLES, UNIVERSAL_ROLE_DEFINITIONS } from './validator.js';

// Pre-configured agent block templates
const TEMPLATES = {
  assistant: {
    title: 'Assistant Agent',
    filename: 'assistant.md',
    content: `---
role: assistant
model: claude-3-5-sonnet
temperature: 0.7
tools: [bash, file_writer]
---

# Assistant Agent

Coordinates responses, validates inputs, and produces structured markdown summaries.

### Instructions
1. Receive task context from upstream planner.
2. Formulate step-by-step breakdown.
3. Return verified response.
`
  },
  researcher: {
    title: 'Research Agent',
    filename: 'researcher.md',
    content: `---
role: researcher
model: gemini-3.7-flash
tools: [web_search, browser_page]
temperature: 0.2
---

# Research Agent

Specialized agent responsible for real-time web lookups, documentation parsing, and cross-referencing facts.

### Capabilities
- Extract key insights from URLs
- Synthesize conflicting sources
- Output clean references
`
  },
  evaluator: {
    title: 'Critic & Guardrails',
    filename: 'evaluator.md',
    content: `---
role: evaluator
model: claude-3-5-haiku
temperature: 0.1
---

# Evaluator & Guardrails

Verifies factual consistency, policy compliance, and test verification before delivering output.

- [x] Check schema validation
- [x] Enforce safety constraints
- [x] Assert output completeness
`
  },
  router: {
    title: 'Decision Router',
    filename: 'router.md',
    content: `---
role: router
model: gemini-3.7-flash
temperature: 0.0
---

# Decision Router

Evaluates the user intent and branches the execution path to the designated sub-agents.

- **Route A**: Code Generation -> coder.md
- **Route B**: Deep Search -> researcher.md
- **Route C**: Direct Answer
`
  },
  tool: {
    title: 'Database Tool Spec',
    filename: 'sqlite_tool.md',
    content: `---
role: tool
type: sqlite_query
database: canvas.db
---

# SQLite Query Tool

Provides structured query capabilities over native \`node:sqlite\` storage.

\`\`\`sql
SELECT id, filename, created_at 
FROM nodes 
ORDER BY updated_at DESC;
\`\`\`
`
  }
};

class App {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.activeEditorNode = null;

    const container = document.getElementById('viewport');
    const world = document.getElementById('canvas-world');
    const svg = document.getElementById('connections-svg');
    const nodesLayer = document.getElementById('nodes-container');

    this.canvas = new CanvasEngine({
      container,
      world,
      svg,
      nodesLayer,
      onNodeChange: (node) => this.handleNodeUpdate(node),
      onNodeDelete: (id) => this.handleNodeDelete(id),
      onEdgeCreate: (edge) => this.handleEdgeCreate(edge),
      onEdgeDelete: (id) => this.handleEdgeDelete(id),
      onEdgeUpdate: (edge) => this.handleEdgeUpdate(edge),
      onNodeSelect: (node) => {},
      onOpenEditor: (node) => this.openEditorModal(node)
    });

    this.orchestrator = new OrchestrationRunner(this.canvas);
    this.exportStudio = new ExportStudio(this);
    this.skillsManager = new SkillsManager(this);

    this.projectManager = new ProjectManager({
      onProjectSelect: (project) => this.switchProject(project)
    });

    this.initUI();
    this.bootstrap();
  }

  initUI() {
    // Project Selector Button (Header breadcrumb)
    const btnProjectSelector = document.getElementById('btn-project-selector');
    if (btnProjectSelector) {
      btnProjectSelector.addEventListener('click', () => {
        this.projectManager.openModal();
      });
    }

    // Skills Library Button (Header nav)
    const btnSkillsLibrary = document.getElementById('btn-skills-library');
    if (btnSkillsLibrary) {
      btnSkillsLibrary.addEventListener('click', () => {
        this.skillsManager.open();
      });
    }

    // Zoom Controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      this.canvas.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.2);
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      this.canvas.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.8);
    });
    document.getElementById('btn-zoom-fit').addEventListener('click', () => {
      this.canvas.fitToView();
    });
    document.getElementById('btn-zoom-reset').addEventListener('click', () => {
      this.canvas.resetZoom();
    });

    // Add Block Button
    document.getElementById('btn-add-block').addEventListener('click', () => {
      this.createNodeFromTemplate('assistant');
    });

    // Run Workflow Button
    document.getElementById('btn-run-workflow').addEventListener('click', () => {
      this.orchestrator.runWorkflow(this.nodes, this.edges, this.currentProjectId);
    });

    // Auto Layout Button
    const btnAutoLayout = document.getElementById('btn-auto-layout');
    if (btnAutoLayout) {
      btnAutoLayout.addEventListener('click', () => {
        this.canvas.autoLayout();
      });
    }

    // Workspace Files Sidebar Toggle
    const sidebar = document.getElementById('file-sidebar');
    document.getElementById('btn-toggle-files').addEventListener('click', () => {
      sidebar.classList.toggle('hidden');
      if (!sidebar.classList.contains('hidden')) {
        this.loadWorkspaceFiles();
      }
    });
    document.getElementById('btn-close-sidebar').addEventListener('click', () => {
      sidebar.classList.add('hidden');
    });

    document.getElementById('btn-sync-workspace').addEventListener('click', () => {
      this.syncWorkspaceDisk();
    });

    // Export Button -> Opens Multi-Target Export Studio
    document.getElementById('btn-export-bundle').addEventListener('click', () => {
      this.exportStudio.open();
    });

    // 3-Dot More Actions Menu
    const btnMore = document.getElementById('btn-more-menu');
    const moreDropdown = document.getElementById('nav-more-dropdown');
    if (btnMore && moreDropdown) {
      btnMore.addEventListener('click', (e) => {
        e.stopPropagation();
        moreDropdown.classList.toggle('hidden');
      });

      moreDropdown.querySelectorAll('.nav-dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
          moreDropdown.classList.add('hidden');
        });
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#nav-more-menu-wrapper')) {
          moreDropdown.classList.add('hidden');
        }
      });
    }

    // MCP Server Connect Modal
    this.initMcpModal();

    // Graph Diagnostics Pill
    this.initGraphDiagnostics();

    // Modal Editor UI
    this.initModalEditor();
  }

  initMcpModal() {
    const btnMcp = document.getElementById('btn-mcp-server');
    const modal = document.getElementById('mcp-modal');
    const closeBtn = document.getElementById('btn-close-mcp-modal');

    if (!btnMcp || !modal) return;

    btnMcp.addEventListener('click', () => {
      modal.classList.remove('hidden');
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    // Tab switching
    const tabBtns = modal.querySelectorAll('.mcp-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const targetTabId = `mcp-tab-${btn.dataset.mcpTab}`;
        modal.querySelectorAll('.mcp-tab-content').forEach(content => {
          content.classList.toggle('hidden', content.id !== targetTabId);
          content.classList.toggle('active', content.id === targetTabId);
        });
      });
    });

    // Copy buttons
    modal.querySelectorAll('.btn-copy-mcp').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.copyTarget;
        const codeElem = document.getElementById(targetId);
        if (codeElem) {
          navigator.clipboard.writeText(codeElem.textContent.trim());
          dialog.toast('MCP configuration copied to clipboard', 'success');
        }
      });
    });

    // Dynamically resolve local machine paths from backend
    this.loadMcpConfig();
  }

  async loadMcpConfig() {
    try {
      const res = await fetch('/api/mcp/config');
      const data = await res.json();
      if (!data.success || !data.configs) return;

      const setSnippet = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      setSnippet('mcp-snippet-opencode', JSON.stringify(data.configs.opencode, null, 2));
      setSnippet('mcp-snippet-claudecode-cli', data.configs.claudecode_cli);
      setSnippet('mcp-snippet-claudecode-json', JSON.stringify(data.configs.claudecode_json, null, 2));
      setSnippet('mcp-snippet-claude', JSON.stringify(data.configs.claude, null, 2));
      setSnippet('mcp-snippet-cursor', JSON.stringify(data.configs.cursor, null, 2));
      setSnippet('mcp-snippet-antigravity', JSON.stringify(data.configs.antigravity, null, 2));
      setSnippet('mcp-snippet-cline', JSON.stringify(data.configs.cline, null, 2));

      const sseUrlEl = document.getElementById('mcp-sse-url');
      if (sseUrlEl && data.sseUrl) sseUrlEl.textContent = data.sseUrl;

      const msgUrlEl = document.getElementById('mcp-msg-url');
      if (msgUrlEl && data.origin) msgUrlEl.textContent = `${data.origin}/api/mcp/message`;
    } catch (err) {
      console.warn('Could not load dynamic MCP config:', err);
    }
  }

  initGraphDiagnostics() {
    const pill = document.getElementById('graph-health-pill');
    const popover = document.getElementById('graph-diagnostics-popover');
    const closeBtn = document.getElementById('btn-close-diagnostics');

    if (pill && popover) {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        popover.classList.toggle('hidden');
      });

      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          popover.classList.add('hidden');
        });
      }

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#graph-health-pill') && !e.target.closest('#graph-diagnostics-popover')) {
          popover.classList.add('hidden');
        }
      });
    }
  }

  updateGraphDiagnostics() {
    const pill = document.getElementById('graph-health-pill');
    const label = document.getElementById('graph-health-label');
    const list = document.getElementById('diagnostics-list');
    if (!pill || !label) return;

    const skills = this.skillsManager ? this.skillsManager.skills : [];
    const result = validateGraphTopology(this.nodes, this.edges, skills);

    pill.className = 'graph-health-pill';
    if (result.errorsCount > 0) {
      pill.classList.add('has-errors');
      label.textContent = `${result.errorsCount} Error${result.errorsCount > 1 ? 's' : ''}`;
    } else if (result.warningsCount > 0) {
      pill.classList.add('has-warnings');
      label.textContent = `${result.warningsCount} Warning${result.warningsCount > 1 ? 's' : ''}`;
    } else {
      pill.classList.add('healthy');
      label.textContent = 'Graph Healthy';
    }

    if (list) {
      if (result.issues.length === 0) {
        list.innerHTML = `
          <div class="diagnostic-item item-valid" style="border-color: rgba(16, 185, 129, 0.3); background-color: rgba(16, 185, 129, 0.05);">
            <div class="diagnostic-msg-group">
              <span class="diagnostic-type-tag" style="color: #10b981;">Topology Validated</span>
              <span class="diagnostic-msg-text">All decision loops, route contracts, and skills are healthy.</span>
            </div>
          </div>
        `;
      } else {
        list.innerHTML = result.issues.map(issue => `
          <div class="diagnostic-item item-${issue.type}">
            <div class="diagnostic-msg-group">
              <span class="diagnostic-type-tag ${issue.type}">${issue.type}</span>
              <span class="diagnostic-msg-text">${escapeHtml(issue.message)}</span>
            </div>
            ${issue.nodeId ? `
              <button type="button" class="btn btn-secondary btn-xs diagnostic-focus-btn" data-node-id="${issue.nodeId}">
                Focus
              </button>
            ` : ''}
          </div>
        `).join('');

        list.querySelectorAll('.diagnostic-focus-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nodeId = btn.dataset.nodeId;
            if (nodeId && this.canvas) {
              this.canvas.focusNode(nodeId);
            }
          });
        });
      }
    }

    if (this.canvas) {
      this.canvas.setNodeDiagnostics(result.nodeIssuesMap);
    }
  }

  initModalEditor() {
    const modal = document.getElementById('editor-modal');
    const textarea = document.getElementById('modal-editor-textarea');
    const preview = document.getElementById('modal-preview-content');
    const filenameInput = document.getElementById('modal-filename');
    const statusPill = document.getElementById('editor-validation-status');
    const statusText = document.getElementById('validation-status-text');
    const banner = document.getElementById('editor-validation-banner');
    const lineIndicator = document.getElementById('editor-line-indicator');

    // Initialize draggable split resizer between editor and preview
    this.initEditorSplitResizer();

    // Create or select floating rich tooltip element
    let tooltipElem = document.getElementById('field-tooltip-popover');
    if (!tooltipElem) {
      tooltipElem = document.createElement('div');
      tooltipElem.id = 'field-tooltip-popover';
      tooltipElem.className = 'field-tooltip hidden';
      document.body.appendChild(tooltipElem);
    }

    // Role selector dropdown setup
    const rolePickerBtn = document.getElementById('btn-toggle-editor-role-picker');
    const roleDropdown = document.getElementById('editor-role-dropdown');
    const roleDropdownList = document.getElementById('editor-role-dropdown-list');
    const rolePickerLabel = document.getElementById('editor-role-picker-label');
    const roleDot = document.getElementById('editor-role-dot');

    if (roleDropdownList) {
      const footerDesc = document.getElementById('role-dropdown-footer-desc');

      const itemsHtml = [
        `
        <div class="role-dropdown-item" data-role="" title="General standalone agent without specific role constraint">
          <span class="role-item-badge role-none">none</span>
          <div class="role-item-info">
            <span class="role-item-title">No Role (Optional)</span>
            <span class="role-item-desc">General standalone agent without specific role constraint</span>
          </div>
        </div>
        `,
        ...UNIVERSAL_ROLE_DEFINITIONS.map(r => `
        <div class="role-dropdown-item" data-role="${r.role}" title="${escapeHtml(r.desc)}">
          <span class="role-item-badge" style="color: ${r.color}; border-color: ${r.color}66; background-color: ${r.color}15;">${r.role}</span>
          <div class="role-item-info">
            <span class="role-item-title">${r.label}</span>
            <span class="role-item-desc">${escapeHtml(r.shortDesc || r.desc)}</span>
          </div>
        </div>
        `)
      ].join('');

      roleDropdownList.innerHTML = itemsHtml;

      const updateFooterToActive = () => {
        if (!footerDesc) return;
        const val = textarea.value;
        const { frontmatter } = parseAgentYaml(val);
        const curRole = frontmatter.role ? String(frontmatter.role).toLowerCase() : '';
        if (curRole) {
          const def = UNIVERSAL_ROLE_DEFINITIONS.find(r => r.role === curRole);
          footerDesc.textContent = def ? `${def.label}: ${def.desc}` : `Role: ${curRole}`;
        } else {
          footerDesc.textContent = 'No specific role set. Agent executes as a general standalone component.';
        }
      };

      roleDropdownList.querySelectorAll('.role-dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
          const role = item.dataset.role;
          this.setAgentRole(textarea, role);
          if (roleDropdown) roleDropdown.classList.add('hidden');
          updateValidation();
        });

        item.addEventListener('mouseenter', () => {
          const role = item.dataset.role;
          if (footerDesc) {
            if (role) {
              const def = UNIVERSAL_ROLE_DEFINITIONS.find(r => r.role === role);
              footerDesc.textContent = def ? `${def.label}: ${def.desc}` : `Role: ${role}`;
            } else {
              footerDesc.textContent = 'None: General standalone agent without specific role or orchestration constraints.';
            }
          }
        });

        item.addEventListener('mouseleave', () => {
          updateFooterToActive();
        });
      });
    }

    if (rolePickerBtn && roleDropdown) {
      rolePickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        roleDropdown.classList.toggle('hidden');
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#editor-role-picker-wrapper')) {
          roleDropdown.classList.add('hidden');
        }
      });
    }

    const updateValidation = () => {
      const val = textarea.value;
      const res = validateAgentSchema(val);
      const { frontmatter } = parseAgentYaml(val);

      preview.innerHTML = renderMarkdown(val);

      // Update validation status badge and banner
      if (!res.valid || (res.errors && res.errors.length > 0)) {
        statusPill.className = 'validation-status-pill invalid';
        statusText.textContent = res.errors[0]?.message || 'Invalid YAML Syntax';
        banner.className = 'validation-banner error';
        banner.classList.remove('hidden');
        banner.innerHTML = `<strong>Error (Line ${res.errors[0]?.line || 1}):</strong> ${res.errors[0]?.message}`;
      } else if (res.warnings && res.warnings.length > 0) {
        statusPill.className = 'validation-status-pill warning';
        statusText.textContent = `${res.warnings.length} Schema Warning${res.warnings.length === 1 ? '' : 's'}`;
        banner.className = 'validation-banner warning';
        banner.classList.remove('hidden');
        banner.innerHTML = `<strong>Recommendation:</strong> ${res.warnings[0].message}`;
      } else {
        statusPill.className = 'validation-status-pill valid';
        statusText.textContent = 'Universal Schema Valid';
        banner.classList.add('hidden');
      }

      // Sync role UI controls (picker label, dot, active dropdown item)
      const currentRole = frontmatter.role ? String(frontmatter.role).toLowerCase() : '';
      if (rolePickerLabel) {
        rolePickerLabel.textContent = currentRole ? `Role: ${currentRole}` : 'Role: None';
      }
      if (roleDot) {
        roleDot.className = currentRole ? `role-dot role-${currentRole}` : 'role-dot role-none';
      }
      if (roleDropdownList) {
        roleDropdownList.querySelectorAll('.role-dropdown-item').forEach(item => {
          const itemRole = item.dataset.role;
          if (itemRole === currentRole) {
            item.classList.add('active');
          } else {
            item.classList.remove('active');
          }
        });
      }

      // Update Presence state on toolbar chips
      const chips = document.querySelectorAll('#editor-field-chips .field-chip');
      chips.forEach(chip => {
        const field = chip.dataset.field;
        const exists = (field === 'routes')
          ? (Array.isArray(frontmatter.routes) && frontmatter.routes.length > 0)
          : (field === 'skills')
          ? (Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0)
          : (frontmatter[field] !== undefined);

        if (exists) {
          chip.classList.add('is-present');
          chip.innerHTML = `<svg class="chip-icon" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ${field}`;
        } else {
          chip.classList.remove('is-present');
          chip.textContent = `+ ${field}`;
        }
      });

      // Update skills picker label & checkboxes
      if (this.syncEditorSkillsPicker) {
        this.syncEditorSkillsPicker(val);
      }
    };

    // Skills multi-select dropdown setup
    const skillsPickerBtn = document.getElementById('btn-toggle-editor-skills-picker');
    const skillsDropdown = document.getElementById('editor-skills-dropdown');
    const skillsDropdownList = document.getElementById('editor-skills-dropdown-list');
    const skillsPickerLabel = document.getElementById('editor-skills-picker-label');

    if (skillsPickerBtn && skillsDropdown) {
      skillsPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        skillsDropdown.classList.toggle('hidden');
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#editor-skills-picker-wrapper')) {
          skillsDropdown.classList.add('hidden');
        }
      });
    }

    this.syncEditorSkillsPicker = (val) => {
      const { frontmatter } = parseAgentYaml(val || textarea.value);
      const linked = Array.isArray(frontmatter.skills) ? frontmatter.skills.map(s => String(s).trim().toLowerCase()) : [];
      if (skillsPickerLabel) {
        skillsPickerLabel.textContent = `Link Skills (${linked.length})`;
      }

      if (!skillsDropdownList) return;
      const allSkills = this.skillsManager ? this.skillsManager.skills : [];
      if (allSkills.length === 0) {
        skillsDropdownList.innerHTML = `
          <div class="skills-dropdown-empty">
            <span>No skills defined in library</span>
            <button type="button" class="btn btn-primary btn-xs" id="btn-dropdown-create-skill">Create Skill</button>
          </div>
        `;
        document.getElementById('btn-dropdown-create-skill')?.addEventListener('click', () => {
          skillsDropdown.classList.add('hidden');
          this.skillsManager.open();
        });
        return;
      }

      skillsDropdownList.innerHTML = allSkills.map(s => {
        const isChecked = linked.includes(s.name.toLowerCase());
        return `
          <label class="skills-dropdown-item">
            <input type="checkbox" class="skill-checkbox" value="${s.name}" ${isChecked ? 'checked' : ''} />
            <div class="skill-dropdown-info">
              <span class="skill-dropdown-name">${s.name}</span>
              <span class="skill-dropdown-desc">${s.description || 'Modular skill package'}</span>
            </div>
          </label>
        `;
      }).join('');

      skillsDropdownList.querySelectorAll('.skill-checkbox').forEach(chk => {
        chk.addEventListener('change', () => {
          const selected = Array.from(skillsDropdownList.querySelectorAll('.skill-checkbox:checked')).map(c => c.value);
          this.updateAgentSkillsFrontmatter(textarea, selected);
          updateValidation();
        });
      });
    };

    textarea.addEventListener('input', updateValidation);

    textarea.addEventListener('keyup', () => {
      const textBefore = textarea.value.substring(0, textarea.selectionStart);
      const lineNum = textBefore.split('\n').length;
      if (lineIndicator) lineIndicator.textContent = `Line ${lineNum}`;
    });

    // Field insertion chips and rich hover tooltips
    const chipsContainer = document.getElementById('editor-field-chips');
    if (chipsContainer) {
      chipsContainer.querySelectorAll('.field-chip').forEach(btn => {
        const field = btn.dataset.field;
        const doc = FIELD_DOCUMENTATION[field];

        // Click to insert or jump to existing property
        btn.addEventListener('click', () => {
          this.insertFrontmatterField(textarea, field);
          updateValidation();
        });

        // Hover tooltip events
        btn.addEventListener('mouseenter', () => {
          if (!doc) return;
          const rect = btn.getBoundingClientRect();

          const harnessListHtml = (doc.harnesses || []).map(h => `
            <div class="tooltip-harness-item">
              <span class="harness-name">${h.name}</span>
              <span class="harness-badge ${h.support.toLowerCase()}">${h.support}</span>
              <span class="harness-note">${h.note}</span>
            </div>
          `).join('');

          let acceptedRolesHtml = '';
          if (doc.roleDefinitions && Array.isArray(doc.roleDefinitions)) {
            acceptedRolesHtml = `
              <div class="tooltip-section-title">Accepted Universal Roles</div>
              <div class="tooltip-roles-grid">
                ${doc.roleDefinitions.map(r => `
                  <div class="tooltip-role-row">
                    <span class="tooltip-role-badge" style="color: ${r.color}; border-color: ${r.color}55; background-color: ${r.color}15;">${r.role}</span>
                    <span class="tooltip-role-desc">${r.desc}</span>
                  </div>
                `).join('')}
              </div>
            `;
          }

          tooltipElem.innerHTML = `
            <div class="tooltip-header">
              <div class="tooltip-prop-title">
                <span class="tooltip-prop-name">${doc.label}</span>
                <span class="tooltip-prop-type">${doc.type}</span>
              </div>
            </div>
            <div class="tooltip-desc">${doc.description}</div>
            ${acceptedRolesHtml}
            <div class="tooltip-section-title">Supported Harnesses & Platforms</div>
            <div class="tooltip-harnesses">${harnessListHtml}</div>
            <div class="tooltip-section-title">Example Syntax</div>
            <pre class="tooltip-snippet"><code>${doc.example}</code></pre>
          `;

          tooltipElem.classList.remove('hidden');

          // Position tooltip below or above the button
          const tooltipRect = tooltipElem.getBoundingClientRect();
          let top = rect.bottom + 8;
          let left = rect.left;

          if (left + tooltipRect.width > window.innerWidth - 20) {
            left = window.innerWidth - tooltipRect.width - 20;
          }
          if (top + tooltipRect.height > window.innerHeight - 20) {
            top = rect.top - tooltipRect.height - 8;
          }

          tooltipElem.style.top = `${Math.max(10, top)}px`;
          tooltipElem.style.left = `${Math.max(10, left)}px`;
        });

        btn.addEventListener('mouseleave', () => {
          tooltipElem.classList.add('hidden');
        });
      });
    }

    document.getElementById('btn-modal-save').addEventListener('click', async () => {
      if (!this.activeEditorNode) return;
      const newFilename = filenameInput.value.trim() || this.activeEditorNode.filename;
      const newContent = textarea.value;
      const newTitle = newFilename.replace(/\.md$/, '');

      this.activeEditorNode.filename = newFilename;
      this.activeEditorNode.title = newTitle;
      this.activeEditorNode.content = newContent;

      await this.handleNodeUpdate(this.activeEditorNode);
      this.canvas.updateNodeContent(this.activeEditorNode);
      this.updateStats();
      modal.classList.add('hidden');
      tooltipElem.classList.add('hidden');
    });

    document.getElementById('btn-modal-close').addEventListener('click', () => {
      modal.classList.add('hidden');
      tooltipElem.classList.add('hidden');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        tooltipElem.classList.add('hidden');
      }
    });
  }

  setAgentRole(textarea, roleName) {
    let content = textarea.value;
    const isClearing = !roleName || roleName === 'none';
    const roleLine = isClearing ? '' : `role: ${roleName}`;

    if (content.startsWith('---')) {
      const secondDash = content.indexOf('---', 3);
      if (secondDash > 0) {
        let ymlContent = content.slice(3, secondDash).trim();
        const lines = ymlContent.split('\n');
        let found = false;
        const newLines = [];
        for (const l of lines) {
          if (l.trim().startsWith('role:')) {
            found = true;
            if (roleLine) newLines.push(roleLine);
          } else {
            newLines.push(l);
          }
        }
        if (!found && roleLine) {
          newLines.unshift(roleLine);
        }
        const rawBody = content.slice(secondDash + 3);
        const bodyContent = rawBody.replace(/^[\r\n]+/, '');
        content = bodyContent ? `---\n${newLines.join('\n')}\n---\n\n${bodyContent}` : `---\n${newLines.join('\n')}\n---`;
      }
    } else if (roleLine) {
      const bodyContent = content.replace(/^[\r\n]+/, '');
      content = bodyContent ? `---\n${roleLine}\n---\n\n${bodyContent}` : `---\n${roleLine}\n---`;
    }

    textarea.value = content;
    if (isClearing) {
      dialog.toast('Cleared agent role (Optional)', 'info');
    } else {
      dialog.toast(`Updated agent role to '${roleName}'`, 'info');
    }
  }

  updateAgentSkillsFrontmatter(textarea, selectedSkills = []) {
    let content = textarea.value;
    const skillsLine = selectedSkills.length > 0
      ? `skills: [${selectedSkills.join(', ')}]`
      : '';

    if (content.startsWith('---')) {
      const secondDash = content.indexOf('---', 3);
      if (secondDash > 0) {
        let ymlContent = content.slice(3, secondDash).trim();
        const lines = ymlContent.split('\n');
        let found = false;
        const newLines = [];
        for (const l of lines) {
          if (l.trim().startsWith('skills:')) {
            found = true;
            if (skillsLine) newLines.push(skillsLine);
          } else {
            newLines.push(l);
          }
        }
        if (!found && skillsLine) {
          newLines.push(skillsLine);
        }
        const rawBody = content.slice(secondDash + 3);
        const bodyContent = rawBody.replace(/^[\r\n]+/, '');
        content = bodyContent ? `---\n${newLines.join('\n')}\n---\n\n${bodyContent}` : `---\n${newLines.join('\n')}\n---`;
      }
    } else if (skillsLine) {
      const bodyContent = content.replace(/^[\r\n]+/, '');
      content = bodyContent ? `---\n${skillsLine}\n---\n\n${bodyContent}` : `---\n${skillsLine}\n---`;
    }

    textarea.value = content;
  }

  insertFrontmatterField(textarea, field) {
    let content = textarea.value;
    const { frontmatter } = parseAgentYaml(content);

    // If field is role, toggle open the role dropdown picker
    if (field === 'role') {
      const dropdown = document.getElementById('editor-role-dropdown');
      if (dropdown) dropdown.classList.toggle('hidden');
    }

    // If field is skills, toggle open the skills dropdown picker
    if (field === 'skills') {
      const dropdown = document.getElementById('editor-skills-dropdown');
      if (dropdown) dropdown.classList.toggle('hidden');
    }

    // Check if property is already defined in the frontmatter
    const isAlreadyPresent = (field === 'routes')
      ? (Array.isArray(frontmatter.routes) && frontmatter.routes.length > 0)
      : (field === 'skills')
      ? (Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0)
      : (frontmatter[field] !== undefined);

    if (isAlreadyPresent) {
      dialog.toast(`Property '${field}' already exists in frontmatter`, 'warning');

      // Find line containing this field and highlight / jump cursor to it
      const lines = content.split('\n');
      let charPos = 0;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const trimmed = l.trim();
        if (trimmed.startsWith(`${field}:`) || (field === 'routes' && trimmed.startsWith('routes:')) || (field === 'skills' && trimmed.startsWith('skills:'))) {
          textarea.focus();
          textarea.setSelectionRange(charPos, charPos + l.length);
          break;
        }
        charPos += l.length + 1;
      }
      return;
    }

    const snippets = {
      role: 'role: assistant',
      description: 'description: Specialized agent capability description',
      skills: 'skills: [git-workflow]',
      tools: 'tools: [file_reader, grep_search, bash]',
      routes: 'routes:\n  - on: pass\n    target: next-agent.md\n    label: "Approved"\n  - on: fail\n    target: planner.md\n    label: "Retry"\n    max_retries: 3',
      globs: 'globs: ["src/**/*.js", "api/**"]',
      model: 'model: claude-3-5-sonnet',
      temperature: 'temperature: 0.2'
    };

    const snippet = snippets[field];
    if (!snippet) return;

    let insertStartPos = 0;
    if (content.startsWith('---')) {
      const secondDash = content.indexOf('---', 3);
      if (secondDash > 0) {
        let yml = content.slice(3, secondDash).trimEnd();
        const bodyContent = content.slice(secondDash + 3).replace(/^[\r\n]+/, '');
        insertStartPos = yml.length + 4; // pos after opening --- \n yml \n
        const newYml = yml ? `${yml}\n${snippet}` : snippet;
        content = bodyContent ? `---\n${newYml}\n---\n\n${bodyContent}` : `---\n${newYml}\n---`;
      } else {
        insertStartPos = 4;
        const bodyContent = content.replace(/^[\r\n]+/, '');
        content = bodyContent ? `---\n${snippet}\n---\n\n${bodyContent}` : `---\n${snippet}\n---`;
      }
    } else {
      insertStartPos = 4;
      const bodyContent = content.replace(/^[\r\n]+/, '');
      content = bodyContent ? `---\n${snippet}\n---\n\n${bodyContent}` : `---\n${snippet}\n---`;
    }

    textarea.value = content;
    textarea.focus();
    // Highlight the newly inserted snippet
    textarea.setSelectionRange(insertStartPos, insertStartPos + snippet.length);
    dialog.toast(`Added ${field} to frontmatter`, 'info');
  }

  initEditorSplitResizer() {
    const resizer = document.getElementById('modal-split-resizer');
    const container = document.getElementById('modal-body-split');
    const editorPane = document.querySelector('.modal-editor-pane');
    const previewPane = document.querySelector('.modal-preview-pane');

    if (!resizer || !container || !editorPane || !previewPane) return;

    let isDragging = false;

    // Helper to apply percentage split
    const applySplit = (ratio) => {
      const clamped = Math.min(Math.max(ratio, 15), 85);
      editorPane.style.flex = `0 0 ${clamped}%`;
      editorPane.style.maxWidth = `${clamped}%`;
      previewPane.style.flex = `0 0 ${100 - clamped}%`;
      previewPane.style.maxWidth = `${100 - clamped}%`;
    };

    // Load saved split ratio or default to 50%
    const savedSplit = localStorage.getItem('agent_canvas_editor_split_pct');
    if (savedSplit) {
      const parsed = parseFloat(savedSplit);
      if (!isNaN(parsed) && parsed >= 15 && parsed <= 85) {
        applySplit(parsed);
      }
    }

    const onMouseDown = (e) => {
      isDragging = true;
      resizer.classList.add('is-dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      // Prevent child textareas and scrollable previews from capturing events
      const textarea = document.getElementById('modal-editor-textarea');
      const preview = document.getElementById('modal-preview-content');
      if (textarea) textarea.style.pointerEvents = 'none';
      if (preview) preview.style.pointerEvents = 'none';

      window.addEventListener('mousemove', onMouseMove, { passive: false });
      window.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;

      const offsetX = e.clientX - rect.left;
      const ratio = (offsetX / rect.width) * 100;
      const clamped = Math.min(Math.max(ratio, 15), 85);
      applySplit(clamped);
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      resizer.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      const textarea = document.getElementById('modal-editor-textarea');
      const preview = document.getElementById('modal-preview-content');
      if (textarea) textarea.style.pointerEvents = '';
      if (preview) preview.style.pointerEvents = '';

      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const rect = container.getBoundingClientRect();
      if (rect.width > 0) {
        const editorWidth = editorPane.getBoundingClientRect().width;
        const currentPct = (editorWidth / rect.width) * 100;
        localStorage.setItem('agent_canvas_editor_split_pct', currentPct.toFixed(1));
      }
    };

    resizer.addEventListener('mousedown', onMouseDown);

    // Double-click to reset to 50 / 50
    resizer.addEventListener('dblclick', () => {
      applySplit(50);
      localStorage.setItem('agent_canvas_editor_split_pct', '50.0');
      dialog.toast('Editor panes reset to 50 / 50', 'info');
    });
  }

  async openEditorModal(node) {
    this.activeEditorNode = node;
    const modal = document.getElementById('editor-modal');
    const textarea = document.getElementById('modal-editor-textarea');
    const preview = document.getElementById('modal-preview-content');
    const filenameInput = document.getElementById('modal-filename');

    filenameInput.value = node.filename || `${node.title}.md`;
    textarea.value = node.content || '';
    preview.innerHTML = renderMarkdown(node.content || '');

    // Refresh skills from backend
    if (this.skillsManager) {
      await this.skillsManager.fetchSkills();
    }

    modal.classList.remove('hidden');
    textarea.dispatchEvent(new Event('input'));
  }

  // --- PROJECT LIFECYCLE & DATA ---

  async bootstrap() {
    await this.projectManager.loadProjects();
    await this.loadCurrentProjectData();
  }

  async switchProject(project) {
    if (!project) return;
    dialog.toast(`Switched to "${project.name}"`, 'info');
    await this.loadCurrentProjectData();
    const sidebar = document.getElementById('file-sidebar');
    if (!sidebar.classList.contains('hidden')) {
      this.loadWorkspaceFiles();
    }
  }

  get currentProjectId() {
    return this.projectManager.activeProjectId || 'project-default';
  }

  async loadCurrentProjectData() {
    try {
      const projectId = this.currentProjectId;
      const [nodesRes, edgesRes] = await Promise.all([
        fetch(`/api/projects/${encodeURIComponent(projectId)}/nodes`).then(r => r.json()),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/edges`).then(r => r.json()),
        this.skillsManager ? this.skillsManager.fetchSkills() : Promise.resolve([])
      ]);

      this.nodes = nodesRes.nodes || [];
      this.edges = edgesRes.edges || [];

      this.canvas.setNodes(this.nodes);
      this.canvas.setEdges(this.edges);
      this.updateStats();
      this.updateGraphDiagnostics();

      // Fit to screen on initial load
      setTimeout(() => this.canvas.fitToView(), 100);
    } catch (err) {
      console.error('Failed to load project canvas data:', err);
    }
  }

  async createNodeFromTemplate(key) {
    const tpl = TEMPLATES[key] || TEMPLATES.assistant;
    const count = this.nodes.length + 1;
    const projectId = this.currentProjectId;

    // Calculate non-overlapping placement
    let posX = 140;
    let posY = 120;
    if (this.nodes.length > 0) {
      const maxX = Math.max(...this.nodes.map(n => n.x + (n.width || 320)));
      const maxY = Math.max(...this.nodes.map(n => n.y));
      if (maxX < 1400) {
        posX = maxX + 60;
        posY = maxY;
      } else {
        posX = 140;
        posY = Math.max(...this.nodes.map(n => n.y + (n.height || 380))) + 60;
      }
    }

    const newNodeData = {
      id: `node-${Date.now().toString(36)}`,
      project_id: projectId,
      filename: `${tpl.filename.replace('.md', '')}-${count}.md`,
      title: `${tpl.title} ${count}`,
      content: tpl.content,
      x: posX,
      y: posY,
      width: 320,
      height: 380,
      color: '#202024'
    };

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNodeData)
      });
      const data = await res.json();
      if (data.success && data.node) {
        this.nodes.push(data.node);
        this.canvas.addNodeElement(data.node);
        this.canvas.selectNode(data.node.id);
        this.updateStats();
        this.updateGraphDiagnostics();
        this.projectManager.loadProjects(); // Refresh counts
      }
    } catch (err) {
      console.error('Failed to create node:', err);
    }
  }

  async handleNodeUpdate(node) {
    try {
      node.project_id = this.currentProjectId;
      await fetch(`/api/nodes/${encodeURIComponent(node.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(node)
      });
      const idx = this.nodes.findIndex(n => n.id === node.id);
      if (idx !== -1) this.nodes[idx] = { ...node };
      this.updateStats();
      this.updateGraphDiagnostics();
    } catch (err) {
      console.error('Failed to update node:', err);
    }
  }

  async handleNodeDelete(id) {
    try {
      await fetch(`/api/nodes/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      this.nodes = this.nodes.filter(n => n.id !== id);
      this.edges = this.edges.filter(e => e.source_id !== id && e.target_id !== id);
      this.canvas.removeNode(id);
      this.updateStats();
      this.updateGraphDiagnostics();
      this.projectManager.loadProjects(); // Refresh counts
    } catch (err) {
      console.error('Failed to delete node:', err);
    }
  }

  async handleEdgeCreate(edgeData) {
    try {
      const projectId = this.currentProjectId;
      edgeData.project_id = projectId;
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/edges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edgeData)
      });
      const data = await res.json();
      if (data.success && data.edge) {
        this.edges.push(data.edge);
        this.canvas.addEdge(data.edge);
        this.updateStats();
        this.updateGraphDiagnostics();
        this.projectManager.loadProjects();
        const sidebar = document.getElementById('file-sidebar');
        if (!sidebar.classList.contains('hidden')) this.loadWorkspaceFiles();
      }
    } catch (err) {
      console.error('Failed to create edge:', err);
    }
  }

  async handleEdgeDelete(id) {
    try {
      await fetch(`/api/edges/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      this.edges = this.edges.filter(e => e.id !== id);
      this.canvas.removeEdge(id);
      this.updateStats();
      this.updateGraphDiagnostics();
      this.projectManager.loadProjects();
      const sidebar = document.getElementById('file-sidebar');
      if (!sidebar.classList.contains('hidden')) this.loadWorkspaceFiles();
    } catch (err) {
      console.error('Failed to delete edge:', err);
    }
  }

  async handleEdgeUpdate(edge) {
    try {
      edge.project_id = this.currentProjectId;
      await fetch(`/api/projects/${encodeURIComponent(this.currentProjectId)}/edges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edge)
      });
      const idx = this.edges.findIndex(e => e.id === edge.id);
      if (idx !== -1) this.edges[idx] = { ...edge };
      this.updateStats();
      this.updateGraphDiagnostics();
      const sidebar = document.getElementById('file-sidebar');
      if (!sidebar.classList.contains('hidden')) this.loadWorkspaceFiles();
    } catch (err) {
      console.error('Failed to update edge:', err);
    }
  }

  async loadWorkspaceFiles() {
    const listElem = document.getElementById('workspace-file-list');
    listElem.innerHTML = '<div style="color:#71717a; padding:10px;">Loading files...</div>';

    try {
      const projectId = this.currentProjectId;
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`);
      const data = await res.json();
      listElem.innerHTML = '';

      if (!data.success) {
        listElem.innerHTML = `<div style="color:#f87171; padding:10px;">Failed to load files: ${data.error || 'Unknown error'}</div>`;
        return;
      }

      if (!data.files || data.files.length === 0) {
        listElem.innerHTML = '<div style="color:#71717a; padding:10px;">No .md files found in this project</div>';
        return;
      }

      for (const file of data.files) {
        const item = document.createElement('div');
        item.className = 'file-item';
        const isJs = file.filename.endsWith('.js');
        item.innerHTML = `
          <div class="file-info">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${isJs ? '#f59e0b' : '#a1a1aa'}" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div>
              <div class="file-name">${file.filename}</div>
              <div class="file-meta">${file.size} bytes • ~${estimateTokens(file.content)} tokens</div>
            </div>
          </div>
        `;
        item.addEventListener('click', () => {
          const matched = this.nodes.find(n => n.filename === file.filename);
          if (matched) {
            this.canvas.selectNode(matched.id);
            this.openEditorModal(matched);
          } else if (isJs) {
            dialog.alert(`Execution Runner (${file.filename})`, `<pre style="max-height:350px; overflow:auto; font-family:'JetBrains Mono',monospace; font-size:12px; background:#141416; padding:12px; border-radius:6px; border:1px solid #2d2d35; color:#cbd5e1;">${file.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`);
          }
        });
        listElem.appendChild(item);
      }
    } catch (err) {
      console.error('Failed to load workspace files:', err);
      listElem.innerHTML = `<div style="color:#f87171; padding:10px;">Error: ${err.message}</div>`;
    }
  }

  async syncWorkspaceDisk() {
    try {
      const projectId = this.currentProjectId;
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/sync/from-disk`, { method: 'POST' });
      const res = await fetch('/api/workspace/sync', { method: 'POST' });
      const data = await res.json();
      dialog.toast(`Synchronized with disk: ${data.message || 'Complete'}`, 'success');
      await this.loadCurrentProjectData();
      await this.loadWorkspaceFiles();
    } catch (err) {
      dialog.toast(`Sync failed: ${err.message}`, 'error');
    }
  }

  exportBundle() {
    const activeProject = this.projectManager.getActiveProject();
    const bundle = {
      version: '1.0.0',
      type: 'agent-canvas-orchestration',
      project: activeProject,
      exportedAt: new Date().toISOString(),
      nodes: this.nodes,
      edges: this.edges
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const projSlug = activeProject ? (activeProject.slug || 'project') : 'project';
    a.download = `agent-project-${projSlug}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  updateStats() {
    const totalTokens = this.nodes.reduce((acc, n) => acc + estimateTokens(n.content || ''), 0);
    document.getElementById('stat-nodes').textContent = `${this.nodes.length} block${this.nodes.length === 1 ? '' : 's'}`;
    document.getElementById('stat-edges').textContent = `${this.edges.length} connection${this.edges.length === 1 ? '' : 's'}`;
    document.getElementById('stat-tokens').textContent = `~${totalTokens} tokens`;
  }
}

// Boot application
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
