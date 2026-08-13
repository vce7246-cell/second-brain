import fs from 'fs/promises';
import type { Dirent } from 'fs';
import path from 'path';
import { extractNoteIndexData, type LinkInfo } from './wikilink-parser.js';

const NOTE_READ_CONCURRENCY = 32;

export interface ScannedNote {
  path: string;
  title: string;
  links: LinkInfo[];
}

export async function readNote(notesDir: string, relPath: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(notesDir, relPath), 'utf-8');
  } catch {
    return null;
  }
}

export async function scanNotes(notesDir: string): Promise<ScannedNote[]> {
  const relPaths: string[] = [];
  await collectMarkdownPaths(notesDir, '', relPaths);

  const notes = await mapLimit(relPaths, NOTE_READ_CONCURRENCY, async (relPath) => {
    const raw = await readNote(notesDir, relPath);
    if (!raw) return null;
    const parsed = extractNoteIndexData(relPath, raw);
    return { path: relPath, title: parsed.title, links: parsed.links };
  });

  return notes.filter((note): note is ScannedNote => note !== null);
}

async function collectMarkdownPaths(rootDir: string, dirPath: string, relPaths: string[]): Promise<void> {
  const fullPath = path.join(rootDir, dirPath);
  let entries: Dirent[];

  try {
    entries = await fs.readdir(fullPath, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const relPath = (dirPath ? path.join(dirPath, entry.name) : entry.name).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      await collectMarkdownPaths(rootDir, relPath, relPaths);
    } else if (entry.name.endsWith('.md')) {
      relPaths.push(relPath);
    }
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
