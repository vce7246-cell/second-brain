# SecondBrain v2 — 界面链接 + 知识梳理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改笔记原文的前提下，通过外挂链接存储 + 标签系统 + 仪表盘 + 图谱增强，将 sb 从"带图谱的 Markdown 编辑器"升级为"知识梳理工具"。

**Architecture:** 后端新增 `link-store.ts` 服务管理 `.sb/links.json` 的读写，indexer 合并 `[[]]` 和界面链接双数据源；前端新增 LinkPanel、Dashboard、TagView、QuickSwitcher 四个组件，App.tsx 新增视图路由。

**Tech Stack:** Same as current MVP — Express 4 + React 18 + TypeScript 5 + D3.js v7 + Tailwind CSS 3 + Zod 3 + chokidar + ws

## Global Constraints

- `.sb/` 目录下所有文件为机器可写 JSON，手动编辑不保证兼容
- 链接操作立即写入磁盘，不使用 debounce（NFR 要求）
- 前端 API 调用通过 `src/client/lib/api.ts` 统一封装
- 后端所有路由输入必须用 Zod 校验
- 单文件不超过 300 行
- 禁止 `any` 类型

---

## Phase 1: 后端基础

### Task 1: 共享类型与常量更新

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/client/types/index.ts`

**Interfaces:**
- Produces: `SB_DIR`, `LINKS_FILE`, `CONFIG_FILE` constants; `UILink`, `UITag`, `GraphNodeEnriched`, `GraphDataEnriched` types

---

- [ ] **Step 1: 更新 `src/shared/constants.ts`**

```typescript
/** 前后端共享常量 */

/** 默认服务器端口 */
export const DEFAULT_PORT = 3000;

/** 前端开发服务器端口 */
export const CLIENT_DEV_PORT = 5173;

/** WebSocket 路径 */
export const WS_PATH = '/ws';

/** sb 元数据目录名（相对于笔记根目录） */
export const SB_DIR = '.sb';

/** 链接数据文件名 */
export const LINKS_FILE = 'links.json';

/** 用户配置文件名 */
export const CONFIG_FILE = 'config.json';
```

- [ ] **Step 2: 更新 `src/client/types/index.ts`**

```typescript
/** 目录树节点 */
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/** 文件读取响应 */
export interface FileContent {
  filePath: string;
  content: string;
}

/** 笔记搜索结果项 */
export interface NoteSearchResult {
  path: string;
  title: string;
}

/** 链接信息（来自 [[wikilink]] 解析或界面链接） */
export interface LinkInfo {
  source: string;
  target: string;
  resolvedPath: string | null;
  /** 链接来源类型 */
  sourceType?: 'wikilink' | 'ui';
}

/** 界面链接（存储在 links.json 中） */
export interface UILink {
  from: string;
  to: string;
}

/** links.json 的数据结构 */
export interface LinkStoreData {
  version: number;
  links: UILink[];
  tags: Record<string, string[]>;
}

/** 图谱节点（增强版，含标签信息） */
export interface GraphNodeEnriched {
  id: string;
  label: string;
  tags: string[];
  folderTags: string[];
  isOrphan: boolean;
  backlinkCount: number;
}

/** 图谱数据（增强版） */
export interface GraphDataEnriched {
  nodes: GraphNodeEnriched[];
  links: Array<{ source: string; target: string }>;
}

/** 仪表盘数据 */
export interface DashboardData {
  totalNotes: number;
  totalLinks: number;
  totalTags: number;
  coreNodes: Array<{ path: string; title: string; backlinkCount: number }>;
  orphanNotes: Array<{ path: string; title: string }>;
  folderGroups: Array<{ name: string; count: number; linkCount: number }>;
  recentNotes: Array<{ path: string; title: string; mtime: number }>;
}

/** 未链接提及 */
export interface UnlinkedMention {
  sourcePath: string;
  targetPath: string;
  matchedText: string;
}

/** 标签视图条目 */
export interface TagEntry {
  name: string;
  type: 'folder' | 'manual';
  count: number;
}
```

- [ ] **Step 3: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/shared/constants.ts src/client/types/index.ts
git commit -m "feat: add v2 shared types and .sb constants"
```

---

### Task 2: Link Store 服务（links.json 读写）

**Files:**
- Create: `src/server/services/link-store.ts`

**Interfaces:**
- Produces: `LinkStore` class with `load()`, `addLink(from, to)`, `removeLink(from, to)`, `getLinks(filePath)`, `getBacklinks(filePath)`, `getAllLinks()`, `addTags(filePath, tags)`, `removeTag(filePath, tag)`, `getTags(filePath)`, `getAllTags()`, `getTagCounts()`, `getOrphanNotes(allPaths)`, `getCoreNotes(topN)`, `getFolderGroups(allPaths)`

---

- [ ] **Step 1: 创建 `src/server/services/link-store.ts`**

```typescript
/**
 * Link Store — 管理 .sb/links.json 的读写
 * 存储界面链接和标签，不侵入笔记原文
 */
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { SB_DIR, LINKS_FILE } from '../../shared/constants.js';
import type { UILink, LinkStoreData } from '../../client/types/index.js';

const CURRENT_VERSION = 1;

function emptyData(): LinkStoreData {
  return { version: CURRENT_VERSION, links: [], tags: {} };
}

export class LinkStore {
  private data: LinkStoreData = emptyData();
  private filePath: string;

  constructor(notesDir: string) {
    this.filePath = path.join(notesDir, SB_DIR, LINKS_FILE);
  }

  /** 从磁盘加载 links.json，不存在则创建 */
  async load(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as LinkStoreData;

      // 版本迁移（当前只有 v1，后续版本在这里做兼容）
      if (parsed.version !== CURRENT_VERSION) {
        this.data = emptyData();
        return;
      }

      this.data = parsed;
    } catch {
      // 文件不存在或格式损坏，初始化为空
      this.data = emptyData();
      await this.save();
    }
  }

  /** 写入磁盘 */
  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  /** 添加链接 */
  async addLink(from: string, to: string): Promise<void> {
    const exists = this.data.links.some((l) => l.from === from && l.to === to);
    if (exists) return;
    this.data.links.push({ from, to });
    await this.save();
  }

  /** 删除链接 */
  async removeLink(from: string, to: string): Promise<void> {
    this.data.links = this.data.links.filter(
      (l) => !(l.from === from && l.to === to)
    );
    await this.save();
  }

  /** 获取某文件的出链（界面链接） */
  getLinks(filePath: string): UILink[] {
    return this.data.links.filter((l) => l.from === filePath);
  }

  /** 获取某文件的反向链接（界面链接） */
  getBacklinks(filePath: string): UILink[] {
    return this.data.links.filter((l) => l.to === filePath);
  }

  /** 获取所有界面链接 */
  getAllLinks(): UILink[] {
    return this.data.links;
  }

  /** 添加标签 */
  async addTags(filePath: string, tags: string[]): Promise<void> {
    if (!this.data.tags[filePath]) {
      this.data.tags[filePath] = [];
    }
    const existing = this.data.tags[filePath];
    for (const tag of tags) {
      if (!existing.includes(tag)) {
        existing.push(tag);
      }
    }
    await this.save();
  }

  /** 删除标签 */
  async removeTag(filePath: string, tag: string): Promise<void> {
    if (!this.data.tags[filePath]) return;
    this.data.tags[filePath] = this.data.tags[filePath].filter((t) => t !== tag);
    if (this.data.tags[filePath].length === 0) {
      delete this.data.tags[filePath];
    }
    await this.save();
  }

  /** 获取某文件的标签 */
  getTags(filePath: string): string[] {
    return this.data.tags[filePath] || [];
  }

  /** 获取所有标签 → 关联文件列表 */
  getAllTags(): Record<string, string[]> {
    return this.data.tags;
  }

  /** 获取标签 → 笔记数统计 */
  getTagCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const tags of Object.values(this.data.tags)) {
      for (const tag of tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return counts;
  }

  /** 获取孤岛笔记（无任何链接的文件） */
  getOrphanNotes(allPaths: string[]): string[] {
    const linked = new Set<string>();
    for (const link of this.data.links) {
      linked.add(link.from);
      linked.add(link.to);
    }
    return allPaths.filter((p) => !linked.has(p));
  }

  /** 获取核心节点（被链最多的 N 篇） */
  getCoreNotes(topN: number): Array<{ path: string; count: number }> {
    const counts = new Map<string, number>();
    for (const link of this.data.links) {
      counts.set(link.to, (counts.get(link.to) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  }

  /** 获取文件夹分组统计 */
  getFolderGroups(allPaths: string[]): Map<string, { count: number; linkCount: number }> {
    const groups = new Map<string, { count: number; linkCount: number }>();

    for (const p of allPaths) {
      const dir = path.dirname(p);
      const parts = dir.split('/');
      // 每层目录都是一个分组
      let accumulated = '';
      for (const part of parts) {
        if (!part) continue;
        accumulated = accumulated ? `${accumulated}/${part}` : part;
        if (!groups.has(accumulated)) {
          groups.set(accumulated, { count: 0, linkCount: 0 });
        }
        groups.get(accumulated)!.count++;
      }
    }

    // 统计每个文件夹的链接数
    for (const link of this.data.links) {
      const fromDir = path.dirname(link.from);
      if (groups.has(fromDir)) {
        groups.get(fromDir)!.linkCount++;
      }
    }

    return groups;
  }
}
```

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/services/link-store.ts
git commit -m "feat: add LinkStore service for .sb/links.json management"
```

---

### Task 3: Indexer 合并双数据源

**Files:**
- Modify: `src/server/services/indexer.ts`

**Interfaces:**
- Consumes: `LinkStore.getLinks()`, `LinkStore.getBacklinks()`, `LinkStore.getAllLinks()`
- Produces: Updated `getLinks()` and `getBacklinks()` that merge `[[]]` + UI links; new `getMergedLinks()` and `getMergedBacklinks()` methods

---

- [ ] **Step 1: 扩展 indexer，注入 LinkStore 并合并查询结果**

在 `src/server/services/indexer.ts` 中修改 `WikilinkIndexer` 类：

在 import 区域增加：
```typescript
import type { LinkStore } from './link-store.js';
import type { UILink } from '../../client/types/index.js';
```

在 `WikilinkIndexer` 类中增加字段和方法：

```typescript
export class WikilinkIndexer {
  private notesDir: string;
  private data: IndexData;
  private linkStore: LinkStore | null = null;

