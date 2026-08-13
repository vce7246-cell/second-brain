/**
 * 文件监听服务 — 使用 chokidar 监听笔记目录变更
 * 通过 WebSocket 广播文件变更事件到所有连接的客户端
 */
import chokidar from 'chokidar';
import path from 'node:path';
import { broadcast } from '../ws.js';
import type { WikilinkIndexer } from './indexer.js';
import type { ContentSearchIndex } from './content-search-index.js';

export interface WatcherOptions {
  notesDir: string;
  indexer: WikilinkIndexer;
  contentSearch: ContentSearchIndex;
}

/** 启动文件监听，返回 watcher 实例 */
export function startWatcher(options: WatcherOptions): chokidar.FSWatcher {
  const { notesDir, indexer, contentSearch } = options;
  let rebuilding = false;
  let rebuildRequested = false;

  async function refreshKnowledgeIndex(): Promise<void> {
    if (rebuilding) {
      rebuildRequested = true;
      return;
    }
    rebuilding = true;
    try {
      do {
        rebuildRequested = false;
        await Promise.all([indexer.rebuild(), contentSearch.rebuild()]);
      } while (rebuildRequested);
      broadcast({ type: 'links-changed' });
      broadcast({ type: 'tags-changed' });
      broadcast({ type: 'refresh-tree' });
    } catch (error) {
      console.error('[watcher] Failed to refresh knowledge index:', error);
    } finally {
      rebuilding = false;
    }
  }

  const watcher = chokidar.watch(notesDir, {
    // 监听所有可见文件，确保非 Markdown 文件也能及时出现在文件树中。
    ignored: [
      /(^|[\\/])\.[^\\/]/,
      /node_modules/,
    ],
    persistent: true,
    ignoreInitial: true, // 启动时不触发 add 事件
    awaitWriteFinish: {
      stabilityThreshold: 300, // 文件写入后等 300ms 稳定
      pollInterval: 100,
    },
  });

  // 将绝对路径转为相对路径
  function toRelPath(absPath: string): string {
    return path.relative(notesDir, absPath).replace(/\\/g, '/');
  }

  watcher.on('add', (absPath) => {
    const relPath = toRelPath(absPath);
    console.log(`[watcher] add: ${relPath}`);
    void refreshKnowledgeIndex();
    broadcast({ type: 'file-added', path: relPath });
    broadcast({ type: 'refresh-tree' });
  });

  watcher.on('change', async (absPath) => {
    const relPath = toRelPath(absPath);
    console.log(`[watcher] change: ${relPath}`);
    await Promise.all([
      relPath.endsWith('.md') ? indexer.updateFile(relPath) : Promise.resolve(),
      contentSearch.updateFile(relPath),
    ]);
    if (relPath.endsWith('.md')) {
      broadcast({ type: 'links-changed' });
    }
    broadcast({ type: 'refresh-tree' });
    broadcast({ type: 'file-changed', path: relPath });
  });

  watcher.on('unlink', (absPath) => {
    const relPath = toRelPath(absPath);
    console.log(`[watcher] unlink: ${relPath}`);
    contentSearch.removeFile(relPath);
    void refreshKnowledgeIndex();
    broadcast({ type: 'file-deleted', path: relPath });
    broadcast({ type: 'refresh-tree' });
  });

  watcher.on('addDir', () => {
    broadcast({ type: 'refresh-tree' });
  });

  watcher.on('unlinkDir', () => {
    broadcast({ type: 'refresh-tree' });
  });

  watcher.on('error', (err) => {
    console.error('[watcher] Error:', err);
  });

  console.log(`[watcher] Watching: ${notesDir}`);
  return watcher;
}
