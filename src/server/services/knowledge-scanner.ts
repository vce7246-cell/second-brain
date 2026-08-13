import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { getFileKind, type FileKind } from '../../shared/file-types.js';

export interface KnowledgeFile {
  path: string;
  kind: Exclude<FileKind, 'directory'>;
}

/** List visible, regular files without following symbolic links. */
export async function scanKnowledgeFiles(notesDir: string): Promise<KnowledgeFile[]> {
  const files: KnowledgeFile[] = [];
  await collectFiles(notesDir, '', files);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function collectFiles(
  rootDir: string,
  dirPath: string,
  files: KnowledgeFile[]
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(path.join(rootDir, dirPath), { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) {
      continue;
    }
    const relativePath = path.posix.join(dirPath.replace(/\\/g, '/'), entry.name);
    if (entry.isDirectory()) {
      await collectFiles(rootDir, relativePath, files);
    } else if (entry.isFile()) {
      const kind = getFileKind(entry.name);
      if (kind !== 'directory') files.push({ path: relativePath, kind });
    }
  }
}
