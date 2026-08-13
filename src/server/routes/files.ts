/** 文件 CRUD API；所有路径操作限定在 notesDir 内。 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { saveImage } from '../services/image-store.js';
import {
  createFileManagementRouter,
  type FileManagementRouterOptions,
} from './file-management.js';
import { createFileMetadataRouter } from './file-metadata.js';
import { createFilePreviewRouter } from './file-preview.js';
import { createFileImportRouter } from './file-import.js';
import { resolveManagedPath } from '../services/file-management.js';
import { getFileExtension, getFileKind, type FileKind } from '../../shared/file-types.js';
import {
  FileVersionConflictError,
  readVersionedFile,
  saveVersionedFile,
} from '../services/file-persistence.js';

// ===== Zod schemas =====

const ListSchema = z.object({
  dirPath: z.string().optional().default(''),
});

const ReadSchema = z.object({
  filePath: z.string().min(1, 'filePath is required'),
});

const CreateSchema = z.object({
  filePath: z.string().min(1, 'filePath is required'),
  content: z.string().optional().default(''),
});

const SaveSchema = z.object({
  filePath: z.string().min(1, 'filePath is required'),
  content: z.string(),
  expectedVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as Error & { code?: unknown }).code === code;
}

// ===== Types =====

interface TreeNode {
  name: string;
  path: string; // 相对于 notesDir 的路径
  type: 'file' | 'directory';
  kind: FileKind;
  extension?: string;
  size?: number;
  mtimeMs?: number;
  children?: TreeNode[];
}

interface FileRouterOptions extends FileManagementRouterOptions {
  onFileSaved?: (filePath: string) => Promise<void>;
}

// ===== Router factory =====

export function createFileRouter(
  notesDir: string,
  managementOptions: FileRouterOptions = {}
): Router {
  const router = Router();
  router.use(createFileManagementRouter(notesDir, managementOptions));
  router.use(createFileMetadataRouter(notesDir));
  router.use(createFilePreviewRouter(notesDir));
  router.use(createFileImportRouter(notesDir));

  /** 递归构建目录树 */
  async function buildTree(dirPath: string): Promise<TreeNode> {
    const fullPath = await resolveManagedPath(notesDir, dirPath, { allowRoot: true });
    const stat = await fs.stat(fullPath);
    const name = path.basename(fullPath) || path.basename(notesDir);

    if (!stat.isDirectory()) {
      return {
        name,
        path: dirPath,
        type: 'file',
        kind: getFileKind(name),
        extension: getFileExtension(name),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      };
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    // 过滤掉隐藏文件和 node_modules
    const filtered = entries
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && !e.isSymbolicLink())
      .sort((a, b) => {
        // 目录优先，然后按名称排序
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    const children = await Promise.all(
      filtered.map((entry) =>
        buildTree(path.join(dirPath, entry.name))
      )
    );

    return { name, path: dirPath, type: 'directory', kind: 'directory', children };
  }

  // ===== Routes =====

  /** 列出目录树 */
  router.post('/api/files/list', async (req: Request, res: Response) => {
    try {
      const { dirPath } = ListSchema.parse(req.body);
      const tree = await buildTree(dirPath || '');
      res.json(tree);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: err.errors });
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  /** 读取文件内容 */
  router.post('/api/files/read', async (req: Request, res: Response) => {
    try {
      const { filePath } = ReadSchema.parse(req.body);
      const fullPath = await resolveManagedPath(notesDir, filePath);
      const { content, version } = await readVersionedFile(fullPath);
      res.json({ filePath, content, version });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: err.errors });
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  /** 创建文件（自动创建父目录，不覆盖已有文件） */
  router.post('/api/files/create', async (req: Request, res: Response) => {
    try {
      const { filePath, content } = CreateSchema.parse(req.body);
      const fullPath = await resolveManagedPath(notesDir, filePath);
      // 确保父目录存在
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      // 原子地拒绝覆盖已有文件，避免“先检查再写入”的竞态窗口。
      await fs.writeFile(fullPath, content, { encoding: 'utf-8', flag: 'wx' });
      res.json({ filePath, created: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: err.errors });
        return;
      }
      if (hasErrorCode(err, 'EEXIST')) {
        res.status(409).json({
          error: 'Destination already exists',
          code: 'PATH_EXISTS',
        });
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  /** 保存文件（始终覆盖，用于编辑器 Ctrl+S） */
  router.post('/api/files/save', async (req: Request, res: Response) => {
    try {
      const { filePath, content, expectedVersion } = SaveSchema.parse(req.body);
      const fullPath = await resolveManagedPath(notesDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      const version = await saveVersionedFile(fullPath, content, expectedVersion);
      await managementOptions.onFileSaved?.(filePath);
      res.json({ filePath, saved: true, version });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: err.errors });
        return;
      }
      if (err instanceof FileVersionConflictError) {
        res.status(409).json({
          error: err.message,
          code: err.code,
          currentVersion: err.currentVersion,
        });
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  // 图片上传 schema
  const ImageUploadSchema = z.object({
    /** base64 编码的图片数据（不含 data:xxx;base64, 前缀） */
    data: z.string().min(1),
    /** MIME 类型，如 image/png */
    mimeType: z.string().min(1),
    /** 当前笔记所在目录（相对于 notesDir），用于确定图片存放位置 */
    currentNoteDir: z.string().optional().default(''),
  });

  /** 图片上传（剪贴板粘贴） */
  router.post('/api/files/upload-image', async (req: Request, res: Response) => {
    try {
      const { data, mimeType, currentNoteDir } = ImageUploadSchema.parse(req.body);
      const relPath = await saveImage(notesDir, currentNoteDir, data, mimeType);
      const markdownRef = `![](./images/${path.posix.basename(relPath)})`;
      res.json({ path: relPath, markdown: markdownRef });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: err.errors });
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  /** 创建每日笔记 */
  router.post('/api/files/daily-note', async (req: Request, res: Response) => {
    try {
      const { dailyDir } = z.object({
        dailyDir: z.string().optional().default('daily')
      }).parse(req.body);

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const fileName = `${dateStr}.md`;
      const filePath = dailyDir ? path.join(dailyDir, fileName).replace(/\\/g, '/') : fileName;
      const fullPath = await resolveManagedPath(notesDir, filePath);

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      const template = `# ${dateStr}\n\n`;
      try {
        await fs.writeFile(fullPath, template, { encoding: 'utf-8', flag: 'wx' });
      } catch (error) {
        if (hasErrorCode(error, 'EEXIST')) {
          res.json({ filePath, created: false, existed: true });
          return;
        }
        throw error;
      }

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

  return router;
}
