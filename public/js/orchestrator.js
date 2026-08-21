/**
 * Live LLM Execution Sandbox, Streaming Runner & Trace Inspector
 * Strictly vector SVG icons - No emojis in UI (per GEMINI.md standards)
 */

import { escapeHtml } from './markdown.js';

export class OrchestrationRunner {
  constructor(canvas) {
    this.canvas = canvas;
    this.drawer = document.getElementById('execution-drawer');
    this.logsContainer = document.getElementById('execution-logs');
    this.statusText = document.getElementById('exec-status-text');
    this.metricTokens = document.getElementById('exec-metric-tokens');
    this.metricCost = document.getElementById('exec-metric-cost');
    this.metricTime = document.getElementById('exec-metric-time');
    
    this.approvalBanner = document.getElementById('approval-gate-banner');
    this.approvalNodeName = document.getElementById('approval-node-name');
    this.approvalPreview = document.getElementById('approval-payload-preview');
    this.btnApprove = document.getElementById('btn-approval-approve');
    this.btnReject = document.getElementById('btn-approval-reject');

    this.traceStepsList = document.getElementById('trace-steps-list');
    this.traceDetailPane = document.getElementById('trace-detail-pane');
    this.telemetryContent = document.getElementById('telemetry-profile-content');

    this.isRunning = false;
    this.currentRunId = null;
    this.activeTab = 'stream';
    this.executedSteps = [];
    this.selectedStepIndex = 0;
    this.currentStreamingEntry = null;
    this.currentStreamingTextElem = null;

    this.bindDrawerEvents();
    this.initResizer();
  }

  initResizer() {
    const resizer = document.getElementById('drawer-resizer');
    if (!resizer) return;

    let startY = 0;
    let startHeight = 0;
    let isDragging = false;

    const savedHeight = localStorage.getItem('agent_canvas_drawer_height');
    if (savedHeight) {
      const parsed = parseInt(savedHeight, 10);
      if (parsed >= 160 && parsed <= window.innerHeight - 80) {
        this.drawer.style.height = `${parsed}px`;
      }
    }

    const onMouseDown = (e) => {
      isDragging = true;
      startY = e.clientY;
      startHeight = this.drawer.getBoundingClientRect().height;
      this.drawer.classList.add('is-resizing');
      resizer.classList.add('dragging');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';

      window.addEventListener('mousemove', onMouseMove, { passive: true });
      window.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaY = startY - e.clientY;
      const minHeight = 160;
      const maxHeight = window.innerHeight - 80;
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
      this.drawer.style.height = `${newHeight}px`;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      this.drawer.classList.remove('is-resizing');
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const finalHeight = this.drawer.getBoundingClientRect().height;
      localStorage.setItem('agent_canvas_drawer_height', finalHeight);
    };

    resizer.addEventListener('mousedown', onMouseDown);

    // Double-click toggle between standard and tall height
    resizer.addEventListener('dblclick', () => {
      const currentHeight = this.drawer.getBoundingClientRect().height;
      const targetHeight = currentHeight > 450 ? 380 : 600;
      this.drawer.style.height = `${targetHeight}px`;
      localStorage.setItem('agent_canvas_drawer_height', targetHeight);
    });
  }

