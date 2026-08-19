/**
 * Agent Orchestration Runner & Workflow Simulation Engine
 * Strictly vector SVG icons - No emojis in UI (per GEMINI.md standards)
 */

export class OrchestrationRunner {
  constructor(canvas) {
    this.canvas = canvas;
    this.drawer = document.getElementById('execution-drawer');
    this.logsContainer = document.getElementById('execution-logs');
    this.statusText = document.getElementById('exec-status-text');
    this.isRunning = false;

    const closeBtn = document.getElementById('btn-close-drawer');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.drawer.classList.add('hidden');
      });
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
  }

  async runWorkflow(nodes, edges, projectId = 'project-default') {
    if (this.isRunning) return;
    this.isRunning = true;

    // Show drawer
    this.drawer.classList.remove('hidden');
    this.logsContainer.innerHTML = '';
    this.statusText.textContent = 'Running Decision Pipeline...';
    this.log('Initializing multi-agent decision loop execution...', 'info');

    try {
      const res = await fetch('/api/orchestrate/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, projectId })
      });
      const data = await res.json();

      if (!data.success || !data.steps) {
        throw new Error(data.error || 'Execution simulation failed');
      }

      this.log(`Resolved agent decision graph: ${data.steps.length} sequential execution stages`, 'info');

      for (let i = 0; i < data.steps.length; i++) {
        const step = data.steps[i];
        
        // Highlight active executing node
        this.canvas.setExecutingNode(step.nodeId, true);
        
        this.log(`[Stage ${step.step}] Executing Block: <strong>${step.filename}</strong> (${step.nodeTitle})...`, 'step');
        
        // Simulate LLM execution latency
        await new Promise(r => setTimeout(r, step.durationMs + 250));

        if (step.status === 'retry_loop') {
          this.log(`[REJECT] Decision Rejection: <strong>${step.verdict}</strong> — ${step.feedback}`, 'error');
        } else if (step.verdict === 'APPROVED') {
          this.log(`[APPROVED] Decision Approved: <strong>${step.verdict}</strong> — ${step.feedback || 'Guardrails satisfied.'}`, 'success');
        } else {
          this.log(`Completed ${step.filename}: consumed ~${step.tokens} tokens in ${step.durationMs}ms`, 'info');
        }

        // Pulse the chosen outgoing decision branch if available
        if (step.activeEdgeId) {
          const edgeType = step.edgeType || 'default';
          this.canvas.pulseEdge(step.activeEdgeId, true, edgeType);
          await new Promise(r => setTimeout(r, 450));
          this.canvas.pulseEdge(step.activeEdgeId, false, edgeType);
        }

        // De-highlight executing node
        this.canvas.setExecutingNode(step.nodeId, false);
      }

      this.log('Agent Orchestration workflow completed successfully with all tasks synced.', 'success');
      this.statusText.textContent = 'Finished Successfully';
    } catch (err) {
      console.error('Orchestration run failed:', err);
      this.log(`Error: ${err.message}`, 'error');
      this.statusText.textContent = 'Failed';
    } finally {
      this.isRunning = false;
    }
  }
}
