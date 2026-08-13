/**
 * 前端 API 客户端 — fetch 封装
 */
import type {
  TreeNode,
  FileContent,
  FileMetadata,
  NoteSearchResult,
  KnowledgeSearchResult,
  ContentSearchResult,
  LinkInfo,
} from '../types/index.js';
import type { FileKind } from '../../shared/file-types.js';
import type { TrashItem } from '../../shared/file-types.js';
import { resolveWikilinkTarget, type WikilinkResolution } from './wikilink.js';

const BASE = '';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly currentVersion?: string | null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function throwResponseError(res: Response): Promise<never> {
  const payload: unknown = await res.json().catch(() => null);
  const details = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const message = typeof details.error === 'string'
    ? details.error
    : res.statusText || `HTTP ${res.status}`;
  const code = typeof details.code === 'string' ? details.code : undefined;
  const currentVersion = typeof details.currentVersion === 'string' || details.currentVersion === null
    ? details.currentVersion
    : undefined;

  throw new ApiError(message, res.status, code, currentVersion);
}

async function request<T>(url: string, body?: object): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    return throwResponseError(res);
  }
  return res.json();
}

async function getRequest<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) {
    return throwResponseError(res);
  }
  return res.json();
}

/** 获取目录树 */
export function fetchTree(dirPath = ''): Promise<TreeNode> {
  return request<TreeNode>('/api/files/list', { dirPath });
}

/** 生成受保护的附件只读预览地址 */
export function filePreviewUrl(filePath: string, revision = 0): string {
  const query = new URLSearchParams({ filePath, v: String(revision) });
  return `${BASE}/api/files/preview?${query.toString()}`;
}

/** 获取受大小限制的纯文本附件预览 */
export async function fetchTextPreview(
  filePath: string,
  revision = 0,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(filePreviewUrl(filePath, revision), { signal });
  if (!res.ok) return throwResponseError(res);
  return res.text();
}

/** 读取文件内容 */
export function fetchFile(filePath: string): Promise<FileContent> {
  return request<FileContent>('/api/files/read', { filePath });
}

/** 获取文件元数据 */
export function fetchFileMetadata(filePath: string): Promise<FileMetadata> {
  return request<FileMetadata>('/api/files/meta', { filePath });
}