  // constructor 不变 ...

  /** 注入 LinkStore（v2 界面链接支持） */
  setLinkStore(store: LinkStore): void {
    this.linkStore = store;
  }

  /** 获取某文件的所有出链（合并 wikilink + 界面链接） */
  getMergedLinks(filePath: string): LinkInfo[] {
    const wikiLinks = this.getLinks(filePath);
    const result: LinkInfo[] = wikiLinks.map((l) => ({ ...l, sourceType: 'wikilink' as const }));

    if (this.linkStore) {
      const uiLinks = this.linkStore.getLinks(filePath);
      for (const ui of uiLinks) {
        // 去重：如果 [[wikilink]] 已经覆盖了同一目标，跳过
        const alreadyExists = result.some(
          (r) => r.resolvedPath === ui.to || r.target === ui.to
        );
        if (!alreadyExists) {
          result.push({
            source: filePath,
            target: ui.to,
            resolvedPath: ui.to,
            sourceType: 'ui' as const,
          });
        }
      }
    }
    return result;
  }

  /** 获取某文件的所有反向链接（合并 wikilink + 界面链接） */
  getMergedBacklinks(filePath: string): LinkInfo[] {
    const wikiBacklinks = this.getBacklinks(filePath);
    const result: LinkInfo[] = wikiBacklinks.map((l) => ({ ...l, sourceType: 'wikilink' as const }));

    if (this.linkStore) {
      const uiBacklinks = this.linkStore.getBacklinks(filePath);
      for (const ui of uiBacklinks) {
        const alreadyExists = result.some((r) => r.source === ui.from);
        if (!alreadyExists) {
          result.push({
            source: ui.from,
            target: ui.to,
            resolvedPath: ui.to,
            sourceType: 'ui' as const,
          });
        }
      }
    }
    return result;
  }

  /** 获取合并后的图谱数据（indexer 中的 `[[]]` + LinkStore 的界面链接） */
  getMergedGraphData(): {
    nodes: Array<{ id: string; label: string }>;
    links: Array<{ source: string; target: string }>;
  } {
    const pathToTitle = this.data.pathToTitle;
    const allPaths = this.data.allPaths;

    const nodes = allPaths.map((p) => ({
      id: p,
      label: pathToTitle.get(p) || p.replace(/\.md$/, ''),
    }));

    const linkSet = new Set<string>();
    const links: Array<{ source: string; target: string }> = [];

    // wikilink 链接
    for (const sourcePath of allPaths) {
      const sourceLinks = this.getLinks(sourcePath);
      for (const link of sourceLinks) {
        if (link.resolvedPath) {
          const key = [sourcePath, link.resolvedPath].sort().join('|||');
          if (!linkSet.has(key)) {
            linkSet.add(key);
            links.push({ source: sourcePath, target: link.resolvedPath });
          }
        }
      }
    }

    // 界面链接
    if (this.linkStore) {
      for (const uiLink of this.linkStore.getAllLinks()) {
        const key = [uiLink.from, uiLink.to].sort().join('|||');
        if (!linkSet.has(key)) {
          linkSet.add(key);
          links.push({ source: uiLink.from, target: uiLink.to });
        }
      }
    }

    return { nodes, links };
  }
}
```

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/services/indexer.ts
git commit -m "feat: merge wikilink + UI link data sources in indexer"
```

---

### Task 4: 链接/标签 API 路由

**Files:**
- Modify: `src/server/routes/notes.ts`
- Modify: `src/server/index.ts` (inject linkStore)

**Interfaces:**
- Consumes: `LinkStore` instance from `startServer()`
- Produces: POST `/api/links/add`, POST `/api/links/remove`, GET `/api/links/list`, POST `/api/tags/add`, POST `/api/tags/remove`, GET `/api/tags/list`, GET `/api/notes/graph` (updated), GET `/api/dashboard`

---

- [ ] **Step 1: 更新 `src/server/routes/notes.ts`**

在现有 `createNotesRouter` 基础上，新增 `createLinksRouter`：

