import { useEffect, useState } from 'react';
import type { TreeNode } from '../types/index.js';
import { addLink, deleteFile, searchKnowledge } from '../lib/api.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { FileMoveDialog } from './FileMoveDialog.js';
import { InlineNotice } from './InlineNotice.js';

export interface FileTreeContextTarget {
  x: number;
  y: number;
  node: TreeNode;
}

interface FileTreeActionsProps {
  target: FileTreeContextTarget | null;
  selectedPath: string | null;
  hasUnsavedChanges: boolean;
  onClose: () => void;
  onCreateNote: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onTreeChanged: () => void | Promise<void>;
  onPathMoved: (oldPath: string, newPath: string, selectedPathAfterMove: string | null) => void;
  onPathTrashed: (trashedPath: string, selectedPathWasTrashed: boolean) => void;
}

function pathIncludes(parentPath: string, candidate: string | null): boolean {
  return candidate === parentPath || Boolean(candidate?.startsWith(`${parentPath}/`));
}

export function FileTreeActions({
  target,
  selectedPath,
  hasUnsavedChanges,
  onClose,
  onCreateNote,
  onCreateFolder,
  onTreeChanged,
  onPathMoved,
  onPathTrashed,
}: FileTreeActionsProps) {
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<Array<{ path: string; title: string }>>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkSearchError, setLinkSearchError] = useState<string | null>(null);
  const [linkActionError, setLinkActionError] = useState<string | null>(null);
  const [addingLinkPath, setAddingLinkPath] = useState<string | null>(null);
  const [trashTarget, setTrashTarget] = useState<TreeNode | null>(null);
  const [trashBusy, setTrashBusy] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [trashBlocked, setTrashBlocked] = useState(false);
  const [moveTarget, setMoveTarget] = useState<TreeNode | null>(null);

  useEffect(() => {
    if (!target) return;
    const close = () => onClose();
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [onClose, target]);

  useEffect(() => {
    setLinkSearchError(null);
    setLinkActionError(null);
    if (!linkTarget || linkSearch.length < 1) {
      setLinkResults([]);
      setLinkSearching(false);
      return;
    }
    setLinkSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchKnowledge(linkSearch, 10);
        setLinkResults(result.results.filter((item) => item.path !== linkTarget));
      } catch (error) {
        setLinkResults([]);
        setLinkSearchError(error instanceof Error ? error.message : '搜索失败');
      } finally {
        setLinkSearching(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [linkSearch, linkTarget]);

  function openLinkDialog(filePath: string): void {
    setLinkTarget(filePath);
    setLinkSearch('');
    setLinkResults([]);
    setLinkSearchError(null);
    setLinkActionError(null);
    setAddingLinkPath(null);
  }

  function closeLinkDialog(): void {
    setLinkTarget(null);
    setLinkSearch('');
    setLinkResults([]);
    setLinkSearchError(null);
    setLinkActionError(null);
    setAddingLinkPath(null);
  }

  async function handleAddLink(targetPath: string): Promise<void> {
    if (!linkTarget) return;
    setAddingLinkPath(targetPath);
    setLinkActionError(null);
    try {
      await addLink(linkTarget, targetPath);
      closeLinkDialog();
    } catch (error) {
      setLinkActionError(error instanceof Error ? error.message : '添加链接失败');
    } finally {
      setAddingLinkPath(null);
    }
  }

  function openTrashDialog(node: TreeNode): void {
    const selectedPathWasTrashed = pathIncludes(node.path, selectedPath);
    setTrashTarget(node);
    setTrashBlocked(selectedPathWasTrashed && hasUnsavedChanges);
    setTrashError(
      selectedPathWasTrashed && hasUnsavedChanges
        ? '当前笔记有未保存内容。请先保存，再移入回收站。'
        : null,
    );
  }

  function closeTrashDialog(): void {
    if (trashBusy) return;
    setTrashTarget(null);
    setTrashError(null);
    setTrashBlocked(false);
  }

  async function confirmTrash(): Promise<void> {
    if (!trashTarget) return;
    if (trashBlocked) return;
    const selectedPathWasTrashed = pathIncludes(trashTarget.path, selectedPath);
    setTrashBusy(true);
    setTrashError(null);
    try {
      await deleteFile(trashTarget.path);
      onPathTrashed(trashTarget.path, selectedPathWasTrashed);
      await onTreeChanged();
      setTrashTarget(null);
    } catch (error) {
      setTrashError(error instanceof Error ? error.message : '移入回收站失败');
    } finally {
      setTrashBusy(false);
    }
  }

  return (
    <>
      {target && (
        <div
          className="fixed z-50 min-w-[180px] rounded border border-gray-200 bg-white py-1 shadow-lg"
          style={{ left: target.x, top: target.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {target.node.type === 'directory' && (
            <>
              <button
                className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-blue-50"
                onClick={() => { onCreateNote(target.node.path); onClose(); }}
              >
                新建笔记
              </button>
              <button
                className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-blue-50"
                onClick={() => { onCreateFolder(target.node.path); onClose(); }}
              >
                新建文件夹
              </button>
            </>
          )}
          {target.node.type === 'file' && (
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-blue-50"
              onClick={() => {
                openLinkDialog(target.node.path);
                onClose();
              }}
            >
              链接到...
            </button>
          )}
          <button
            className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-blue-50"
            onClick={() => { setMoveTarget(target.node); onClose(); }}
          >
            重命名 / 移动...
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
            onClick={() => { openTrashDialog(target.node); onClose(); }}
          >
            移入回收站
          </button>
        </div>
      )}

      {linkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={closeLinkDialog}>
          <div className="w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <p className="mb-2 truncate text-sm font-medium">链接“{linkTarget}”到...</p>
            {linkActionError && (
              <InlineNotice tone="danger" className="mb-2 rounded">
                {linkActionError}
              </InlineNotice>
            )}
            <input
              className="mb-2 w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
              placeholder="搜索笔记或附件..."
              value={linkSearch}
              onChange={(event) => setLinkSearch(event.target.value)}
              disabled={Boolean(addingLinkPath)}
              autoFocus
            />
            {linkSearching && <p className="mb-2 px-2 text-sm text-gray-400">搜索中...</p>}
            {!linkSearching && linkSearchError && (
              <p className="mb-2 px-2 text-sm text-red-500">{linkSearchError}</p>
            )}
            <ul className="max-h-48 overflow-y-auto">
              {linkResults.map((result) => (
                <li key={result.path}>
                  <button
                    className="w-full rounded px-2 py-1 text-left text-sm hover:bg-blue-50 disabled:opacity-50"
                    onClick={() => void handleAddLink(result.path)}
                    disabled={Boolean(addingLinkPath)}
                  >
                    {addingLinkPath === result.path ? '添加中...' : result.title}
                  </button>
                </li>
              ))}
              {!linkSearching && !linkSearchError && linkResults.length === 0 && linkSearch && (
                <li className="px-2 py-1 text-sm text-gray-400">无匹配结果</li>
              )}
            </ul>
            <button
              className="mt-2 w-full rounded bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200 disabled:opacity-50"
              onClick={closeLinkDialog}
              disabled={Boolean(addingLinkPath)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(trashTarget)}
        title="移入回收站"
        description={trashTarget ? `将“${trashTarget.path}”移入回收站？之后可以恢复。` : ''}
        confirmLabel="移入回收站"
        tone="danger"
        busy={trashBusy}
        confirmDisabled={trashBlocked}
        error={trashError}
        onConfirm={() => void confirmTrash()}
        onCancel={closeTrashDialog}
      />
      <FileMoveDialog
        node={moveTarget}
        selectedPath={selectedPath}
        hasUnsavedChanges={hasUnsavedChanges}
        onClose={() => setMoveTarget(null)}
        onMoved={onPathMoved}
        onTreeChanged={onTreeChanged}
      />
    </>
  );
}
