import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  createFolder,
  FileManagementError,
  listTrashItems,
  moveEntry,
  moveEntryToTrash,
  normalizeManagedPath,
  restoreTrashItem,
} from '../services/file-management.js';

export interface FileManagementRouterOptions {
  onPathMoved?: (oldPath: string, newPath: string) => Promise<void>;
  onVisibilityChanged?: () => Promise<void>;
}

const CreateFolderSchema = z.object({
  dirPath: z.string().min(1, 'dirPath is required'),
});
const MoveSchema = z.object({
  oldPath: z.string().min(1, 'oldPath is required'),
  newPath: z.string().min(1, 'newPath is required'),
});
const DeleteSchema = z.object({
  filePath: z.string().min(1, 'filePath is required'),
});
const RestoreSchema = z.object({
  trashId: z.string().uuid(),
});

function sendError(error: unknown, res: Response): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', details: error.errors });
    return;
  }
  if (error instanceof FileManagementError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(400).json({ error: message });
}

export function createFileManagementRouter(
  notesDir: string,
  options: FileManagementRouterOptions = {}
): Router {
  const router = Router();

  router.post('/api/files/create-folder', async (req: Request, res: Response) => {
    try {
      const { dirPath } = CreateFolderSchema.parse(req.body);
      await createFolder(notesDir, dirPath);
      res.json({ dirPath, created: true });
    } catch (error) {
      sendError(error, res);
    }
  });

  router.post('/api/files/rename', async (req: Request, res: Response) => {
    try {
      const requestedPaths = MoveSchema.parse(req.body);
      const oldPath = normalizeManagedPath(requestedPaths.oldPath);
      const newPath = normalizeManagedPath(requestedPaths.newPath);
      await moveEntry(notesDir, oldPath, newPath);
      if (options.onPathMoved) {
        try {
          await options.onPathMoved(oldPath, newPath);
        } catch (error) {
          try {
            await moveEntry(notesDir, newPath, oldPath);
            await options.onPathMoved(newPath, oldPath);
          } catch {
            throw new FileManagementError(
              'Move metadata update failed and rollback was not possible',
              500,
              'ROLLBACK_FAILED'
            );
          }
          throw error;
        }
      }
      res.json({ oldPath, newPath, renamed: true });
    } catch (error) {
      sendError(error, res);
    }
  });

  router.post('/api/files/delete', async (req: Request, res: Response) => {
    try {
      const { filePath } = DeleteSchema.parse(req.body);
      const item = await moveEntryToTrash(notesDir, filePath);
      try {
        await options.onVisibilityChanged?.();
      } catch (error) {
        console.error('[files] Failed to refresh indexes after trashing an entry:', error);
      }
      res.json({ filePath, deleted: true, item });
    } catch (error) {
      sendError(error, res);
    }
  });

  router.get('/api/files/trash', async (_req: Request, res: Response) => {
    try {
      res.json({ items: await listTrashItems(notesDir) });
    } catch (error) {
      sendError(error, res);
    }
  });

  router.post('/api/files/restore', async (req: Request, res: Response) => {
    try {
      const { trashId } = RestoreSchema.parse(req.body);
      const item = await restoreTrashItem(notesDir, trashId);
      try {
        await options.onVisibilityChanged?.();
      } catch (error) {
        console.error('[files] Failed to refresh indexes after restoring an entry:', error);
      }
      res.json({ restored: true, item });
    } catch (error) {
      sendError(error, res);
    }
  });

  return router;
}
