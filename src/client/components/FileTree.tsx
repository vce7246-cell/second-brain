import { useCallback, useEffect, useState } from 'react';
import type { TreeNode } from '../types/index.js';
import { fetchTree } from '../lib/api.js';
import {
  FileTreeActions,
  type FileTreeContextTarget,
} from './FileTreeActions.js';
import {
  FileCreateDialog,
  type FileCreateKind,
  type FileCreateRequest,
} from './FileCreateDialog.js';
import { TrashDialog } from './TrashDialog.js';
import { ViewState } from './ViewState.js';
import { InlineNotice } from './InlineNotice.js';
import { FileImportSurface } from './FileImportSurface.js';
import { fileKindIcon } from '../lib/file-presentation.js';
import {
  isPreviewFileKind,
  type FileKind,
  type ManagedFileKind,
  type PreviewFileKind,
} from '../../shared/file-types.js';

interface FileTreeProps {
  selectedPath: string | null;
  onSelect: (filePath: string) => void;
  onPreview?: (filePath: string, kind: PreviewFileKind) => void;
  onManageFile?: (filePath: string, kind: ManagedFileKind) => void;
  refreshKey?: number;
  hasUnsavedChanges?: boolean;
  onPathMoved?: (selectedPathAfterMove: string | null) => void;
  onPathTrashed?: (selectedPathWasTrashed: boolean) => void;
  currentNotePath?: string | null;
  onInsertImported?: (filePaths: string[]) => void;
}

function isManagedFileKind(kind: FileKind): kind is ManagedFileKind {
  return kind !== 'directory' && kind !== 'markdown' && !isPreviewFileKind(kind);
}

