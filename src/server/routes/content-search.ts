import { Router } from 'express';
import { z } from 'zod';
import type { WikilinkIndexer } from '../services/indexer.js';
import type { ContentSearchIndex } from '../services/content-search-index.js';

const ContentSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(100).default(30),
});

export function createContentSearchRouter(
  contentSearch: ContentSearchIndex,
  indexer: WikilinkIndexer
): Router {
  const router = Router();

  router.post('/api/search/content', (req, res) => {
    const parsed = ContentSearchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      return;
    }

    const { query, limit } = parsed.data;
    res.json({
      results: contentSearch.search(
        query,
        limit,
        (filePath) => indexer.getKnowledgeLabel(filePath)
      ),
    });
  });

  return router;
}
