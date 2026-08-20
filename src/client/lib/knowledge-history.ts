const RECENT_KEY = 'secondbrain.recent-paths';
const FAVORITES_KEY = 'secondbrain.favorite-paths';
const MAX_RECENT = 12;

function readPaths(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function writePaths(key: string, paths: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(paths));
  } catch {
    // 浏览器禁用本地存储时，历史功能静默降级，不影响文件操作。
  }
}

export function getRecentPaths(): string[] {
  return readPaths(RECENT_KEY);
}

export function recordRecentPath(filePath: string): void {
  const next = [filePath, ...getRecentPaths().filter((path) => path !== filePath)].slice(0, MAX_RECENT);
  writePaths(RECENT_KEY, next);
}

export function getFavoritePaths(): string[] {
  return readPaths(FAVORITES_KEY);
}

export function isFavoritePath(filePath: string): boolean {
  return getFavoritePaths().includes(filePath);
}

export function toggleFavoritePath(filePath: string): boolean {
  const current = getFavoritePaths();
  const next = current.includes(filePath)
    ? current.filter((path) => path !== filePath)
    : [filePath, ...current];
  writePaths(FAVORITES_KEY, next);
  return next.includes(filePath);
}

function remapPath(path: string, oldPath: string, newPath: string): string {
  return path === oldPath || path.startsWith(`${oldPath}/`)
    ? `${newPath}${path.slice(oldPath.length)}`
    : path;
}

export function migrateKnowledgePath(oldPath: string, newPath: string): void {
  writePaths(RECENT_KEY, getRecentPaths().map((path) => remapPath(path, oldPath, newPath)));
  writePaths(FAVORITES_KEY, getFavoritePaths().map((path) => remapPath(path, oldPath, newPath)));
}

export function removeKnowledgePath(filePath: string): void {
  const keep = (path: string) => path !== filePath && !path.startsWith(`${filePath}/`);
  writePaths(RECENT_KEY, getRecentPaths().filter(keep));
  writePaths(FAVORITES_KEY, getFavoritePaths().filter(keep));
}

export function pruneKnowledgePaths(validPaths: Set<string>): void {
  writePaths(RECENT_KEY, getRecentPaths().filter((path) => validPaths.has(path)));
  writePaths(FAVORITES_KEY, getFavoritePaths().filter((path) => validPaths.has(path)));
}
