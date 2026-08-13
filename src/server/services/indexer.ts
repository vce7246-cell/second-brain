/**
 * Wikilink 索引引擎 — 全量扫描 + 内存缓存 + 增量更新
 */
import path from 'path';
import type { LinkStore } from './link-store.js';
import { extractNoteIndexData, type LinkInfo } from './wikilink-parser.js';
import { readNote, scanNotes } from './note-scanner.js';
import { scanKnowledgeFiles } from './knowledge-scanner.js';
import type { FileKind } from '../../shared/file-types.js';
import { buildKnowledgeGraph, type KnowledgeGraphData } from './knowledge-graph.js';

interface IndexData {
  /** filePath → 出链列表 */
  forwardLinks: Map<string, LinkInfo[]>;
  /** filePath → 反向链接（哪些文件链向它） */
  backlinks: Map<string, LinkInfo[]>;
  /** 所有 note 的路径集合（用于 wikilink 自动补全） */
  allPaths: string[];
  /** title → filePath 映射（用于解析 [[wikilink]]） */
  titleToPath: Map<string, string>;
  /** path → title 映射 */
  pathToTitle: Map<string, string>;
  /** 所有可见知识文件，包括 Markdown 和附件 */
  allKnowledgePaths: string[];
  /** 知识文件路径 → 文件类型 */
  knowledgeKinds: Map<string, Exclude<FileKind, 'directory'>>;
}

export class WikilinkIndexer {
  private notesDir: string;
  private data: IndexData;
  private linkStore: LinkStore | null = null;

  /** 注入 LinkStore（v2 界面链接支持） */
  setLinkStore(store: LinkStore): void {
    this.linkStore = store;
  }

  /** 公开 notesDir（Dashboard 等路由需要） */
  getNotesDir(): string {
    return this.notesDir;
  }

  constructor(notesDir: string) {
    this.notesDir = path.resolve(notesDir);
    this.data = {
      forwardLinks: new Map(),
      backlinks: new Map(),
      allPaths: [],
      titleToPath: new Map(),
      pathToTitle: new Map(),
      allKnowledgePaths: [],
      knowledgeKinds: new Map(),
    };
  }

  /** 全量重建索引 */
  async rebuild(): Promise<void> {
    const forwardLinks = new Map<string, LinkInfo[]>();
    const backlinks = new Map<string, LinkInfo[]>();
    const allPaths: string[] = [];
    const titleToPath = new Map<string, string>();
    const pathToTitle = new Map<string, string>();

    const [notes, knowledgeFiles] = await Promise.all([
      scanNotes(this.notesDir),
      scanKnowledgeFiles(this.notesDir),
    ]);
    for (const note of notes) {
      allPaths.push(note.path);
      titleToPath.set(note.title.toLowerCase(), note.path);
      pathToTitle.set(note.path, note.title);
      if (note.links.length > 0) {
        forwardLinks.set(note.path, note.links);
      }
    }

    // 构建反向链接 + 解析目标路径
    for (const [source, links] of forwardLinks) {
      const resolvedLinks = links.map((link) => ({
        ...link,
        resolvedPath: this.resolveLink(link.target, titleToPath, allPaths),
      }));
      forwardLinks.set(source, resolvedLinks);

      // 为每个出链目标添加反向链接
      for (const link of resolvedLinks) {
        const targetPath = link.resolvedPath;
        if (targetPath) {
          if (!backlinks.has(targetPath)) {
            backlinks.set(targetPath, []);
          }
          backlinks.get(targetPath)!.push({ ...link, source });
        }
      }
    }

    const allKnowledgePaths = knowledgeFiles.map((file) => file.path);
    const knowledgeKinds = new Map(knowledgeFiles.map((file) => [file.path, file.kind]));
    this.data = {
      forwardLinks,
      backlinks,
      allPaths,
      titleToPath,
      pathToTitle,
      allKnowledgePaths,
      knowledgeKinds,
    };
    console.log(`[indexer] Indexed ${allPaths.length} notes, ${forwardLinks.size} with links`);
  }

  /** 解析 wikilink 标题 → 文件路径 */
  private resolveLink(target: string, titleToPath: Map<string, string>, allPaths: string[]): string | null {
    // 精确匹配 title
    const lower = target.toLowerCase();
    if (titleToPath.has(lower)) {
      return titleToPath.get(lower)!;
    }

    // 模糊匹配：target 可能是文件名的一部分
    for (const p of allPaths) {
      const stem = path.basename(p, '.md').toLowerCase();
      if (stem === lower) {
        return p;
      }
    }

    // 部分匹配：包含关系
    for (const p of allPaths) {
      const stem = path.basename(p, '.md').toLowerCase();
      if (stem.includes(lower) || lower.includes(stem)) {
        return p;
      }
    }

    return null;
  }