```typescript
/**
 * 链接/标签 API — v2 界面链接管理
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { LinkStore } from '../services/link-store.js';
import type { WikilinkIndexer } from '../services/indexer.js';
import fs from 'fs/promises';
import path from 'path';

// ===== Zod schemas =====

const LinkAddSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const LinkRemoveSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const TagsAddSchema = z.object({
  filePath: z.string().min(1),
  tags: z.array(z.string()),
});

const TagsRemoveSchema = z.object({
  filePath: z.string().min(1),
  tag: z.string().min(1),
});

// ===== Router factory =====

export function createLinksRouter(
  linkStore: LinkStore,
  indexer: WikilinkIndexer
): Router {
  const router = Router();

  /** 添加界面链接 */
  router.post('/api/links/add', async (req: Request, res: Response) => {
    const parsed = LinkAddSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }
    const { from, to } = parsed.data;
    await linkStore.addLink(from, to);
    // 立即广播更新
    const { broadcast } = await import('../ws.js');
    broadcast({ type: 'links-changed' });
    res.json({ success: true });
  });

  /** 删除界面链接 */
  router.post('/api/links/remove', async (req: Request, res: Response) => {
    const parsed = LinkRemoveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }
    const { from, to } = parsed.data;
    await linkStore.removeLink(from, to);
    const { broadcast } = await import('../ws.js');
    broadcast({ type: 'links-changed' });
    res.json({ success: true });
  });

  /** 获取某文件的所有链接（合并 wikilink + 界面链接） */
  router.post('/api/links/list', (req: Request, res: Response) => {
    const parsed = z.object({ filePath: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }
    const { filePath } = parsed.data;
    const links = indexer.getMergedLinks(filePath);
    const backlinks = indexer.getMergedBacklinks(filePath);
    res.json({ filePath, links, backlinks });
  });

  /** 添加标签 */
  router.post('/api/tags/add', async (req: Request, res: Response) => {
    const parsed = TagsAddSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }
    const { filePath, tags } = parsed.data;
    await linkStore.addTags(filePath, tags);
    const { broadcast } = await import('../ws.js');
    broadcast({ type: 'tags-changed' });
    res.json({ success: true, tags: linkStore.getTags(filePath) });
  });

  /** 删除标签 */
  router.post('/api/tags/remove', async (req: Request, res: Response) => {
    const parsed = TagsRemoveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }
    const { filePath, tag } = parsed.data;
    await linkStore.removeTag(filePath, tag);
    const { broadcast } = await import('../ws.js');
    broadcast({ type: 'tags-changed' });
    res.json({ success: true, tags: linkStore.getTags(filePath) });
  });

  /** 按标签过滤笔记 */
  router.post('/api/tags/filter', (req: Request, res: Response) => {
    const parsed = z.object({ tags: z.array(z.string()) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }
    const { tags: filterTags } = parsed.data;
    const allPaths = indexer.getAllPaths();
    const pathToTitle = indexer.getPathToTitle();

    const results: Array<{ path: string; title: string }> = [];
    for (const p of allPaths) {
      const fileTags = linkStore.getTags(p);
      const dir = path.dirname(p);
      const folderParts = dir && dir !== '.' ? dir.split('/').filter(Boolean) : [];
      const allFileTags = [...folderParts, ...fileTags];
      // ALL selected tags must match (AND logic)
      if (filterTags.every((t) => allFileTags.some((ft) => ft.toLowerCase().includes(t.toLowerCase())))) {
        results.push({ path: p, title: pathToTitle.get(p) || p });
      }
    }
    res.json({ notes: results });
  });

  /** 获取所有标签统计 */
  router.get('/api/tags/list', (_req: Request, res: Response) => {
    const manualTags = linkStore.getTagCounts();
    const allPaths = indexer.getAllPaths();

    // 文件夹自动标签
    const folderTags = new Map<string, number>();
    for (const p of allPaths) {
      const dir = path.dirname(p);
      if (dir && dir !== '.') {
        const parts = dir.split('/');
        let acc = '';
        for (const part of parts) {
          if (!part) continue;
          acc = acc ? `${acc}/${part}` : part;
          folderTags.set(acc, (folderTags.get(acc) || 0) + 1);
        }
      }
    }

    const tags: Array<{ name: string; type: 'folder' | 'manual'; count: number }> = [];

    for (const [name, count] of folderTags) {
      tags.push({ name, type: 'folder', count });
    }
    for (const [name, count] of manualTags) {
      tags.push({ name, type: 'manual', count });
    }

    tags.sort((a, b) => b.count - a.count);
    res.json({ tags });
  });

  /** 获取仪表盘数据 */
  router.get('/api/dashboard', async (req: Request, res: Response) => {
    const allPaths = indexer.getAllPaths();
    const pathToTitle = indexer.getPathToTitle();

    const totalTags = linkStore.getTagCounts().size;
    const allLinks = linkStore.getAllLinks();

    // 核心节点（合并 wikilink 和 UI 链接计数）
    const backlinkCounts = new Map<string, number>();
    for (const link of allLinks) {
      backlinkCounts.set(link.to, (backlinkCounts.get(link.to) || 0) + 1);
    }
    for (const p of allPaths) {
      const wikiBacklinks = indexer.getBacklinks(p);
      backlinkCounts.set(p, (backlinkCounts.get(p) || 0) + wikiBacklinks.length);
    }

    const coreNodes = Array.from(backlinkCounts.entries())
      .map(([path, count]) => ({ path, title: pathToTitle.get(path) || path, backlinkCount: count }))
      .sort((a, b) => b.backlinkCount - a.backlinkCount)
      .slice(0, 5);

    // 孤岛笔记
    const linkedSet = new Set<string>();
    for (const link of allLinks) {
      linkedSet.add(link.from);
      linkedSet.add(link.to);
    }
    for (const p of allPaths) {
      const wikiLinks = indexer.getLinks(p);
      if (wikiLinks.length > 0) linkedSet.add(p);
      for (const wl of wikiLinks) {
        if (wl.resolvedPath) linkedSet.add(wl.resolvedPath);
      }
    }
    const orphanNotes = allPaths
      .filter((p) => !linkedSet.has(p))
      .slice(0, 5)
      .map((p) => ({ path: p, title: pathToTitle.get(p) || p }));

    // 文件夹分组
    const folderGroups = linkStore.getFolderGroups(allPaths);
    const groupList = Array.from(folderGroups.entries())
      .map(([name, data]) => ({ name, count: data.count, linkCount: data.linkCount }))
      .sort((a, b) => b.count - a.count);

    // 最近修改（从文件系统读取 mtime）
    const notesDir = indexer['notesDir']; // 访问私有字段
    const recentNotes: Array<{ path: string; title: string; mtime: number }> = [];
    for (const p of allPaths.slice(0, 10)) {
      try {
        const fullPath = path.join(notesDir, p);
        const stat = await fs.stat(fullPath);
        recentNotes.push({
          path: p,
          title: pathToTitle.get(p) || p,
          mtime: stat.mtimeMs,
        });
      } catch {
        // skip
      }
    }
    recentNotes.sort((a, b) => b.mtime - a.mtime);

    res.json({
      totalNotes: allPaths.length,
      totalLinks: allLinks.length,
      totalTags,
      coreNodes,
      orphanNotes,
      folderGroups: groupList,
      recentNotes: recentNotes.slice(0, 5),
    });
  });

  /** 更新图谱 API — 使用合并数据 */
  router.get('/api/notes/graph', (_req: Request, res: Response) => {
    const data = indexer.getMergedGraphData();
    res.json(data);
  });

  /** 未链接提及检测 */
  router.post('/api/notes/unlinked-mentions', async (req: Request, res: Response) => {
    const parsed = z.object({ filePath: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }
    const { filePath } = parsed.data;
    const notesDir = indexer['notesDir'];
    const allPaths = indexer.getAllPaths();
    const titleToPath = indexer.getTitleToPath();

    // 读取当前笔记正文
    let content = '';
    try {
      const fullPath = path.join(notesDir, filePath);
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      res.json({ mentions: [] });
      return;
    }

    // 获取已有链接的目标集合
    const existingLinks = new Set<string>();
    for (const link of indexer.getMergedLinks(filePath)) {
      existingLinks.add(link.resolvedPath || link.target.toLowerCase());
    }

    const mentions: Array<{ sourcePath: string; targetPath: string; matchedText: string }> = [];

    for (const otherPath of allPaths) {
      if (otherPath === filePath) continue;
      const title = indexer.getPathToTitle().get(otherPath) || path.basename(otherPath, '.md');

      if (title.length < 3) continue; // 太短的标题跳过

      // 大小写不敏感搜索标题在正文中的出现
      const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'gi');
      const match = re.exec(content);
      if (match) {
        const targetLower = title.toLowerCase();
        if (!existingLinks.has(targetLower) && !existingLinks.has(otherPath)) {
          mentions.push({
            sourcePath: filePath,
            targetPath: otherPath,
            matchedText: match[0],
          });
        }
      }
    }

    res.json({ mentions });
  });

  // 保留原有的搜索、titles API
  // 注意：原有的 /api/notes/graph 和 /api/notes/links、/api/notes/backlinks
  // 端点从 createNotesRouter 中移除（或保留但不再使用），
  // 因为 createLinksRouter 提供了合并 wikilink + UI link 的版本。

  return router;
}
```

Wait — the original `createNotesRouter` already has search, titles, links, backlinks endpoints. Rather than duplicating, the new link API routes need to coexist. The original `createNotesRouter` stays, and `createLinksRouter` adds the new endpoints. The `/api/notes/graph` endpoint is moved to `createLinksRouter` to use merged data.

- [ ] **Step 2: 更新 `src/server/index.ts` — 注入 LinkStore**

In `startServer()`, after creating the indexer:

```typescript
import { LinkStore } from './services/link-store.js';

// ... inside startServer():
const linkStore = new LinkStore(notesDir);
await linkStore.load();
indexer.setLinkStore(linkStore);

// Replace:
// app.use(createNotesRouter(indexer));
// With:
app.use(createNotesRouter(indexer));
app.use(createLinksRouter(linkStore, indexer));
```

The `createLinksRouter` import needs to be added to index.ts imports.

- [ ] **Step 3: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors — note the `indexer['notesDir']` access to private field; add a public getter to indexer instead:

In `indexer.ts`, add:
```typescript
getNotesDir(): string {
  return this.notesDir;
}
```

Then update the dashboard and unlinked-mentions routes to use `indexer.getNotesDir()` instead of `indexer['notesDir']`.

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/notes.ts src/server/services/indexer.ts src/server/index.ts
git commit -m "feat: add link/tag CRUD API, merge graph, dashboard endpoint"
```

---

## Phase 2: 链接管理 UI

### Task 5: API 客户端更新

**Files:**
- Modify: `src/client/lib/api.ts`

**Interfaces:**
- Consumes: New API endpoints from Task 4
- Produces: `addLink()`, `removeLink()`, `fetchMergedLinks()`, `addTags()`, `removeTag()`, `fetchTags()`, `fetchDashboard()`, `fetchUnlinkedMentions()`, `fetchGraph()`, `createDailyNote()`

---

- [ ] **Step 1: 扩展 `src/client/lib/api.ts`**

在现有文件末尾追加以下函数。注意：需要新增一个 `get` 辅助函数，因为现有 `request` 只支持 POST。

```typescript
async function getRequest<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/** 添加界面链接 */
export function addLink(from: string, to: string): Promise<{ success: boolean }> {
  return request('/api/links/add', { from, to });
}

