# Task 14 Report — App.tsx v2 Integration

## Status: Complete

## Changes Made

Rewrote `src/client/App.tsx` to integrate all v2 components built in Tasks 1-13.

### Panel type expanded
- Old: `'editor' | 'graph'`
- New: `'dashboard' | 'editor' | 'graph' | 'tags' | 'local-graph'`

### New state added
- `linkStoreVersion` (number, default 0) — incremented on `links-changed` and `tags-changed` WS messages
- `showQuickSwitcher` (boolean, default false) — controls QuickSwitcher modal visibility

### Default view changed
- Old: `'editor'`
- New: `'dashboard'`

### New components integrated
- `LinkPanel` — shown in right sidebar of editor (fixed 140px, border-t)
- `Dashboard` — full view with `onNavigate` + `refreshKey` props
- `TagView` — full view with `onNavigate` + `refreshKey` props
- `QuickSwitcher` — modal overlay, toggled by Ctrl+O

### Top nav changes
Added buttons: 概览 (dashboard), 标签 (tags), 图谱 (graph, renamed from old), 局部图谱 (local-graph, conditional on `selectedFile`), 📅 今日笔记 (daily note)

### WebSocket changes
Added cases for `'links-changed'` and `'tags-changed'` — both increment `linkStoreVersion`

### Keyboard shortcuts
- Ctrl+O → opens QuickSwitcher modal
- Ctrl+S → triggers `handleSave()` (pre-existing function, listener added)

### Editor right sidebar restructured
3 stacked panels instead of 2:
1. `MarkdownPreview` — flex-1, overflow-hidden (fills remaining space)
2. `LinkPanel` — shrink-0, fixed 140px height, border-t
3. `BacklinksPanel` — shrink-0, fixed 160px height, border-t

### Updated existing component props
- `BacklinksPanel` now receives `linkStoreVersion` and `onNavigate` (was `setSelectedFile`)
- `GraphView` now receives `linkStoreVersion`, `localMode`, `centerNode` props in both graph and local-graph modes

### New helpers
- `handleNavigate(filePath)` — sets selected file and switches to editor
- `handleDailyNote()` — calls `createDailyNote('daily')` API, navigates to result

### Preserved functionality
- All existing file loading, saving, dirty tracking, error handling
- WebSocket reconnection via `useWebSocket` hook
- `handleWikilinkClick` stub (unchanged)

## Verification

```
npx tsc --noEmit
```
Result: zero errors.
