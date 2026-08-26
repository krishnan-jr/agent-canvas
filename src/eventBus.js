/**
 * Centralized Server-Sent Events (SSE) Event Bus
 * Dispatches real-time state changes (nodes, edges, skills, file sync) to connected clients.
 */

class EventBus {
  constructor() {
    this.clients = new Set();
    this.heartbeatInterval = null;
    this.startHeartbeat();
  }

  /**
   * Register a new SSE HTTP response stream
   */
  addClient(res) {
    this.clients.add(res);

    // Initial connection acknowledgement
    res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now(), clients: this.clients.size })}\n\n`);

    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  /**
   * Remove a client from the subscriber list
   */
  removeClient(res) {
    this.clients.delete(res);
  }

  /**
   * Keep-alive ping to maintain connection through proxies and prevent timeout
   */
  startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      this.sendRaw(': ping\n\n');
    }, 25000);
    // Allow process to exit cleanly if only heartbeat is active
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  /**
   * Send raw string to all connected clients
   */
  sendRaw(data) {
    for (const client of this.clients) {
      try {
        client.write(data);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  /**
   * Broadcast structured event to all active canvas clients
   * @param {string} eventType - e.g. 'node_updated', 'graph_updated', 'skills_updated', 'project_updated'
   * @param {object} payload - event details
   */
  broadcast(eventType, payload = {}) {
    const formatted = `event: ${eventType}\ndata: ${JSON.stringify({
      ...payload,
      timestamp: Date.now()
    })}\n\n`;

    this.sendRaw(formatted);
  }

  getClientCount() {
    return this.clients.size;
  }
}

export const eventBus = new EventBus();
