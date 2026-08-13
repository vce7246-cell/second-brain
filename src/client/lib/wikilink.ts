export type WikilinkResolution =
  | { status: 'found'; path: string }
  | { status: 'ambiguous' }
  | { status: 'missing' };

function normalize(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function withoutMarkdownExtension(value: string): string {
  return value.replace(/\.(?:md|markdown)$/i, '');
}

function resolveMatches(paths: string[]): WikilinkResolution {
  if (paths.length === 1) return { status: 'found', path: paths[0] };
  return paths.length > 1 ? { status: 'ambiguous' } : { status: 'missing' };
}

/** 精确解析 wikilink；遇到重名时拒绝猜测。 */
export function resolveWikilinkTarget(
  target: string,
  titles: Record<string, string>
): WikilinkResolution {
  const normalizedTarget = normalize(target);
  if (!normalizedTarget) return { status: 'missing' };
  const targetWithoutExtension = withoutMarkdownExtension(normalizedTarget);
  const entries = Object.entries(titles);

  const pathMatches = entries
    .map(([filePath]) => filePath)
    .filter((filePath) => withoutMarkdownExtension(normalize(filePath)) === targetWithoutExtension);
  if (pathMatches.length > 0) return resolveMatches(pathMatches);

  const titleMatches = entries
    .filter(([, title]) => normalize(title) === normalizedTarget)
    .map(([filePath]) => filePath);
  if (titleMatches.length > 0) return resolveMatches(titleMatches);

  const filenameMatches = entries
    .map(([filePath]) => filePath)
    .filter((filePath) => {
      const filename = normalize(filePath).split('/').at(-1) ?? '';
      return withoutMarkdownExtension(filename) === targetWithoutExtension;
    });
  return resolveMatches(filenameMatches);
}
