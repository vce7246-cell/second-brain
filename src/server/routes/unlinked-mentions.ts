import fs from 'node:fs/promises';
import path from 'node:path';
import type { Router } from 'express';
import { z } from 'zod';
import type { WikilinkIndexer } from '../services/indexer.js';
import { normalizeManagedPath, resolveManagedPath } from '../services/file-management.js';

const MentionsSchema = z.object({ filePath: z.string().min(1) });

export function registerUnlinkedMentionRoute(
  router: Router,
  indexer: WikilinkIndexer
): void {
  router.post('/api/notes/unlinked-mentions', async (req, res) => {
    const parsed = MentionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }

    const filePath = normalizeManagedPath(parsed.data.filePath);
    const allPaths = indexer.getAllPaths();
    if (!allPaths.includes(filePath)) {
      res.json({ mentions: [] });
      return;
    }

    let content = '';
    try {
      const fullPath = await resolveManagedPath(indexer.getNotesDir(), filePath);
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      res.json({ mentions: [] });
      return;
    }

    const existingLinks = new Set<string>();
    for (const link of indexer.getMergedLinks(filePath)) {
      existingLinks.add((link.resolvedPath || link.target).toLowerCase());
    }

    const mentions: Array<{
      sourcePath: string;
      targetPath: string;
      matchedText: string;
    }> = [];
    for (const otherPath of allPaths) {
      if (otherPath === filePath) continue;
      const title = indexer.getPathToTitle().get(otherPath) || path.basename(otherPath, '.md');
      if (title.length < 3) continue;

      const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = new RegExp(escaped, 'gi').exec(content);
      if (!match) continue;
      const targetLower = title.toLowerCase();
      if (existingLinks.has(targetLower) || existingLinks.has(otherPath)) continue;
      mentions.push({ sourcePath: filePath, targetPath: otherPath, matchedText: match[0] });
    }

    res.json({ mentions });
  });
}
