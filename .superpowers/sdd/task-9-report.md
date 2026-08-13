# Task 9 Report — GraphView.tsx Rewrite

## What was implemented

### 1. Tag-based node coloring
- `folderTag(id)` extracts the first path segment (e.g. `"学习/TypeScript.md"` -> `"学习"`; root files get `"__root__"`)
- `hashTag()` hashes the folder tag string to a stable integer
- Non-orphan nodes are colored from a 10-color `TAG_COLORS` palette using `hash % palette.length`
- Orphan nodes (nodes appearing in zero links, as source or target) are colored gray (`#d1d5db`)

### 2. Drag-to-link
- Shift+mousedown on a node enters link-drag mode (simulation stops, a dashed blue line appears)
- SVG-level `mousemove.graphlink` handler updates the line endpoint in transformed group coordinates via `d3.pointer(event, g.node())`
- SVG-level `mouseup.graphlink` handler stops the simulation, hit-tests all other nodes within 20 px, calls `addLink()` if a target is found, then restarts the simulation
- After a successful link creation, `triggerReload()` fires to re-fetch the graph

### 3. Local graph mode
- `bfsSubgraph()` does BFS expansion from `centerNode` up to `localDepth` hops over the undirected adjacency
- Returns the induced subgraph (nodes within radius + links where both endpoints are within radius)
- Controlled by `localMode` and `centerNode` props; falls back to full graph when either is falsy

### 4. Variable node radius
- Orphan nodes: radius 4
- Non-orphan nodes: `6 + min(linkCount * 1.5, 10)` where linkCount is the total link participation count

### 5. API integration
- Replaced raw `fetch('/api/notes/graph')` with `fetchGraph()` from `src/client/lib/api.ts`
- Uses `addLink()` from api.ts for drag-to-link

### 6. Props
- Added `linkStoreVersion` (triggers full graph reload)
- Added `localMode`, `centerNode`, `localDepth` for local graph

### 7. Legend
- Updated bottom legend to include `Shift+拖拽连线` hint alongside node/link counts and zoom/drag hints

## Files changed

- `src/client/components/GraphView.tsx` — complete rewrite (207 -> ~280 lines)

## tsc result

`npx tsc --noEmit` — zero errors, zero warnings. Clean pass.

## Any concerns

- **`addLink` after drag-to-link followed by immediate reload**: The `await addLink()` + `triggerReload()` sequence assumes the server processes the POST synchronously before responding. If the server defers link persistence, a brief stale read could occur. In practice this is fine.
- **D3 drag + svg-level handlers coexistence**: The link-drag and normal-drag code paths are guarded by the `dragSrc` closure variable. Normal drag events check `if (dragSrc) return` to avoid interference, and vice versa.
- **No visual feedback on link-drag failure**: If `addLink()` fails (network error, duplicate link, etc.), the dashed line simply disappears with no user-facing error. This is intentional per spec but could be improved later.
- **Orphan detection uses total link participation**: Both source and target roles count. This matches the visual graph being undirected.
