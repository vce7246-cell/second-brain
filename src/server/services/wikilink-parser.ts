import path from 'path';
import matter from 'gray-matter';

// [[title]] 或 [[title|alias]]
const WIKILINK_RE = /\[\[([^\]|#]+?)(?:[|#][^\]]+?)?\]\]/g;

export interface LinkInfo {
  /** 源文件路径（相对 notesDir） */
  source: string;
  /** 目标笔记标题 */
  target: string;
  /** 目标文件路径（相对 notesDir），若未解析则为 null */
  resolvedPath: string | null;
  /** 链接来源类型 */
  sourceType?: 'wikilink' | 'ui';
}

export interface ParsedNoteIndexData {
  title: string;
  links: LinkInfo[];
}

export function extractNoteIndexData(relPath: string, raw: string): ParsedNoteIndexData {
  const { data: frontmatter } = matter(raw);
  const title = typeof frontmatter.title === 'string'
    ? frontmatter.title
    : path.basename(relPath, '.md');

  return {
    title,
    links: extractLinks(relPath, raw),
  };
}

function extractLinks(relPath: string, raw: string): LinkInfo[] {
  const links: LinkInfo[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const re = new RegExp(WIKILINK_RE.source, 'g');
  while ((match = re.exec(raw)) !== null) {
    const target = match[1].trim();
    if (!seen.has(target)) {
      seen.add(target);
      links.push({ source: relPath, target, resolvedPath: null });
    }
  }

  return links;
}
