/**
 * AI Chat Copilot Frontend Component
 * Clean, standard chatbot interface for autonomous multi-agent graph generation,
 * wiring, and quality auditing. Scans and utilizes configured LLM models from .env.
 */

import { renderMarkdown } from './markdown.js';

export class ChatCopilot {
  constructor(app) {
    this.app = app;
    this.isOpen = false;
    this.isStreaming = false;
    this.providers = [];
    this.selectedProvider = null;
    this.selectedModel = null;
    this.messages = [];

    this.initDOM();
    this.initListeners();
    this.initResizer();
    this.fetchProviders();
  }

  initDOM() {
    this.drawer = document.getElementById('chat-copilot-drawer');
    this.toggleBtn = document.getElementById('btn-floating-copilot') || document.getElementById('btn-toggle-copilot');
    this.closeBtn = document.getElementById('btn-close-copilot');
    this.clearBtn = document.getElementById('btn-clear-copilot');
    this.messagesContainer = document.getElementById('copilot-messages');
    this.inputArea = document.getElementById('copilot-input');
    this.sendBtn = document.getElementById('copilot-send-btn');
    this.modelSelect = document.getElementById('copilot-model-select');
    this.resizer = document.getElementById('copilot-resizer');
  }

  initListeners() {
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggle());
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => this.clearChat());
    }

    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.handleSendMessage());
    }

    if (this.inputArea) {
      this.inputArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
      // Auto-grow textarea
      this.inputArea.addEventListener('input', () => {
        this.inputArea.style.height = 'auto';
        const newHeight = Math.min(Math.max(this.inputArea.scrollHeight, 48), 180);
        this.inputArea.style.height = `${newHeight}px`;
      });
    }

    if (this.modelSelect) {
      this.modelSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) return;
        const [provId, modName] = val.split('::');
        this.selectedProvider = provId;
        this.selectedModel = modName;
        localStorage.setItem('agent_canvas_selected_model_val', val);
      });
    }
  }

  initResizer() {
    if (!this.resizer || !this.drawer) return;

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    const savedWidth = localStorage.getItem('agent_canvas_copilot_width');
    if (savedWidth) {
      const parsed = parseInt(savedWidth, 10);
      if (parsed >= 360 && parsed <= 900) {
        this.drawer.style.width = `${parsed}px`;
      }
    }

    const onMouseDown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = this.drawer.getBoundingClientRect().width;
      this.drawer.classList.add('is-resizing');
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';

      window.addEventListener('mousemove', onMouseMove, { passive: true });
      window.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaX = startX - e.clientX;
      const minWidth = 360;
      const maxWidth = Math.min(900, window.innerWidth - 100);
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
      this.drawer.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      this.drawer.classList.remove('is-resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const finalWidth = this.drawer.getBoundingClientRect().width;
      localStorage.setItem('agent_canvas_copilot_width', finalWidth);
    };

    this.resizer.addEventListener('mousedown', onMouseDown);
  }

  async fetchProviders() {
    try {
      const res = await fetch('/api/chat/models');
      const data = await res.json();
      if (data.success && Array.isArray(data.providers)) {
        this.providers = data.providers;
        this.renderModelSelector();
        this.renderMessages();
      }
    } catch (e) {
      console.warn('Could not fetch AI chat providers:', e);
    }
  }

  renderModelSelector() {
    if (!this.modelSelect) return;
    this.modelSelect.innerHTML = '';

    if (this.providers.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No Models in .env';
      opt.disabled = true;
      opt.selected = true;
      this.modelSelect.appendChild(opt);
      this.selectedProvider = null;
      this.selectedModel = null;
      return;
    }

    const savedVal = localStorage.getItem('agent_canvas_selected_model_val');
    let matchedSaved = false;

    for (const prov of this.providers) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = prov.name;

      for (const m of prov.models) {
        const opt = document.createElement('option');
        const val = `${prov.id}::${m}`;
        opt.value = val;
        opt.textContent = m;

        if (savedVal && val === savedVal) {
          opt.selected = true;
          this.selectedProvider = prov.id;
          this.selectedModel = m;
          matchedSaved = true;
        }

        optGroup.appendChild(opt);
      }
      this.modelSelect.appendChild(optGroup);
    }

    if (!matchedSaved && this.providers.length > 0) {
      const firstProv = this.providers[0];
      const firstModel = firstProv.defaultModel || firstProv.models[0];
      this.selectedProvider = firstProv.id;
      this.selectedModel = firstModel;
      this.modelSelect.value = `${firstProv.id}::${firstModel}`;
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    if (this.drawer) this.drawer.classList.remove('hidden');
    if (this.toggleBtn) this.toggleBtn.classList.add('active');
    this.fetchProviders();
    this.loadProjectMessages();
    if (this.inputArea) {
      setTimeout(() => this.inputArea.focus(), 50);
    }
  }

  close() {
    this.isOpen = false;
    if (this.drawer) this.drawer.classList.add('hidden');
    if (this.toggleBtn) this.toggleBtn.classList.remove('active');
  }

  loadProjectMessages() {
    const projectId = this.app.currentProjectId || 'project-default';
    const key = `agent_canvas_chat_${projectId}`;
    try {
      const saved = localStorage.getItem(key);
      this.messages = saved ? JSON.parse(saved) : [];
    } catch (e) {
      this.messages = [];
    }
    this.renderMessages();
  }

  saveProjectMessages() {
    const projectId = this.app.currentProjectId || 'project-default';
    const key = `agent_canvas_chat_${projectId}`;
    try {
      localStorage.setItem(key, JSON.stringify(this.messages.slice(-40)));
    } catch (e) {}
  }

  clearChat() {
    this.messages = [];
    this.saveProjectMessages();
    this.renderMessages();
  }

  renderMessages() {
    if (!this.messagesContainer) return;
    this.messagesContainer.innerHTML = '';

    if (this.messages.length === 0) {
      const welcome = document.createElement('div');
      welcome.className = 'copilot-welcome-message';

      if (this.providers.length === 0) {
        welcome.innerHTML = `
          <div class="welcome-badge badge-warning">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>No LLM Provider Configured</span>
          </div>
          <h3>Connect an AI Model</h3>
          <p>Add your API key to <code>.env</code> in the project root to start using AI Copilot:</p>
          <div class="welcome-code-box">
            <code>GEMINI_API_KEY=your_key_here</code><br/>
            <code># or ANTHROPIC_API_KEY=your_key_here</code><br/>
            <code># or OPENAI_API_KEY=your_key_here</code>
          </div>
        `;
      } else {
        const activeName = this.selectedModel ? `${this.selectedModel}` : 'AI Assistant';
        welcome.innerHTML = `
          <div class="welcome-badge">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            <span>Active: ${activeName}</span>
          </div>
          <h3>What would you like to build?</h3>
          <p>Ask in natural language to generate agent squads, wire conditional pass/reject feedback loops, attach domain skills, or audit graph topology.</p>
        `;
      }

      this.messagesContainer.appendChild(welcome);
      return;
    }

    for (const msg of this.messages) {
      this.appendMessageDOM(msg);
    }
    this.scrollToBottom();
  }

  appendMessageDOM(msg) {
    if (!this.messagesContainer) return null;

    const elem = document.createElement('div');
    elem.className = `copilot-msg copilot-msg-${msg.role}`;

    const header = document.createElement('div');
    header.className = 'copilot-msg-header';

    if (msg.role === 'user') {
      header.innerHTML = `
        <span class="copilot-role-tag role-user">YOU</span>
        <span class="copilot-timestamp">${new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      `;
      const body = document.createElement('div');
      body.className = 'copilot-msg-body';
      body.textContent = msg.content;
      elem.appendChild(header);
      elem.appendChild(body);
    } else {
      header.innerHTML = `
        <span class="copilot-role-tag role-ai">COPILOT</span>
        <span class="copilot-model-tag">${msg.model || this.selectedModel || 'AI'}</span>
        <span class="copilot-timestamp">${new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      `;

      // Tool calls list if any
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const toolsContainer = document.createElement('div');
        toolsContainer.className = 'copilot-tools-list';
        for (const tc of msg.toolCalls) {
          const card = document.createElement('div');
          card.className = 'copilot-tool-card';
          card.innerHTML = `
            <div class="tool-card-header">
              <span class="tool-card-badge">TOOL</span>
              <span class="tool-card-name">${tc.tool}</span>
              <span class="tool-card-status status-success">COMPLETED</span>
            </div>
            <div class="tool-card-args">${escapeHtml(JSON.stringify(tc.args || {}))}</div>
          `;
          toolsContainer.appendChild(card);
        }
        elem.appendChild(toolsContainer);
      }

      const body = document.createElement('div');
      body.className = 'copilot-msg-body markdown-body';
      body.innerHTML = renderMarkdown(msg.content || '');

      elem.appendChild(header);
      elem.appendChild(body);
    }

    this.messagesContainer.appendChild(elem);
    return elem;
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  async handleSendMessage() {
    if (this.isStreaming) return;
    const text = (this.inputArea?.value || '').trim();
    if (!text) return;

    this.inputArea.value = '';
    this.inputArea.style.height = '48px';

    const userMsg = {
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    this.messages.push(userMsg);
    this.appendMessageDOM(userMsg);
    this.scrollToBottom();

    // Prepare assistant message
    const assistantMsg = {
      role: 'assistant',
      content: '',
      model: this.selectedModel || 'copilot',
      toolCalls: [],
      timestamp: Date.now()
    };
    this.messages.push(assistantMsg);

    const assistantElem = this.appendMessageDOM(assistantMsg);
    const bodyElem = assistantElem.querySelector('.copilot-msg-body');

    this.isStreaming = true;
    if (this.sendBtn) this.sendBtn.disabled = true;

    const projectId = this.app.currentProjectId || 'project-default';

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          provider: this.selectedProvider,
          model: this.selectedModel,
          messages: this.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop();

        for (const evtBlock of events) {
          const lines = evtBlock.split('\n');
          let eventType = 'message';
          let dataStr = '';

          for (const l of lines) {
            if (l.startsWith('event: ')) eventType = l.slice(7).trim();
            if (l.startsWith('data: ')) dataStr = l.slice(6).trim();
          }

          if (dataStr) {
            try {
              const data = JSON.parse(dataStr);

              if (eventType === 'token') {
                assistantMsg.content += data.text;
                if (bodyElem) bodyElem.innerHTML = renderMarkdown(assistantMsg.content);
                this.scrollToBottom();
              } else if (eventType === 'tool_start') {
                assistantMsg.toolCalls.push({ tool: data.tool, args: data.args });
                this.renderToolCallLive(assistantElem, data.tool, data.args);
                this.scrollToBottom();
              } else if (eventType === 'canvas_sync') {
                if (this.app) {
                  await this.app.loadCurrentProjectData();
                }
              }
            } catch (err) {
              console.warn('Error parsing SSE event data:', err);
            }
          }
        }
      }
    } catch (err) {
      assistantMsg.content += `\n\n*Error streaming AI response: ${err.message}*`;
      if (bodyElem) bodyElem.innerHTML = renderMarkdown(assistantMsg.content);
    } finally {
      this.isStreaming = false;
      if (this.sendBtn) this.sendBtn.disabled = false;
      this.saveProjectMessages();
      this.scrollToBottom();
    }
  }

  renderToolCallLive(msgElem, toolName, args) {
    let container = msgElem.querySelector('.copilot-tools-list');
    if (!container) {
      container = document.createElement('div');
      container.className = 'copilot-tools-list';
      const body = msgElem.querySelector('.copilot-msg-body');
      msgElem.insertBefore(container, body);
    }

    const card = document.createElement('div');
    card.className = 'copilot-tool-card is-active';
    card.innerHTML = `
      <div class="tool-card-header">
        <span class="tool-card-badge">TOOL</span>
        <span class="tool-card-name">${toolName}</span>
        <span class="tool-card-status status-success">COMPLETED</span>
      </div>
      <div class="tool-card-args">${escapeHtml(JSON.stringify(args || {}))}</div>
    `;
    container.appendChild(card);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