  bindDrawerEvents() {
    const closeBtn = document.getElementById('btn-close-drawer');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.drawer.classList.add('hidden');
      });
    }

    const expandBtn = document.getElementById('btn-toggle-expand-drawer');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        this.drawer.classList.toggle('expanded');
        const isExp = this.drawer.classList.contains('expanded');
        expandBtn.setAttribute('title', isExp ? 'Restore Size' : 'Maximize Drawer');
      });
    }

    // Tab switching
    const tabs = this.drawer.querySelectorAll('.drawer-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeTab = tab.dataset.tab;
        this.switchView(this.activeTab);
      });
    });

    // Approval gate actions
    if (this.btnApprove) {
      this.btnApprove.addEventListener('click', () => this.sendApprovalAction('approve'));
    }
    if (this.btnReject) {
      this.btnReject.addEventListener('click', () => this.sendApprovalAction('reject'));
    }
  }

  switchView(tabName) {
    const views = {
      'stream': document.getElementById('drawer-view-stream'),
      'traces': document.getElementById('drawer-view-traces'),
      'telemetry': document.getElementById('drawer-view-telemetry')
    };

    Object.keys(views).forEach(key => {
      if (views[key]) {
        if (key === tabName) {
          views[key].classList.remove('hidden');
          views[key].classList.add('active');
        } else {
          views[key].classList.add('hidden');
          views[key].classList.remove('active');
        }
      }
    });

    if (tabName === 'traces') {
      this.renderTraceStepsList();
      this.renderTraceDetail(this.selectedStepIndex);
    } else if (tabName === 'telemetry') {
      this.renderTelemetryProfile();
    }
  }

  log(message, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-badge ${type}">${type}</span>
      <span class="log-msg">${message}</span>
    `;
    this.logsContainer.appendChild(entry);
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
    return entry;
  }

  startStreamingBlock(stepData) {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry stream-entry';
    entry.innerHTML = `
      <div class="stream-header">
        <span class="log-time">[${time}]</span>
        <span class="log-badge step">Stage ${stepData.step}</span>
        <strong class="stream-title">${escapeHtml(stepData.nodeTitle)}</strong>
        <span class="stream-model-badge">${escapeHtml(stepData.model)}</span>
        ${stepData.linkedSkills && stepData.linkedSkills.length > 0 ? `<span class="stream-skill-badge">${stepData.linkedSkills.length} skill${stepData.linkedSkills.length > 1 ? 's' : ''}</span>` : ''}
      </div>
      <div class="stream-body-wrapper">
        <pre class="stream-content"><code class="stream-code"></code><span class="stream-cursor"></span></pre>
      </div>
    `;
    this.logsContainer.appendChild(entry);
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
    this.currentStreamingEntry = entry;
    this.currentStreamingTextElem = entry.querySelector('.stream-code');
  }

  appendStreamChunk(chunk) {
    if (this.currentStreamingTextElem) {
      this.currentStreamingTextElem.textContent += chunk;
      this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
    }
  }

  finishStreamingBlock(stepData, finishData) {
    if (this.currentStreamingEntry) {
      const cursor = this.currentStreamingEntry.querySelector('.stream-cursor');
      if (cursor) cursor.remove();

      const footer = document.createElement('div');
      footer.className = 'stream-footer';
      const isReject = finishData.verdict === 'REJECTED' || finishData.verdict === 'USER_REJECTED';
      const verdictClass = isReject ? 'verdict-rejected' : 'verdict-approved';

      footer.innerHTML = `
        <span class="verdict-pill ${verdictClass}">Verdict: ${escapeHtml(finishData.verdict)}</span>
        <span class="stream-meta-chip">${finishData.durationMs}ms</span>
        <span class="stream-meta-chip">${finishData.inputTokens + finishData.outputTokens} tokens</span>
        <span class="stream-meta-chip">$${finishData.stepCost.toFixed(6)}</span>
      `;
      this.currentStreamingEntry.appendChild(footer);
    }
    this.currentStreamingEntry = null;
    this.currentStreamingTextElem = null;
  }

  async runWorkflow(nodes, edges, projectId = 'project-default') {
    if (this.isRunning) return;
    this.isRunning = true;
    this.executedSteps = [];
    this.selectedStepIndex = 0;

    // Show drawer and reset metrics
    this.drawer.classList.remove('hidden');
    this.logsContainer.innerHTML = '';
    this.statusText.textContent = 'Streaming Execution...';
    this.statusText.className = 'exec-status running';
    this.metricTokens.textContent = '0 tokens';
    this.metricCost.textContent = '$0.0000';
    this.metricTime.textContent = '0ms';
    if (this.approvalBanner) this.approvalBanner.classList.add('hidden');

    this.log('Connecting to Live LLM Execution Sandbox & Streaming Harness...', 'info');

    let currentStepData = null;
    let accumulatedTokens = 0;
    let accumulatedCost = 0;
    const runStartTime = Date.now();

    try {
      const response = await fetch('/api/orchestrate/run-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      });

      if (!response.ok) {
        throw new Error(`Execution failed: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // Keep partial buffer

        for (const block of lines) {
          if (!block.trim()) continue;
          const eventMatch = block.match(/^event:\s*(.+)$/m);
          const dataMatch = block.match(/^data:\s*(.+)$/m);

          if (eventMatch && dataMatch) {
            const eventName = eventMatch[1].trim();
            const eventData = JSON.parse(dataMatch[1].trim());

            if (eventName === 'workflow_start') {
              this.currentRunId = eventData.runId;
              this.log(`Initialized run <strong>${eventData.runId}</strong> with ${eventData.totalNodes} canvas blocks`, 'info');
            } else if (eventName === 'node_start') {
              currentStepData = { ...eventData, output: '' };
              this.canvas.setExecutingNode(eventData.nodeId, true);
              this.startStreamingBlock(eventData);
            } else if (eventName === 'token_chunk') {
              if (currentStepData) currentStepData.output += eventData.chunk;
              this.appendStreamChunk(eventData.chunk);
            } else if (eventName === 'approval_required') {
              this.showApprovalGate(eventData);
            } else if (eventName === 'node_finish') {
              this.finishStreamingBlock(currentStepData, eventData);
              this.canvas.setExecutingNode(eventData.nodeId, false);

              accumulatedTokens += (eventData.inputTokens + eventData.outputTokens);
              accumulatedCost += eventData.stepCost;
              this.metricTokens.textContent = `${accumulatedTokens} tokens`;
              this.metricCost.textContent = `$${accumulatedCost.toFixed(4)}`;
              this.metricTime.textContent = `${Date.now() - runStartTime}ms`;

              if (currentStepData) {
                this.executedSteps.push({
                  ...currentStepData,
                  ...eventData
                });
              }

              // Pulse the active transition branch
              if (eventData.nextEdgeId) {
                const edgeType = eventData.edgeType || 'default';
                this.canvas.pulseEdge(eventData.nextEdgeId, true, edgeType);
                await new Promise(r => setTimeout(r, 450));
                this.canvas.pulseEdge(eventData.nextEdgeId, false, edgeType);
              }
            } else if (eventName === 'workflow_finish') {
              this.log(`Workflow execution finished: ${eventData.totalSteps} stages, ${eventData.totalTokens} tokens, $${eventData.totalCostUsd.toFixed(6)} in ${eventData.totalDurationMs}ms`, 'success');
              this.statusText.textContent = 'Finished';
              this.statusText.className = 'exec-status finished';
              this.metricTokens.textContent = `${eventData.totalTokens} tokens`;
              this.metricCost.textContent = `$${eventData.totalCostUsd.toFixed(4)}`;
              this.metricTime.textContent = `${eventData.totalDurationMs}ms`;
            } else if (eventName === 'error') {
              this.log(`Pipeline error: ${eventData.message}`, 'error');
              this.statusText.textContent = 'Failed';
              this.statusText.className = 'exec-status failed';
            }
          }
        }
      }
    } catch (err) {
      console.error('Execution run error:', err);
      this.log(`Execution stream error: ${err.message}`, 'error');
      this.statusText.textContent = 'Failed';
      this.statusText.className = 'exec-status failed';
    } finally {
      this.isRunning = false;
      this.canvas.clearAllExecutingNodes();
    }
  }

  showApprovalGate(gateData) {
    if (!this.approvalBanner) return;
    this.approvalNodeName.textContent = gateData.nodeTitle || 'Decision Gate';
    this.approvalPreview.textContent = gateData.output.slice(0, 180) + '...';
    this.approvalBanner.classList.remove('hidden');
    this.statusText.textContent = 'Waiting for Approval';
    this.statusText.className = 'exec-status paused';
  }

  async sendApprovalAction(action) {
    if (!this.currentRunId) return;
    this.approvalBanner.classList.add('hidden');
    this.statusText.textContent = 'Resuming...';
    this.statusText.className = 'exec-status running';

    try {
      await fetch('/api/orchestrate/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: this.currentRunId,
          action
        })
      });
      this.log(`Human checkpoint decision: <strong>${action.toUpperCase()}</strong> submitted`, 'step');
    } catch (err) {
      this.log(`Failed to submit approval: ${err.message}`, 'error');
    }
  }

  renderTraceStepsList() {
    if (!this.traceStepsList) return;
    this.traceStepsList.innerHTML = '';

    if (this.executedSteps.length === 0) {
      this.traceStepsList.innerHTML = '<div class="trace-empty-hint">No executed steps recorded yet. Run a workflow to view live traces.</div>';
      return;
    }

    this.executedSteps.forEach((step, idx) => {
      const item = document.createElement('div');
      const isSelected = idx === this.selectedStepIndex;
      const isReject = step.verdict === 'REJECTED' || step.verdict === 'USER_REJECTED';
      const statusClass = isReject ? 'status-rejected' : 'status-approved';

      item.className = `trace-step-item ${isSelected ? 'active' : ''}`;
      item.innerHTML = `
        <div class="trace-item-header">
          <span class="trace-step-number">#${step.step}</span>
          <strong class="trace-item-title">${escapeHtml(step.nodeTitle)}</strong>
          <span class="trace-status-dot ${statusClass}"></span>
        </div>
        <div class="trace-item-sub">
          <span class="trace-role-tag">${escapeHtml(step.role || 'assistant')}</span>
          <span class="trace-tokens-tag">${(step.inputTokens || 0) + (step.outputTokens || 0)}t</span>
          <span class="trace-cost-tag">$${(step.stepCost || 0).toFixed(4)}</span>
        </div>
      `;

      item.addEventListener('click', () => {
        this.selectedStepIndex = idx;
        this.traceStepsList.querySelectorAll('.trace-step-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        this.renderTraceDetail(idx);
      });

      this.traceStepsList.appendChild(item);
    });
  }

  renderTraceDetail(stepIndex) {
    if (!this.traceDetailPane) return;
    const step = this.executedSteps[stepIndex];

    if (!step) {
      this.traceDetailPane.innerHTML = '<div class="trace-placeholder">Select a step to inspect its execution trace.</div>';
      return;
    }

    const isReject = step.verdict === 'REJECTED' || step.verdict === 'USER_REJECTED';
    const verdictColor = isReject ? 'var(--red-core)' : 'var(--emerald-core)';

    this.traceDetailPane.innerHTML = `
      <div class="trace-detail-card">
        <!-- Trace Header -->
        <div class="trace-detail-header">
          <div class="trace-header-info">
            <span class="trace-detail-stage">Stage ${step.step} Trace</span>
            <h3 class="trace-detail-title">${escapeHtml(step.nodeTitle)}</h3>
            <span class="trace-filename">${escapeHtml(step.filename || '')}</span>
          </div>
          <div class="trace-header-verdict" style="border-color: ${verdictColor}; color: ${verdictColor};">
            VERDICT: ${escapeHtml(step.verdict || 'SUCCESS')}
          </div>
        </div>

        <!-- Telemetry KPI Strip -->
        <div class="trace-kpi-strip">
          <div class="kpi-box">
            <span class="kpi-label">Model</span>
            <span class="kpi-value">${escapeHtml(step.model || 'gemini-3.7-flash')}</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-label">Latency</span>
            <span class="kpi-value">${step.durationMs || 0}ms</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-label">Tokens</span>
            <span class="kpi-value">${(step.inputTokens || 0) + (step.outputTokens || 0)} <span class="kpi-sub">(${step.inputTokens || 0} in / ${step.outputTokens || 0} out)</span></span>
          </div>
          <div class="kpi-box">
            <span class="kpi-label">Est. Cost</span>
            <span class="kpi-value">$${(step.stepCost || 0).toFixed(6)}</span>
          </div>
        </div>

        <!-- Linked Skills Section -->
        <div class="trace-section">
          <h4 class="trace-section-title">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" style="stroke: var(--sky-core)" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Injected Skill Packages (${(step.linkedSkills || []).length})
          </h4>
          <div class="trace-skills-chips">
            ${(step.linkedSkills && step.linkedSkills.length > 0)
              ? step.linkedSkills.map(s => `<span class="trace-skill-chip">${escapeHtml(s)}</span>`).join('')
              : '<span class="trace-text-muted">No external skill packages attached</span>'
            }
          </div>
        </div>

        <!-- Upstream Input Payload -->
        <div class="trace-section">
          <h4 class="trace-section-title">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" style="stroke: var(--indigo-core)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
            Upstream Input Payload
          </h4>
          <pre class="trace-code-box"><code>${escapeHtml(step.upstreamPayload || '(Initial trigger payload)')}</code></pre>
        </div>

        <!-- Generated Output -->
        <div class="trace-section">
          <h4 class="trace-section-title">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" style="stroke: var(--emerald-core)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            Generated Agent Output & Verdict
          </h4>
          <pre class="trace-code-box"><code>${escapeHtml(step.output || '')}</code></pre>
        </div>
      </div>
    `;
  }

  renderTelemetryProfile() {
    if (!this.telemetryContent) return;

    if (this.executedSteps.length === 0) {
      this.telemetryContent.innerHTML = '<div class="trace-placeholder">Run a workflow to generate telemetry and cost profile metrics.</div>';
      return;
    }

    let totalTokens = 0;
    let totalIn = 0;
    let totalOut = 0;
    let totalCost = 0;
    let totalLatency = 0;

    this.executedSteps.forEach(s => {
      totalIn += s.inputTokens || 0;
      totalOut += s.outputTokens || 0;
      totalCost += s.stepCost || 0;
      totalLatency += s.durationMs || 0;
    });
    totalTokens = totalIn + totalOut;

    this.telemetryContent.innerHTML = `
      <div class="telemetry-dashboard">
        <!-- Summary Cards -->
        <div class="telemetry-cards-row">
          <div class="telemetry-card">
            <span class="telemetry-card-label">Total Stages</span>
            <strong class="telemetry-card-val">${this.executedSteps.length}</strong>
          </div>
          <div class="telemetry-card">
            <span class="telemetry-card-label">Total Tokens</span>
            <strong class="telemetry-card-val">${totalTokens} <span class="telemetry-sub">(${totalIn} in / ${totalOut} out)</span></strong>
          </div>
          <div class="telemetry-card">
            <span class="telemetry-card-label">Total Pipeline Cost</span>
            <strong class="telemetry-card-val cost-accent">$${totalCost.toFixed(6)}</strong>
          </div>
          <div class="telemetry-card">
            <span class="telemetry-card-label">Cumulative Duration</span>
            <strong class="telemetry-card-val">${totalLatency}ms</strong>
          </div>
        </div>

        <!-- Table Breakdown -->
        <div class="telemetry-table-container">
          <table class="telemetry-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Agent Node</th>
                <th>Role</th>
                <th>Model</th>
                <th>Verdict</th>
                <th>Latency</th>
                <th>Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              ${this.executedSteps.map(s => {
                const isReject = s.verdict === 'REJECTED' || s.verdict === 'USER_REJECTED';
                const verdictClass = isReject ? 'badge-rejected' : 'badge-approved';
                return `
                  <tr>
                    <td>#${s.step}</td>
                    <td><strong>${escapeHtml(s.nodeTitle)}</strong></td>
                    <td><span class="role-pill">${escapeHtml(s.role || 'assistant')}</span></td>
                    <td><code>${escapeHtml(s.model || 'gemini-3.7-flash')}</code></td>
                    <td><span class="verdict-tag ${verdictClass}">${escapeHtml(s.verdict || 'SUCCESS')}</span></td>
                    <td>${s.durationMs}ms</td>
                    <td>${(s.inputTokens || 0) + (s.outputTokens || 0)}</td>
                    <td><strong>$${(s.stepCost || 0).toFixed(6)}</strong></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}
