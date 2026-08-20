import {
  resolveWikilinkTarget as resolveSharedWikilinkTarget,
  type WikilinkResolution,
} from '../../shared/wikilink-resolution.js';

export type { WikilinkResolution } from '../../shared/wikilink-resolution.js';

/** 精确解析 wikilink；遇到重名时拒绝猜测。 */
export function resolveWikilinkTarget(
  target: string,
  titles: Record<string, string>
): WikilinkResolution {
  return resolveSharedWikilinkTarget(
    target,
    Object.entries(titles).map(([path, title]) => ({ path, title })),
  );
}
