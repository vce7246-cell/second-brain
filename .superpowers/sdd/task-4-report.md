# Task 4: Link/Tag API Routes -- Report

**Status: PASS**

## Compilation

`npx tsc --noEmit` passed with zero errors.

## Changes Made

### File: `src/server/routes/notes.ts`

1. **Added imports** (lines 7-9): `fs from 'fs/promises'`, `path from 'path'`, `LinkStore` type import. These were not previously present in the file.

2. **Removed old `/api/notes/graph` endpoint** from `createNotesRouter` (was lines 91-120 of the original). This endpoint built graph data using only wikilinks; the replacement in `createLinksRouter` calls `indexer.getMergedGraphData()` which merges wikilinks + UI links.

3. **Added module-level Zod schemas** (lines 99-117): `LinkAddSchema`, `LinkRemoveSchema`, `TagsAddSchema`, `TagsRemoveSchema`.

4. **Added `createLinksRouter` function** (lines 119-377) with the following endpoints:
   - `POST /api/links/add` -- add UI link, broadcasts `links-changed`
   - `POST /api/links/remove` -- remove UI link, broadcasts `links-changed`
   - `POST /api/links/list` -- get merged links + backlinks for a file
   - `POST /api/tags/add` -- add tags to a file, broadcasts `tags-changed`
   - `POST /api/tags/remove` -- remove tag from a file, broadcasts `tags-changed`
   - `POST /api/tags/filter` -- filter notes by tags (folder tags + manual tags)
   - `GET /api/tags/list` -- get all tag statistics (folder + manual, sorted by count)
   - `GET /api/dashboard` -- dashboard aggregating total notes/links/tags, core nodes, orphan notes, folder groups, recent notes
   - `GET /api/notes/graph` -- replacement graph endpoint using `getMergedGraphData()`
   - `POST /api/notes/unlinked-mentions` -- detect unlinked mentions between notes

### File: `src/server/index.ts`

1. **Updated import** (line 10): Changed `import { createNotesRouter }` to `import { createNotesRouter, createLinksRouter }`.

2. **Added LinkStore import** (line 13): `import { LinkStore } from './services/link-store.js'`.

3. **Added LinkStore initialization** (lines 44-47): After `indexer.rebuild()`, creates `LinkStore`, calls `linkStore.load()`, and calls `indexer.setLinkStore(linkStore)`.

4. **Mounted links router** (line 63): `app.use(createLinksRouter(linkStore, indexer))` right after `createNotesRouter`.

## Concerns

- **Route conflicts**: The new `createLinksRouter` defines `GET /api/notes/graph`, which replaces the old one removed from `createNotesRouter`. The old `createNotesRouter` also has `POST /api/notes/links` and `POST /api/notes/backlinks` -- these are separate from the new `POST /api/links/list` which returns merged data. No conflicts.

- **`unused` variables in dashboard route**: The `req` parameter in `router.get('/api/dashboard', async (req: Request, res: Response) => ...)` is unused. This triggers no error under the current tsconfig settings (it compiles fine), but an ESLint rule like `@typescript-eslint/no-unused-vars` would flag it. Can be addressed later if linting is enabled.

- **Dynamic import of `../ws.js`**: The `createLinksRouter` uses `await import('../ws.js')` to dynamically import `broadcast`. This avoids a circular dependency (ws.ts imports from index.ts or similar). Works correctly at runtime; TypeScript handles the dynamic import fine.
