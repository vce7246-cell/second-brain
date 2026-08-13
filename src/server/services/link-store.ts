/**
 * Link Store — 管理 .sb/links.json 的读写
 * 存储界面链接和标签，不侵入笔记原文
 */
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { SB_DIR, LINKS_FILE } from '../../shared/constants.js';
import { atomicWriteFile } from './file-persistence.js';

const CURRENT_VERSION = 1;
const LinkStoreDataSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  links: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
  }).strict()),
  tags: z.record(z.string().min(1), z.array(z.string().min(1))),
}).strict();

type LinkStoreData = z.infer<typeof LinkStoreDataSchema>;
type UILink = LinkStoreData['links'][number];

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as { code?: unknown }).code === code;
}

function serialize(data: LinkStoreData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export class LinkStoreLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkStoreLoadError';
  }
}

export class LinkStoreConflictError extends Error {
  readonly code = 'LINK_STORE_CHANGED';

  constructor() {
    super('LinkStore changed on disk; refusing to overwrite external changes');
    this.name = 'LinkStoreConflictError';
  }
}

function emptyData(): LinkStoreData {
  return { version: CURRENT_VERSION, links: [], tags: {} };
}

export class LinkStore {
  private data: LinkStoreData = emptyData();
  private filePath: string;
  private backupPath: string;
  private persistedRaw: string | null = null;
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(notesDir: string) {
    this.filePath = path.join(notesDir, SB_DIR, LINKS_FILE);
    this.backupPath = `${this.filePath}.bak`;
  }

  /** 从磁盘加载 links.json，不存在则创建 */
  async load(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf-8');
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        const initial = emptyData();
        const serialized = serialize(initial);
        await atomicWriteFile(this.filePath, serialized);
        this.data = initial;
        this.persistedRaw = serialized;
        return;
      }
      throw new LinkStoreLoadError('LinkStore cannot be read; the original file was preserved');
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new LinkStoreLoadError('LinkStore contains invalid JSON; the original file was preserved');
    }
    const parsed = LinkStoreDataSchema.safeParse(json);
    if (!parsed.success) {
      throw new LinkStoreLoadError('LinkStore has an invalid or unsupported structure; the original file was preserved');
    }
    this.data = parsed.data;
    this.persistedRaw = raw;
  }

  private async persist(next: LinkStoreData): Promise<void> {
    const currentRaw = await fs.readFile(this.filePath, 'utf-8');
    if (this.persistedRaw === null || currentRaw !== this.persistedRaw) {
      throw new LinkStoreConflictError();
    }
    await atomicWriteFile(this.backupPath, currentRaw);
    const serialized = serialize(next);
    await atomicWriteFile(this.filePath, serialized);
    this.data = next;
    this.persistedRaw = serialized;
  }

  private async update(transform: (current: LinkStoreData) => LinkStoreData): Promise<void> {
    const operation = this.updateQueue.then(async () => {
      const next = transform(this.data);
      if (next !== this.data) await this.persist(next);
    });
    this.updateQueue = operation.catch(() => undefined);
    return operation;
  }

  /** 文件或目录移动后同步所有界面链接和手动标签路径 */
  async movePath(oldPath: string, newPath: string): Promise<void> {
    const normalize = (value: string) => value.replace(/\\/g, '/');
    const normalizedOld = normalize(oldPath);
    const normalizedNew = normalize(newPath);
    const remap = (value: string) => {
      const normalized = normalize(value);
      if (normalized === normalizedOld) return normalizedNew;
      if (normalized.startsWith(`${normalizedOld}/`)) {
        return `${normalizedNew}${normalized.slice(normalizedOld.length)}`;
      }
      return normalized;
    };
    await this.update((current) => {
      const seenLinks = new Set<string>();
      const links = current.links
        .map((link) => ({ from: remap(link.from), to: remap(link.to) }))
        .filter((link) => {
          const key = `${link.from}\0${link.to}`;
          if (seenLinks.has(key)) return false;
          seenLinks.add(key);
          return true;
        });
      const tags: Record<string, string[]> = {};
      for (const [filePath, fileTags] of Object.entries(current.tags)) {
        const movedPath = remap(filePath);
        tags[movedPath] = Array.from(new Set([...(tags[movedPath] ?? []), ...fileTags]));
      }
      return { ...current, links, tags };
    });
  }

  /** 添加链接 */
  async addLink(from: string, to: string): Promise<void> {
    await this.update((current) => current.links.some((link) => link.from === from && link.to === to)
      ? current
      : { ...current, links: [...current.links, { from, to }] });
  }

  /** 删除链接 */
  async removeLink(from: string, to: string): Promise<void> {
    await this.update((current) => {
      const links = current.links.filter((link) => !(link.from === from && link.to === to));
      return links.length === current.links.length ? current : { ...current, links };
    });
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
    await this.update((current) => {
      const existing = current.tags[filePath] ?? [];
      const merged = Array.from(new Set([...existing, ...tags]));
      return merged.length === existing.length
        ? current
        : { ...current, tags: { ...current.tags, [filePath]: merged } };
    });
  }

  /** 删除标签 */
  async removeTag(filePath: string, tag: string): Promise<void> {
    await this.update((current) => {
      const existing = current.tags[filePath];
      if (!existing?.includes(tag)) return current;
      const remaining = existing.filter((currentTag) => currentTag !== tag);
      const nextTags = { ...current.tags };
      if (remaining.length > 0) nextTags[filePath] = remaining;
      else delete nextTags[filePath];
      return { ...current, tags: nextTags };
    });
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

  /** 获取孤岛笔记（无任何界面链接的文件） */
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
