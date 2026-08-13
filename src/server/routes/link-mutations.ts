import type { Response, Router } from 'express';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { LinkStoreConflictError, type LinkStore } from '../services/link-store.js';
import {
  FileManagementError,
  normalizeManagedPath,
  resolveManagedPath,
} from '../services/file-management.js';
import { broadcast } from '../ws.js';

const LinkSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
const TagsAddSchema = z.object({
  filePath: z.string().min(1),
  tags: z.array(z.string().min(1)),
});
const TagRemoveSchema = z.object({
  filePath: z.string().min(1),
  tag: z.string().min(1),
});

function sendWriteError(error: unknown, res: Response): void {
  if (error instanceof FileManagementError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  const conflict = error instanceof LinkStoreConflictError;
  const message = error instanceof Error ? error.message : 'LinkStore write failed';
  res.status(conflict ? 409 : 500).json({
    error: message,
    code: conflict ? error.code : 'LINK_STORE_WRITE_FAILED',
  });
}

async function assertKnowledgeFile(notesDir: string, filePath: string): Promise<string> {
  const normalizedPath = normalizeManagedPath(filePath);
  const fullPath = await resolveManagedPath(notesDir, normalizedPath);
  let stat;
  try {
    stat = await fs.lstat(fullPath);
  } catch (error) {
    throw new FileManagementError('Knowledge file does not exist', 400, 'FILE_NOT_FOUND');
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new FileManagementError('Knowledge relations require a regular file', 400, 'NOT_A_FILE');
  }
  return normalizedPath;
}

export function registerLinkMutationRoutes(
  router: Router,
  linkStore: LinkStore,
  notesDir: string
): void {
  router.post('/api/links/add', async (req, res) => {
    const parsed = LinkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }
    try {
      const [from, to] = await Promise.all([
        assertKnowledgeFile(notesDir, parsed.data.from),
        assertKnowledgeFile(notesDir, parsed.data.to),
      ]);
      await linkStore.addLink(from, to);
      broadcast({ type: 'links-changed' });
      res.json({ success: true });
    } catch (error) {
      sendWriteError(error, res);
    }
  });

  router.post('/api/links/remove', async (req, res) => {
    const parsed = LinkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }
    try {
      await linkStore.removeLink(
        normalizeManagedPath(parsed.data.from),
        normalizeManagedPath(parsed.data.to)
      );
      broadcast({ type: 'links-changed' });
      res.json({ success: true });
    } catch (error) {
      sendWriteError(error, res);
    }
  });

  router.post('/api/tags/add', async (req, res) => {
    const parsed = TagsAddSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }
    try {
      const filePath = await assertKnowledgeFile(notesDir, parsed.data.filePath);
      await linkStore.addTags(filePath, parsed.data.tags);
      broadcast({ type: 'tags-changed' });
      res.json({ success: true, tags: linkStore.getTags(filePath) });
    } catch (error) {
      sendWriteError(error, res);
    }
  });

  router.post('/api/tags/remove', async (req, res) => {
    const parsed = TagRemoveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }
    try {
      const filePath = normalizeManagedPath(parsed.data.filePath);
      await linkStore.removeTag(filePath, parsed.data.tag);
      broadcast({ type: 'tags-changed' });
      res.json({ success: true, tags: linkStore.getTags(filePath) });
    } catch (error) {
      sendWriteError(error, res);
    }
  });
}
