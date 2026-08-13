# Task 12: QuickSwitcher Component

**File created:** `src/client/components/QuickSwitcher.tsx`

## Summary

Implemented a Ctrl+O fuzzy search modal (`QuickSwitcher`) for quickly switching between notes.

## What it does

- Full-screen modal overlay (z-50, dark backdrop) — click backdrop to close
- Auto-focused input with 100ms debounced search via `searchNotes()` API
- Fuzzy-sorted results: titles starting with the query appear first, then localeCompare
- Keyboard navigation: ArrowUp/ArrowDown/Enter/Escape
- Mouse hover sets the active row
- Empty state: "无匹配结果"
- Footer bar with shortcut hints: "↑↓ 选择 · Enter 打开 · Esc 取消"

## Verification

- `npx tsc --noEmit` passed with **0 errors**
- File is 97 lines (well under the 300-line limit)
- No `any` types used
- Uses `.js` import extensions matching project conventions
- Follows existing component patterns (named export, Tailwind classes, typed props)
