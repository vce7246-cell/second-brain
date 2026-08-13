import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface VersionedFile {
  content: string;
  version: string;
}

export class FileVersionConflictError extends Error {
  readonly code = 'FILE_VERSION_CONFLICT';

  constructor(readonly currentVersion: string | null) {
    super('File changed since it was loaded');
    this.name = 'FileVersionConflictError';
  }
}

const saveQueues = new Map<string, Promise<void>>();

function contentVersion(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as { code?: unknown }).code === code;
}

async function withFileLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
  const previous = saveQueues.get(filePath) ?? Promise.resolve();
  let release = (): void => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queueTail = previous.then(() => current);
  saveQueues.set(filePath, queueTail);

  await previous;
  try {
    return await action();
  } finally {
    release();
    if (saveQueues.get(filePath) === queueTail) {
      saveQueues.delete(filePath);
    }
  }
}

export async function readVersionedFile(filePath: string): Promise<VersionedFile> {
  const content = await fs.readFile(filePath, 'utf-8');
  return { content, version: contentVersion(content) };
}

async function readCurrentVersion(filePath: string): Promise<string | null> {
  try {
    return (await readVersionedFile(filePath)).version;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return null;
    throw error;
  }
}

/** Write beside the target, flush, then atomically replace the target. */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`
  );
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;

  try {
    handle = await fs.open(tempPath, 'wx');
    await handle.writeFile(content, 'utf-8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, filePath);
  } finally {
    try {
      if (handle) await handle.close();
    } finally {
      await fs.rm(tempPath, { force: true });
    }
  }
}

export async function saveVersionedFile(
  filePath: string,
  content: string,
  expectedVersion?: string
): Promise<string> {
  return withFileLock(filePath, async () => {
    if (expectedVersion !== undefined) {
      const currentVersion = await readCurrentVersion(filePath);
      if (currentVersion !== expectedVersion) {
        throw new FileVersionConflictError(currentVersion);
      }
    }

    await atomicWriteFile(filePath, content);
    return contentVersion(content);
  });
}
