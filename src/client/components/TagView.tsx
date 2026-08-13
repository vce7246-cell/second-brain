import { useState, useEffect, useCallback } from 'react';
import { fetchTags, filterByTags } from '../lib/api.js';
import type { TagEntry } from '../types/index.js';
import { ViewState } from './ViewState.js';
import { InlineNotice } from './InlineNotice.js';

interface TagViewProps {
  onNavigate?: (filePath: string) => void;
  refreshKey?: number;
}

export function TagView({ onNavigate, refreshKey = 0 }: TagViewProps) {
  const [tags, setTags] = useState<TagEntry[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [filteredItems, setFilteredItems] = useState<Array<{ path: string; title: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);

  const loadTags = useCallback(async () => {
    setLoading(true);
    setTagError(null);
    try {
      const data = await fetchTags();
      setTags(data.tags);
    } catch (error) {
      setTagError(error instanceof Error ? error.message : '标签加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags, refreshKey]);

  /** 按选中标签过滤笔记和附件 */
  const loadFiltered = useCallback(async (tagSet: Set<string>) => {
    setFilterError(null);
    if (tagSet.size === 0) {
      setFilteredItems([]);
      return;
    }
    setFiltering(true);
    try {
      const data = await filterByTags(Array.from(tagSet));
      setFilteredItems(data.items);
    } catch (error) {
      setFilteredItems([]);
      setFilterError(error instanceof Error ? error.message : '标签筛选失败');
    } finally {
      setFiltering(false);
    }
  }, []);

  useEffect(() => {
    loadFiltered(selectedTags);
  }, [selectedTags, loadFiltered]);

  function toggleTag(tagName: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagName)) {
        next.delete(tagName);
      } else {
        next.add(tagName);
      }
      return next;
    });
  }

  const folderTags = tags.filter((t) => t.type === 'folder');
  const manualTags = tags.filter((t) => t.type === 'manual');

  if (loading && tags.length === 0) {
    return (
      <ViewState title="正在加载标签" detail="正在读取文件夹标签和手动标签。" busy />
    );
  }

  if (tagError && tags.length === 0) {
    return (
      <ViewState
        title="标签加载失败"
        detail={tagError}
        actionLabel="重试"
        onAction={() => void loadTags()}
        tone="danger"
      />
    );
  }

  if (tags.length === 0) {
    return (
      <ViewState title="暂无标签" detail="文件夹会自动形成标签，也可以在链接面板中为笔记或附件添加手动标签。" />
    );
  }

  return (
    <div className="flex h-full">
      {/* 左侧标签列表 */}
      <aside className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto">
        <div className="view-header border-b px-3 py-4">
          <h1 className="text-base font-semibold text-gray-800">标签</h1>
          <p className="mt-1 text-[11px] leading-5 text-gray-500">文件夹标签与手动标签分开管理</p>
        </div>
        {tagError && (
          <InlineNotice tone="danger" actionLabel="重试" onAction={() => void loadTags()} className="rounded-none border-x-0 border-t-0 px-3 py-2">
            标签刷新失败：{tagError}
          </InlineNotice>
        )}
        {loading && (
          <div className="border-b border-gray-200 px-3 py-1.5 text-xs text-gray-400">
            正在刷新标签...
          </div>
        )}
        {/* 文件夹标签 */}
        {folderTags.length > 0 && (
          <div className="px-3 py-2">
            <p className="mb-1 text-xs font-medium text-gray-500">文件夹标签</p>
            <div className="flex flex-col gap-0.5">
              {folderTags.map((tag) => (
                <button
                  key={tag.name}
                  className={`flex items-center gap-1.5 w-full text-xs px-2 py-1 rounded text-left transition-colors ${
                    selectedTags.has(tag.name)
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => toggleTag(tag.name)}
                >
                  <span className="kind-chip" aria-hidden="true">DIR</span>
                  <span className="truncate flex-1">{tag.name}</span>
                  <span className="text-gray-400 shrink-0">({tag.count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 手动标签 */}
        {manualTags.length > 0 && (
          <div className="px-3 py-2 border-t border-gray-200">
            <p className="mb-1 text-xs font-medium text-gray-500">手动标签</p>
            <div className="flex flex-col gap-0.5">
              {manualTags.map((tag) => (
                <button
                  key={tag.name}
                  className={`flex items-center gap-1.5 w-full text-xs px-2 py-1 rounded text-left transition-colors ${
                    selectedTags.has(tag.name)
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => toggleTag(tag.name)}
                >
                  <span className="kind-chip" aria-hidden="true">TAG</span>
                  <span className="truncate flex-1">{tag.name}</span>
                  <span className="text-gray-400 shrink-0">({tag.count})</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* 右侧过滤结果 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 已选标签 header */}
        <div className="px-4 py-3 border-b border-gray-200">
          {selectedTags.size > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500">已选:</span>
              {Array.from(selectedTags).map((tagName) => (
                <span
                  key={tagName}
                  className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs"
                >
                  {tagName}
                  <button
                    className="hover:text-red-500 ml-0.5"
                    onClick={() => toggleTag(tagName)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">点击左侧标签进行过滤</p>
          )}
        </div>

        {/* 过滤结果列表 */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtering && (
            <ViewState title="正在筛选知识条目" busy compact />
          )}
          {!filtering && filterError && (
            <ViewState
              title="筛选失败"
              detail={filterError}
              actionLabel="重试"
              onAction={() => void loadFiltered(selectedTags)}
              tone="danger"
              compact
            />
          )}
          {!filtering && !filterError && selectedTags.size > 0 && filteredItems.length === 0 && (
            <ViewState title="无匹配知识条目" detail="可以减少选中的标签，或为相关笔记、附件补充手动标签。" compact />
          )}
          {!filtering && !filterError && filteredItems.length > 0 && (
            <ul className="space-y-1">
              {filteredItems.map((item) => (
                <li key={item.path}>
                  <button
                    className="w-full text-left text-sm text-blue-600 hover:bg-blue-50 rounded px-2 py-1.5 transition-colors"
                    onClick={() => onNavigate?.(item.path)}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
