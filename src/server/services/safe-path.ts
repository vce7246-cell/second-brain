import fs from 'fs/promises';
import path from 'path';

export interface SafePathOptions {
  allowRoot?: boolean;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT';
}

async function findNearestExistingPath(candidate: string): Promise<string> {
  let current = candidate;

  while (true) {
    try {
      return await fs.realpath(current);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;

      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

/** Resolve a user path while keeping lexical and real paths inside notesDir. */
export async function resolveSafePath(
  notesDir: string,
  relativePath: string,
  options: SafePathOptions = {}
): Promise<string> {
  if (path.isAbsolute(relativePath)) {
    throw new Error('Absolute paths are not allowed');
  }

  if (relativePath.includes('\0')) {
    throw new Error('Invalid path');
  }

  const resolvedRoot = path.resolve(notesDir);
  const candidate = path.resolve(resolvedRoot, relativePath);

  if (!isInside(resolvedRoot, candidate)) {
    throw new Error('Path escapes notes directory');
  }

  if (!options.allowRoot && candidate === resolvedRoot) {
    throw new Error('Root path is not allowed');
  }

  const realRoot = await fs.realpath(resolvedRoot);
  const realExistingPath = await findNearestExistingPath(candidate);

  if (!isInside(realRoot, realExistingPath)) {
    throw new Error('Path escapes notes directory through a symbolic link');
  }

  return candidate;
}
