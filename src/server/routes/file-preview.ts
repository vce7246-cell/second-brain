import { Router, type Request, type Response } from 'express';
import fs from 'fs/promises';
import { z } from 'zod';
import { getFileExtension, getFileKind, isPreviewFileKind } from '../../shared/file-types.js';
import { MAX_TEXT_CONTENT_BYTES } from '../../shared/constants.js';
import { resolveManagedPath } from '../services/file-management.js';

export const MAX_TEXT_PREVIEW_BYTES = MAX_TEXT_CONTENT_BYTES;

const PreviewSchema = z.object({
  filePath: z.string().min(1, 'filePath is required'),
});

export function createFilePreviewRouter(notesDir: string): Router {
  const router = Router();

  router.get('/api/files/preview', async (req: Request, res: Response) => {
    try {
      const { filePath } = PreviewSchema.parse(req.query);
      const fullPath = await resolveManagedPath(notesDir, filePath);
      const stat = await fs.stat(fullPath);
      const kind = getFileKind(filePath);
      if (!stat.isFile() || !isPreviewFileKind(kind)) {
        res.status(415).json({ error: 'This file type cannot be previewed' });
        return;
      }

      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (kind === 'text') {
        if (stat.size > MAX_TEXT_PREVIEW_BYTES) {
          res.status(413).json({
            error: 'Text file exceeds the 1 MB preview limit',
            code: 'TEXT_PREVIEW_TOO_LARGE',
          });
          return;
        }
        const content = await fs.readFile(fullPath, 'utf8');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(content);
        return;
      }

      if (getFileExtension(filePath) === '.svg') {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; img-src data:; style-src 'unsafe-inline'"
        );
      }
      res.sendFile(fullPath);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: error.errors });
        return;
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  return router;
}