export function FileTree({
  selectedPath,
  onSelect,
  onPreview = () => undefined,
  onManageFile = () => undefined,
  refreshKey = 0,
  hasUnsavedChanges = false,
  onPathMoved = () => undefined,
  onPathTrashed = () => undefined,
  currentNotePath = null,
  onInsertImported,
}: FileTreeProps) {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [contextTarget, setContextTarget] = useState<FileTreeContextTarget | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [createRequest, setCreateRequest] = useState<FileCreateRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      setTitleError(null);
      const treeData = await fetchTree();
      setTree(treeData);
      try {
        const titlesResponse = await fetch('/api/notes/titles');
        if (!titlesResponse.ok) throw new Error(titlesResponse.statusText || '标题索引加载失败');
        const titleData = await titlesResponse.json() as { titles?: Record<string, string> };
        setTitles(titleData.titles || {});
      } catch (titlesLoadError) {
        setTitles({});
        setTitleError(titlesLoadError instanceof Error ? titlesLoadError.message : '标题索引加载失败');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const closeContextMenu = useCallback(() => setContextTarget(null), []);

  function toggleExpand(dirPath: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }

  function openCreateDialog(kind: FileCreateKind, parentPath = ''): void {
    setCreateRequest({ kind, parentPath });
  }

  async function handleCreated(kind: FileCreateKind, parentPath: string, createdPath: string): Promise<void> {
    if (parentPath) setExpanded((previous) => new Set(previous).add(parentPath));
    await load();
    if (kind === 'note' && !hasUnsavedChanges) onSelect(createdPath);
  }

  function renderNode(node: TreeNode, depth: number): JSX.Element {
    const isDirectory = node.type === 'directory';
    const isExpanded = expanded.has(node.path);
    const isMarkdown = node.kind === 'markdown';
    const isPreviewable = isPreviewFileKind(node.kind);
    const isManagedOnly = !isDirectory && !isMarkdown && !isPreviewable;
    const isSelected = selectedPath === node.path;
    const displayName = isMarkdown && titles[node.path] ? titles[node.path] : node.name;
    const hint = isDirectory
      ? node.path
      : isMarkdown
        ? node.path
        : isPreviewable
          ? `${node.path}（点击${node.kind === 'audio' || node.kind === 'video' ? '本地播放' : '只读预览'}）`
          : `${node.path}（当前仅支持文件管理，暂不支持预览）`;

    return (
      <div key={node.path}>
        <div
          className={`file-tree-row group flex select-none items-center gap-1 px-1 py-0.5 text-sm
            ${isDirectory || isMarkdown || isPreviewable ? 'cursor-pointer' : 'cursor-default'}
            ${isSelected ? 'is-selected' : 'text-gray-700'}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          title={hint}
          onClick={() => {
            if (isDirectory) toggleExpand(node.path);
            else if (isMarkdown) onSelect(node.path);
            else if (isPreviewFileKind(node.kind)) onPreview(node.path, node.kind);
            else if (isManagedFileKind(node.kind)) onManageFile(node.path, node.kind);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setContextTarget({ x: event.clientX, y: event.clientY, node });
          }}
        >
          <span className="w-4 shrink-0 text-center text-xs text-gray-400">
            {isDirectory ? (isExpanded ? '▾' : '▸') : ''}
          </span>
          <span className="kind-chip shrink-0" aria-label={node.kind}>{fileKindIcon(node.kind)}</span>
          <span className="min-w-0 flex-1 truncate">{displayName}</span>
          {isPreviewable && (
            <span className="hidden shrink-0 rounded bg-green-50 px-1 text-[10px] text-green-600 group-hover:inline">
              {node.kind === 'audio' || node.kind === 'video' ? '播放' : '预览'}
            </span>
          )}
          {isManagedOnly && (
            <span className="hidden shrink-0 rounded bg-gray-100 px-1 text-[10px] text-gray-500 group-hover:inline">
              管理
            </span>
          )}
          {isDirectory && (
            <button
              className="hidden shrink-0 rounded px-1 text-xs hover:bg-gray-200 group-hover:inline"
              title="在此新建笔记"
              onClick={(event) => {
                event.stopPropagation();
                openCreateDialog('note', node.path);
              }}
            >
              ＋
            </button>
          )}
        </div>
        {isDirectory && isExpanded && node.children && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <ViewState
        title="文件树加载失败"
        detail={error}
        actionLabel="重试"
        onAction={() => void load()}
        tone="danger"
        compact
      />
    );
  }

  if (!tree) return <ViewState title="正在加载文件树" busy compact />;

  return (
    <FileImportSurface
      selectedPath={selectedPath}
      currentNotePath={currentNotePath}
      onImported={load}
      onInsert={onInsertImported}
    >
      <div className="flex h-full flex-col">
      <div className="file-tree-header">
        <div className="file-tree-heading" title={tree.name}>
          <span className="min-w-0 flex-1 truncate">{tree.name}</span>
          {loading && (
            <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-gray-200 border-t-blue-500" title="正在刷新" />
          )}
        </div>
        <div className="file-tree-actions" aria-label="文件管理">
          <button className="file-tree-action" onClick={() => openCreateDialog('note')}>新建笔记</button>
          <button className="file-tree-action" onClick={() => openCreateDialog('folder')}>新建文件夹</button>
          <button className="file-tree-action" onClick={() => setTrashOpen(true)}>回收站</button>
          <button className="file-tree-action" onClick={() => void load()}>刷新</button>
        </div>
      </div>
      {titleError && (
        <InlineNotice tone="warning" actionLabel="重试" onAction={() => void load()} className="rounded-none border-x-0 border-t-0">
          标题索引加载失败，暂时显示文件名。
        </InlineNotice>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {tree.children?.length
          ? tree.children.map((child) => renderNode(child, 0))
          : (
            <ViewState
              title="还没有文件"
              detail="可以从上方新建 Markdown 笔记或文件夹。"
              compact
            />
          )}
      </div>

      <FileTreeActions
        target={contextTarget}
        selectedPath={selectedPath}
        hasUnsavedChanges={hasUnsavedChanges}
        onClose={closeContextMenu}
        onCreateNote={(parentPath) => openCreateDialog('note', parentPath)}
        onCreateFolder={(parentPath) => openCreateDialog('folder', parentPath)}
        onTreeChanged={load}
        onPathMoved={(_oldPath, _newPath, selectedPathAfterMove) => onPathMoved(selectedPathAfterMove)}
        onPathTrashed={onPathTrashed}
      />
      <FileCreateDialog
        request={createRequest}
        onClose={() => setCreateRequest(null)}
        onCreated={handleCreated}
      />
      <TrashDialog open={trashOpen} onClose={() => setTrashOpen(false)} onRestored={load} />
      </div>
    </FileImportSurface>
  );
}
