import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { SB_DIR, TRASH_DIR } from '../../shared/constants.js';
import type { TrashItem } from '../../shared/file-types.js';
import { atomicWriteFile } from './file-persistence.js';
import { resolveSafePath } from './safe-path.js';

const TrashItemSchema: z.ZodType<TrashItem> = z.object({
  id: z.string().uuid(),
  originalPath: z.string().min(1),
  deletedAt: z.string().datetime(),
  entryType: z.enum(['file', 'directory']),
});

export class FileManagementError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'FileManagementError';
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as { code?: unknown }).code === code;
}

export function normalizeManagedPath(relativePath: string): string {
  const normalized = path.posix.normalize(relativePath.replace(/\\/g, '/'));
  return normalized === '.' ? '' : normalized.replace(/^\.\//, '');
}

function assertUserManagedPath(relativePath: string): void {
  const normalized = normalizeManagedPath(relativePath);
  if (!normalized || normalized.split('/').some((segment) => segment.startsWith('.'))) {
    throw new FileManagementError('Hidden, metadata, and root paths cannot be managed', 400, 'PROTECTED_PATH');
  }
}

export async function resolveManagedPath(
  notesDir: string,
  relativePath: string,
  options: { allowRoot?: boolean } = {}
): Promise<string> {
  if (!normalizeManagedPath(relativePath) && options.allowRoot) {
    return resolveSafePath(notesDir, relativePath, { allowRoot: true });
  }
  assertUserManagedPath(relativePath);
  return resolveSafePath(notesDir, relativePath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

async function assertDirectory(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath);
  if (!stat.isDirectory()) {
    throw new FileManagementError('Destination parent is not a directory', 400, 'INVALID_PARENT');
  }
}

function trashRoot(notesDir: string): string {
  return path.join(path.resolve(notesDir), SB_DIR, TRASH_DIR);
}

function trashItemPaths(notesDir: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) {
    throw new FileManagementError('Invalid trash item id', 400, 'INVALID_TRASH_ID');
  }
  const itemDir = path.join(trashRoot(notesDir), id);
  return {
    itemDir,
    manifestPath: path.join(itemDir, 'manifest.json'),
    payloadPath: path.join(itemDir, 'payload'),
  };
}

async function readTrashItem(notesDir: string, id: string): Promise<TrashItem> {
  const { manifestPath, payloadPath } = trashItemPaths(notesDir, id);
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, 'utf-8');
  } catch (error) {
    throw new FileManagementError(
      `Trash item ${id} has no readable manifest`,
      500,
      'CORRUPT_TRASH_ITEM'
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new FileManagementError(`Trash item ${id} has invalid metadata`, 500, 'CORRUPT_TRASH_ITEM');
  }
  const parsed = TrashItemSchema.safeParse(parsedJson);
  if (!parsed.success || parsed.data.id !== id || !await pathExists(payloadPath)) {
    throw new FileManagementError(`Trash item ${id} is incomplete`, 500, 'CORRUPT_TRASH_ITEM');
  }
  return parsed.data;
}

export async function createFolder(notesDir: string, dirPath: string): Promise<void> {
  const fullPath = await resolveManagedPath(notesDir, dirPath);
  if (await pathExists(fullPath)) {
    throw new FileManagementError('Destination already exists', 409, 'PATH_EXISTS');
  }
  await assertDirectory(path.dirname(fullPath));
  try {
    await fs.mkdir(fullPath);
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) {
      throw new FileManagementError('Destination already exists', 409, 'PATH_EXISTS');
    }
    throw error;
  }
}

