import type { Router } from 'express';
import { z } from 'zod';
import type { WikilinkIndexer } from '../services/indexer.js';

const SearchSchema = z.object({
  query: z.string().default(''),
  limit: z.number().int().min(1).max(100).default(20),
});

export function registerKnowledgeSearchRoute(
  router: Router,
  indexer: WikilinkIndexer
): void {
  router.post('/api/knowledge/search', (req, res) => {
    const parsed = SearchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }

    const { query, limit } = parsed.data;
    const lowerQuery = query.toLowerCase();
    const results = indexer.getAllKnowledgePaths()
      .map((filePath) => ({ path: filePath, title: indexer.getKnowledgeLabel(filePath) }))
      .filter((item) => !query
        || item.title.toLowerCase().includes(lowerQuery)
        || item.path.toLowerCase().includes(lowerQuery))
      .sort((left, right) => {
        const leftStarts = left.title.toLowerCase().startsWith(lowerQuery);
        const rightStarts = right.title.toLowerCase().startsWith(lowerQuery);
        if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
        return left.title.localeCompare(right.title);
      });

    res.json({ results: results.slice(0, limit) });
  });
}