  private resolveCurrentLinks(links: LinkInfo[]): LinkInfo[] {
    return links.map((link) => ({
      ...link,
      resolvedPath: this.resolveLink(link.target, this.data.titleToPath, this.data.allPaths),
    }));
  }

  private removeBacklinksFromSource(sourcePath: string, oldLinks: LinkInfo[]): void {
    for (const link of oldLinks) {
      if (!link.resolvedPath) continue;
      const backlinks = this.data.backlinks.get(link.resolvedPath);
      if (!backlinks) continue;
      const remaining = backlinks.filter((backlink) => backlink.source !== sourcePath);
      if (remaining.length > 0) {
        this.data.backlinks.set(link.resolvedPath, remaining);
      } else {
        this.data.backlinks.delete(link.resolvedPath);
      }
    }
  }

  private addBacklinksFromSource(sourcePath: string, links: LinkInfo[]): void {
    for (const link of links) {
      if (!link.resolvedPath) continue;
      const backlinks = this.data.backlinks.get(link.resolvedPath) || [];
      backlinks.push({ ...link, source: sourcePath });
      this.data.backlinks.set(link.resolvedPath, backlinks);
    }
  }

  getLinks(filePath: string): LinkInfo[] {
    return this.data.forwardLinks.get(filePath) || [];
  }

  getBacklinks(filePath: string): LinkInfo[] {
    return this.data.backlinks.get(filePath) || [];
  }

  getAllPaths(): string[] {
    return this.data.allPaths;
  }

  getAllKnowledgePaths(): string[] {
    return this.data.allKnowledgePaths;
  }

  getKnowledgeLabel(filePath: string): string {
    return this.data.pathToTitle.get(filePath) || path.basename(filePath);
  }

  getKnowledgeKind(filePath: string): Exclude<FileKind, 'directory'> | undefined {
    return this.data.knowledgeKinds.get(filePath);
  }

  getPathToTitle(): Map<string, string> {
    return this.data.pathToTitle;
  }

  getTitleToPath(): Map<string, string> {
    return this.data.titleToPath;
  }

  /** 获取某文件的所有出链（合并 wikilink + 界面链接） */
  getMergedLinks(filePath: string): LinkInfo[] {
    const wikiLinks = this.getLinks(filePath);
    const result: LinkInfo[] = wikiLinks.map((l) => ({ ...l, sourceType: 'wikilink' as const }));

    if (this.linkStore) {
      const uiLinks = this.linkStore.getLinks(filePath);
      for (const ui of uiLinks) {
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

  /** 获取合并后的图谱数据 */
  getMergedGraphData(): KnowledgeGraphData {
    return buildKnowledgeGraph({
      paths: this.data.allKnowledgePaths,
      labelFor: (filePath) => this.getKnowledgeLabel(filePath),
      kindFor: (filePath) => this.data.knowledgeKinds.get(filePath) ?? 'other',
      wikiLinksFor: (filePath) => this.getLinks(filePath),
      uiLinks: this.linkStore?.getAllLinks() ?? [],
    });
  }

  /** 文件变化后刷新索引；标题变化会影响其他笔记的解析，仍回退到全量重建。 */
  async updateFile(filePath: string): Promise<void> {
    const relPath = filePath.replace(/\\/g, '/');
    if (!relPath.endsWith('.md')) return;

    const raw = await readNote(this.notesDir, relPath);
    if (!raw || !this.data.allPaths.includes(relPath)) {
      await this.rebuild();
      return;
    }

    const parsed = extractNoteIndexData(relPath, raw);
    const previousTitle = this.data.pathToTitle.get(relPath);
    if (!previousTitle || previousTitle.toLowerCase() !== parsed.title.toLowerCase()) {
      await this.rebuild();
      return;
    }

    this.data.pathToTitle.set(relPath, parsed.title);
    this.data.titleToPath.set(parsed.title.toLowerCase(), relPath);

    const oldLinks = this.data.forwardLinks.get(relPath) || [];
    const resolvedLinks = this.resolveCurrentLinks(parsed.links);
    this.removeBacklinksFromSource(relPath, oldLinks);

    if (resolvedLinks.length > 0) {
      this.data.forwardLinks.set(relPath, resolvedLinks);
    } else {
      this.data.forwardLinks.delete(relPath);
    }
    this.addBacklinksFromSource(relPath, resolvedLinks);
  }
}
