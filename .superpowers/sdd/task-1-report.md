# Task 1 Report: Shared Types & Constants Update

## What Was Implemented

Added v2 data structures across two shared files:

### 1. `src/shared/constants.ts`
Added three new exported constants:
- `SB_DIR` — metadata directory name (`.sb`)
- `LINKS_FILE` — links data filename (`links.json`)
- `CONFIG_FILE` — user config filename (`config.json`)

### 2. `src/client/types/index.ts`
- **Modified** `LinkInfo` interface: added optional `sourceType` field (`'wikilink' | 'ui'`)
- **Added** 7 new interfaces after `LinkInfo`:
  - `UILink` — UI-created link stored in `links.json`
  - `LinkStoreData` — full `links.json` data structure with version, links, tags
  - `GraphNodeEnriched` — graph node with tags, folderTags, isOrphan, backlinkCount
  - `GraphDataEnriched` — graph data with enriched nodes
  - `DashboardData` — dashboard statistics
  - `UnlinkedMention` — unresolved wikilink mention
  - `TagEntry` — tag view entry with type and count

## Files Changed

- `d:\AAAAA龙正扬\secondbrain\src\shared\constants.ts`
- `d:\AAAAA龙正扬\secondbrain\src\client\types\index.ts`

## TypeScript Compilation Result

`npx tsc --noEmit` completed with **zero errors**.

## Issues or Concerns

None.
