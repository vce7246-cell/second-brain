# Task 5: API Client Update — Report

## Status: Completed

## Changes Made

**File modified:** `d:\AAAAA龙正扬\secondbrain\src\client\lib\api.ts`

1. **Added `getRequest` helper** (lines 21–28) — a GET counterpart to the existing `request` POST helper, used by endpoints that don't require a body (`fetchTags`, `fetchDashboard`, `fetchGraph`).

2. **Appended 12 new exported functions** (lines 75–137):

   | Function | Endpoint | Method |
   |---|---|---|
   | `addLink` | `/api/links/add` | POST |
   | `removeLink` | `/api/links/remove` | POST |
   | `fetchMergedLinks` | `/api/links/list` | POST |
   | `addTags` | `/api/tags/add` | POST |
   | `removeTag` | `/api/tags/remove` | POST |
   | `fetchTags` | `/api/tags/list` | GET |
   | `filterByTags` | `/api/tags/filter` | POST |
   | `fetchDashboard` | `/api/dashboard` | GET |
   | `fetchUnlinkedMentions` | `/api/notes/unlinked-mentions` | POST |
   | `fetchGraph` | `/api/notes/graph` | GET |
   | `createDailyNote` | `/api/files/daily-note` | POST |

All existing code (lines 30–72) was preserved intact.

## TypeScript Compilation Result

```
npx tsc --noEmit
```

**Passed — zero errors.**
