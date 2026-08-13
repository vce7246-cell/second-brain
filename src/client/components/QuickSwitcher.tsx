/**
 * QuickSwitcher — Ctrl+O 模糊搜索模态框
 * 输入关键词搜索笔记和附件，键盘/鼠标选择后打开
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { getFileKind } from '../../shared/file-types.js';
import type { KnowledgeSearchResult } from '../types/index.js';
import { searchKnowledge } from '../lib/api.js';
import { fileKindIcon, fileKindLabel } from '../lib/file-presentation.js';

interface QuickSwitcherProps {
  onClose: () => void;
  onSelect: (filePath: string) => void;
}

export function QuickSwitcher({ onClose, onSelect }: QuickSwitcherProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);
  const selectedRef = useRef<HTMLButtonElement>(null);

  /* 防抖搜索：100ms 延迟 */
  useEffect(() => {
    const requestId = ++requestSeq.current;
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const { results: raw } = await searchKnowledge(normalizedQuery, 20);
        if (requestId !== requestSeq.current) return;
        /* 模糊排序：标题以查询开头的优先，其余按字典序 */
        const sorted = [...raw].sort((a, b) => {
          const q = normalizedQuery.toLowerCase();
          const aStarts = a.title.toLowerCase().startsWith(q);
          const bStarts = b.title.toLowerCase().startsWith(q);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return a.title.localeCompare(b.title, 'zh');
        });
        setResults(sorted);
        setSelectedIndex(0);
      } catch (searchError) {
        if (requestId !== requestSeq.current) return;
        setResults([]);
        setError(searchError instanceof Error ? searchError.message : '搜索失败');
      } finally {
        if (requestId === requestSeq.current) setLoading(false);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [query]);

  /* 自动聚焦输入框 */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const selected = selectedRef.current;
    const container = selected?.parentElement;
    if (!selected || !container) return;
    const top = selected.offsetTop;
    const bottom = top + selected.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = bottom - container.clientHeight;
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (results.length > 0) {
          setSelectedIndex(i => (i + 1) % results.length);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (results.length > 0) {
          setSelectedIndex(i => (i - 1 + results.length) % results.length);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelect(results[selectedIndex].path);
          onClose();
        }
        break;
    }
  }, [onClose, onSelect, results, selectedIndex]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSelectedIndex(0);
  }, []);

  const handleRowClick = useCallback((path: string) => {
    onSelect(path);
    onClose();
  }, [onSelect, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex justify-center pt-[20vh]"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-switcher-title"
    >
      <div className="bg-white rounded-lg shadow-2xl w-[480px] max-h-[60vh] flex flex-col">
        <div className="flex items-start gap-3 px-4 pt-3">
          <div className="min-w-0 flex-1">
            <h2 id="quick-switcher-title" className="text-sm font-medium text-gray-700">快速打开</h2>
            <p className="text-xs text-gray-400">搜索当前知识库中的笔记与附件</p>
          </div>
          <button
            type="button"
            className="rounded px-1.5 text-lg leading-6 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={onClose}
            aria-label="关闭快速切换器"
          >
            ×
          </button>
        </div>
        {/* 搜索输入 */}
        <div className="px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            className="w-full outline-none text-base placeholder-gray-400"
            placeholder="搜索笔记或附件..."
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            aria-label="搜索知识条目"
            aria-controls="quick-switcher-results"
            aria-activedescendant={results[selectedIndex] ? `quick-result-${selectedIndex}` : undefined}
          />
        </div>

        <div className="border-t border-gray-200" />

        {/* 结果列表 */}
        <div
          id="quick-switcher-results"
          className="flex-1 overflow-y-auto min-h-0"
          role="listbox"
          aria-label="知识条目搜索结果"
        >
          {loading ? (
            <p className="px-4 py-3 text-sm text-gray-400">搜索中...</p>
          ) : error ? (
            <div className="px-4 py-3">
              <p className="text-sm text-red-500">{error}</p>
              <button
                className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                onClick={() => {
                  const current = query;
                  setQuery('');
                  window.setTimeout(() => setQuery(current), 0);
                }}
              >
                重试
              </button>
            </div>
          ) : query.trim() === '' ? (
            <p className="px-4 py-3 text-sm text-gray-400">
              输入标题、文件名或路径快速打开知识条目。
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">无匹配结果</p>
          ) : (
            results.map((r, i) => {
              const kind = getFileKind(r.path);
              return (
                <button
                  id={`quick-result-${i}`}
                  key={r.path}
                  ref={i === selectedIndex ? selectedRef : undefined}
                  className={`w-full px-4 py-2 text-left flex items-center gap-2 text-sm ${
                    i === selectedIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                  }`}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => handleRowClick(r.path)}
                  role="option"
                  aria-selected={i === selectedIndex}
                  title={`${r.path} · ${fileKindLabel(kind)}`}
                >
                  <span className="kind-chip shrink-0" aria-label={fileKindLabel(kind)}>{fileKindIcon(kind)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-gray-400">{r.path}</span>
                  </span>
                  <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                    {fileKindLabel(kind)}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* 尾部快捷键提示 */}
        <div className="border-t border-gray-200 px-4 py-1.5">
          <span className="text-xs text-gray-400">
            ↑↓ 选择 · Enter 打开 · Esc 取消
          </span>
        </div>
      </div>
    </div>
  );
}
