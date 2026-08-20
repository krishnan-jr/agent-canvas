/**
 * Obsidian-Style Canvas Engine with Bezier Connections, Port Wiring,
 * Topological DAG Auto-Layout, Marquee Multi-Selection, and Canvas Minimap Radar.
 */

import { renderMarkdown, parseFrontmatter, escapeHtml } from './markdown.js';
import { dialog } from './dialog.js';

export class CanvasEngine {
  constructor({ container, world, svg, nodesLayer, onNodeChange, onNodeDelete, onEdgeCreate, onEdgeDelete, onEdgeUpdate, onNodeSelect, onOpenEditor }) {
    this.container = container;
    this.world = world;
    this.svg = svg;
    this.edgesGroup = document.getElementById('edges-group');
    this.edgeLabelsGroup = document.getElementById('edge-labels-group');
    this.tempEdgeGroup = document.getElementById('temp-edge-group');
    this.nodesLayer = nodesLayer;

    this.onNodeChange = onNodeChange;
    this.onNodeDelete = onNodeDelete;
    this.onEdgeCreate = onEdgeCreate;
    this.onEdgeDelete = onEdgeDelete;
    this.onEdgeUpdate = onEdgeUpdate;
    this.onNodeSelect = onNodeSelect;
    this.onOpenEditor = onOpenEditor;

    // Viewport transform
    this.panX = 0;
    this.panY = 0;
    this.scale = 1.0;
    this.minScale = 0.45;
    this.maxScale = 2.5;

    // State
    this.nodes = new Map();
    this.edges = new Map();
    this.selectedNodeId = null;
    this.selectedNodeIds = new Set();
    this.nodeDiagnostics = {};

    // Interaction states
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.isSpacePressed = false;

    // Marquee selection
    this.isMarqueeSelecting = false;
    this.marqueeStart = { clientX: 0, clientY: 0 };
    this.marqueeElem = null;

    // Dragging
    this.draggingNode = null;
    this.dragStart = { mouseX: 0, mouseY: 0, nodeX: 0, nodeY: 0, allNodesInitPos: new Map() };

    this.resizingNode = null;
    this.resizeStart = { mouseX: 0, mouseY: 0, width: 0, height: 0 };

    this.connectingFrom = null; // { nodeId, handle, x, y }

    this.initEventListeners();
    this.initMinimap();
    this.updateTransform();
  }