/** 删除界面链接 */
export function removeLink(from: string, to: string): Promise<{ success: boolean }> {
  return request('/api/links/remove', { from, to });
}

/** 获取合并后的链接和反向链接 */
export function fetchMergedLinks(filePath: string): Promise<{
  filePath: string;
  links: import('../types/index.js').LinkInfo[];
  backlinks: import('../types/index.js').LinkInfo[];
}> {
  return request('/api/links/list', { filePath });
}

/** 添加标签 */
export function addTags(filePath: string, tags: string[]): Promise<{ success: boolean; tags: string[] }> {
  return request('/api/tags/add', { filePath, tags });
}

/** 删除标签 */
export function removeTag(filePath: string, tag: string): Promise<{ success: boolean; tags: string[] }> {
  return request('/api/tags/remove', { filePath, tag });
}

/** 获取所有标签 */
export function fetchTags(): Promise<{ tags: import('../types/index.js').TagEntry[] }> {
  return getRequest('/api/tags/list');
}

/** 按标签过滤笔记 */
export function filterByTags(tags: string[]): Promise<{ notes: Array<{ path: string; title: string }> }> {
  return request('/api/tags/filter', { tags });
}

/** 获取仪表盘数据 */
export function fetchDashboard(): Promise<import('../types/index.js').DashboardData> {
  return getRequest('/api/dashboard');
}

/** 获取未链接提及 */
export function fetchUnlinkedMentions(filePath: string): Promise<{
  mentions: import('../types/index.js').UnlinkedMention[];
}> {
  return request('/api/notes/unlinked-mentions', { filePath });
}

/** 获取图谱数据 */
export function fetchGraph(): Promise<{
  nodes: Array<{ id: string; label: string }>;
  links: Array<{ source: string; target: string }>;
}> {
  return getRequest('/api/notes/graph');
}

/** 创建每日笔记 */
export function createDailyNote(dailyDir: string): Promise<{ filePath: string; created: boolean; existed: boolean }> {
  return request('/api/files/daily-note', { dailyDir });
}
```

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/client/lib/api.ts
git commit -m "feat: add v2 API client functions"
```

---

### Task 6: Link Panel 组件

**Files:**
- Create: `src/client/components/LinkPanel.tsx`

**Interfaces:**
- Consumes: `addLink()`, `removeLink()`, `fetchMergedLinks()`, `searchNotes()`, `addTags()`, `removeTag()`, `fetchMergedLinks()`
- Produces: `<LinkPanel>` React component, props: `{ filePath, linkStoreVersion, onNavigate }`

---

- [ ] **Step 1: 创建 `src/client/components/LinkPanel.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { fetchMergedLinks, addLink, removeLink, searchNotes, addTags, removeTag, fetchMergedLinks as fetchLinkData } from '../lib/api.js';
import type { LinkInfo } from '../types/index.js';

interface LinkPanelProps {
  filePath: string | null;
  /** 外部链接版本号（links-changed WS 消息触发 +1） */
  linkStoreVersion?: number;
  onNavigate?: (filePath: string) => void;
}

export function LinkPanel({ filePath, linkStoreVersion = 0, onNavigate }: LinkPanelProps) {
  const [links, setLinks] = useState<LinkInfo[]>([]);
  const [backlinks, setBacklinks] = useState<LinkInfo[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ path: string; title: string }>>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!filePath) {
      setLinks([]);
      setBacklinks([]);
      setTags([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchLinkData(filePath);
      setLinks(data.links);
      setBacklinks(data.backlinks);
    } catch {
      setLinks([]);
      setBacklinks([]);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => { load(); }, [load, linkStoreVersion]);

  // 搜索笔记
  useEffect(() => {
    if (searchQuery.length < 1) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await searchNotes(searchQuery, 10);
        setSearchResults(res.results.filter((r) => r.path !== filePath));
      } catch { setSearchResults([]); }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, filePath]);

  async function handleAddLink(targetPath: string) {
    if (!filePath) return;
    try {
      await addLink(filePath, targetPath);
      setShowSearch(false);
      setSearchQuery('');
      await load();
    } catch { /* fail silently */ }
  }

  async function handleRemoveLink(targetPath: string) {
    if (!filePath) return;
    try {
      await removeLink(filePath, targetPath);
      await load();
    } catch { /* fail silently */ }
  }

  async function handleAddTag() {
    if (!filePath || !tagInput.trim()) return;
    const newTags = tagInput.split(',').map((t) => t.trim()).filter(Boolean);
    if (newTags.length === 0) return;
    try {
      const res = await addTags(filePath, newTags);
      setTags(res.tags);
      setTagInput('');
    } catch { /* fail silently */ }
  }

  async function handleRemoveTag(tag: string) {
    if (!filePath) return;
    try {
      const res = await removeTag(filePath, tag);
      setTags(res.tags);
    } catch { /* fail silently */ }
  }

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 p-3">
        打开笔记管理链接
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-200">
        <h3 className="text-xs font-medium text-gray-500">🔗 链接</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 添加链接 */}
        <div>
          <button
            className="w-full text-xs px-2 py-1 border border-dashed border-gray-300 rounded hover:border-blue-400 hover:text-blue-600 text-gray-500"
            onClick={() => setShowSearch(!showSearch)}
          >
            + 添加链接
          </button>
          {showSearch && (
            <div className="mt-1">
              <input
                className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                placeholder="搜索笔记..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchResults.length > 0 && (
                <ul className="mt-1 border border-gray-200 rounded max-h-32 overflow-y-auto">
                  {searchResults.map((r) => (
                    <li
                      key={r.path}
                      className="px-2 py-1 text-xs hover:bg-blue-50 cursor-pointer text-gray-700"
                      onClick={() => handleAddLink(r.path)}
                    >
                      {r.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 已链接列表 */}
        {loading ? (
          <p className="text-xs text-gray-400">加载中...</p>
        ) : links.length > 0 ? (
          <div>
            <p className="text-xs text-gray-400 mb-1">已链接 ({links.length})</p>
            <ul className="space-y-0.5">
              {links.map((link, i) => (
                <li key={`${link.resolvedPath || link.target}-${i}`} className="flex items-center gap-1 text-xs">
                  <button
                    className="flex-1 text-left text-blue-600 hover:underline truncate"
                    onClick={() => {
                      const target = link.resolvedPath || link.target;
                      if (onNavigate && target) onNavigate(target);
                    }}
                  >
                    {link.resolvedPath || link.target}
                  </button>
                  {link.sourceType === 'ui' && (
                    <button
                      className="text-gray-400 hover:text-red-500 shrink-0"
                      onClick={() => handleRemoveLink(link.resolvedPath || link.target)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-gray-400">暂无链接</p>
        )}

        {/* 标签管理 */}
        <div className="border-t border-gray-100 pt-2">
          <p className="text-xs text-gray-400 mb-1">🏷️ 标签</p>
          <div className="flex flex-wrap gap-1 mb-1">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                {tag}
                <button className="hover:text-red-500" onClick={() => handleRemoveTag(tag)}>×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
              placeholder="添加标签（逗号分隔）"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); }}
            />
            <button
              className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              onClick={handleAddTag}
            >
              添加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/LinkPanel.tsx
git commit -m "feat: add LinkPanel component for UI link management"
```

---

### Task 7: BacklinksPanel 升级（已链接 + 未链接提及）

**Files:**
- Modify: `src/client/components/BacklinksPanel.tsx`

**Interfaces:**
- Consumes: `fetchUnlinkedMentions()`, `addLink()`
- Produces: Updated `<BacklinksPanel>` with linked/unlinked sections

---