/** 以原始字节流导入一个文件；服务端拒绝覆盖同名目标。 */
export async function importVaultFile(
  filePath: string,
  file: Blob
): Promise<{ filePath: string; imported: boolean; size: number }> {
  const query = new URLSearchParams({ filePath });
  const res = await fetch(`${BASE}/api/files/import?${query.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) return throwResponseError(res);
  return res.json();
}

/** 为递归导入准备目录；已存在的真实目录会被安全复用。 */
export async function ensureVaultImportFolder(
  dirPath: string
): Promise<{ dirPath: string; created: boolean }> {
  const query = new URLSearchParams({ dirPath });
  const res = await fetch(`${BASE}/api/files/import-folder?${query.toString()}`, { method: 'POST' });
  if (!res.ok) return throwResponseError(res);
  return res.json();
}

/** 创建文件 */
export function createFile(filePath: string, content = ''): Promise<{ filePath: string; created: boolean }> {
  return request('/api/files/create', { filePath, content });
}

/** 创建文件夹 */
export function createFolder(dirPath: string): Promise<{ dirPath: string; created: boolean }> {
  return request('/api/files/create-folder', { dirPath });
}

/** 保存文件；expectedVersion 缺省时表示用户明确要求覆盖 */
export function saveFile(
  filePath: string,
  content: string,
  expectedVersion?: string
): Promise<{ filePath: string; saved: boolean; version: string }> {
  return request('/api/files/save', { filePath, content, expectedVersion });
}

/** 删除文件 */
export function deleteFile(filePath: string): Promise<{
  filePath: string;
  deleted: boolean;
  item: TrashItem;
}> {
  return request('/api/files/delete', { filePath });
}

/** 重命名文件 */
export function renameFile(oldPath: string, newPath: string): Promise<{ oldPath: string; newPath: string; renamed: boolean }> {
  return request('/api/files/rename', { oldPath, newPath });
}

/** 获取回收站内容 */
export function fetchTrash(): Promise<{ items: TrashItem[] }> {
  return getRequest('/api/files/trash');
}

/** 恢复回收站项目 */
export function restoreTrashItem(trashId: string): Promise<{ restored: boolean; item: TrashItem }> {
  return request('/api/files/restore', { trashId });
}

/** 搜索笔记（自动补全） */
export function searchNotes(query: string, limit = 20): Promise<{ results: NoteSearchResult[] }> {
  return request('/api/notes/search', { query, limit });
}

/** 搜索所有可见知识条目，包括 Markdown 笔记和附件 */
export function searchKnowledge(
  query: string,
  limit = 20
): Promise<{ results: KnowledgeSearchResult[] }> {
  return request('/api/knowledge/search', { query, limit });
}

/** 搜索所有知识条目的标题、路径，以及受限大小的 Markdown/文本正文。 */
export function searchContent(
  query: string,
  limit = 30
): Promise<{ results: ContentSearchResult[] }> {
  return request('/api/search/content', { query, limit });
}

/** 使用当前标题索引精确解析 wikilink，重名时不猜测。 */
export async function resolveWikilink(target: string): Promise<WikilinkResolution> {
  const response = await getRequest<{ titles: Record<string, string> }>('/api/notes/titles');
  return resolveWikilinkTarget(target, response.titles);
}

/** 获取前向链接 */
export function fetchLinks(filePath: string): Promise<{ filePath: string; links: LinkInfo[] }> {
  return request('/api/notes/links', { filePath });
}

/** 获取反向链接 */
export function fetchBacklinks(filePath: string): Promise<{ filePath: string; backlinks: LinkInfo[] }> {
  return request('/api/notes/backlinks', { filePath });
}

/** 添加界面链接 */
export function addLink(from: string, to: string): Promise<{ success: boolean }> {
  return request('/api/links/add', { from, to });
}

/** 删除界面链接 */
export function removeLink(from: string, to: string): Promise<{ success: boolean }> {
  return request('/api/links/remove', { from, to });
}

/** 获取合并后的链接和反向链接 */
export function fetchMergedLinks(filePath: string): Promise<{
  filePath: string;
  links: import('../types/index.js').LinkInfo[];
  backlinks: import('../types/index.js').LinkInfo[];
  tags: string[];
}> {
  return request('/api/links/list', { filePath });
}

/** 添加标签 */
export function addTags(filePath: string, tags: string[]): Promise<{ success: boolean; tags: string[] }> {
  return request('/api/tags/add', { filePath, tags });
}

/** 删除标签 */
export function removeTag(filePath: string, tag: string): Promise<{ success: boolean; tags: string[] }> {
  return request('/api/tags/remove', { filePath, tag });
}

/** 获取所有标签 */
export function fetchTags(): Promise<{ tags: import('../types/index.js').TagEntry[] }> {
  return getRequest('/api/tags/list');
}

/** 按标签过滤笔记 */
export function filterByTags(tags: string[]): Promise<{ items: Array<{ path: string; title: string }> }> {
  return request('/api/tags/filter', { tags });
}

/** 获取仪表盘数据 */
export function fetchDashboard(): Promise<import('../types/index.js').DashboardData> {
  return getRequest('/api/dashboard');
}

/** 获取未链接提及 */
export function fetchUnlinkedMentions(filePath: string): Promise<{
  mentions: import('../types/index.js').UnlinkedMention[];
}> {
  return request('/api/notes/unlinked-mentions', { filePath });
}

/** 获取图谱数据（合并 wikilink + UI 链接） */
export function fetchGraph(): Promise<{
  nodes: Array<{ id: string; label: string; kind: Exclude<FileKind, 'directory'> }>;
  links: Array<{ source: string; target: string }>;
}> {
  return getRequest('/api/notes/graph');
}

/** 创建每日笔记 */
export function createDailyNote(dailyDir: string): Promise<{ filePath: string; created: boolean; existed: boolean }> {
  return request('/api/files/daily-note', { dailyDir });
}
