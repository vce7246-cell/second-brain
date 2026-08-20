import fs from 'node:fs/promises';
import matter from 'gray-matter';
import { MAX_TEXT_CONTENT_BYTES } from '../../shared/constants.js';
import type { FileKind } from '../../shared/file-types.js';
import { scanKnowledgeFiles } from './knowledge-scanner.js';
import { resolveManagedPath } from './file-management.js';
import { getFileExtension } from '../../shared/file-types.js';

interface SearchDocument {
  path: string;
  kind: Exclude<FileKind, 'directory'>;
  content: string;
}

export interface ContentSearchResult {
  path: string;
  title: string;
  kind: Exclude<FileKind, 'directory'>;
  matchSource: 'title' | 'path' | 'content';
  snippet: string;
}

interface RankedResult extends ContentSearchResult {
  score: number;
}

const READ_BATCH_SIZE = 20;
const SNIPPET_LENGTH = 160;

export class ContentSearchIndex {
  private documents = new Map<string, SearchDocument>();

  constructor(private readonly notesDir: string) {}

  async rebuild(): Promise<void> {
    const files = await scanKnowledgeFiles(this.notesDir);
    const nextDocuments = new Map<string, SearchDocument>();

    for (let offset = 0; offset < files.length; offset += READ_BATCH_SIZE) {
      const batch = files.slice(offset, offset + READ_BATCH_SIZE);
      const documents = await Promise.all(batch.map(async (file) => ({
        ...file,
        content: await this.readContent(file.path, file.kind),
      })));
      for (const document of documents) nextDocuments.set(document.path, document);
    }

    this.documents = nextDocuments;
  }

  async updateFile(filePath: string): Promise<void> {
    const current = this.documents.get(filePath);
    if (!current) return;
    current.content = await this.readContent(filePath, current.kind);
  }

  removeFile(filePath: string): void {
    this.documents.delete(filePath);
  }

  search(
    query: string,
    limit: number,
    labelFor: (filePath: string) => string
  ): ContentSearchResult[] {
    const lowerQuery = query.toLocaleLowerCase();
    const results: RankedResult[] = [];

    for (const document of this.documents.values()) {
      const title = labelFor(document.path);
      const lowerTitle = title.toLocaleLowerCase();
      const lowerPath = document.path.toLocaleLowerCase();
      const contentIndex = document.content.toLocaleLowerCase().indexOf(lowerQuery);
      const score = matchScore(lowerTitle, lowerPath, contentIndex, lowerQuery);
      if (score === null) continue;

      results.push({
        path: document.path,
        title,
        kind: document.kind,
        matchSource: score <= 2 ? 'title' : score === 3 ? 'path' : 'content',
        snippet: buildSnippet(document.content, contentIndex, query.length),
        score,
      });
    }

    return results
      .sort((left, right) => left.score - right.score
        || left.title.localeCompare(right.title)
        || left.path.localeCompare(right.path))
      .slice(0, limit)
      .map(({ score: _score, ...result }) => result);
  }

  private async readContent(
    filePath: string,
    kind: Exclude<FileKind, 'directory'>
  ): Promise<string> {
    if (kind !== 'markdown' && kind !== 'text') return '';
    // Draw.io XML is previewable but intentionally stays out of正文搜索。
    if (getFileExtension(filePath) === '.drawio') return '';

    try {
      const fullPath = await resolveManagedPath(this.notesDir, filePath);
      const stat = await fs.stat(fullPath);
      if (!stat.isFile() || stat.size > MAX_TEXT_CONTENT_BYTES) return '';
      const bytes = await fs.readFile(fullPath);
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return kind === 'markdown' ? matter(decoded).content.trim() : decoded;
    } catch {
      return '';
    }
  }
}

function matchScore(
  lowerTitle: string,
  lowerPath: string,
  contentIndex: number,
  lowerQuery: string
): number | null {
  if (lowerTitle === lowerQuery) return 0;
  if (lowerTitle.startsWith(lowerQuery)) return 1;
  if (lowerTitle.includes(lowerQuery)) return 2;
  if (lowerPath.includes(lowerQuery)) return 3;
  if (contentIndex >= 0) return 4;
  return null;
}

function buildSnippet(content: string, matchIndex: number, queryLength: number): string {
  if (!content) return '';
  const center = matchIndex >= 0 ? matchIndex : 0;
  const start = Math.max(0, center - Math.floor((SNIPPET_LENGTH - queryLength) / 2));
  const end = Math.min(content.length, start + SNIPPET_LENGTH);
  const excerpt = content.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${excerpt}${end < content.length ? '…' : ''}`;
}