- [ ] **Step 1: 重写 `src/client/components/BacklinksPanel.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';
import type { LinkInfo, UnlinkedMention } from '../types/index.js';
import { fetchMergedLinks, fetchUnlinkedMentions, addLink } from '../lib/api.js';

interface BacklinksPanelProps {
  filePath: string | null;
  onNavigate?: (filePath: string) => void;
  /** 链接数据变更版本号 */
  linkStoreVersion?: number;
}

export function BacklinksPanel({ filePath, onNavigate, linkStoreVersion = 0 }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<LinkInfo[]>([]);
  const [mentions, setMentions] = useState<UnlinkedMention[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!filePath) {
      setBacklinks([]);
      setMentions([]);
      return;
    }
    setLoading(true);
    try {
      const [linkData, mentionData] = await Promise.all([
        fetchMergedLinks(filePath),
        fetchUnlinkedMentions(filePath),
      ]);
      setBacklinks(linkData.backlinks);
      setMentions(mentionData.mentions);
    } catch {
      setBacklinks([]);
      setMentions([]);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => { load(); }, [load, linkStoreVersion]);

  async function handleConnectMention(mention: UnlinkedMention) {
    try {
      await addLink(mention.sourcePath, mention.targetPath);
      await load();
    } catch { /* fail silently */ }
  }

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 p-3">
        打开笔记查看反向链接
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-200">
        <h3 className="text-xs font-medium text-gray-500">
          反向链接
          {!loading && backlinks.length > 0 && (
            <span className="ml-1 text-gray-400">({backlinks.length})</span>
          )}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-3 text-xs text-gray-400">加载中...</p>
        ) : (
          <>
            {/* 已链接 */}
            {backlinks.length > 0 ? (
              <>
                <p className="px-3 pt-2 text-xs text-gray-400">🔗 已链接</p>
                <ul className="py-1">
                  {backlinks.map((link, i) => (
                    <li key={`${link.source}-${i}`}>
                      <button
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 transition-colors group"
                        onClick={() => { if (onNavigate) onNavigate(link.source); }}
                      >
                        <span className="text-blue-600 group-hover:underline">{link.source}</span>
                        {link.sourceType === 'ui' && (
                          <span className="text-gray-400 ml-1 text-[10px]">界面</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="p-3 text-xs text-gray-400">暂无反向链接</p>
            )}

            {/* 未链接提及 */}
            {mentions.length > 0 && (
              <>
                <p className="px-3 pt-2 text-xs text-gray-400">💡 未链接提及</p>
                <ul className="py-1">
                  {mentions.map((m, i) => (
                    <li key={`${m.targetPath}-${i}`} className="px-3 py-1 flex items-center gap-1">
                      <button
                        className="flex-1 text-left text-xs text-gray-500 hover:text-blue-600"
                        onClick={() => { if (onNavigate) onNavigate(m.targetPath); }}
                      >
                        {m.targetPath}
                        <span className="text-gray-400 ml-1">含 "{m.matchedText}"</span>
                      </button>
                      <button
                        className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 shrink-0"
                        onClick={() => handleConnectMention(m)}
                      >
                        链接
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/BacklinksPanel.tsx
git commit -m "feat: add unlinked mentions to backlinks panel"
```

---

### Task 8: FileTree 右键菜单

**Files:**
- Modify: `src/client/components/FileTree.tsx`

**Interfaces:**
- Consumes: `searchNotes()`, `addLink()`
- Produces: Right-click context menu with "链接到..." option

---

- [ ] **Step 1: 在 `FileTree.tsx` 中添加右键菜单**

在 `FileTree` 组件中追加以下 state 和 handler（修改现有文件）：

在组件内添加 state：
```tsx
const [contextMenu, setContextMenu] = useState<{
  x: number;
  y: number;
  filePath: string;
} | null>(null);
const [linkTarget, setLinkTarget] = useState<string | null>(null);
const [linkSearch, setLinkSearch] = useState('');
const [linkResults, setLinkResults] = useState<Array<{ path: string; title: string }>>([]);
```

添加 handler：
```tsx
function handleContextMenu(e: React.MouseEvent, filePath: string) {
  e.preventDefault();
  e.stopPropagation();
  setContextMenu({ x: e.clientX, y: e.clientY, filePath });
}

function closeContextMenu() {
  setContextMenu(null);
  setLinkTarget(null);
  setLinkSearch('');
}

useEffect(() => {
  const close = () => { setContextMenu(null); };
  window.addEventListener('click', close);
  return () => window.removeEventListener('click', close);
}, []);

useEffect(() => {
  if (!linkTarget || linkSearch.length < 1) {
    setLinkResults([]);
    return;
  }
  const timer = setTimeout(async () => {
    try {
      const res = await searchNotes(linkSearch, 10);
      setLinkResults(res.results.filter((r) => r.path !== linkTarget));
    } catch { setLinkResults([]); }
  }, 200);
  return () => clearTimeout(timer);
}, [linkSearch, linkTarget]);
```

在 `renderNode` 中给每个非目录节点添加 `onContextMenu`：
```tsx
// 在 onClick 同级添加：
onContextMenu={(e) => { if (!isDir) handleContextMenu(e, node.path); }}
```

在组件 return 的根 div 结尾处添加右键菜单 UI：
```tsx
{/* 右键菜单 */}
{contextMenu && (
  <div
    className="fixed z-50 bg-white border border-gray-200 rounded shadow-lg py-1 min-w-[160px]"
    style={{ left: contextMenu.x, top: contextMenu.y }}
    onClick={(e) => e.stopPropagation()}
  >
    <button
      className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-gray-700"
      onClick={() => {
        setLinkTarget(contextMenu.filePath);
        setContextMenu(null);
      }}
    >
      🔗 链接到...
    </button>
    <button
      className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 text-red-500"
      onClick={() => {
        handleDelete(contextMenu.filePath);
        setContextMenu(null);
      }}
    >
      ✕ 删除
    </button>
  </div>
)}

{/* 链接目标选择弹窗 */}
{linkTarget && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setLinkTarget(null)}>
    <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-4 w-80" onClick={(e) => e.stopPropagation()}>
      <p className="text-sm font-medium mb-2">链接 "{linkTarget}" 到...</p>
      <input
        className="w-full text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400 mb-2"
        placeholder="搜索笔记..."
        value={linkSearch}
        onChange={(e) => setLinkSearch(e.target.value)}
        autoFocus
      />
      <ul className="max-h-48 overflow-y-auto">
        {linkResults.map((r) => (
          <li
            key={r.path}
            className="px-2 py-1 text-sm hover:bg-blue-50 cursor-pointer rounded"
            onClick={async () => {
              try {
                const { addLink } = await import('../lib/api.js');
                await addLink(linkTarget, r.path);
              } catch {}
              setLinkTarget(null);
              setLinkSearch('');
            }}
          >
            {r.title}
          </li>
        ))}
        {linkResults.length === 0 && linkSearch && (
          <li className="px-2 py-1 text-sm text-gray-400">无匹配结果</li>
        )}
      </ul>
      <button
        className="mt-2 w-full text-sm px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
        onClick={() => setLinkTarget(null)}
      >
        取消
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/FileTree.tsx
git commit -m "feat: add right-click context menu with link-to option"
```

---

## Phase 3: 图谱增强

### Task 9: 图谱拖拽连线 + 标签着色

**Files:**
- Modify: `src/client/components/GraphView.tsx`

**Interfaces:**
- Consumes: `addLink()`, `fetchTags()`, `fetchGraph()`
- Produces: Updated GraphView with drag-to-link, tag-based node coloring, orphan gray nodes

---

- [ ] **Step 1: 重写 `GraphView.tsx` 增加拖拽连线和标签着色**

The component needs significant modification. Key additions:

1. Use the enriched graph data (via `fetchGraph()`)
2. Tag-based node coloring
3. Drag-to-create-link interaction
4. Orphan nodes in gray

```tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { fetchGraph, fetchTags, addLink } from '../lib/api.js';
import type { GraphNodeEnriched, GraphDataEnriched, TagEntry } from '../types/index.js';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  tags: string[];
  folderTags: string[];
  isOrphan: boolean;
  backlinkCount: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface GraphViewProps {
  onNodeClick?: (filePath: string) => void;
  /** 链接数据变更版本号，外部变化触发重载 */
  linkStoreVersion?: number;
  /** 是否为局部图谱模式 */
  localMode?: boolean;
  /** 局部图谱中心节点 */
  centerNode?: string | null;
  /** 局部图谱步数 */
  localDepth?: number;
}

const TAG_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
];

function getNodeColor(node: GraphNode): string {
  if (node.isOrphan) return '#d1d5db'; // gray for orphans
  const allTags = [...node.folderTags, ...node.tags];
  if (allTags.length === 0) return '#3b82f6'; // default blue
  // Hash the first tag to pick a color
  const hash = allTags[0].split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return TAG_COLORS[hash % TAG_COLORS.length];
}

export function GraphView({ onNodeClick, linkStoreVersion = 0, localMode = false, centerNode = null, localDepth = 1 }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<GraphDataEnriched | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dragSourceRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [graphData, tagsData] = await Promise.all([
        fetchGraph(),
        fetchTags(),
      ]);

      // Build enriched nodes
      const tagMap = new Map<string, string[]>();
      for (const t of tagsData.tags) {
        if (t.type === 'manual') {
          // Need per-file tag mapping from API, simplify for now
        }
      }

      // Compute folder tags and orphan status
      const linkedSet = new Set<string>();
      for (const link of graphData.links) {
        linkedSet.add(link.source);
        linkedSet.add(link.target);
      }

      const backlinkCounts = new Map<string, number>();
      for (const link of graphData.links) {
        backlinkCounts.set(link.target, (backlinkCounts.get(link.target) || 0) + 1);
      }

      const nodes: GraphNode[] = graphData.nodes.map((n) => {
        const dir = n.id.includes('/') ? n.id.split('/').slice(0, -1).join('/') : '';
        const folderTags = dir ? dir.split('/').filter(Boolean) : [];
        return {
          ...n,
          tags: [],
          folderTags,
          isOrphan: !linkedSet.has(n.id),
          backlinkCount: backlinkCounts.get(n.id) || 0,
        };
      });

      // Filter for local graph if needed
      let filteredNodes = nodes;
      let filteredLinks = graphData.links;

      if (localMode && centerNode) {
        const neighborSet = new Set<string>([centerNode]);
        let frontier = new Set<string>([centerNode]);
        for (let step = 0; step < localDepth; step++) {
          const next = new Set<string>();
          for (const link of graphData.links) {
            if (frontier.has(link.source) && !neighborSet.has(link.target)) {
              neighborSet.add(link.target);
              next.add(link.target);
            }
            if (frontier.has(link.target) && !neighborSet.has(link.source)) {
              neighborSet.add(link.source);
              next.add(link.source);
            }
          }
          frontier = next;
        }
        filteredNodes = nodes.filter((n) => neighborSet.has(n.id));
        filteredLinks = graphData.links.filter(
          (l) => neighborSet.has(l.source) && neighborSet.has(l.target)
        );
      }

      setData({ nodes: filteredNodes, links: filteredLinks });
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setLoading(false);
    }
  }, [localMode, centerNode, localDepth]);

  useEffect(() => { load(); }, [load, linkStoreVersion]);

  // D3 rendering
  const renderGraph = useCallback(
    (svg: SVGSVGElement, graphData: GraphDataEnriched) => {
      const width = svg.clientWidth;
      const height = svg.clientHeight;
      d3.select(svg).selectAll('*').remove();

      // Zoom
      const g = d3.select(svg).append('g');
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => { g.attr('transform', event.transform); });
      d3.select(svg).call(zoom);

      const nodes: GraphNode[] = graphData.nodes.map((n) => ({ ...n }));
      const links: GraphLink[] = graphData.links.map((l) => ({ ...l }));

      const simulation = d3.forceSimulation<GraphNode>(nodes)
        .force('link', d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(100))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide(40));

      // Lines
      const link = g.append('g')
        .selectAll('line')
        .data(links)
        .join('line')
        .attr('stroke', '#999')
        .attr('stroke-opacity', 0.4)
        .attr('stroke-width', 1.5);

      // Nodes
      const node = g.append('g')
        .selectAll<SVGGElement, GraphNode>('g')
        .data(nodes)
        .join('g')
        .call(d3.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x; d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
        );

      // Circles with tag-based color
      node.append('circle')
        .attr('r', (d) => d.isOrphan ? 4 : 6 + Math.min(d.backlinkCount * 1.5, 10))
        .attr('fill', (d) => getNodeColor(d))
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .attr('cursor', 'pointer');

      // Labels
      node.append('text')
        .text((d) => d.label.length > 15 ? d.label.slice(0, 15) + '…' : d.label)
        .attr('x', 12)
        .attr('y', 4)
        .attr('font-size', '11px')
        .attr('fill', '#374151');

      // Click node
      node.on('click', (_event, d) => {
        if (onNodeClick) onNodeClick(d.id);
      });

      // Drag-to-link: mousedown on a node starts link creation
      let dragLine: d3.Selection<SVGLineElement, unknown, null, undefined> | null = null;
      node.on('mousedown', (event: MouseEvent, d: GraphNode) => {
        if (event.shiftKey) {
          // Shift+click to start drag-to-link
          dragSourceRef.current = d.id;
          const coords = d3.pointer(event, g.node());
          dragLine = g.append('line')
            .attr('x1', coords[0])
            .attr('y1', coords[1])
            .attr('x2', coords[0])
            .attr('y2', coords[1])
            .attr('stroke', '#3b82f6')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        }
      });

      d3.select(svg).on('mousemove', (event: MouseEvent) => {
        if (dragLine && dragSourceRef.current) {
          const coords = d3.pointer(event, g.node());
          dragLine.attr('x2', coords[0]).attr('y2', coords[1]);
        }
      });

      d3.select(svg).on('mouseup', async (event: MouseEvent) => {
        if (dragLine && dragSourceRef.current) {
          // Find target node under cursor
          const [mx, my] = d3.pointer(event, g.node());
          const source = dragSourceRef.current;
          let target: string | null = null;

          simulation.stop();
          for (const n of nodes) {
            if (!n.x || !n.y || n.id === source) continue;
            const dx = n.x - mx;
            const dy = n.y - my;
            if (Math.sqrt(dx * dx + dy * dy) < 20) {
              target = n.id;
              break;
            }
          }

          dragLine.remove();
          dragLine = null;
          dragSourceRef.current = null;

          if (target) {
            try {
              await addLink(source, target);
              await load();
            } catch {}
          }
          simulation.alphaTarget(0.3).restart();
        }
      });

      // Tick
      simulation.on('tick', () => {
        link
          .attr('x1', (d) => (d.source as GraphNode).x!)
          .attr('y1', (d) => (d.source as GraphNode).y!)
          .attr('x2', (d) => (d.target as GraphNode).x!)
          .attr('y2', (d) => (d.target as GraphNode).y!);
        node.attr('transform', (d) => `translate(${d.x},${d.y})`);
      });
    },
    [onNodeClick, load]
  );

  // Resize observer
  useEffect(() => {
    if (!svgRef.current || !data) return;
    const svg = svgRef.current;
    const observer = new ResizeObserver(() => {
      if (data.nodes.length > 0) renderGraph(svg, data);
    });
    observer.observe(svg);
    renderGraph(svg, data);
    return () => observer.disconnect();
  }, [data, renderGraph]);

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">加载图谱数据...</div>;
  if (error) return <div className="flex items-center justify-center h-full text-red-500 text-sm">{error}</div>;
  if (!data || data.nodes.length === 0) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">暂无笔记，无法生成图谱</div>;

  return (
    <div className="h-full w-full relative">
      <svg ref={svgRef} className="w-full h-full bg-gray-50" />
      <div className="absolute bottom-3 left-3 text-xs text-gray-400 space-x-2">
        <span>{data.nodes.length} 节点 · {data.links.length} 连线</span>
        <span>· 滚轮缩放 · 拖拽节点</span>
        <span className="text-blue-500">· Shift+拖拽连线</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/GraphView.tsx
git commit -m "feat: add drag-to-link, tag coloring, local graph to GraphView"
```

---

## Phase 4: 知识视图

### Task 10: Dashboard 仪表盘组件

**Files:**
- Create: `src/client/components/Dashboard.tsx`

---

- [ ] **Step 1: 创建 `src/client/components/Dashboard.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { fetchDashboard } from '../lib/api.js';
import type { DashboardData } from '../types/index.js';

interface DashboardProps {
  onNavigate?: (filePath: string) => void;
  refreshKey?: number;
}

export function Dashboard({ onNavigate, refreshKey = 0 }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchDashboard();
      setData(d);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">加载中...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 text-sm">
        {error}
        <button className="ml-2 underline" onClick={load}>重试</button>
      </div>
    );
  }

  if (!data) return null;

  function formatTime(ms: number): string {
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-xl font-bold text-gray-800 mb-6">📊 知识库概览</h1>

        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{data.totalNotes}</div>
            <div className="text-xs text-gray-500 mt-1">篇笔记</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{data.totalLinks}</div>
            <div className="text-xs text-gray-500 mt-1">条链接</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{data.totalTags}</div>
            <div className="text-xs text-gray-500 mt-1">个标签</div>
          </div>
        </div>

        {/* 核心节点 */}
        {data.coreNodes.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-gray-600 mb-2">🔥 核心节点（被链最多）</h2>
            <div className="space-y-1">
              {data.coreNodes.map((n) => (
                <button
                  key={n.path}
                  className="w-full text-left px-3 py-2 border border-gray-100 rounded hover:bg-blue-50 transition-colors"
                  onClick={() => onNavigate?.(n.path)}
                >
                  <span className="text-sm text-blue-600 hover:underline">{n.title}</span>
                  <span className="text-xs text-gray-400 ml-2">← {n.backlinkCount} 篇笔记引用了它</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 孤岛笔记 */}
        {data.orphanNotes.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-gray-600 mb-2">🏝️ 孤立笔记（无任何链接）</h2>
            <div className="space-y-1">
              {data.orphanNotes.map((n) => (
                <button
                  key={n.path}
                  className="w-full text-left px-3 py-2 border border-gray-100 rounded hover:bg-orange-50 transition-colors flex items-center justify-between"
                  onClick={() => onNavigate?.(n.path)}
                >
                  <span className="text-sm text-gray-600">{n.title}</span>
                  <span className="text-xs text-orange-500">添加链接 →</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 文件夹分组 */}
        {data.folderGroups.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-gray-600 mb-2">📁 项目分组</h2>
            <div className="grid grid-cols-2 gap-2">
              {data.folderGroups.map((g) => (
                <div key={g.name} className="px-3 py-2 border border-gray-100 rounded text-sm">
                  <span className="text-gray-700">{g.name}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {g.count} 篇 · {g.linkCount} 链接{g.linkCount === 0 ? ' 🏝️' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 最近修改 */}
        {data.recentNotes.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-gray-600 mb-2">📝 最近修改</h2>
            <div className="space-y-1">
              {data.recentNotes.map((n) => (
                <button
                  key={n.path}
                  className="w-full text-left px-3 py-2 border border-gray-100 rounded hover:bg-gray-50 transition-colors flex items-center justify-between"
                  onClick={() => onNavigate?.(n.path)}
                >
                  <span className="text-sm text-blue-600">{n.title}</span>
                  <span className="text-xs text-gray-400">{formatTime(n.mtime)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/Dashboard.tsx
git commit -m "feat: add Dashboard component"
```

