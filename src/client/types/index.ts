import type { FileKind } from '../../shared/file-types.js';

/** 目录树节点 */
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  kind: FileKind;
  extension?: string;
  size?: number;
  mtimeMs?: number;
  children?: TreeNode[];
}

/** 文件读取响应 */
export interface FileContent {
  filePath: string;
  content: string;
  version: string;
}

/** 文件元数据响应 */
export interface FileMetadata {
  filePath: string;
  kind: FileKind;
  extension?: string;
  size: number;
  mtimeMs: number;
}

/** 笔记搜索结果项 */
export interface NoteSearchResult {
  path: string;
  title: string;
}

/** 笔记或附件搜索结果 */
export interface KnowledgeSearchResult {
  path: string;
  title: string;
}

/** 本地标题、路径或受限文本正文搜索结果 */
export interface ContentSearchResult {
  path: string;
  title: string;
  kind: Exclude<FileKind, 'directory'>;
  matchSource: 'title' | 'path' | 'content';
  snippet: string;
}

/** 链接信息（来自 [[wikilink]] 解析或界面链接） */
export interface LinkInfo {
  source: string;
  target: string;
  resolvedPath: string | null;
  /** 链接来源类型 */
  sourceType?: 'wikilink' | 'ui';
}

/** 界面链接（存储在 links.json 中） */
export interface UILink {
  from: string;
  to: string;
}

/** links.json 的数据结构 */
export interface LinkStoreData {
  version: number;
  links: UILink[];
  tags: Record<string, string[]>;
}

/** 图谱节点（增强版，含标签信息） */
export interface GraphNodeEnriched {
  id: string;
  label: string;
  kind: Exclude<FileKind, 'directory'>;
  tags: string[];
  folderTags: string[];
  isOrphan: boolean;
  backlinkCount: number;
}

/** 图谱数据（增强版） */
export interface GraphDataEnriched {
  nodes: GraphNodeEnriched[];
  links: Array<{ source: string; target: string }>;
}

/** 仪表盘数据 */
export interface DashboardItem {
  path: string;
  title: string;
  kind: Exclude<FileKind, 'directory'>;
}

export interface DashboardData {
  totalItems: number;
  totalNotes: number;
  totalAttachments: number;
  totalLinks: number;
  totalTags: number;
  coreNodes: Array<DashboardItem & { relationCount: number }>;
  orphanItems: DashboardItem[];
  folderGroups: Array<{ name: string; count: number; linkCount: number }>;
  recentItems: Array<DashboardItem & { mtime: number }>;
  health: {
    brokenLinks: number;
    brokenLinkItems: Array<{ source: string; target: string }>;
    orphanCount: number;
    untaggedAttachments: number;
    untaggedAttachmentItems: DashboardItem[];
    duplicateTitleCount: number;
    duplicateTitleItems: Array<{ title: string; paths: string[] }>;
  };
}

/** 未链接提及 */
export interface UnlinkedMention {
  sourcePath: string;
  targetPath: string;
  matchedText: string;
}

/** 标签视图条目 */
export interface TagEntry {
  name: string;
  type: 'folder' | 'manual';
  count: number;
}
