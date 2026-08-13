import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';
import { getFileKind } from '../../shared/file-types.js';
import {
  collectDroppedImportItems,
  collectSelectedImportItems,
  type FileImportCollection,
} from '../lib/file-import-collection.js';
import {
  executeFileImport,
  readableImportFailure,
  type ImportSummary,
} from '../lib/file-import-execution.js';
import { importTargetDirectory } from '../lib/file-import-target.js';
import { bindGlobalFileDrop } from '../lib/global-file-drop.js';
import { InlineNotice } from './InlineNotice.js';

interface FileImportSurfaceProps {
  children?: ReactNode;
  mode?: 'local' | 'global';
  selectedPath: string | null;
  currentNotePath?: string | null;
  onImported: () => void | Promise<void>;
  onInsert?: (filePaths: string[]) => void;
}

function summaryText(summary: ImportSummary): string {
  const completed: string[] = [];
  if (summary.importedPaths.length > 0) completed.push(`导入 ${summary.importedPaths.length} 个文件`);
  if (summary.createdFolders > 0) completed.push(`创建 ${summary.createdFolders} 个文件夹`);
  if (summary.reusedFolders > 0) completed.push(`合并 ${summary.reusedFolders} 个已有文件夹`);
  const result = completed.length > 0 ? `已${completed.join('，')}。` : '';
  const skippedExamples = summary.skipped.slice(0, 2).map((item) => item.path).join('、');
  const skippedRemainder = summary.skipped.length > 2 ? `等 ${summary.skipped.length} 个条目` : '';
  const skipped = summary.skipped.length > 0
    ? `已跳过 ${skippedExamples}${skippedRemainder ? ` ${skippedRemainder}` : ''}。`
    : '';
  if (summary.failures.length === 0) return `${result}${skipped}` || '没有需要导入的内容。';
  const examples = summary.failures
    .slice(0, 2)
    .map((failure) => `${failure.name}：${failure.reason}`)
    .join('；');
  const remainder = summary.failures.length > 2 ? `；另有 ${summary.failures.length - 2} 个失败` : '';
  return `${result}${skipped}${summary.failures.length} 个失败：${examples}${remainder}`;
}

function summaryTone(summary: ImportSummary): 'info' | 'warning' | 'danger' {
  if (summary.failures.length > 0) {
    return summary.importedPaths.length > 0 || summary.createdFolders > 0 ? 'warning' : 'danger';
  }
  return summary.skipped.length > 0 ? 'warning' : 'info';
}

function hasDraggedFiles(event: ReactDragEvent<HTMLDivElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

export function FileImportSurface({
  children,
  mode = 'local',
  selectedPath,
  currentNotePath = null,
  onImported,
  onInsert,
}: FileImportSurfaceProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const importingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const targetDirectory = importTargetDirectory(selectedPath);
  const insertablePaths = summary?.importedPaths.filter((filePath) => getFileKind(filePath) !== 'markdown') ?? [];

  const importCollection = useCallback(async (
    collectionPromise: Promise<FileImportCollection>
  ): Promise<void> => {
    if (importingRef.current) return;
    importingRef.current = true;
    setImporting(true);
    setSummary(null);
    setProgress('读取选择内容');
    try {
      const collection = await collectionPromise;
      setSummary(await executeFileImport(collection, {
        targetDirectory,
        onProgress: setProgress,
        onImported,
      }));
    } catch (error) {
      setSummary({
        importedPaths: [],
        createdFolders: 0,
        reusedFolders: 0,
        failures: [{ name: '选择内容', reason: readableImportFailure(error) }],
        skipped: [],
      });
    } finally {
      importingRef.current = false;
      setImporting(false);
      setProgress('');
    }
  }, [onImported, targetDirectory]);

  useEffect(() => {
    directoryInputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  useEffect(() => {
    if (mode !== 'global') return;
    return bindGlobalFileDrop(window, {
      onDraggingChange: setDragging,
      onTransferDrop: (transfer) => {
        void importCollection(collectDroppedImportItems(transfer));
      },
    });
  }, [importCollection, mode]);

  function handleDragEnter(event: ReactDragEvent<HTMLDivElement>): void {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>): void {
    if (dragDepth.current === 0) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>): void {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void importCollection(collectDroppedImportItems(event.dataTransfer));
  }

  function handleFileChoice(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void importCollection(Promise.resolve(collectSelectedImportItems(files)));
  }

  if (mode === 'global') {
    return (
      <>
        {(importing || summary) && (
          <InlineNotice
            tone={summary ? summaryTone(summary) : 'info'}
            actionLabel={summary && currentNotePath && insertablePaths.length ? '插入当前笔记' : undefined}
            onAction={summary && onInsert ? () => { onInsert(insertablePaths); setSummary(null); } : undefined}
            onClose={summary ? () => setSummary(null) : undefined}
            className="fixed bottom-4 left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg shadow-lg"
          >
            <span title={summary ? summaryText(summary) : undefined}>
              {summary ? summaryText(summary) : `正在处理 ${progress}，目标“${targetDirectory || '知识库根目录'}”…`}
            </span>
          </InlineNotice>
        )}
        {dragging && (
          <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-4 border-dashed border-blue-400 bg-blue-50/95 px-6 text-center text-blue-700">
            <div>
              <div className="text-lg font-semibold">松开即可导入文件或文件夹</div>
              <div className="mt-2 text-sm">内容将复制到“{targetDirectory || '知识库根目录'}”并保留文件夹结构，不会移动或同步外部原文件</div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={(event) => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="min-h-0 flex-1">{children}</div>
      {summary && (
        <InlineNotice
          tone={summaryTone(summary)}
          actionLabel={currentNotePath && insertablePaths.length ? '插入当前笔记' : undefined}
          onAction={onInsert ? () => { onInsert(insertablePaths); setSummary(null); } : undefined}
          onClose={() => setSummary(null)}
          className="rounded-none border-x-0 border-b-0"
        >
          <span title={summaryText(summary)}>{summaryText(summary)}</span>
        </InlineNotice>
      )}
      <div className="flex shrink-0 items-center gap-2 border-t border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-500">
        <span className="min-w-0 flex-1 truncate" title={targetDirectory || '知识库根目录'}>
          拖入到：{targetDirectory || '知识库根目录'}
        </span>
        <button
          type="button"
          className="shrink-0 rounded border border-gray-200 px-2 py-0.5 hover:bg-gray-100 disabled:cursor-wait disabled:opacity-60"
          disabled={importing}
          onClick={() => inputRef.current?.click()}
        >
          {importing ? `处理中 ${progress}` : '文件'}
        </button>
        <input ref={inputRef} className="hidden" type="file" multiple onChange={handleFileChoice} />
        <button
          type="button"
          className="shrink-0 rounded border border-gray-200 px-2 py-0.5 hover:bg-gray-100 disabled:cursor-wait disabled:opacity-60"
          disabled={importing}
          onClick={() => directoryInputRef.current?.click()}
        >
          文件夹
        </button>
        <input ref={directoryInputRef} className="hidden" type="file" multiple onChange={handleFileChoice} />
      </div>
      {dragging && (
        <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded border-2 border-dashed border-blue-400 bg-blue-50/95 px-4 text-center text-sm font-medium text-blue-700">
          松开后复制文件或文件夹到“{targetDirectory || '知识库根目录'}”
        </div>
      )}
    </div>
  );
}