---

### Task 11: Tag View 标签视图

**Files:**
- Create: `src/client/components/TagView.tsx`

---

- [ ] **Step 1: 创建 `src/client/components/TagView.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { fetchTags } from '../lib/api.js';
import type { TagEntry } from '../types/index.js';

interface TagViewProps {
  onNavigate?: (filePath: string) => void;
  refreshKey?: number;
}

export function TagView({ onNavigate, refreshKey = 0 }: TagViewProps) {
  const [tags, setTags] = useState<TagEntry[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [filteredNotes, setFilteredNotes] = useState<Array<{ path: string; title: string }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTags();
      setTags(data.tags);
    } catch { /* fail silently */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  function toggleTag(name: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); }
      else { next.add(name); }
      return next;
    });
  }

  // Fetch filtered notes when tag selection changes
  useEffect(() => {
    if (selectedTags.size === 0) { setFilteredNotes([]); return; }
    fetch('/api/tags/filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: Array.from(selectedTags) }),
    })
      .then((r) => r.ok ? r.json() : { notes: [] })
      .then((d) => setFilteredNotes(d.notes))
      .catch(() => setFilteredNotes([]));
  }, [selectedTags]);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">加载标签...</div>;
  }

  const manualTags = tags.filter((t) => t.type === 'manual');
  const folderTags = tags.filter((t) => t.type === 'folder');

  return (
    <div className="flex h-full">
      {/* 标签列表 */}
      <div className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-medium text-gray-600">标签</h2>
        </div>

        {folderTags.length > 0 && (
          <div className="py-2">
            <p className="px-4 py-1 text-xs text-gray-400">📁 文件夹</p>
            {folderTags.map((t) => (
              <button
                key={`folder-${t.name}`}
                className={`w-full text-left px-4 py-1 text-sm hover:bg-gray-100 transition-colors ${
                  selectedTags.has(t.name) ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                }`}
                onClick={() => toggleTag(t.name)}
              >
                📁 {t.name}
                <span className="text-xs text-gray-400 ml-1">({t.count})</span>
              </button>
            ))}
          </div>
        )}

        {manualTags.length > 0 && (
          <div className="py-2">
            <p className="px-4 py-1 text-xs text-gray-400">🏷️ 手动标签</p>
            {manualTags.map((t) => (
              <button
                key={`tag-${t.name}`}
                className={`w-full text-left px-4 py-1 text-sm hover:bg-gray-100 transition-colors ${
                  selectedTags.has(t.name) ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                }`}
                onClick={() => toggleTag(t.name)}
              >
                🏷️ {t.name}
                <span className="text-xs text-gray-400 ml-1">({t.count})</span>
              </button>
            ))}
          </div>
        )}

        {tags.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-400">暂无标签。在链接面板中为笔记添加标签。</p>
        )}
      </div>

      {/* 过滤结果 */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-medium text-gray-600 mb-2">
          {selectedTags.size === 0 ? '选择一个标签查看笔记' : `已选: ${Array.from(selectedTags).join(', ')}`}
        </h3>
        {filteredNotes.length > 0 ? (
          <ul className="space-y-1">
            {filteredNotes.map((n) => (
              <li key={n.path}>
                <button
                  className="text-sm text-blue-600 hover:underline"
                  onClick={() => onNavigate?.(n.path)}
                >
                  {n.title}
                </button>
              </li>
            ))}
          </ul>
        ) : selectedTags.size > 0 ? (
          <p className="text-sm text-gray-400">暂无匹配笔记</p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/TagView.tsx
git commit -m "feat: add TagView component"
```

---

### Task 12: Quick Switcher 快速切换器

**Files:**
- Create: `src/client/components/QuickSwitcher.tsx`

---

- [ ] **Step 1: 创建 `src/client/components/QuickSwitcher.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react';
import { searchNotes } from '../lib/api.js';

interface QuickSwitcherProps {
  /** 关闭弹窗 */
  onClose: () => void;
  /** 选中笔记 */
  onSelect: (filePath: string) => void;
}

export function QuickSwitcher({ onClose, onSelect }: QuickSwitcherProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ path: string; title: string }>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.length === 0) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await searchNotes(query, 20);
        setResults(res.results);
        setSelectedIndex(0);
      } catch { setResults([]); }
    }, 100);
    return () => clearTimeout(timer);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (results[selectedIndex]) {
        onSelect(results[selectedIndex].path);
        onClose();
      }
    }
  }

  // 模糊匹配排序: 以 query 开头的优先，按 Levenshtein 距离次之
  function sortResults(items: typeof results): typeof results {
    const q = query.toLowerCase();
    return [...items].sort((a, b) => {
      const aStarts = a.title.toLowerCase().startsWith(q);
      const bStarts = b.title.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.title.localeCompare(b.title);
    });
  }

  const sorted = sortResults(results);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/30" onClick={onClose}>
      <div
        className="bg-white border border-gray-200 rounded-lg shadow-2xl w-[480px] max-h-[60vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-gray-100">
          <input
            ref={inputRef}
            className="w-full text-base px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
            placeholder="搜索笔记... (Ctrl+O)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {sorted.map((r, i) => (
            <button
              key={r.path}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                i === selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
              onClick={() => { onSelect(r.path); onClose(); }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="font-medium">{r.title}</span>
              <span className="text-xs text-gray-400 ml-2">{r.path}</span>
            </button>
          ))}
          {query && sorted.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">无匹配结果</p>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
          ↑↓ 选择 · Enter 打开 · Esc 取消
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/QuickSwitcher.tsx
git commit -m "feat: add QuickSwitcher component"
```

---

### Task 13: 每日笔记 API + 前端按钮

**Files:**
- Modify: `src/server/routes/files.ts` (add daily note endpoint)
- Modify: `src/client/App.tsx` (add daily note button)

---

- [ ] **Step 1: 在 `files.ts` 中添加每日笔记端点**

在 `createFileRouter` 函数内，图片上传路由之后添加：

```typescript
const DailyNoteSchema = z.object({
  dailyDir: z.string().optional().default('daily'),
});

/** 创建每日笔记 */
router.post('/api/files/daily-note', async (req: Request, res: Response) => {
  try {
    const { dailyDir } = DailyNoteSchema.parse(req.body);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const fileName = `${dateStr}.md`;
    const filePath = dailyDir ? path.join(dailyDir, fileName).replace(/\\/g, '/') : fileName;
    const fullPath = safePath(filePath);

    // 文件已存在则直接返回
    if (fsSync.existsSync(fullPath)) {
      res.json({ filePath, created: false, existed: true });
      return;
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const template = `# ${dateStr}\n\n`;
    await fs.writeFile(fullPath, template, 'utf-8');

    res.json({ filePath, created: true, existed: false });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: err.errors });
      return;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});
```

将 `DailyNoteSchema` 的 Zod import 加入文件顶部已 import 的 `z` 中（`z` 已 import）。

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/files.ts
git commit -m "feat: add daily note API endpoint"
```

---

## Phase 5: 应用整合

### Task 14: App.tsx 全视图集成

**Files:**
- Modify: `src/client/App.tsx`