  initEventListeners() {
    // Canvas Pan & Marquee Selection
    this.container.addEventListener('mousedown', (e) => {
      // Middle click (button 1) or Space+Left click always pans
      if (e.button === 1 || (this.isSpacePressed && e.button === 0)) {
        this.isPanning = true;
        this.panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
        this.container.classList.add('panning');
        e.preventDefault();
        return;
      }

      // Check if click was on canvas background
      const isInteractive = e.target.closest('.node-block, .port-handle, .resize-handle, .edge-pill-group, .floating-controls, .btn, button, input, textarea, a, .in-dom-dialog-overlay, .modal-backdrop, .top-nav, .files-sidebar, .canvas-minimap-container, .graph-diagnostics-popover');
      if (!isInteractive && e.button === 0) {
        if (e.shiftKey) {
          this.startMarquee(e);
        } else {
          this.isPanning = true;
          this.panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
          this.container.classList.add('panning');
          this.deselectAll();
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.panStart.x;
        this.panY = e.clientY - this.panStart.y;
        this.updateTransform();
        return;
      }

      if (this.isMarqueeSelecting) {
        this.updateMarquee(e);
        return;
      }

      if (this.draggingNode) {
        const dx = (e.clientX - this.dragStart.mouseX) / this.scale;
        const dy = (e.clientY - this.dragStart.mouseY) / this.scale;

        if (this.selectedNodeIds.size > 1 && this.selectedNodeIds.has(this.draggingNode)) {
          this.selectedNodeIds.forEach(id => {
            const init = this.dragStart.allNodesInitPos.get(id);
            const node = this.nodes.get(id);
            if (init && node) {
              node.x = init.x + dx;
              node.y = init.y + dy;
              this.updateNodePosition(node);
            }
          });
        } else {
          const node = this.nodes.get(this.draggingNode);
          if (node) {
            node.x = this.dragStart.nodeX + dx;
            node.y = this.dragStart.nodeY + dy;
            this.updateNodePosition(node);
          }
        }
        this.renderEdges();
        this.renderMinimap();
        return;
      }

      if (this.resizingNode) {
        const dx = (e.clientX - this.resizeStart.mouseX) / this.scale;
        const dy = (e.clientY - this.resizeStart.mouseY) / this.scale;
        const node = this.nodes.get(this.resizingNode);
        if (node) {
          node.width = Math.max(240, this.resizeStart.width + dx);
          node.height = Math.max(180, this.resizeStart.height + dy);
          this.updateNodeDimensions(node);
          this.renderEdges();
          this.renderMinimap();
        }
        return;
      }

      if (this.connectingFrom) {
        const mouseWorld = this.screenToWorld(e.clientX, e.clientY);
        this.renderTempEdge(this.connectingFrom, mouseWorld);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.classList.remove('panning');
      }

      if (this.isMarqueeSelecting) {
        this.endMarquee();
      }

      if (this.draggingNode) {
        if (this.selectedNodeIds.size > 1 && this.selectedNodeIds.has(this.draggingNode)) {
          this.selectedNodeIds.forEach(id => {
            const node = this.nodes.get(id);
            if (node && this.onNodeChange) this.onNodeChange(node);
          });
        } else {
          const node = this.nodes.get(this.draggingNode);
          if (node && this.onNodeChange) this.onNodeChange(node);
        }
        this.draggingNode = null;
      }

      if (this.resizingNode) {
        const node = this.nodes.get(this.resizingNode);
        if (node && this.onNodeChange) {
          this.onNodeChange(node);
        }
        this.resizingNode = null;
      }

      if (this.connectingFrom) {
        const sourceInfo = this.connectingFrom;
        this.clearTempEdge();
        this.connectingFrom = null;

        const hitElem = document.elementFromPoint(e.clientX, e.clientY);
        if (hitElem) {
          const port = hitElem.closest('.port-handle');
          const targetBlock = hitElem.closest('.node-block');

          if (port) {
            const targetNodeId = port.dataset.nodeId || targetBlock?.id?.replace(/^block-/, '');
            const targetHandle = port.dataset.handle || 'top';
            if (targetNodeId && targetNodeId !== sourceInfo.nodeId) {
              if (this.onEdgeCreate) {
                this.onEdgeCreate({
                  source_id: sourceInfo.nodeId,
                  target_id: targetNodeId,
                  source_handle: sourceInfo.handle,
                  target_handle: targetHandle,
                  edge_type: 'default',
                  label: 'Next'
                });
              }
            }
          } else if (targetBlock) {
            const targetNodeId = targetBlock.id.replace(/^block-/, '');
            if (targetNodeId && targetNodeId !== sourceInfo.nodeId) {
              const targetHandle = sourceInfo.handle === 'bottom' ? 'top' : (sourceInfo.handle === 'right' ? 'left' : 'top');
              if (this.onEdgeCreate) {
                this.onEdgeCreate({
                  source_id: sourceInfo.nodeId,
                  target_id: targetNodeId,
                  source_handle: sourceInfo.handle,
                  target_handle: targetHandle,
                  edge_type: 'default',
                  label: 'Next'
                });
              }
            }
          }
        }
      }
    });

    // Zoom on wheel (around mouse cursor)
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoomAt(e.clientX, e.clientY, zoomFactor);
    }, { passive: false });

