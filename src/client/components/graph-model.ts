import type * as d3 from 'd3';
import type { FileKind } from '../../shared/file-types.js';

export const LARGE_GRAPH_NODE_LIMIT = 1000;

export interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  kind: Exclude<FileKind, 'directory'>;
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const TAG_COLORS = [
  '#9b4c34', '#af6b3f', '#9b7847', '#737b52', '#517565',
  '#587785', '#72677d', '#8a5c58', '#936177', '#756452',
];

const FILE_KIND_COLORS: Record<Exclude<FileKind, 'directory' | 'markdown'>, string> = {
  text: '#517565',
  drawio: '#3d6f8f',
  image: '#75677f',
  pdf: '#a3473e',
  document: '#9b7847',
  audio: '#936177',
  video: '#587785',
  other: '#756b60',
};

type NodeStyle = { color: string; radius: number };

function hashTag(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function folderTag(id: string): string {
  const idx = id.indexOf('/');
  return idx === -1 ? '__root__' : id.substring(0, idx);
}

export function bfsSubgraph(
  nodes: GraphNode[],
  links: GraphLink[],
  center: string,
  depth: number
): GraphData {
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const l of links) {
    const s = typeof l.source === 'string' ? l.source : l.source.id;
    const t = typeof l.target === 'string' ? l.target : l.target.id;
    adj.get(s)?.add(t);
    adj.get(t)?.add(s);
  }

  const visited = new Set<string>([center]);
  let frontier = new Set<string>([center]);
  for (let step = 0; step < depth; step++) {
    const next = new Set<string>();
    for (const nid of frontier) {
      for (const nb of adj.get(nid) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          next.add(nb);
        }
      }
    }
    frontier = next;
  }

  return {
    nodes: nodes.filter((n) => visited.has(n.id)),
    links: links.filter((l) => {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      return visited.has(s) && visited.has(t);
    }),
  };
}

export function computeNodeStyles(nodes: GraphNode[], links: GraphLink[]): Map<string, NodeStyle> {
  const participants = new Set<string>();
  const linkCount = new Map<string, number>();
  for (const l of links) {
    const s = typeof l.source === 'string' ? l.source : l.source.id;
    const t = typeof l.target === 'string' ? l.target : l.target.id;
    participants.add(s);
    participants.add(t);
    linkCount.set(s, (linkCount.get(s) ?? 0) + 1);
    linkCount.set(t, (linkCount.get(t) ?? 0) + 1);
  }

  const out = new Map<string, NodeStyle>();
  for (const n of nodes) {
    const orphan = !participants.has(n.id);
    const tag = folderTag(n.id);
    const connectedColor = n.kind === 'markdown'
      ? TAG_COLORS[hashTag(tag) % TAG_COLORS.length]
      : FILE_KIND_COLORS[n.kind];
    const color = orphan ? '#cfc2af' : connectedColor;
    const lc = linkCount.get(n.id) ?? 0;
    out.set(n.id, { color, radius: orphan ? 4 : 6 + Math.min(lc * 1.5, 10) });
  }
  return out;
}
