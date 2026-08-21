/**
 * Obsidian-Style Canvas Engine with Bezier Connections, Port Wiring,
 * Topological DAG Auto-Layout, Marquee Multi-Selection, and Canvas Minimap Radar.
 */

import { renderMarkdown, parseFrontmatter, escapeHtml } from './markdown.js';
import { dialog } from './dialog.js';
import { classifyEdge, deriveEdgeLabel, decorateLabel } from './edgeSemantics.js';
import {
  ROUTING_MODES, DEFAULT_ROUTING_MODE, isRoutingMode,
  pickHandles, portPosition, buildPath, spreadOffsets, handleNormal
} from './edgeRouting.js';
import { themeColor } from './theme.js';

/** The minimap paints to a <canvas>, so role colours are read from the theme. */
const MINIMAP_ROLE_VARS = {
  orchestrator: '--sky-core',
  evaluator: '--emerald-core',
  researcher: '--indigo-core',
  coder: '--violet-core',
  router: '--amber-core',
  tool: '--zinc-core',
  assistant: '--slate-core',
};

const ROUTING_STORAGE_KEY = 'agent-canvas:edge-routing';

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

    // Edge routing. Persisted per browser: it is a viewing preference, not graph data,
    // so it must not vary between people opening the same project.
    this.edgeRouting = this.loadRoutingPreference();

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
      const isInteractive = e.target.closest('.node-block, .port-handle, .resize-handle, .edge-pill-group, .floating-controls, .btn, button, input, textarea, a, .in-dom-dialog-overlay, .modal-backdrop, .top-nav, .files-sidebar, .canvas-minimap-container, .graph-diagnostics-popover, .floating-copilot-btn, .chat-copilot-drawer');
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
    window.addEventListener('themechange', () => this.renderMinimap());

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

      ctx.fillStyle = themeColor(MINIMAP_ROLE_VARS[role] || MINIMAP_ROLE_VARS.assistant);
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
    this.hideNodeInspector();
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

  /**
   * Arrange nodes as a layered DAG: columns follow the pipeline's actual flow, and rows
   * are ordered to minimise edge crossings.
   *
   * The previous version assigned columns from the agent's *role*, so every `coder`,
   * `researcher` and `assistant` landed in one column no matter where they sat in the
   * pipeline — Planner, Coder, Documenter and Test-Writer stacked on top of each other
   * while their edges crossed the whole canvas to reach the evaluator column. Roles now
   * only break ties for nodes the graph cannot place.
   */
  autoLayout() {
    const nodesList = Array.from(this.nodes.values());
    if (nodesList.length === 0) return;

    const ids = nodesList.map(n => n.id);
    const idSet = new Set(ids);

    // Layering uses forward edges only. A fail edge is a loop back to an earlier stage —
    // counting it would make the graph cyclic and collapse the layering.
    const forward = [];
    for (const edge of this.edges.values()) {
      if (!idSet.has(edge.source_id) || !idSet.has(edge.target_id)) continue;
      if (edge.source_id === edge.target_id) continue;
      if (classifyEdge(edge) === 'fail') continue;
      forward.push([edge.source_id, edge.target_id]);
    }

    const layer = this.assignLayers(ids, forward);

    const buckets = new Map();
    for (const n of nodesList) {
      const l = layer.get(n.id) || 0;
      if (!buckets.has(l)) buckets.set(l, []);
      buckets.get(l).push(n);
    }
    const layerIndices = [...buckets.keys()].sort((a, b) => a - b);

    this.orderLayers(layerIndices, buckets, forward, layer);

    // Columns are sized from the widest node in each layer plus a lane for the edge
    // trunks and their label pills, which is where the old fixed 380px fell short.
    const startX = 140;
    const startY = 120;
    const laneWidth = 190;
    const rowGap = 60;

    let maxLayerHeight = 0;
    for (const l of layerIndices) {
      const totalH = buckets.get(l).reduce((sum, n) => sum + (n.height || 360) + rowGap, 0) - rowGap;
      maxLayerHeight = Math.max(maxLayerHeight, totalH);
    }

    let x = startX;
    for (const l of layerIndices) {
      const bucket = buckets.get(l);
      const colWidth = Math.max(...bucket.map(n => n.width || 300));
      const totalH = bucket.reduce((sum, n) => sum + (n.height || 360) + rowGap, 0) - rowGap;
      let y = startY + Math.max(0, (maxLayerHeight - totalH) / 2);

      for (const n of bucket) {
        n.x = x;
        n.y = y;
        y += (n.height || 360) + rowGap;
        this.updateNodePosition(n);
        if (this.onNodeChange) this.onNodeChange(n);
      }
      x += colWidth + laneWidth;
    }

    this.renderEdges();
    this.renderMinimap();
    setTimeout(() => this.fitToView(), 60);
  }

  /**
   * Longest-path layering: every node sits one column right of its furthest predecessor.
   *
   * Longest-path rather than BFS depth because a node with two predecessors in different
   * columns must go after *both*, otherwise its incoming edges run backwards. Nodes still
   * unplaced after the sweep are cycle members or orphans; they fall back to role rank so
   * they at least land somewhere sensible.
   */
  assignLayers(ids, forward) {
    const preds = new Map(ids.map(id => [id, []]));
    const succs = new Map(ids.map(id => [id, []]));
    for (const [s, t] of forward) {
      succs.get(s).push(t);
      preds.get(t).push(s);
    }

    const indeg = new Map(ids.map(id => [id, preds.get(id).length]));
    const layer = new Map();
    const queue = ids.filter(id => indeg.get(id) === 0);
    queue.forEach(id => layer.set(id, 0));

    while (queue.length) {
      const u = queue.shift();
      for (const v of succs.get(u)) {
        layer.set(v, Math.max(layer.get(v) ?? 0, (layer.get(u) ?? 0) + 1));
        indeg.set(v, indeg.get(v) - 1);
        if (indeg.get(v) === 0) queue.push(v);
      }
    }

    // Anything left is in a cycle the fail-edge filter did not break (a gate that both
    // receives from and returns to the same stage, for instance).
    //
    // Resolve these by repeated relaxation rather than a single pass: placing one cycle
    // member often reveals the layer for the next, and a single pass would only catch
    // that if the nodes happened to be visited in dependency order.
    const unplaced = ids.filter(id => !layer.has(id));
    for (let pass = 0; pass < unplaced.length && unplaced.some(id => !layer.has(id)); pass++) {
      for (const id of unplaced) {
        if (layer.has(id)) continue;
        const known = preds.get(id).map(p => layer.get(p)).filter(v => v !== undefined);
        if (known.length) layer.set(id, Math.min(...known) + 1);
      }
    }

    // Still nothing: a closed cycle with no placed entry point. Fall back to role rank.
    const roleRanks = { orchestrator: 0, router: 1, researcher: 2, assistant: 3, coder: 3, tool: 4, evaluator: 5 };
    for (const id of ids) {
      if (layer.has(id)) continue;
      const { frontmatter } = parseFrontmatter(this.nodes.get(id)?.content || '');
      layer.set(id, roleRanks[(frontmatter.role || 'assistant').toLowerCase()] ?? 3);
    }

    return layer;
  }

  /**
   * Barycentre ordering — the standard Sugiyama crossing-reduction heuristic.
   *
   * Each node is pulled toward the average row of its neighbours in the adjacent layer;
   * sorting by that average untangles most crossings. Sweeping forward then backward a
   * few times lets the ordering settle instead of only satisfying one direction.
   */
  orderLayers(layerIndices, buckets, forward, layer) {
    const neighboursIn = new Map();
    const neighboursOut = new Map();
    for (const [s, t] of forward) {
      if (!neighboursIn.has(t)) neighboursIn.set(t, []);
      if (!neighboursOut.has(s)) neighboursOut.set(s, []);
      neighboursIn.get(t).push(s);
      neighboursOut.get(s).push(t);
    }

    const rowOf = new Map();
    const reindex = () => {
      for (const l of layerIndices) buckets.get(l).forEach((n, i) => rowOf.set(n.id, i));
    };
    reindex();

    const barycentre = (node, side) => {
      const nbrs = (side === 'in' ? neighboursIn : neighboursOut).get(node.id) || [];
      const rows = nbrs.map(id => rowOf.get(id)).filter(v => v !== undefined);
      // No neighbour on that side: keep the current row so the node does not jump to the top.
      return rows.length ? rows.reduce((a, c) => a + c, 0) / rows.length : rowOf.get(node.id);
    };

    for (let pass = 0; pass < 4; pass++) {
      const order = pass % 2 === 0 ? layerIndices : [...layerIndices].reverse();
      const side = pass % 2 === 0 ? 'in' : 'out';
      for (const l of order) {
        const bucket = buckets.get(l);
        // Decorate-sort-undecorate keeps it stable: equal barycentres retain their order.
        bucket
          .map((n, i) => ({ n, i, b: barycentre(n, side) }))
          .sort((a, b) => (a.b - b.b) || (a.i - b.i))
          .forEach((entry, i) => { bucket[i] = entry.n; });
        reindex();
      }
    }
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
        <span class="node-label-role-dot role-${escapeHtml(role)}"></span>
        <span class="node-label-title">${escapeHtml(node.title || node.filename)}</span>
        <span class="node-label-filename">${escapeHtml(node.filename)}</span>
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
            <span class="node-header-title">${escapeHtml(node.title || node.filename)}</span>
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

    // Accessibility Hover Inspector
    elem.addEventListener('mouseenter', () => {
      if (this.isPanning || this.draggingNode || this.connectingFrom) return;
      this.showNodeInspector(node.id, elem);
    });

    elem.addEventListener('mouseleave', () => {
      this.hideNodeInspector();
    });

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

  // --- ACCESSIBILITY AGENT HOVER INSPECTOR ---

  showNodeInspector(nodeId, nodeElem) {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const inspector = document.getElementById('canvas-node-inspector');
    if (!inspector) return;

    const { frontmatter } = parseFrontmatter(node.content || '');
    const role = (frontmatter.role || node.role || 'assistant').toLowerCase();
    const desc = frontmatter.description || '';
    const tools = frontmatter.tools || [];
    const skills = frontmatter.skills || [];

    // Find outgoing and incoming edges
    const outgoing = [];
    const incoming = [];

    this.edges.forEach(e => {
      if (e.source_id === nodeId) {
        const tgt = this.nodes.get(e.target_id);
        if (tgt) outgoing.push({ condition: e.condition || e.edge_type || 'next', target: tgt.filename || tgt.title });
      }
      if (e.target_id === nodeId) {
        const src = this.nodes.get(e.source_id);
        if (src) incoming.push({ condition: e.condition || e.edge_type || 'next', source: src.filename || src.title });
      }
    });

    // Dim non-connected blocks and illuminate connected ones
    document.querySelectorAll('.node-block').forEach(el => {
      if (el === nodeElem) {
        el.classList.add('hover-focused');
        el.classList.remove('hover-dimmed', 'hover-connected');
      } else {
        const otherId = el.id.replace('block-', '');
        const isConnected = outgoing.some(o => this.nodes.get(otherId)?.filename === o.target) || 
                            incoming.some(i => this.nodes.get(otherId)?.filename === i.source);
        if (isConnected) {
          el.classList.add('hover-connected');
          el.classList.remove('hover-dimmed');
        } else {
          el.classList.add('hover-dimmed');
          el.classList.remove('hover-connected', 'hover-focused');
        }
      }
    });

    // Highlight connected edge lines
    this.highlightConnectedEdges(nodeId);

    // Build inspector HTML
    inspector.innerHTML = `
      <div class="inspector-card role-${escapeHtml(role)}">
        <div class="inspector-top-row">
          <span class="inspector-role-badge role-${escapeHtml(role)}">${escapeHtml(role.toUpperCase())}</span>
          <span class="inspector-title">${escapeHtml(node.title || node.filename)}</span>
          <span class="inspector-filename">${escapeHtml(node.filename)}</span>
        </div>
        ${desc ? `<div class="inspector-desc">${escapeHtml(desc)}</div>` : ''}
        ${(tools.length > 0 || skills.length > 0) ? `
          <div class="inspector-meta-row">
            ${tools.length > 0 ? `
              <div class="inspector-meta-group">
                <span class="inspector-meta-label">TOOLS:</span>
                <div class="inspector-pills">${tools.map(t => `<span class="inspector-pill pill-tool">${escapeHtml(t)}</span>`).join('')}</div>
              </div>
            ` : ''}
            ${skills.length > 0 ? `
              <div class="inspector-meta-group">
                <span class="inspector-meta-label">SKILLS:</span>
                <div class="inspector-pills">${skills.map(s => `<span class="inspector-pill pill-skill">${escapeHtml(s)}</span>`).join('')}</div>
              </div>
            ` : ''}
          </div>
        ` : ''}
        ${(outgoing.length > 0 || incoming.length > 0) ? `
          <div class="inspector-routing-row">
            ${incoming.length > 0 ? `
              <div class="inspector-route-group">
                <span class="inspector-route-direction">INCOMING</span>
                <span class="inspector-route-list">${incoming.map(i => `<span class="route-tag route-in">${escapeHtml(i.source)} [${escapeHtml(i.condition)}]</span>`).join('')}</span>
              </div>
            ` : ''}
            ${outgoing.length > 0 ? `
              <div class="inspector-route-group">
                <span class="inspector-route-direction">OUTGOING</span>
                <span class="inspector-route-list">${outgoing.map(o => `<span class="route-tag route-out ${escapeHtml(o.condition)}">${escapeHtml(o.condition)} ➜ ${escapeHtml(o.target)}</span>`).join('')}</span>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;

    // Position tooltip nicely on screen
    const rect = nodeElem.getBoundingClientRect();
    inspector.classList.remove('hidden');

    const inspW = inspector.offsetWidth || 340;
    const inspH = inspector.offsetHeight || 110;

    let left = rect.left + rect.width / 2 - inspW / 2;
    left = Math.max(16, Math.min(window.innerWidth - inspW - 16, left));

    let top = rect.top - inspH - 12;
    if (top < 64) {
      top = rect.bottom + 12;
    }

    inspector.style.left = `${left}px`;
    inspector.style.top = `${top}px`;
  }

  hideNodeInspector() {
    const inspector = document.getElementById('canvas-node-inspector');
    if (inspector) {
      inspector.classList.add('hidden');
    }
    document.querySelectorAll('.node-block').forEach(el => {
      el.classList.remove('hover-focused', 'hover-connected', 'hover-dimmed');
    });
    this.clearEdgeHighlights();
  }

  highlightConnectedEdges(nodeId) {
    document.querySelectorAll('.edge-path').forEach(path => {
      const srcId = path.dataset.sourceId;
      const tgtId = path.dataset.targetId;
      if (srcId === nodeId || tgtId === nodeId) {
        path.classList.add('edge-hover-highlight');
        path.classList.remove('edge-hover-dimmed');
      } else {
        path.classList.add('edge-hover-dimmed');
        path.classList.remove('edge-hover-highlight');
      }
    });
    document.querySelectorAll('.edge-pill-group').forEach(grp => {
      const srcId = grp.dataset.sourceId;
      const tgtId = grp.dataset.targetId;
      if (srcId === nodeId || tgtId === nodeId) {
        grp.classList.remove('edge-hover-dimmed');
      } else {
        grp.classList.add('edge-hover-dimmed');
      }
    });
  }

  clearEdgeHighlights() {
    document.querySelectorAll('.edge-path').forEach(path => {
      path.classList.remove('edge-hover-highlight', 'edge-hover-dimmed');
    });
    document.querySelectorAll('.edge-pill-group').forEach(grp => {
      grp.classList.remove('edge-hover-dimmed');
    });
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

  nodeBox(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return null;
    return { x: node.x, y: node.y, width: node.width || 300, height: node.height || 360 };
  }

  getPortWorldPosition(nodeId, handle) {
    const box = this.nodeBox(nodeId);
    if (!box) return { x: 0, y: 0 };
    return portPosition(box, handle);
  }

  getHandleNormal(handle) {
    return handleNormal(handle);
  }

  // --- EDGE ROUTING PREFERENCE ---

  loadRoutingPreference() {
    try {
      const stored = localStorage.getItem(ROUTING_STORAGE_KEY);
      if (isRoutingMode(stored)) return stored;
    } catch {
      // Private browsing or a blocked storage partition. Not worth failing the canvas over.
    }
    return DEFAULT_ROUTING_MODE;
  }

  setEdgeRouting(mode) {
    if (!isRoutingMode(mode) || mode === this.edgeRouting) return;
    this.edgeRouting = mode;
    try {
      localStorage.setItem(ROUTING_STORAGE_KEY, mode);
    } catch {
      // Preference just won't survive a reload.
    }
    this.renderEdges();
    this.container.dispatchEvent(new CustomEvent('edge-routing-changed', { detail: { mode }, bubbles: true }));
  }

  /**
   * Work out the anchor points and path for one edge.
   *
   * Handles stored on the edge are honoured — a user who dragged a wire from a specific
   * port meant it. Everything else is derived from the current geometry, so the routing
   * stays sensible after nodes are moved or auto-laid-out.
   */
  computeEdgeGeometry(edge, spread = 0) {
    const srcBox = this.nodeBox(edge.source_id);
    const tgtBox = this.nodeBox(edge.target_id);
    if (!srcBox || !tgtBox) return null;

    const auto = pickHandles(srcBox, tgtBox);
    const h1 = edge.source_handle || auto.source;
    const h2 = edge.target_handle || auto.target;

    // Fan the anchors apart along the node face as well as the path itself, otherwise
    // parallel edges still converge to a single point at each end.
    const p1 = portPosition(srcBox, h1, spread);
    const p2 = portPosition(tgtBox, h2, spread);

    return { ...buildPath(p1, h1, p2, h2, this.edgeRouting, spread), p1, p2, h1, h2 };
  }

  /**
   * Group edges by unordered node pair so a bundle running between the same two nodes
   * can be fanned. Unordered because A→B and B→A are visually the same corridor — the
   * reviewer/coder reject loop sits right on top of the coder/reviewer forward edge
   * otherwise.
   */
  edgeSpreadMap() {
    const buckets = new Map();
    for (const edge of this.edges.values()) {
      const key = [edge.source_id, edge.target_id].sort().join('::');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(edge.id);
    }

    const spreads = new Map();
    for (const ids of buckets.values()) {
      const offsets = spreadOffsets(ids.length);
      ids.forEach((id, i) => spreads.set(id, offsets[i]));
    }
    return spreads;
  }

  renderEdges() {
    this.edgesGroup.innerHTML = '';
    this.edgeLabelsGroup.innerHTML = '';

    // Lets CSS react to the mode (round joins for orthogonal, for instance).
    this.edgesGroup.setAttribute('class', `edge-routing-${this.edgeRouting}`);

    const spreads = this.edgeSpreadMap();

    for (const edge of this.edges.values()) {
      const geometry = this.computeEdgeGeometry(edge, spreads.get(edge.id) || 0);
      if (!geometry) continue;

      const pathData = geometry.d;
      const midX = geometry.mid.x;
      const midY = geometry.mid.y;

      const srcNode = this.nodes.get(edge.source_id);
      const tgtNode = this.nodes.get(edge.target_id);

      // Shared with the MCP writer (edgeSemantics.js) so an edge is coloured the same
      // way no matter whether an agent, the inspector, or a legacy row created it.
      const edgeType = classifyEdge(edge);
      const isFail = edgeType === 'fail';
      const markerId = edgeType === 'pass' ? 'arrow-pass' : (edgeType === 'fail' ? 'arrow-fail' : 'arrow-default');

      // A transparent fat stroke under the visible one. Structured routing puts long
      // straight runs close together, and a 2px line is a genuinely hard click target.
      const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitArea.setAttribute('d', pathData);
      hitArea.setAttribute('class', 'edge-hit-area');
      hitArea.setAttribute('data-source-id', edge.source_id);
      hitArea.setAttribute('data-target-id', edge.target_id);
      hitArea.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEdgeInspector(edge);
      });
      this.edgesGroup.appendChild(hitArea);

      // SVG Path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('class', `edge-path edge-type-${edgeType}`);
      path.setAttribute('id', `edge-${edge.id}`);
      path.setAttribute('data-source-id', edge.source_id);
      path.setAttribute('data-target-id', edge.target_id);
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
      pillGroup.setAttribute('data-source-id', edge.source_id);
      pillGroup.setAttribute('data-target-id', edge.target_id);
      pillGroup.setAttribute('transform', `translate(${midX}, ${midY})`);

      // An unlabelled edge falls back to naming its two endpoints rather than a bare
      // "NEXT", which is indistinguishable from every other edge once they cross.
      const retryHint = isFail ? (edge.max_retries || undefined) : undefined;
      const displayLabel = edge.label
        ? decorateLabel(edge.label, edgeType, retryHint)
        : deriveEdgeLabel(
            srcNode ? (srcNode.filename || srcNode.title) : edge.source_id,
            tgtNode ? (tgtNode.filename || tgtNode.title) : edge.target_id,
            edgeType,
            retryHint
          );

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

    // The wire being dragged uses the same routing mode as the finished edges, so what
    // you see while dragging is what you get when you drop.
    const opposite = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' };
    const { d } = buildPath(
      fromPort,
      fromPort.handle,
      mousePos,
      opposite[fromPort.handle] || 'top',
      this.edgeRouting
    );

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
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