export async function moveEntry(
  notesDir: string,
  oldPath: string,
  newPath: string
): Promise<void> {
  const normalizedOld = normalizeManagedPath(oldPath);
  const normalizedNew = normalizeManagedPath(newPath);
  if (normalizedOld === normalizedNew) {
    throw new FileManagementError('Source and destination are the same', 400, 'SAME_PATH');
  }

  const fullOldPath = await resolveManagedPath(notesDir, normalizedOld);
  const fullNewPath = await resolveManagedPath(notesDir, normalizedNew);
  const sourceStat = await fs.lstat(fullOldPath);
  if (sourceStat.isSymbolicLink()) {
    throw new FileManagementError('Symbolic links cannot be moved', 400, 'SYMLINK_NOT_ALLOWED');
  }
  if (sourceStat.isDirectory()) {
    const relative = path.relative(fullOldPath, fullNewPath);
    const isDescendant = relative !== ''
      && relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative);
    if (isDescendant) {
      throw new FileManagementError('A directory cannot be moved into itself', 400, 'SELF_MOVE');
    }
  }
  if (await pathExists(fullNewPath)) {
    throw new FileManagementError('Destination already exists', 409, 'PATH_EXISTS');
  }
  await fs.mkdir(path.dirname(fullNewPath), { recursive: true });
  await fs.rename(fullOldPath, fullNewPath);
}

export async function moveEntryToTrash(
  notesDir: string,
  relativePath: string
): Promise<TrashItem> {
  const normalizedPath = normalizeManagedPath(relativePath);
  const fullPath = await resolveManagedPath(notesDir, normalizedPath);
  const stat = await fs.lstat(fullPath);
  if (stat.isSymbolicLink()) {
    throw new FileManagementError('Symbolic links cannot be deleted', 400, 'SYMLINK_NOT_ALLOWED');
  }

  const item: TrashItem = {
    id: randomUUID(),
    originalPath: normalizedPath,
    deletedAt: new Date().toISOString(),
    entryType: stat.isDirectory() ? 'directory' : 'file',
  };
  const root = trashRoot(notesDir);
  const { itemDir, manifestPath, payloadPath } = trashItemPaths(notesDir, item.id);
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(itemDir);
  let moved = false;

  try {
    await fs.rename(fullPath, payloadPath);
    moved = true;
    await atomicWriteFile(manifestPath, `${JSON.stringify(item, null, 2)}\n`);
    return item;
  } catch (error) {
    if (moved) {
      try {
        await fs.rename(payloadPath, fullPath);
      } catch {
        throw new FileManagementError('Delete failed and rollback was not possible', 500, 'ROLLBACK_FAILED');
      }
    }
    await fs.rm(manifestPath, { force: true });
    await fs.rmdir(itemDir).catch(() => undefined);
    throw error;
  }
}

export async function listTrashItems(notesDir: string): Promise<TrashItem[]> {
  const root = trashRoot(notesDir);
  let itemIds: string[];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    itemIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return [];
    throw error;
  }

  const items = await Promise.all(itemIds.map(async (id) => {
    const { itemDir, manifestPath, payloadPath } = trashItemPaths(notesDir, id);
    if (!await pathExists(manifestPath) && !await pathExists(payloadPath)) {
      await fs.rmdir(itemDir).catch(() => undefined);
      return null;
    }
    return readTrashItem(notesDir, id);
  }));
  return items
    .filter((item): item is TrashItem => item !== null)
    .sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
}

export async function restoreTrashItem(notesDir: string, id: string): Promise<TrashItem> {
  const item = await readTrashItem(notesDir, id);
  const destination = await resolveManagedPath(notesDir, item.originalPath);
  if (await pathExists(destination)) {
    throw new FileManagementError('Restore destination already exists', 409, 'PATH_EXISTS');
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const { itemDir, manifestPath, payloadPath } = trashItemPaths(notesDir, id);
  await fs.rename(payloadPath, destination);
  try {
    await fs.unlink(manifestPath);
  } catch (error) {
    try {
      await fs.rename(destination, payloadPath);
    } catch {
      throw new FileManagementError('Restore failed and rollback was not possible', 500, 'ROLLBACK_FAILED');
    }
    throw error;
  }
  await fs.rmdir(itemDir).catch(() => undefined);
  return item;
}
