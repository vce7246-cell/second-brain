import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { MAX_FILE_IMPORT_BYTES } from '../../shared/constants.js';
import { FileManagementError, normalizeManagedPath } from '../services/file-management.js';
import { ensureImportDirectory, importFileStream } from '../services/file-import.js';

const RelativeImportPathSchema = z.string()
  .min(1, 'path is required')
  .refine(
    (value) => !value.replace(/\\/g, '/').split('/').includes('..'),
    'Parent traversal segments are not allowed'
  );
const ImportQuerySchema = z.object({
  filePath: RelativeImportPathSchema,
});
const ImportFolderQuerySchema = z.object({
  dirPath: RelativeImportPathSchema,
});

export interface FileImportRouterOptions {
  maxBytes?: number;
}

function declaredContentLength(req: Request): number | undefined {
  const rawValue = req.header('content-length');
  if (rawValue === undefined) return undefined;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new FileManagementError('Invalid Content-Length', 400, 'INVALID_CONTENT_LENGTH');
  }
  return value;
}

function sendError(error: unknown, res: Response): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', details: error.errors });
    return;
  }
  if (error instanceof FileManagementError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
}

export function createFileImportRouter(
  notesDir: string,
  options: FileImportRouterOptions = {}
): Router {
  const router = Router();
  const maxBytes = options.maxBytes ?? MAX_FILE_IMPORT_BYTES;

  router.post('/api/files/import-folder', async (req: Request, res: Response) => {
    try {
      const { dirPath } = ImportFolderQuerySchema.parse(req.query);
      const normalizedPath = normalizeManagedPath(dirPath);
      const created = await ensureImportDirectory(notesDir, normalizedPath);
      res.status(created ? 201 : 200).json({ dirPath: normalizedPath, created });
    } catch (error) {
      sendError(error, res);
    }
  });

  router.post('/api/files/import', async (req: Request, res: Response) => {
    try {
      const { filePath } = ImportQuerySchema.parse(req.query);
      if (!req.is('application/octet-stream')) {
        res.status(415).json({
          error: 'File imports require application/octet-stream',
          code: 'UNSUPPORTED_MEDIA_TYPE',
        });
        return;
      }
      const normalizedPath = normalizeManagedPath(filePath);
      const size = await importFileStream(notesDir, normalizedPath, req, {
        maxBytes,
        declaredBytes: declaredContentLength(req),
      });
      res.status(201).json({ filePath: normalizedPath, imported: true, size });
    } catch (error) {
      sendError(error, res);
    }
  });

  return router;
}
