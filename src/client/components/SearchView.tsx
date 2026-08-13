import { useEffect, useRef, useState } from 'react';
import { searchContent } from '../lib/api.js';
import { fileKindIcon, fileKindLabel } from '../lib/file-presentation.js';
import type { ContentSearchResult } from '../types/index.js';
import { ViewState } from './ViewState.js';

interface SearchViewProps {
  onNavigate: (filePath: string) => void;
  refreshKey?: number;
}

type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

const MATCH_SOURCE_LABEL: Record<ContentSearchResult['matchSource'], string> = {
  title: '标题命中',
  path: '路径命中',
  content: '正文命中',
};

export function SearchView({ onNavigate, refreshKey = 0 }: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContentSearchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setResults([]);
      setStatus('idle');
      setError(null);
      return;
    }

    let cancelled = false;
    setResults([]);
    setStatus('loading');
    setError(null);
    const timer = window.setTimeout(() => {
      void searchContent(normalizedQuery).then(({ results: nextResults }) => {
        if (cancelled) return;
        setResults(nextResults);
        setStatus('ready');
      }).catch((searchError) => {
        if (cancelled) return;
        setError(searchError instanceof Error ? searchError.message : '搜索失败');
        setStatus('error');
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, refreshKey]);

  return (
    <section className="view-page flex h-full flex-col">
      <div className="view-header border-b px-6 py-6">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h1 className="view-title">全文搜索</h1>
              <p className="view-copy">
                搜索全部文件名与路径；正文覆盖不超过 1 MB 的 Markdown、文本和代码文件
              </p>
            </div>
            <span className="shrink-0 text-xs text-gray-400">Ctrl + Shift + F</span>
          </div>
          <div className="relative mt-4">
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入关键词搜索标题、路径或正文…"
              className="search-input w-full py-2.5 pl-3 pr-20 text-sm outline-none transition"
              aria-label="全文搜索"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700"
              >
                清空
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-4xl">
          {status === 'idle' && (
            <ViewState title="开始检索你的知识库" detail="结果只在本机计算，不会上传笔记内容。" />
          )}
          {status === 'loading' && <ViewState title="正在搜索" busy />}
          {status === 'error' && (
            <ViewState title="搜索失败" detail={error ?? undefined} tone="danger" />
          )}
          {status === 'ready' && results.length === 0 && (
            <ViewState title="没有找到匹配内容" detail="可以尝试更短的关键词，或检查文件是否超过正文索引大小限制。" />
          )}
          {status === 'ready' && results.length > 0 && (
            <>
              <p className="mb-3 text-xs text-gray-500">找到 {results.length} 个结果</p>
              <div>
                {results.map((result) => (
                  <button
                    key={result.path}
                    onClick={() => onNavigate(result.path)}
                    className="search-result"
                  >
                    <div className="flex items-center gap-2">
                      <span className="kind-chip" aria-label={fileKindLabel(result.kind)}>{fileKindIcon(result.kind)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                        <HighlightedText text={result.title} query={query.trim()} />
                      </span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                        {fileKindLabel(result.kind)} · {MATCH_SOURCE_LABEL[result.matchSource]}
                      </span>
                    </div>
                    <p className="mt-1 truncate pl-7 text-xs text-gray-400">
                      <HighlightedText text={result.path} query={query.trim()} />
                    </p>
                    {result.snippet ? (
                      <p className="mt-2 line-clamp-2 pl-7 text-xs leading-5 text-gray-600">
                        <HighlightedText text={result.snippet} query={query.trim()} />
                      </p>
                    ) : (
                      <p className="mt-2 pl-7 text-xs text-gray-400">此文件仅支持按名称和路径检索</p>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (!query || index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-yellow-100 px-0.5 text-inherit">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}
