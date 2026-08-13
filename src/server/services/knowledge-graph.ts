import type { FileKind } from '../../shared/file-types.js';
import type { LinkInfo } from './wikilink-parser.js';

type KnowledgeKind = Exclude<FileKind, 'directory'>;

interface KnowledgeGraphOptions {
  paths: string[];
  labelFor: (filePath: string) => string;
  kindFor: (filePath: string) => KnowledgeKind;
  wikiLinksFor: (filePath: string) => LinkInfo[];
  uiLinks: Array<{ from: string; to: string }>;
}

export interface KnowledgeGraphData {
  nodes: Array<{ id: string; label: string; kind: KnowledgeKind }>;
  links: Array<{ source: string; target: string }>;
}

export function buildKnowledgeGraph(options: KnowledgeGraphOptions): KnowledgeGraphData {
  const { paths, labelFor, kindFor, wikiLinksFor, uiLinks } = options;
  const nodes = paths.map((filePath) => ({
    id: filePath,
    label: labelFor(filePath),
    kind: kindFor(filePath),
  }));
  const activePaths = new Set(paths);
  const linkSet = new Set<string>();
  const links: KnowledgeGraphData['links'] = [];

  function addEdge(source: string, target: string): void {
    if (!activePaths.has(source) || !activePaths.has(target)) return;
    const key = [source, target].sort().join('|||');
    if (linkSet.has(key)) return;
    linkSet.add(key);
    links.push({ source, target });
  }

  for (const sourcePath of paths) {
    for (const link of wikiLinksFor(sourcePath)) {
      if (link.resolvedPath) addEdge(sourcePath, link.resolvedPath);
    }
  }
  for (const link of uiLinks) addEdge(link.from, link.to);

  return { nodes, links };
}
