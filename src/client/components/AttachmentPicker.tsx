import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchTree } from '../lib/api.js';
import {
  collectAttachments,
  markdownAttachmentReference,
  type AttachmentEntry,
} from '../lib/attachments.js';

interface AttachmentPickerProps {
  currentNotePath: string;
  onClose: () => void;
  onSelect: (reference: string) => void;
}

const RESULT_LIMIT = 100;

function kindLabel(kind: AttachmentEntry['kind']): string {
  switch (kind) {
    case 'image': return '图片';
    case 'pdf': return 'PDF';
    case 'text': return '文本';
    case 'document': return '文档';
    case 'audio': return '音频';
    case 'video': return '视频';
    case 'other': return '附件';
  }
}

export function AttachmentPicker({ currentNotePath, onClose, onSelect }: AttachmentPickerProps) {
  const [query, setQuery] = useState('');
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAttachments(collectAttachments(await fetchTree()));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '附件列表加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    inputRef.current?.focus();
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    if (!normalized) return attachments;
    return attachments.filter((entry) => (
      entry.name.toLocaleLowerCase('zh-CN').includes(normalized)
      || entry.path.toLocaleLowerCase('zh-CN').includes(normalized)
    ));
  }, [attachments, query]);
  const visible = filtered.slice(0, RESULT_LIMIT);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

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

  function choose(entry: AttachmentEntry): void {
    onSelect(markdownAttachmentReference(entry.path, currentNotePath));
    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (visible.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((index) => (index + 1) % visible.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => (index - 1 + visible.length) % visible.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(visible[selectedIndex] ?? visible[0]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/30 pt-[16vh]"
      role="dialog"
      aria-modal="true"
      aria-label="插入附件"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[68vh] w-[560px] max-w-[calc(100vw-2rem)] flex-col rounded-lg bg-white shadow-2xl">
        <div className="flex items-center gap-2 px-4 py-3">
          <input
            ref={inputRef}
            className="min-w-0 flex-1 outline-none placeholder:text-gray-400"
            placeholder="搜索附件名称或路径..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100" onClick={onClose}>
            取消
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-y border-gray-200">
          {loading ? (
            <p className="px-4 py-4 text-sm text-gray-400">正在读取附件...</p>
          ) : error ? (
            <div className="px-4 py-4 text-sm text-red-600">
              <p>附件列表加载失败：{error}</p>
              <button className="mt-2 rounded bg-red-50 px-2 py-1 text-xs hover:bg-red-100" onClick={() => void load()}>
                重试
              </button>
            </div>
          ) : visible.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-400">
              {attachments.length === 0 ? '知识库中还没有附件。' : '没有匹配的附件。'}
            </p>
          ) : visible.map((entry, index) => (
            <button
              key={entry.path}
              ref={index === selectedIndex ? selectedRef : undefined}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                index === selectedIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
              }`}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => choose(entry)}
            >
              <span className="w-10 shrink-0 rounded bg-gray-100 px-1 py-0.5 text-center text-[10px] text-gray-500">
                {kindLabel(entry.kind)}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
              <span className="max-w-[45%] truncate text-xs text-gray-400">{entry.path}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-400">
          <span>{filtered.length > RESULT_LIMIT ? `显示前 ${RESULT_LIMIT} / ${filtered.length} 个` : `${filtered.length} 个附件`}</span>
          <span>↑↓ 选择 · Enter 插入 · Esc 取消</span>
        </div>
      </div>
    </div>
  );
}
