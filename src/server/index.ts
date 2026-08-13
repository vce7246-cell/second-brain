/**
 * Express 服务器入口 — REST API + WebSocket + 静态文件服务
 */
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { attachWebSocket, broadcast } from './ws.js';
import { createFileRouter } from './routes/files.js';
import { createNotesRouter, createLinksRouter } from './routes/notes.js';
import { WikilinkIndexer } from './services/indexer.js';
import { startWatcher } from './services/watcher.js';
import { LinkStore } from './services/link-store.js';
import { ContentSearchIndex } from './services/content-search-index.js';
import { createContentSearchRouter } from './routes/content-search.js';
import { DEFAULT_PORT, LOOPBACK_HOST } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  /** 笔记库根目录（绝对路径） */
  notesDir: string;
  /** HTTP 端口 */
  port?: number;
  /** 是否静默模式（不输出启动日志） */
  silent?: boolean;
}

/** 启动 HTTP + WebSocket 服务器，返回 server 实例和实际端口 */
export async function startServer(options: ServerOptions): Promise<{
  server: ReturnType<typeof createServer>;
  port: number;
  indexer: WikilinkIndexer;
  watcher: ReturnType<typeof startWatcher>;
}> {
  const { notesDir, port = DEFAULT_PORT, silent = false } = options;

  const app = express();

  // JSON 请求体解析
  app.use(express.json({ limit: '10mb' }));

  // 构建 Wikilink 索引
  const indexer = new WikilinkIndexer(notesDir);
  const contentSearch = new ContentSearchIndex(notesDir);
  await Promise.all([indexer.rebuild(), contentSearch.rebuild()]);

  // 初始化 LinkStore（v2 界面链接存储）
  const linkStore = new LinkStore(notesDir);
  await linkStore.load();
  indexer.setLinkStore(linkStore);

  async function refreshKnowledgeIndex(): Promise<void> {
    await Promise.all([indexer.rebuild(), contentSearch.rebuild()]);
    broadcast({ type: 'links-changed' });
    broadcast({ type: 'refresh-tree' });
  }

  // ===== API 路由 =====

  /** 健康检查 */
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', notesDir, notesCount: indexer.getAllPaths().length });
  });

  // 文件 CRUD API
  app.use(createFileRouter(notesDir, {
    onPathMoved: async (oldPath, newPath) => {
      await linkStore.movePath(oldPath, newPath);
      await refreshKnowledgeIndex();
      broadcast({ type: 'tags-changed' });
    },
    onVisibilityChanged: async () => {
      await refreshKnowledgeIndex();
      broadcast({ type: 'tags-changed' });
    },
    onFileSaved: async (filePath) => {
      if (filePath.endsWith('.md')) {
        await refreshKnowledgeIndex();
      }
    },
  }));

  // 笔记链接/搜索 API
  app.use(createNotesRouter(indexer));

  // 本地标题、路径和受限文本正文搜索 API
  app.use(createContentSearchRouter(contentSearch, indexer));

  // 链接/标签 API（v2）
  app.use(createLinksRouter(linkStore, indexer));

  // 生产环境：serve Vite 构建产物
  const distPath = path.resolve(__dirname, '..', '..', 'dist');
  app.use(express.static(distPath));

  // SPA fallback：所有非 API 请求返回 index.html
  app.get('*', (_req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        // dist/ 还没构建，返回提示
        res.status(503).json({
          error: 'Frontend not built. Run `npm run build` first.',
        });
      }
    });
  });

  // ===== 启动 =====

  const server = createServer(app);

  // 挂载 WebSocket
  attachWebSocket(server);

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, LOOPBACK_HOST, () => {
      const address = server.address();
      const actualPort = address && typeof address !== 'string' ? address.port : port;
      if (!silent) {
        console.log(`[server] SecondBrain Lite running at http://${LOOPBACK_HOST}:${actualPort}`);
        console.log(`[server] Notes directory: ${notesDir}`);
      }
      // 启动文件监听
      const watcher = startWatcher({ notesDir, indexer, contentSearch });
      resolve({ server, port: actualPort, indexer, watcher });
    });
  });
}

// 仅当此文件是入口（非被 import）时自动启动 — 供 tsx watch 使用
const runningDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('/src/server/index.ts')
  || process.argv[1]?.replace(/\\/g, '/').endsWith('/src/server/index.js');

if (runningDirectly) {
  const NOTES_DIR = process.env.SB_NOTES_DIR || process.cwd();
  startServer({ notesDir: NOTES_DIR }).catch((err) => {
    console.error('[server] Failed to start:', err);
    process.exit(1);
  });
}
