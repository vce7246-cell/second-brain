import { Router, type Request, type Response } from 'express';
import fs from 'fs/promises';
import { z } from 'zod';
import { getFileExtension, getFileKind } from '../../shared/file-types.js';
import { resolveManagedPath } from '../services/file-management.js';

const MetadataSchema = z.object({
  filePath: z.string().min(1, 'filePath is required'),
});

function sendError(error: unknown, res: Response): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', details: error.errors });
    return;
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(400).json({ error: message });
}

export function createFileMetadataRouter(notesDir: string): Router {
  const router = Router();

  router.post('/api/files/meta', async (req: Request, res: Response) => {
    try {
      const { filePath } = MetadataSchema.parse(req.body);
      const fullPath = await resolveManagedPath(notesDir, filePath);
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) {
        res.status(415).json({ error: 'Metadata is only available for files' });
        return;
      }
      res.json({
        filePath,
        kind: getFileKind(filePath),
        extension: getFileExtension(filePath),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    } catch (error) {
      sendError(error, res);
    }
  });

  return router;
}
