import { useEffect, useState } from 'react';
import { createFile, createFolder } from '../lib/api.js';
import { InlineNotice } from './InlineNotice.js';

export type FileCreateKind = 'note' | 'folder';

export interface FileCreateRequest {
  kind: FileCreateKind;
  parentPath: string;
}

interface FileCreateDialogProps {
  request: FileCreateRequest | null;
  onClose: () => void;
  onCreated: (kind: FileCreateKind, parentPath: string, createdPath: string) => void | Promise<void>;
}

function childPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function normalizeName(kind: FileCreateKind, value: string): string {
  if (kind === 'folder') return value;
  return /\.(md|markdown)$/i.test(value) ? value : `${value}.md`;
}

function titleFor(kind: FileCreateKind): string {
  return kind === 'note' ? '新建 Markdown 笔记' : '新建文件夹';
}

export function FileCreateDialog({ request, onClose, onCreated }: FileCreateDialogProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;
    setName('');
    setError(null);
    setBusy(false);
  }, [request]);

  if (!request) return null;
  const activeRequest = request;

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入名称。');
      return;
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      setError('名称不能包含路径分隔符；移动位置请使用右键菜单中的“重命名 / 移动”。');
      return;
    }

    const createdName = normalizeName(activeRequest.kind, trimmed);
    const createdPath = childPath(activeRequest.parentPath, createdName);
    setBusy(true);
    setError(null);
    try {
      if (activeRequest.kind === 'note') await createFile(createdPath, '');
      else await createFolder(createdPath);
      await onCreated(activeRequest.kind, activeRequest.parentPath, createdPath);
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onClick={onClose}>
      <section
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-create-title"
      >
        <h2 id="file-create-title" className="text-sm font-semibold text-gray-800">
          {titleFor(activeRequest.kind)}
        </h2>
        <p className="mt-1 truncate text-xs text-gray-400">
          位置：{activeRequest.parentPath || '根目录'}
        </p>
        {error && (
          <InlineNotice tone="danger" className="mt-3 rounded">
            {error}
          </InlineNotice>
        )}
        <input
          className="mt-3 w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          placeholder={activeRequest.kind === 'note' ? '例如：读书笔记' : '例如：项目资料'}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
            if (event.key === 'Escape') onClose();
          }}
          disabled={busy}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy ? '创建中...' : '创建'}
          </button>
        </div>
      </section>
    </div>
  );
}