This task integrates all new components: Dashboard (default view), TagView, QuickSwitcher trigger, daily note button, link store version tracking, and WebSocket handling for links-changed/tags-changed.

---

- [ ] **Step 1: 重写 App.tsx 集成所有新组件**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { FileTree } from './components/FileTree.js';
import { Editor } from './components/Editor.js';
import { MarkdownPreview } from './components/MarkdownPreview.js';
import { BacklinksPanel } from './components/BacklinksPanel.js';
import { LinkPanel } from './components/LinkPanel.js';
import { GraphView } from './components/GraphView.js';
import { Dashboard } from './components/Dashboard.js';
import { TagView } from './components/TagView.js';
import { QuickSwitcher } from './components/QuickSwitcher.js';
import { fetchFile, saveFile, createDailyNote } from './lib/api.js';
import { useWebSocket } from './hooks/useWebSocket.js';

type Panel = 'dashboard' | 'editor' | 'graph' | 'tags' | 'local-graph';

export function App() {
  const [activePanel, setActivePanel] = useState<Panel>('dashboard');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [treeVersion, setTreeVersion] = useState(0);
  const [linkStoreVersion, setLinkStoreVersion] = useState(0);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);

  // Editor state
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = content !== savedContent;

  // Load file content
  useEffect(() => {
    if (!selectedFile) { setContent(''); setSavedContent(''); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchFile(selectedFile)
      .then((data) => {
        if (!cancelled) { setContent(data.content); setSavedContent(data.content); setLoading(false); }
      })
      .catch((err) => {
        if (!cancelled) { setError(err instanceof Error ? err.message : '加载失败'); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [selectedFile]);

  // Save
  const handleSave = useCallback(async () => {
    if (!selectedFile || !dirty) return;
    try { await saveFile(selectedFile, content); setSavedContent(content); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败'); }
  }, [selectedFile, content, dirty]);

  // WebSocket
  useWebSocket(useCallback((msg) => {
    switch (msg.type) {
      case 'refresh-tree': setTreeVersion((v) => v + 1); break;
      case 'file-changed':
        if (msg.path && msg.path === selectedFile) {
          fetchFile(msg.path).then((data) => { setContent(data.content); setSavedContent(data.content); }).catch(() => {});
        }
        break;
      case 'file-deleted':
        if (msg.path && msg.path === selectedFile) { setSelectedFile(null); setContent(''); setSavedContent(''); }
        break;
      case 'links-changed': setLinkStoreVersion((v) => v + 1); break;
      case 'tags-changed': setLinkStoreVersion((v) => v + 1); break;
    }
  }, [selectedFile]));

  // Global Ctrl+O shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        setShowQuickSwitcher(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Ctrl+S save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  // Daily note
  async function handleDailyNote() {
    try {
      const { createDailyNote } = await import('./lib/api.js');
      const res = await createDailyNote('daily');
      setSelectedFile(res.filePath);
      setActivePanel('editor');
    } catch {}
  }

  // Navigate from dashboard/orphans to editor
  function handleNavigate(filePath: string) {
    setSelectedFile(filePath);
    setActivePanel('editor');
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Top navigation */}
      <header className="flex items-center gap-1 px-4 h-10 border-b border-gray-200 bg-gray-50 shrink-0">
        <button className={`px-3 py-1 text-sm rounded transition-colors ${activePanel === 'dashboard' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-200'}`}
          onClick={() => setActivePanel('dashboard')}>概览</button>
        <button className={`px-3 py-1 text-sm rounded transition-colors ${activePanel === 'editor' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-200'}`}
          onClick={() => setActivePanel('editor')}>编辑</button>
        <button className={`px-3 py-1 text-sm rounded transition-colors ${activePanel === 'graph' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-200'}`}
          onClick={() => setActivePanel('graph')}>图谱</button>
        <button className={`px-3 py-1 text-sm rounded transition-colors ${activePanel === 'local-graph' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-200'}`}
          onClick={() => { if (selectedFile) setActivePanel('local-graph'); }}>局部图谱</button>
        <button className={`px-3 py-1 text-sm rounded transition-colors ${activePanel === 'tags' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-200'}`}
          onClick={() => setActivePanel('tags')}>标签</button>
        <button className="px-3 py-1 text-sm text-green-600 hover:bg-green-50 rounded transition-colors ml-2"
          onClick={handleDailyNote}>📅 今日笔记</button>
        <span className="ml-auto text-xs text-gray-400">SecondBrain</span>
      </header>

      {/* Main content */}
      {activePanel === 'dashboard' && (
        <Dashboard onNavigate={handleNavigate} refreshKey={linkStoreVersion} />
      )}

      {activePanel === 'tags' && (
        <TagView onNavigate={handleNavigate} refreshKey={linkStoreVersion} />
      )}

      {activePanel === 'editor' && (
        <div className="flex flex-1 min-h-0">
          <aside className="w-60 shrink-0 border-r border-gray-200 bg-gray-50">
            <FileTree selectedPath={selectedFile} onSelect={setSelectedFile} refreshKey={treeVersion} />
          </aside>
          <main className="flex-1 min-w-0 bg-white">
            <Editor filePath={selectedFile} content={content} onChange={setContent}
              loading={loading} error={error} dirty={dirty} onSave={handleSave} />
          </main>
          <aside className="w-72 shrink-0 border-l border-gray-200 bg-gray-50 flex flex-col">
            <div className="flex-1 min-h-0 overflow-hidden">
              <MarkdownPreview content={content} />
            </div>
            <div className="border-t border-gray-200 shrink-0" style={{ height: '140px' }}>
              <LinkPanel filePath={selectedFile} linkStoreVersion={linkStoreVersion} onNavigate={handleNavigate} />
            </div>
            <div className="border-t border-gray-200 shrink-0" style={{ height: '160px' }}>
              <BacklinksPanel filePath={selectedFile} onNavigate={handleNavigate} linkStoreVersion={linkStoreVersion} />
            </div>
          </aside>
        </div>
      )}

      {(activePanel === 'graph' || activePanel === 'local-graph') && (
        <div className="flex-1 min-h-0 bg-white">
          <GraphView
            onNodeClick={(filePath) => { setSelectedFile(filePath); setActivePanel('editor'); }}
            linkStoreVersion={linkStoreVersion}
            localMode={activePanel === 'local-graph'}
            centerNode={activePanel === 'local-graph' ? selectedFile : null}
          />
        </div>
      )}

      {/* Quick Switcher modal */}
      {showQuickSwitcher && (
        <QuickSwitcher
          onClose={() => setShowQuickSwitcher(false)}
          onSelect={(filePath) => { setSelectedFile(filePath); setActivePanel('editor'); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: no errors (may need to fix some prop type mismatches — handle inline)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/client/App.tsx
git commit -m "feat: integrate all v2 views into App shell"
```

---

### Task 15: 端到端烟雾测试 + 内存库更新

**Files:**
- Modify: `memory-bank/progress.md`
- Modify: `memory-bank/architecture.md`

---

- [ ] **Step 1: 生产构建**

Run: `npm run build`
Expected: no errors

- [ ] **Step 2: 启动服务器并测试全流程**

Run: `npx tsx src/cli.ts start ./test-notes`

然后在浏览器中验证流程：
1. 启动看到 Dashboard（概览页）
2. 点击"编辑"→ 文件树 + 编辑器 + 链接面板 + 反向链接面板正常
3. 在链接面板中搜索并添加链接 → 反向链接自动更新
4. 在链接面板中添加标签 → 标签列表更新
5. Ctrl+O → QuickSwitcher 弹出 → 搜索 → 回车跳转
6. 点击"图谱"→ 节点按标签着色，孤岛节点灰色
7. Shift+拖拽节点 → 创建链接
8. 点击"今日笔记"→ 创建 daily/2026-07-xx.md
9. 右键文件树 → "链接到..." → 弹出选择器
10. 检查 test-notes/.sb/links.json 已创建且有数据

- [ ] **Step 3: 更新 `memory-bank/progress.md`**

在文件末尾追加：

```markdown

## v2: 界面链接 + 知识梳理 ✅
| 日期 | 步骤 | 产出文件 | 验证结果 |
|------|------|----------|----------|
| 2026-07-17 | Phase 1-5 | 见架构文档 | ✅ 通过 |
```

- [ ] **Step 4: 更新 `memory-bank/architecture.md`**

在现有"文件清单"表末尾追加新增文件的条目，在"模块关系图"中追加新的组件关系。

- [ ] **Step 5: 最终 commit**

```bash
git add -A
git commit -m "feat: v2 complete — UI links, tags, dashboard, quick switcher, daily notes"
```