    // Keyboard Shortcuts (Space for Pan, Delete for Batch Delete)
    window.addEventListener('keydown', async (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (activeTag === 'TEXTAREA' || activeTag === 'INPUT') return;

      if (e.code === 'Space' && !this.isSpacePressed) {
        this.isSpacePressed = true;
        this.container.style.cursor = 'grab';
      }

      if (e.code === 'Escape') {
        this.deselectAll();
      }

      if ((e.code === 'Backspace' || e.code === 'Delete') && this.selectedNodeIds.size > 0) {
        const count = this.selectedNodeIds.size;
        const confirmed = await dialog.confirm({
          title: `Delete ${count} Block${count > 1 ? 's' : ''}`,
          message: `Are you sure you want to permanently delete the selected ${count} block(s)?`,
          confirmText: 'Delete Selected',
          cancelText: 'Cancel',
          isDanger: true
        });
        if (confirmed) {
          const idsToDelete = Array.from(this.selectedNodeIds);
          this.deselectAll();
          for (const id of idsToDelete) {
            if (this.onNodeDelete) this.onNodeDelete(id);
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.isSpacePressed = false;
        this.container.style.cursor = '';
      }
    });
  }

  // --- MARQUEE SELECTION ---

  startMarquee(e) {
    this.isMarqueeSelecting = true;
    this.marqueeStart = { clientX: e.clientX, clientY: e.clientY };

    if (!this.marqueeElem) {
      this.marqueeElem = document.createElement('div');
      this.marqueeElem.className = 'selection-marquee';
      document.body.appendChild(this.marqueeElem);
    }

    this.marqueeElem.style.display = 'block';
    this.marqueeElem.style.left = `${e.clientX}px`;
    this.marqueeElem.style.top = `${e.clientY}px`;
    this.marqueeElem.style.width = '0px';
    this.marqueeElem.style.height = '0px';
  }

  updateMarquee(e) {
    if (!this.marqueeElem) return;

    const minX = Math.min(this.marqueeStart.clientX, e.clientX);
    const minY = Math.min(this.marqueeStart.clientY, e.clientY);
    const maxX = Math.max(this.marqueeStart.clientX, e.clientX);
    const maxY = Math.max(this.marqueeStart.clientY, e.clientY);

    this.marqueeElem.style.left = `${minX}px`;
    this.marqueeElem.style.top = `${minY}px`;
    this.marqueeElem.style.width = `${maxX - minX}px`;
    this.marqueeElem.style.height = `${maxY - minY}px`;

    this.nodes.forEach(node => {
      const elem = document.getElementById(`block-${node.id}`);
      if (elem) {
        const rect = elem.getBoundingClientRect();
        const intersects = !(rect.right < minX || rect.left > maxX || rect.bottom < minY || rect.top > maxY);
        if (intersects) {
          this.selectedNodeIds.add(node.id);
          elem.classList.add('selected');
        } else if (!e.shiftKey) {
          this.selectedNodeIds.delete(node.id);
          elem.classList.remove('selected');
        }
      }
    });
  }

  endMarquee() {
    this.isMarqueeSelecting = false;
    if (this.marqueeElem) {
      this.marqueeElem.style.display = 'none';
    }
  }

  // --- MINIMAP RADAR ---

  initMinimap() {
    let container = document.getElementById('canvas-minimap-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'canvas-minimap-container';
      container.className = 'canvas-minimap-container';
      container.innerHTML = `
        <div class="minimap-header">
          <span class="minimap-title">Canvas Radar</span>
        </div>
        <div class="minimap-canvas-wrapper">
          <canvas id="canvas-minimap-canvas" width="180" height="110"></canvas>
          <div id="minimap-viewport-indicator" class="minimap-viewport-indicator"></div>
        </div>
      `;
      this.container.appendChild(container);

      const canvasElem = container.querySelector('.minimap-canvas-wrapper');
      let isMinimapDragging = false;

      const handleMinimapPan = (e) => {
        const rect = canvasElem.getBoundingClientRect();
        const normX = (e.clientX - rect.left) / rect.width;
        const normY = (e.clientY - rect.top) / rect.height;
        this.panToMinimapNorm(normX, normY);
      };

      canvasElem.addEventListener('mousedown', (e) => {
        isMinimapDragging = true;
        handleMinimapPan(e);
      });

      window.addEventListener('mousemove', (e) => {
        if (isMinimapDragging) {
          handleMinimapPan(e);
        }
      });

      window.addEventListener('mouseup', () => {
        isMinimapDragging = false;
      });
    }
  }

  renderMinimap() {
    const canvas = document.getElementById('canvas-minimap-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.nodes.size === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of this.nodes.values()) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + (node.width || 300));
      maxY = Math.max(maxY, node.y + (node.height || 360));
    }

    const padding = 200;
    const worldW = Math.max(600, maxX - minX + padding * 2);
    const worldH = Math.max(450, maxY - minY + padding * 2);
    const worldMinX = minX - padding;
    const worldMinY = minY - padding;

    this.minimapBounds = { worldMinX, worldMinY, worldW, worldH };

    const scaleX = canvas.width / worldW;
    const scaleY = canvas.height / worldH;

    for (const node of this.nodes.values()) {
      const nx = (node.x - worldMinX) * scaleX;
      const ny = (node.y - worldMinY) * scaleY;
      const nw = Math.max(6, (node.width || 300) * scaleX);
      const nh = Math.max(5, (node.height || 360) * scaleY);

      const { frontmatter } = parseFrontmatter(node.content || '');
      const role = (frontmatter.role || 'assistant').toLowerCase();
      let color = '#64748b';
      if (role === 'orchestrator') color = '#38bdf8';
      else if (role === 'evaluator') color = '#10b981';
      else if (role === 'researcher') color = '#818cf8';
      else if (role === 'coder') color = '#a855f7';
      else if (role === 'router') color = '#f59e0b';
      else if (role === 'tool') color = '#71717a';

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(nx, ny, nw, nh, 2);
      ctx.fill();
    }

    const viewportInd = document.getElementById('minimap-viewport-indicator');
    if (viewportInd) {
      const screenW = this.container.clientWidth;
      const screenH = this.container.clientHeight;
      const viewWorldX = -this.panX / this.scale;
      const viewWorldY = -this.panY / this.scale;
      const viewWorldW = screenW / this.scale;
      const viewWorldH = screenH / this.scale;

      const vx = Math.max(0, (viewWorldX - worldMinX) * scaleX);
      const vy = Math.max(0, (viewWorldY - worldMinY) * scaleY);
      const vw = Math.min(canvas.width, viewWorldW * scaleX);
      const vh = Math.min(canvas.height, viewWorldH * scaleY);

      viewportInd.style.left = `${vx}px`;
      viewportInd.style.top = `${vy}px`;
      viewportInd.style.width = `${Math.max(14, vw)}px`;
      viewportInd.style.height = `${Math.max(10, vh)}px`;
    }
  }

  panToMinimapNorm(normX, normY) {
    if (!this.minimapBounds) return;
    const { worldMinX, worldMinY, worldW, worldH } = this.minimapBounds;
    const targetWorldX = worldMinX + normX * worldW;
    const targetWorldY = worldMinY + normY * worldH;

    const screenW = this.container.clientWidth;
    const screenH = this.container.clientHeight;

    this.panX = screenW / 2 - targetWorldX * this.scale;
    this.panY = screenH / 2 - targetWorldY * this.scale;
    this.updateTransform();
  }

  screenToWorld(screenX, screenY) {
    const rect = this.container.getBoundingClientRect();
    return {
      x: (screenX - rect.left - this.panX) / this.scale,
      y: (screenY - rect.top - this.panY) / this.scale
    };
  }

  worldToScreen(worldX, worldY) {
    const rect = this.container.getBoundingClientRect();
    return {
      x: worldX * this.scale + this.panX + rect.left,
      y: worldY * this.scale + this.panY + rect.top
    };
  }

  zoomAt(screenX, screenY, factor) {
    const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    if (newScale === this.scale) return;

    const rect = this.container.getBoundingClientRect();
    const mouseX = screenX - rect.left;
    const mouseY = screenY - rect.top;

    this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
    this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
    this.scale = newScale;

    this.updateTransform();
  }

  updateTransform() {
    this.world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    const zoomPercent = Math.round(this.scale * 100);
    const zoomElem = document.getElementById('zoom-level-display');
    if (zoomElem) zoomElem.textContent = `${zoomPercent}%`;
    this.renderMinimap();
  }

  resetZoom() {
    this.panX = 0;
    this.panY = 0;
    this.scale = 1.0;
    this.updateTransform();
  }

  fitToView() {
    if (this.nodes.size === 0) return this.resetZoom();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of this.nodes.values()) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + (node.width || 300));
      maxY = Math.max(maxY, node.y + (node.height || 360));
    }

    const padding = 80;
    const boxW = Math.max(400, maxX - minX + padding * 2);
    const boxH = Math.max(300, maxY - minY + padding * 2);

    const contW = this.container.clientWidth;
    const contH = this.container.clientHeight;

    const rawScale = Math.min(contW / boxW, contH / boxH);
    this.scale = Math.max(0.25, Math.min(1.0, rawScale));

    this.panX = (contW - (maxX + minX) * this.scale) / 2;
    this.panY = (contH - (maxY + minY) * this.scale) / 2;

    this.updateTransform();
  }

  // --- TOPOLOGICAL HIERARCHICAL AUTO-LAYOUT (SUGIYAMA ALGORITHM) ---

  autoLayout() {
    const nodesList = Array.from(this.nodes.values());
    if (nodesList.length === 0) return;

    // Role-based hierarchy priorities
    const roleRanks = {
      orchestrator: 0,
      router: 1,
      assistant: 2,
      researcher: 2,
      coder: 2,
      tool: 3,
      evaluator: 4
    };

    const incoming = {};
    const outgoing = {};
    nodesList.forEach(n => {
      incoming[n.id] = [];
      outgoing[n.id] = [];
    });

    for (const edge of this.edges.values()) {
      if (edge.edge_type !== 'fail' && outgoing[edge.source_id] && incoming[edge.target_id]) {
        outgoing[edge.source_id].push(edge.target_id);
        incoming[edge.target_id].push(edge.source_id);
      }
    }

    const layers = {};
    // Seed layers from role ranks
    nodesList.forEach(n => {
      const { frontmatter } = parseFrontmatter(n.content || '');
      const role = (frontmatter.role || 'assistant').toLowerCase();
      layers[n.id] = roleRanks[role] !== undefined ? roleRanks[role] : 2;
    });

    // Group into buckets
    const layerBuckets = {};
    nodesList.forEach(n => {
      const l = layers[n.id] || 0;
      if (!layerBuckets[l]) layerBuckets[l] = [];
      layerBuckets[l].push(n);
    });

    const layerIndices = Object.keys(layerBuckets).map(Number).sort((a, b) => a - b);
    const startX = 140;
    const startY = 120;
    const colWidth = 380;
    const rowGap = 50;

    let maxLayerHeight = 0;
    layerIndices.forEach(l => {
      const bucket = layerBuckets[l];
      const totalH = bucket.reduce((sum, n) => sum + (n.height || 360) + rowGap, 0) - rowGap;
      maxLayerHeight = Math.max(maxLayerHeight, totalH);
    });

    layerIndices.forEach((l, colIdx) => {
      const bucket = layerBuckets[l];
      const totalH = bucket.reduce((sum, n) => sum + (n.height || 360) + rowGap, 0) - rowGap;
      const offsetY = startY + Math.max(0, (maxLayerHeight - totalH) / 2);
      let currentY = offsetY;

      bucket.forEach(n => {
        n.x = startX + colIdx * colWidth;
        n.y = currentY;
        currentY += (n.height || 360) + rowGap;

        this.updateNodePosition(n);
        if (this.onNodeChange) this.onNodeChange(n);
      });
    });

    this.renderEdges();
    this.renderMinimap();
    setTimeout(() => this.fitToView(), 60);
  }

  // --- NODE MANAGEMENT ---

  setNodes(nodesList) {
    this.nodesLayer.innerHTML = '';
    this.nodes.clear();
    for (const node of nodesList) {
      this.addNodeElement(node);
    }
    this.renderEdges();
    this.applyNodeDiagnostics();
    this.renderMinimap();
  }

  addNodeElement(node) {
    this.nodes.set(node.id, { ...node });

    const elem = document.createElement('div');
    elem.className = 'node-block';
    elem.id = `block-${node.id}`;
    elem.style.left = `${node.x}px`;
    elem.style.top = `${node.y}px`;
    elem.style.width = `${node.width || 300}px`;
    elem.style.height = `${node.height || 360}px`;

    const { frontmatter } = parseFrontmatter(node.content || '');
    const role = frontmatter.role || 'agent';

    elem.innerHTML = `
      <div class="node-label-floating">
        <span class="node-label-title">${escapeHtml(node.filename || node.title)}</span>
      </div>
      <div class="node-card">
        <!-- Ports -->
        <div class="port-handle port-top" data-handle="top" data-node-id="${node.id}" title="Connect top"></div>
        <div class="port-handle port-bottom" data-handle="bottom" data-node-id="${node.id}" title="Connect bottom"></div>
        <div class="port-handle port-left" data-handle="left" data-node-id="${node.id}" title="Connect left"></div>
        <div class="port-handle port-right" data-handle="right" data-node-id="${node.id}" title="Connect right"></div>

        <!-- Node Header -->
        <div class="node-header">
          <div class="node-meta">
            <span class="role-badge ${escapeHtml(role)}">${escapeHtml(role)}</span>
          </div>
          <div class="node-actions">
            <button class="node-tool-btn btn-edit" title="Open Full Editor">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button class="node-tool-btn btn-delete" title="Delete Block">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Node Body (Markdown Rendered) -->
        <div class="node-body markdown-body" id="body-${node.id}">
          ${renderMarkdown(node.content || '')}
        </div>

        <!-- Resize Handle -->
        <div class="resize-handle"></div>
      </div>
    `;

    // Event Listeners for Node
    const header = elem.querySelector('.node-header');
    const floatingLabel = elem.querySelector('.node-label-floating');

    const startNodeDrag = (e) => {
      e.stopPropagation();
      if (!e.shiftKey && !this.selectedNodeIds.has(node.id)) {
        this.deselectAll();
      }
      this.selectNode(node.id, e.shiftKey);
      this.draggingNode = node.id;

      const initMap = new Map();
      this.selectedNodeIds.forEach(id => {
        const n = this.nodes.get(id);
        if (n) initMap.set(id, { x: n.x, y: n.y });
      });

      this.dragStart = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        nodeX: this.nodes.get(node.id).x,
        nodeY: this.nodes.get(node.id).y,
        allNodesInitPos: initMap
      };
    };

    if (header) header.addEventListener('mousedown', startNodeDrag);
    if (floatingLabel) floatingLabel.addEventListener('mousedown', startNodeDrag);

    elem.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.selectNode(node.id, e.shiftKey);
    });

    // Resize Handle
    const resizeHandle = elem.querySelector('.resize-handle');
    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.resizingNode = node.id;
      this.resizeStart = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        width: elem.offsetWidth,
        height: elem.offsetHeight
      };
    });

    // Ports Connection
    const ports = elem.querySelectorAll('.port-handle');
    ports.forEach(port => {
      port.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const handle = port.dataset.handle;
        const portPos = this.getPortWorldPosition(node.id, handle);
        this.connectingFrom = { nodeId: node.id, handle, ...portPos };
      });
    });

    // Actions
    const btnEdit = elem.querySelector('.btn-edit');
    btnEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onOpenEditor) this.onOpenEditor(this.nodes.get(node.id));
    });

    const btnDelete = elem.querySelector('.btn-delete');
    btnDelete.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await dialog.confirm({
        title: 'Delete Block',
        message: `Are you sure you want to delete "${node.filename || node.title}"?`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        isDanger: true
      });
      if (confirmed) {
        if (this.onNodeDelete) this.onNodeDelete(node.id);
      }
    });

    // Double click to open editor
    elem.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (this.onOpenEditor) this.onOpenEditor(this.nodes.get(node.id));
    });

    this.nodesLayer.appendChild(elem);
  }

  updateNodePosition(node) {
    const elem = document.getElementById(`block-${node.id}`);
    if (elem) {
      elem.style.left = `${node.x}px`;
      elem.style.top = `${node.y}px`;
    }
  }

  updateNodeDimensions(node) {
    const elem = document.getElementById(`block-${node.id}`);
    if (elem) {
      elem.style.width = `${node.width}px`;
      elem.style.height = `${node.height}px`;
    }
  }

  updateNodeContent(node) {
    this.nodes.set(node.id, { ...node });
    const elem = document.getElementById(`block-${node.id}`);
    if (elem) {
      const label = elem.querySelector('.node-label-title');
      if (label) label.textContent = node.filename || node.title;

      const body = elem.querySelector(`#body-${node.id}`);
      if (body) body.innerHTML = renderMarkdown(node.content || '');

      const { frontmatter } = parseFrontmatter(node.content || '');
      const badge = elem.querySelector('.role-badge');
      if (badge) {
        const role = frontmatter.role || 'agent';
        badge.className = `role-badge ${escapeHtml(role)}`;
        badge.textContent = role;
      }
    }
    this.renderEdges();
    this.renderMinimap();
  }

  removeNode(id) {
    this.nodes.delete(id);
    this.selectedNodeIds.delete(id);
    for (const [edgeId, edge] of this.edges.entries()) {
      if (edge.source_id === id || edge.target_id === id) {
        this.edges.delete(edgeId);
      }
    }
    const elem = document.getElementById(`block-${id}`);
    if (elem) elem.remove();
    this.renderEdges();
    this.renderMinimap();
  }

  selectNode(id, isMulti = false) {
    if (!isMulti) {
      this.deselectAll();
    }
    this.selectedNodeId = id;
    this.selectedNodeIds.add(id);

    const elem = document.getElementById(`block-${id}`);
    if (elem) elem.classList.add('selected');

    if (this.onNodeSelect) this.onNodeSelect(this.nodes.get(id));
  }

  deselectAll() {
    this.selectedNodeId = null;
    this.selectedNodeIds.clear();
    document.querySelectorAll('.node-block.selected').forEach(el => el.classList.remove('selected'));
  }

  focusNode(id) {
    const node = this.nodes.get(id);
    if (!node) return;

    this.selectNode(id, false);

    const screenW = this.container.clientWidth;
    const screenH = this.container.clientHeight;
    const nodeCenterX = node.x + (node.width || 300) / 2;
    const nodeCenterY = node.y + (node.height || 360) / 2;

    this.scale = 1.0;
    this.panX = screenW / 2 - nodeCenterX;
    this.panY = screenH / 2 - nodeCenterY;
    this.updateTransform();

    const elem = document.getElementById(`block-${id}`);
    if (elem) {
      elem.classList.add('node-focus-flash');
      setTimeout(() => elem.classList.remove('node-focus-flash'), 1400);
    }
  }

  setNodeDiagnostics(nodeIssuesMap = {}) {
    this.nodeDiagnostics = nodeIssuesMap;
    this.applyNodeDiagnostics();
  }

  applyNodeDiagnostics() {
    this.nodes.forEach(node => {
      const elem = document.getElementById(`block-${node.id}`);
      if (!elem) return;

      elem.classList.remove('node-has-error', 'node-has-warning');
      const diag = this.nodeDiagnostics[node.id];
      if (diag) {
        if (diag.errors && diag.errors.length > 0) {
          elem.classList.add('node-has-error');
        } else if (diag.warnings && diag.warnings.length > 0) {
          elem.classList.add('node-has-warning');
        }
      }
    });
  }

  setExecutingNode(id, isExecuting = true) {
    const elem = document.getElementById(`block-${id}`);
    if (elem) {
      if (isExecuting) elem.classList.add('executing');
      else elem.classList.remove('executing');
    }
  }

  // --- EDGE & BEZIER RENDERING ---

  setEdges(edgesList) {
    this.edges.clear();
    for (const edge of edgesList) {
      this.edges.set(edge.id, { ...edge });
    }
    this.renderEdges();
  }

  addEdge(edge) {
    this.edges.set(edge.id, { ...edge });
    this.renderEdges();
  }

  removeEdge(id) {
    this.edges.delete(id);
    this.renderEdges();
  }

  getPortWorldPosition(nodeId, handle) {
    const node = this.nodes.get(nodeId);
    if (!node) return { x: 0, y: 0 };

    const w = node.width || 300;
    const h = node.height || 360;
    const x = node.x;
    const y = node.y;

    switch (handle) {
      case 'top':
        return { x: x + w / 2, y: y + 24 };
      case 'bottom':
        return { x: x + w / 2, y: y + h };
      case 'left':
        return { x: x, y: y + (h / 2) + 12 };
      case 'right':
        return { x: x + w, y: y + (h / 2) + 12 };
      default:
        return { x: x + w / 2, y: y + h };
    }
  }

  getHandleNormal(handle) {
    switch (handle) {
      case 'top': return { x: 0, y: -1 };
      case 'bottom': return { x: 0, y: 1 };
      case 'left': return { x: -1, y: 0 };
      case 'right': return { x: 1, y: 0 };
      default: return { x: 0, y: 1 };
    }
  }

  createBezierPath(p1, handle1, p2, handle2) {
    const n1 = this.getHandleNormal(handle1);
    const n2 = this.getHandleNormal(handle2);

    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const curvature = Math.max(50, Math.min(250, dist * 0.45));

    const cp1x = p1.x + n1.x * curvature;
    const cp1y = p1.y + n1.y * curvature;
    const cp2x = p2.x + n2.x * curvature;
    const cp2y = p2.y + n2.y * curvature;

    const pathData = `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;

    // Midpoint for intermediate transition pill (t = 0.5)
    const midX = (p1.x + 3 * cp1x + 3 * cp2x + p2.x) / 8;
    const midY = (p1.y + 3 * cp1y + 3 * cp2y + p2.y) / 8;

    return { pathData, midX, midY };
  }

  renderEdges() {
    this.edgesGroup.innerHTML = '';
    this.edgeLabelsGroup.innerHTML = '';

    for (const edge of this.edges.values()) {
      const p1 = this.getPortWorldPosition(edge.source_id, edge.source_handle || 'bottom');
      const p2 = this.getPortWorldPosition(edge.target_id, edge.target_handle || 'top');

      if (!p1 || !p2) continue;

      const { pathData, midX, midY } = this.createBezierPath(
        p1,
        edge.source_handle || 'bottom',
        p2,
        edge.target_handle || 'top'
      );

      const cond = (edge.condition || '').toLowerCase();
      const isPass = cond === 'pass' || edge.edge_type === 'pass';
      const isFail = cond === 'fail' || cond === 'reject' || edge.edge_type === 'fail' || edge.edge_type === 'feedback_loop';
      const edgeType = isPass ? 'pass' : (isFail ? 'fail' : (edge.edge_type || 'default'));
      const markerId = edgeType === 'pass' ? 'arrow-pass' : (edgeType === 'fail' ? 'arrow-fail' : 'arrow-default');

      // SVG Path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('class', `edge-path edge-type-${edgeType}`);
      path.setAttribute('id', `edge-${edge.id}`);
      path.setAttribute('marker-end', `url(#${markerId})`);
      path.style.cursor = 'pointer';

      path.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.openEdgeInspector(edge);
      });

      this.edgesGroup.appendChild(path);

      // Intermediate Transition Pill (Obsidian style card pill)
      const pillGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      pillGroup.setAttribute('class', `edge-pill-group pill-group-${edgeType}`);
      pillGroup.setAttribute('transform', `translate(${midX}, ${midY})`);

      let displayLabel = edge.label || '';
      if (!displayLabel) {
        displayLabel = isPass ? 'PASS' : (isFail ? `REJECT (max ${edge.max_retries || 5})` : (cond === 'start' ? 'START' : 'NEXT'));
      } else {
        if (isPass && !displayLabel.toUpperCase().startsWith('PASS') && !displayLabel.toUpperCase().startsWith('START')) {
          displayLabel = `PASS: ${displayLabel}`;
        } else if (isFail && !displayLabel.toUpperCase().startsWith('REJECT') && !displayLabel.toUpperCase().startsWith('FAIL')) {
          displayLabel = `REJECT: ${displayLabel}`;
        }
      }

      const pillWidth = Math.max(70, (displayLabel.length * 7.2) + 22);
      const pillHeight = 24;

      const pillBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      pillBg.setAttribute('class', `edge-pill-bg pill-${edgeType}`);
      pillBg.setAttribute('x', -pillWidth / 2);
      pillBg.setAttribute('y', -pillHeight / 2);
      pillBg.setAttribute('width', pillWidth);
      pillBg.setAttribute('height', pillHeight);
      pillBg.setAttribute('rx', 12);

      const pillText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      pillText.setAttribute('class', `edge-pill-text pill-text-${edgeType}`);
      pillText.textContent = displayLabel;

      pillGroup.appendChild(pillBg);
      pillGroup.appendChild(pillText);

      pillGroup.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.openEdgeInspector(edge);
      });

      this.edgeLabelsGroup.appendChild(pillGroup);
    }
  }

  async openEdgeInspector(edge) {
    const res = await dialog.edgeConfig(edge);

    if (res.action === 'delete') {
      if (this.onEdgeDelete) this.onEdgeDelete(edge.id);
    } else if (res.action === 'save') {
      edge.edge_type = res.edge_type;
      edge.label = res.label;
      edge.max_retries = res.max_retries;
      if (this.onEdgeUpdate) this.onEdgeUpdate(edge);
      this.renderEdges();
    }
  }

  renderTempEdge(fromPort, mousePos) {
    this.tempEdgeGroup.innerHTML = '';
    const { pathData } = this.createBezierPath(
      fromPort,
      fromPort.handle,
      mousePos,
      fromPort.handle === 'bottom' ? 'top' : 'bottom'
    );
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('class', 'temp-edge');
    this.tempEdgeGroup.appendChild(path);
  }

  clearTempEdge() {
    this.tempEdgeGroup.innerHTML = '';
  }

  pulseEdge(edgeId, active = true, edgeType = 'default') {
    const path = document.getElementById(`edge-${edgeId}`);
    if (path) {
      if (active) {
        path.classList.add('active-pulse', `pulse-${edgeType}`);
        const markerName = edgeType === 'pass' ? 'arrow-active-pass' : (edgeType === 'fail' ? 'arrow-active-fail' : 'arrow-active');
        path.setAttribute('marker-end', `url(#${markerName})`);
      } else {
        path.classList.remove('active-pulse', 'pulse-pass', 'pulse-fail', 'pulse-default');
        const markerName = edgeType === 'pass' ? 'arrow-pass' : (edgeType === 'fail' ? 'arrow-fail' : 'arrow-default');
        path.setAttribute('marker-end', `url(#${markerName})`);
      }
    }
  }
}
