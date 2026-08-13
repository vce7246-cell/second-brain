# Task 3: Indexer Dual Data Source Merge -- Report

**Status**: PASS

**Date**: 2026-07-21

## Changes Made

File modified: `d:/AAAAA龙正扬/secondbrain/src/server/services/indexer.ts`

### 1. LinkInfo interface extended (line 13-22)
Added optional `sourceType?: 'wikilink' | 'ui'` field. Existing code is unaffected since the field is optional.

### 2. Import added (line 8)
```typescript
import type { LinkStore } from './link-store.js';
```
Type-only import to avoid runtime circular dependency risk.

### 3. New field, setter, and getter (lines 40-50)
- `private linkStore: LinkStore | null = null` -- lazily injected
- `setLinkStore(store: LinkStore)` -- dependency injection method
- `getNotesDir(): string` -- exposes `notesDir` for dashboard routes

### 4. Three merged-data methods (lines 244-332)
- `getMergedLinks(filePath)` -- combines wikilink forward links with UI links from LinkStore, deduplicating by `resolvedPath` or `target`
- `getMergedBacklinks(filePath)` -- combines wikilink backlinks with UI backlinks, deduplicating by `source`
- `getMergedGraphData()` -- produces unified `{ nodes, links }` for D3 force graph, with deduplication via sorted-key Set

## Compilation

`npx tsc --noEmit` passed with zero errors.

## Verification

- All 7 original public methods (`rebuild`, `getLinks`, `getBacklinks`, `getAllPaths`, `getPathToTitle`, `getTitleToPath`, `updateFile`) remain untouched
- When `linkStore` is null (not injected), `getMergedLinks`/`getMergedBacklinks` behave identically to `getLinks`/`getBacklinks` (just with `sourceType: 'wikilink'` added)
- Deduplication prevents the same logical link from appearing twice when it exists in both data sources

## Concerns

None.
