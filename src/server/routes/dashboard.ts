import fs from 'fs/promises';
import path from 'path';
import type { Router } from 'express';
import type { FileKind } from '../../shared/file-types.js';
import type { WikilinkIndexer } from '../services/indexer.js';
import type { LinkStore } from '../services/link-store.js';

type KnowledgeKind = Exclude<FileKind, 'directory'>;

interface DashboardItem {
  path: string;
  title: string;
  kind: KnowledgeKind;
}

function comparePaths(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function getAncestorFolders(filePath: string): string[] {
  const directory = path.posix.dirname(filePath);
  if (directory === '.') return [];

  const folders: string[] = [];
  let current = '';
  for (const part of directory.split('/').filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    folders.push(current);
  }
  return folders;
}

async function getRecentItems(
  notesDir: string,
  items: DashboardItem[]
): Promise<Array<DashboardItem & { mtime: number }>> {
  const recent: Array<DashboardItem & { mtime: number }> = [];
  const batchSize = 32;

  for (let offset = 0; offset < items.length; offset += batchSize) {
    const batch = await Promise.all(items.slice(offset, offset + batchSize).map(async (item) => {
      try {
        const stat = await fs.stat(path.join(notesDir, item.path));
        return { ...item, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    }));
    recent.push(...batch.filter((item): item is DashboardItem & { mtime: number } => item !== null));
  }

  return recent
    .sort((left, right) => right.mtime - left.mtime || comparePaths(left.path, right.path))
    .slice(0, 5);
}

export function registerDashboardRoute(
  router: Router,
  indexer: WikilinkIndexer,
  linkStore: LinkStore
): void {
  router.get('/api/dashboard', async (_req, res) => {
    const graph = indexer.getMergedGraphData();
    const items: DashboardItem[] = graph.nodes.map((node) => ({
      path: node.id,
      title: node.label,
      kind: node.kind,
    }));
    const activePaths = new Set(items.map((item) => item.path));
    const relationCounts = new Map(items.map((item) => [item.path, 0]));
    const relatedPaths = new Set<string>();

    for (const link of graph.links) {
      relationCounts.set(link.source, (relationCounts.get(link.source) || 0) + 1);
      if (link.target !== link.source) {
        relationCounts.set(link.target, (relationCounts.get(link.target) || 0) + 1);
      }
      relatedPaths.add(link.source);
      relatedPaths.add(link.target);
    }

    const coreNodes = items
      .map((item) => ({ ...item, relationCount: relationCounts.get(item.path) || 0 }))
      .filter((item) => item.relationCount > 0)
      .sort((left, right) => right.relationCount - left.relationCount
        || comparePaths(left.path, right.path))
      .slice(0, 5);
    const orphanItems = items
      .filter((item) => !relatedPaths.has(item.path))
      .sort((left, right) => comparePaths(left.path, right.path))
      .slice(0, 5);

    const folderGroups = new Map<string, { count: number; linkCount: number }>();
    for (const item of items) {
      for (const folder of getAncestorFolders(item.path)) {
        const group = folderGroups.get(folder) || { count: 0, linkCount: 0 };
        group.count += 1;
        folderGroups.set(folder, group);
      }
    }
    for (const link of graph.links) {
      const linkedFolders = new Set([
        ...getAncestorFolders(link.source),
        ...getAncestorFolders(link.target),
      ]);
      for (const folder of linkedFolders) {
        const group = folderGroups.get(folder);
        if (group) group.linkCount += 1;
      }
    }

    const activeManualTags = new Set<string>();
    for (const [filePath, tags] of Object.entries(linkStore.getAllTags())) {
      if (!activePaths.has(filePath)) continue;
      for (const tag of tags) activeManualTags.add(tag);
    }

    const totalNotes = items.filter((item) => item.kind === 'markdown').length;
    res.json({
      totalItems: items.length,
      totalNotes,
      totalAttachments: items.length - totalNotes,
      totalLinks: graph.links.length,
      totalTags: activeManualTags.size,
      coreNodes,
      orphanItems,
      folderGroups: Array.from(folderGroups, ([name, group]) => ({ name, ...group }))
        .sort((left, right) => right.count - left.count || comparePaths(left.name, right.name)),
      recentItems: await getRecentItems(indexer.getNotesDir(), items),
    });
  });
}
