import { useEffect, useState } from 'react';
import type { TreeNode } from '../types/index.js';
import { renameFile } from '../lib/api.js';
import { InlineNotice } from './InlineNotice.js';

interface FileMoveDialogProps {
  node: TreeNode | null;
  selectedPath: string | null;
  hasUnsavedChanges: boolean;
  onClose: () => void;
  onMoved: (oldPath: string, newPath: string, selectedPathAfterMove: string | null) => void;
  onTreeChanged: () => void | Promise<void>;
}

function pathIncludes(parentPath: string, candidate: string | null): boolean {
  return candidate === parentPath || Boolean(candidate?.startsWith(`${parentPath}/`));
}

function moveSelectedPath(oldPath: string, newPath: string, selectedPath: string | null): string | null {
  if (!selectedPath || !pathIncludes(oldPath, selectedPath)) return null;
  return `${newPath}${selectedPath.slice(oldPath.length)}`;
}

export function FileMoveDialog({
  node,
  selectedPath,
  hasUnsavedChanges,
  onClose,
  onMoved,
  onTreeChanged,
}: FileMoveDialogProps) {
  const [nextPath, setNextPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!node) return;
    setNextPath(node.path);
    setError(null);
    setBusy(false);
  }, [node]);

  if (!node) return null;
  const activeNode = node;
  const blockedByUnsaved = pathIncludes(activeNode.path, selectedPath) && hasUnsavedChanges;

  function close(): void {
    if (busy) return;
    onClose();
  }

  async function submit(): Promise<void> {
    const trimmed = nextPath.trim();
    if (blockedByUnsaved) {
      setError('当前笔记有未保存内容。请先保存，再重命名或移动。');
      return;
    }
    if (!trimmed) {
      setError('请输入新的相对路径。');
      return;
    }
    if (trimmed === activeNode.path) {
      onClose();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await renameFile(activeNode.path, trimmed);
      onMoved(activeNode.path, trimmed, moveSelectedPath(activeNode.path, trimmed, selectedPath));
      await onTreeChanged();
      onClose();
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : '移动失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onClick={close}>
      <section
        className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-move-title"
      >
        <h2 id="file-move-title" className="text-sm font-semibold text-gray-800">
          重命名 / 移动
        </h2>
        <p className="mt-1 break-words text-xs text-gray-400">当前：{activeNode.path}</p>
        {(error || blockedByUnsaved) && (
          <InlineNotice tone="danger" className="mt-3 rounded">
            {error || '当前笔记有未保存内容。请先保存，再重命名或移动。'}
          </InlineNotice>
        )}
        <input
          className="mt-3 w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          value={nextPath}
          onChange={(event) => setNextPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
            if (event.key === 'Escape') close();
          }}
          disabled={busy || blockedByUnsaved}
          autoFocus
        />
        <p className="mt-2 text-xs text-gray-400">输入新的完整相对路径，可同时移动到其他文件夹。</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            onClick={close}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={busy || blockedByUnsaved}
          >
            {busy ? '处理中...' : '保存'}
          </button>
        </div>
      </section>
    </div>
  );
}
