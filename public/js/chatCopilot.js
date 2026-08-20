/**
 * AI Chat Copilot Frontend Component
 * In-UI conversational assistant that generates, wires, audits, and modifies
 * multi-agent canvas pipelines using configured LLMs and MCP autonomous tools.
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
    this.messages = []; // [{ role, content, tools }]

    this.initDOM();
    this.initListeners();
    this.initResizer();
    this.fetchProviders();
  }

  initDOM() {
    this.drawer = document.getElementById('chat-copilot-drawer');
    this.toggleBtn = document.getElementById('btn-toggle-copilot');
    this.closeBtn = document.getElementById('btn-close-copilot');
    this.clearBtn = document.getElementById('btn-clear-copilot');
    this.messagesContainer = document.getElementById('copilot-messages');
    this.inputArea = document.getElementById('copilot-input');
    this.sendBtn = document.getElementById('copilot-send-btn');
    this.modelSelect = document.getElementById('copilot-model-select');
    this.quickPromptsContainer = document.getElementById('copilot-quick-prompts');
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
        this.inputArea.style.height = `${Math.min(this.inputArea.scrollHeight, 120)}px`;
      });
    }

    if (this.modelSelect) {
      this.modelSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        const [provId, modName] = val.split('::');
        this.selectedProvider = provId;
        this.selectedModel = modName;
      });
    }

    if (this.quickPromptsContainer) {
      this.quickPromptsContainer.addEventListener('click', (e) => {
        const chip = e.target.closest('.copilot-chip');
        if (chip && chip.dataset.prompt) {
          if (this.inputArea) {
            this.inputArea.value = chip.dataset.prompt;
            this.handleSendMessage();
          }
        }
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
      if (parsed >= 320 && parsed <= 800) {
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
      const minWidth = 320;
      const maxWidth = Math.min(800, window.innerWidth - 100);
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
      if (data.success && data.providers) {
        this.providers = data.providers;
        this.renderModelSelector();
      }
    } catch (e) {
      console.warn('Could not fetch AI chat providers:', e);
    }
  }

  renderModelSelector() {
    if (!this.modelSelect) return;
    this.modelSelect.innerHTML = '';

    for (const prov of this.providers) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = prov.name;
      for (const m of prov.models) {
        const opt = document.createElement('option');
        opt.value = `${prov.id}::${m}`;
        opt.textContent = m;
        if (prov.id === 'scaffold' || (prov.configured && !this.selectedProvider)) {
          opt.selected = true;
          this.selectedProvider = prov.id;
          this.selectedModel = m;
        }
        optGroup.appendChild(opt);
      }
      this.modelSelect.appendChild(optGroup);
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
    this.loadProjectMessages();
    if (this.inputArea) this.inputArea.focus();
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
      localStorage.setItem(key, JSON.stringify(this.messages.slice(-30)));
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
      welcome.innerHTML = `
        <div class="welcome-badge">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          <span>AI Multi-Agent Copilot</span>
        </div>
        <h3>How can I help build your workflow?</h3>
        <p>Ask me to design agent squads, wire feedback loops, attach skills, auto-layout, or audit graph health.</p>
      `;
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
        <span class="copilot-role-tag role-user">USER</span>
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
      const body = document.createElement('div');
      body.className = 'copilot-msg-body markdown-body';
      body.innerHTML = renderMarkdown(msg.content || '');

      elem.appendChild(header);

      // Tool calls if any
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
            <div class="tool-card-args">${JSON.stringify(tc.args || {})}</div>
          `;
          toolsContainer.appendChild(card);
        }
        elem.appendChild(toolsContainer);
      }

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
    this.inputArea.style.height = 'auto';

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
                // Auto-refresh canvas in real time as nodes/edges are mutated!
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
      <div class="tool-card-args">${JSON.stringify(args || {})}</div>
    `;
    container.appendChild(card);
  }
}
