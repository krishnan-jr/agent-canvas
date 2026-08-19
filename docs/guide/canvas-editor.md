# Canvas & Visual Editor

The visual canvas is an infinite graph environment built for rapid multi-agent architecture and topological validation.

---

## Visual Overview

![Agent Canvas Overview](/images/canvas-overview.png)

---

## Canvas Mechanics & Navigation

### Infinite Panning & Zooming
- **Middle-Click Pan**: Hold middle mouse button anywhere to pan the canvas smoothly.
- **Spacebar + Left Click**: Hold `Space` and drag with left mouse button.
- **Scroll Wheel Zoom**: Zoom in/out proportionally centered around the mouse cursor position.
- **Minimap Radar**: View the global graph footprint in the bottom-right radar pane. Click or drag inside the radar viewport to jump across the canvas.

### Agent Block Interactions
- **Selection**: Click a block card to select it (glowing amber border).
- **Dragging**: Drag any block to reposition it. Connected bezier curves recalculate and animate in real time.
- **Quick Edit**: Click on a block's title to rename its `.md` file in-place.
- **Deep Edit**: Double-click any block card or click the edit icon in its context menu to launch the **Deep Markdown Editor Modal**.

---

## Connection Routing & Decision Pills

```
[ Orchestrator ] ────( on: pass )────► [ Evaluator ]
       │                                     │
       └──────────────( on: fail )───────────┘
```

### Dragging Port Terminals
Each agent block has 4 draggable connection ports:
- **Top Port**: Upstream entry / retry transition.
- **Right Port**: Downstream primary flow.
- **Bottom Port**: Fallback / alternate route.
- **Left Port**: Feedback loop / retry return.

### Transition Routing Pills
Clicking any connection line reveals an interactive decision pill:
- **`on: pass`** (Emerald): Normal progression upon successful evaluation.
- **`on: fail`** (Amber / Crimson): Error-handling or retry loop triggered when validation fails.
- **`on: next`** (Sky Blue): Unconditional pipeline progression.
- **`max_retries: <int>`**: Configures automatic retry transition limits before escalating to fallback agents.

---

## Auto-Layout Engine

Click the **•••** overflow menu in the top navigation bar and select **Auto Layout**. 

The canvas executes a layered topological sort using a Sugiyama-style algorithm:
1. Calculates DAG hierarchy and dependency depth.
2. Organizes root supervisors (`orchestrator`) on the left/top.
3. Aligns workers, researchers, and coders in parallel vertical columns.
4. Centers guardrails (`evaluator`) and final export nodes at the right/bottom.
