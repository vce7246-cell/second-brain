import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MAX_FILE_IMPORT_BYTES } from '../../shared/constants.js';
import { FileManagementError, resolveManagedPath } from './file-management.js';

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as { code?: unknown }).code === code;
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

async function assertExistingParent(parentPath: string): Promise<void> {
  try {
    const stat = await fs.stat(parentPath);
    if (stat.isDirectory()) return;
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw error;
  }
  throw new FileManagementError(
    'Import destination parent must be an existing directory',
    400,
    'INVALID_PARENT'
  );
}

/** Prepare one directory for a recursive import without following or replacing an existing entry. */
export async function ensureImportDirectory(
  notesDir: string,
  relativePath: string
): Promise<boolean> {
  const destination = await resolveManagedPath(notesDir, relativePath);
  await assertExistingParent(path.dirname(destination));
  try {
    await fs.mkdir(destination);
    return true;
  } catch (error) {
    if (!hasErrorCode(error, 'EEXIST')) throw error;
    const stat = await fs.lstat(destination);
    if (stat.isDirectory() && !stat.isSymbolicLink()) return false;
    throw new FileManagementError('Destination already exists', 409, 'PATH_EXISTS');
  }
}

function byteLimit(maxBytes: number, onBytes: (size: number) => void): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(new FileManagementError(
          `File exceeds the ${maxBytes} byte import limit`,
          413,
          'FILE_TOO_LARGE'
        ));
        return;
      }
      onBytes(total);
      callback(null, chunk);
    },
  });
}

/** Stream one file into the vault, publishing it only after the full body succeeds. */
export async function importFileStream(
  notesDir: string,
  relativePath: string,
  source: Readable,
  options: { maxBytes?: number; declaredBytes?: number } = {}
): Promise<number> {
  const maxBytes = options.maxBytes ?? MAX_FILE_IMPORT_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error('Invalid file import byte limit');
  }
  if (options.declaredBytes !== undefined && options.declaredBytes > maxBytes) {
    throw new FileManagementError(
      `File exceeds the ${maxBytes} byte import limit`,
      413,
      'FILE_TOO_LARGE'
    );
  }

  const destination = await resolveManagedPath(notesDir, relativePath);
  const parent = path.dirname(destination);
  await assertExistingParent(parent);
  if (await pathExists(destination)) {
    throw new FileManagementError('Destination already exists', 409, 'PATH_EXISTS');
  }

  const temporaryPath = path.join(parent, `.sb-import-${randomUUID()}.tmp`);
  let writtenBytes = 0;
  try {
    await pipeline(
      source,
      byteLimit(maxBytes, (size) => { writtenBytes = size; }),
      createWriteStream(temporaryPath, { flags: 'wx' })
    );
    try {
      await fs.link(temporaryPath, destination);
    } catch (error) {
      if (hasErrorCode(error, 'EEXIST')) {
        throw new FileManagementError('Destination already exists', 409, 'PATH_EXISTS');
      }
      throw error;
    }
    return writtenBytes;
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}
