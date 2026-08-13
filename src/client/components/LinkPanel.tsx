import { useState, useEffect, useCallback } from 'react';
import { fetchMergedLinks, addLink, removeLink, searchKnowledge, addTags, removeTag } from '../lib/api.js';
import type { LinkInfo } from '../types/index.js';
import { ViewState } from './ViewState.js';
import { InlineNotice } from './InlineNotice.js';

interface LinkPanelProps {
  filePath: string | null;
  /** 外部链接版本号（links-changed WS 消息触发 +1） */
  linkStoreVersion?: number;
  onNavigate?: (filePath: string) => void;
}

export function LinkPanel({ filePath, linkStoreVersion = 0, onNavigate }: LinkPanelProps) {
  const [links, setLinks] = useState<LinkInfo[]>([]);
  const [backlinks, setBacklinks] = useState<LinkInfo[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ path: string; title: string }>>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!filePath) {
      setLinks([]);
      setBacklinks([]);
      setTags([]);
      setLoadError(null);
      setActionError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchMergedLinks(filePath);
      setLinks(data.links);
      setBacklinks(data.backlinks);
      setTags(data.tags);
    } catch (error) {
      setLinks([]);
      setBacklinks([]);
      setTags([]);
      setLoadError(error instanceof Error ? error.message : '链接和标签加载失败');
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => { load(); }, [load, linkStoreVersion]);

  // 搜索笔记和附件
  useEffect(() => {
    setSearchError(null);
    if (searchQuery.length < 1) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchKnowledge(searchQuery, 10);
        setSearchResults(res.results.filter((r) => r.path !== filePath));
      } catch {
        setSearchResults([]);
        setSearchError('搜索失败');
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, filePath]);

  async function runAction(actionKey: string, operation: () => Promise<void>) {
    setBusyAction(actionKey);
    setActionError(null);
    try {
      await operation();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAddLink(targetPath: string) {
    if (!filePath) return;
    await runAction(`add-link:${targetPath}`, async () => {
      await addLink(filePath, targetPath);
      setShowSearch(false);
      setSearchQuery('');
      await load();
    });
  }

  async function handleRemoveLink(targetPath: string) {
    if (!filePath) return;
    await runAction(`remove-link:${targetPath}`, async () => {
      await removeLink(filePath, targetPath);
      await load();
    });
  }

  async function handleAddTag() {
    if (!filePath || !tagInput.trim()) return;
    const newTags = tagInput.split(',').map((t) => t.trim()).filter(Boolean);
    if (newTags.length === 0) return;
    await runAction('add-tags', async () => {
      const res = await addTags(filePath, newTags);
      setTags(res.tags);
      setTagInput('');
    });
  }

  async function handleRemoveTag(tag: string) {
    if (!filePath) return;
    await runAction(`remove-tag:${tag}`, async () => {
      const res = await removeTag(filePath, tag);
      setTags(res.tags);
    });
  }

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 p-3">
        打开知识条目管理链接
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-200">
        <h3 className="text-xs font-medium text-gray-500">链接</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loadError && (
          <ViewState
            title="链接面板加载失败"
            detail={loadError}
            actionLabel="重试"
            onAction={() => void load()}
            tone="danger"
            compact
          />
        )}
        {actionError && (
          <InlineNotice tone="danger" className="rounded">
            {actionError}
          </InlineNotice>
        )}

        {/* 添加链接 */}
        <div>
          <button
            className="w-full text-xs px-2 py-1 border border-dashed border-gray-300 rounded hover:border-blue-400 hover:text-blue-600 text-gray-500 disabled:opacity-50"
            onClick={() => setShowSearch(!showSearch)}
            disabled={Boolean(busyAction)}
          >
            + 添加链接
          </button>
          {showSearch && (
            <div className="mt-1">
              <input
                className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                placeholder="搜索笔记或附件..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searching && <p className="mt-1 text-xs text-gray-400">搜索中...</p>}
              {!searching && searchError && (
                <p className="mt-1 text-xs text-red-500">{searchError}</p>
              )}
              {!searching && !searchError && searchQuery && searchResults.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">没有匹配的知识条目</p>
              )}
              {searchResults.length > 0 && (
                <ul className="mt-1 border border-gray-200 rounded max-h-32 overflow-y-auto">
                  {searchResults.map((r) => (
                    <li key={r.path}>
                      <button
                        className="block w-full px-2 py-1 text-left text-xs hover:bg-blue-50 cursor-pointer text-gray-700 disabled:opacity-50"
                        onClick={() => handleAddLink(r.path)}
                        disabled={Boolean(busyAction)}
                      >
                        {busyAction === `add-link:${r.path}` ? '添加中...' : r.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 已链接列表 */}
        {loading ? (
          <p className="text-xs text-gray-400">加载中...</p>
        ) : !loadError && links.length > 0 ? (
          <div>
            <p className="text-xs text-gray-400 mb-1">已链接 ({links.length})</p>
            <ul className="space-y-0.5">
              {links.map((link, i) => (
                <li key={`${link.resolvedPath || link.target}-${i}`} className="flex items-center gap-1 text-xs">
                  <button
                    className="flex-1 text-left text-blue-600 hover:underline truncate"
                    onClick={() => {
                      const target = link.resolvedPath || link.target;
                      if (onNavigate && target) onNavigate(target);
                    }}
                  >
                    {link.resolvedPath || link.target}
                  </button>
                  {link.sourceType === 'ui' && (
                    <button
                      className="text-gray-400 hover:text-red-500 shrink-0 disabled:opacity-50"
                      onClick={() => handleRemoveLink(link.resolvedPath || link.target)}
                      disabled={Boolean(busyAction)}
                    >
                      {busyAction === `remove-link:${link.resolvedPath || link.target}` ? '...' : '✕'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : !loadError && (
          <p className="text-xs text-gray-400">暂无链接</p>
        )}

        {/* 标签管理 */}
        <div className="border-t border-gray-100 pt-2">
          <p className="mb-1 text-xs text-gray-400">标签</p>
          <div className="flex flex-wrap gap-1 mb-1">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                {tag}
                <button
                  className="hover:text-red-500 disabled:opacity-50"
                  onClick={() => handleRemoveTag(tag)}
                  disabled={Boolean(busyAction)}
                >
                  {busyAction === `remove-tag:${tag}` ? '...' : '×'}
                </button>
              </span>
            ))}
          </div>
          {tags.length === 0 && !loading && !loadError && (
            <p className="mb-1 text-xs text-gray-400">暂无手动标签</p>
          )}
          <div className="flex gap-1">
            <input
              className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
              placeholder="添加标签（逗号分隔）"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); }}
              disabled={Boolean(busyAction)}
            />
            <button
              className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              onClick={handleAddTag}
              disabled={Boolean(busyAction) || !tagInput.trim()}
            >
              {busyAction === 'add-tags' ? '添加中' : '添加'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
