/**
 * Real-Time Server-Sent Events (SSE) Client
 * Connects to /api/events and routes live state mutations (nodes, edges, skills, files)
 * directly into the Canvas application controller.
 */

export class EventStream {
  constructor(app) {
    this.app = app;
    this.eventSource = null;
    this.reconnectTimer = null;
    this.isConnected = false;
    this.reconnectDelay = 2000;
  }

  connect() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      this.eventSource = new EventSource('/api/events');

      this.eventSource.addEventListener('open', () => {
        this.isConnected = true;
        this.reconnectDelay = 2000;
        this.updateConnectionBadge(true);
      });

      this.eventSource.addEventListener('connected', (e) => {
        this.isConnected = true;
        this.updateConnectionBadge(true);
      });

      this.eventSource.addEventListener('node_updated', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.app.handleLiveNodeUpdated(data);
        } catch (err) {
          console.warn('[SSE] Error handling node_updated:', err);
        }
      });

      this.eventSource.addEventListener('graph_updated', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.app.handleLiveGraphUpdated(data);
        } catch (err) {
          console.warn('[SSE] Error handling graph_updated:', err);
        }
      });

      this.eventSource.addEventListener('skills_updated', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.app.handleLiveSkillsUpdated(data);
        } catch (err) {
          console.warn('[SSE] Error handling skills_updated:', err);
        }
      });

      this.eventSource.addEventListener('project_updated', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.app.handleLiveProjectUpdated(data);
        } catch (err) {
          console.warn('[SSE] Error handling project_updated:', err);
        }
      });

      this.eventSource.addEventListener('error', (err) => {
        this.isConnected = false;
        this.updateConnectionBadge(false);
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        this.scheduleReconnect();
      });
    } catch (err) {
      console.warn('[SSE] Failed to initialize EventSource:', err);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
    }, this.reconnectDelay);
  }

  updateConnectionBadge(connected) {
    const badge = document.getElementById('live-sync-indicator');
    if (!badge) return;

    if (connected) {
      badge.classList.add('live-sync-active');
      badge.title = 'Live Sync: Connected to workspace file watcher & MCP';
    } else {
      badge.classList.remove('live-sync-active');
      badge.title = 'Live Sync: Reconnecting...';
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
