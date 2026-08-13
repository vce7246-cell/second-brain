# Task 7: BacklinksPanel Upgrade — Report

**Status:** COMPLETED

## What was done

Replaced the entire content of `BacklinksPanel.tsx` with the upgraded version that supports:

1. **Merged backlinks (wikilink + UI links)** in a "🔗 已链接" section — loaded via `fetchMergedLinks()` instead of the old `fetchBacklinks()`.
2. **"💡 未链接提及" section** — detects when other notes' titles appear in the current note's text without an existing link, loaded via `fetchUnlinkedMentions()`.
3. **"链接" button** on each unlinked mention — calls `addLink()` to quickly create the connection, then reloads data.

Additional changes:
- Added `linkStoreVersion` prop to trigger reload when link data changes externally.
- `sourceType === 'ui'` badges shown on UI-sourced backlinks.
- Type imports updated: `LinkInfo` + `UnlinkedMention` (from `../types/index.js`).
- API imports updated: `fetchMergedLinks`, `fetchUnlinkedMentions`, `addLink` (from `../lib/api.js`).

## Compilation result

`npx tsc --noEmit` — PASSED (zero errors, zero warnings).

## File modified

- `d:/AAAAA龙正扬/secondbrain/src/client/components/BacklinksPanel.tsx`
