/**
 * 笔记 API — 链接查询 + 自动补全
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { WikilinkIndexer } from '../services/indexer.js';
import path from 'path';
import type { LinkStore } from '../services/link-store.js';
import { registerDashboardRoute } from './dashboard.js';
import { registerLinkMutationRoutes } from './link-mutations.js';
import { registerKnowledgeSearchRoute } from './knowledge-search.js';
import { registerUnlinkedMentionRoute } from './unlinked-mentions.js';

const LinksSchema = z.object({
  filePath: z.string().min(1),
});

const SearchSchema = z.object({
  query: z.string().default(''),
  limit: z.number().int().min(1).max(100).default(20),
});

export function createNotesRouter(indexer: WikilinkIndexer): Router {
  const router = Router();

  /** 获取某文件的前向链接 */
  router.post('/api/notes/links', (req: Request, res: Response) => {
    const parsed = LinksSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }

    const { filePath } = parsed.data;
    const links = indexer.getLinks(filePath);
    res.json({ filePath, links });
  });

  /** 获取某文件的反向链接 */
  router.post('/api/notes/backlinks', (req: Request, res: Response) => {
    const parsed = LinksSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }

    const { filePath } = parsed.data;
    const backlinks = indexer.getBacklinks(filePath);
    res.json({ filePath, backlinks });
  });

  /** 搜索笔记标题（自动补全用） */
  router.post('/api/notes/search', (req: Request, res: Response) => {
    const parsed = SearchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }

    const { query, limit } = parsed.data;
    const allPaths = indexer.getAllPaths();
    const titleToPath = indexer.getTitleToPath();
    const pathToTitle = indexer.getPathToTitle();

    const lowerQuery = query.toLowerCase();
    const results: Array<{ path: string; title: string }> = [];

    for (const filePath of allPaths) {
      const title = pathToTitle.get(filePath) || filePath;
      if (!query || title.toLowerCase().includes(lowerQuery) || filePath.toLowerCase().includes(lowerQuery)) {
        results.push({ path: filePath, title });
      }
    }

    // 优先以查询开头的结果
    results.sort((a, b) => {
      const aStarts = a.title.toLowerCase().startsWith(lowerQuery);
      const bStarts = b.title.toLowerCase().startsWith(lowerQuery);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.title.localeCompare(b.title);
    });

    res.json({ results: results.slice(0, limit) });
  });

  /** 获取所有笔记的标题映射 (path → title) */
  router.get('/api/notes/titles', (_req: Request, res: Response) => {
    const pathToTitle = indexer.getPathToTitle();
    const titles: Record<string, string> = {};
    for (const [p, t] of pathToTitle) {
      titles[p] = t;
    }
    res.json({ titles });
  });

  return router;
}

export function createLinksRouter(
  linkStore: LinkStore,
  indexer: WikilinkIndexer
): Router {
  const router = Router();
  registerLinkMutationRoutes(router, linkStore, indexer.getNotesDir());
  registerKnowledgeSearchRoute(router, indexer);
  registerUnlinkedMentionRoute(router, indexer);
  registerDashboardRoute(router, indexer, linkStore);
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
    const tags = linkStore.getTags(filePath);
    res.json({ filePath, links, backlinks, tags });
  });

  /** 按标签过滤笔记 */
  router.post('/api/tags/filter', (req: Request, res: Response) => {
    const parsed = z.object({ tags: z.array(z.string()) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }
    const { tags: filterTags } = parsed.data;
    const allPaths = indexer.getAllKnowledgePaths();

    const results: Array<{ path: string; title: string }> = [];
    for (const p of allPaths) {
      const fileTags = linkStore.getTags(p);
      const dir = path.dirname(p);
      const folderParts = dir && dir !== '.' ? dir.split('/').filter(Boolean) : [];
      const allFileTags = [...folderParts, ...fileTags];
      if (filterTags.every((t) => allFileTags.some((ft) => ft.toLowerCase().includes(t.toLowerCase())))) {
        results.push({ path: p, title: indexer.getKnowledgeLabel(p) });
      }
    }
    res.json({ items: results, notes: results });
  });

  /** 获取所有标签统计 */
  router.get('/api/tags/list', (_req: Request, res: Response) => {
    const manualTags = linkStore.getTagCounts();
    const allPaths = indexer.getAllKnowledgePaths();

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

  /** 更新图谱 API — 使用合并数据 */
  router.get('/api/notes/graph', (_req: Request, res: Response) => {
    const data = indexer.getMergedGraphData();
    res.json(data);
  });

  return router;
}
