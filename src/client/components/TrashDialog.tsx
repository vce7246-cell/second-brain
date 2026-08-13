import { useTrash } from '../hooks/useTrash.js';

interface TrashDialogProps {
  open: boolean;
  onClose: () => void;
  onRestored: () => void | Promise<void>;
}

function formatDeletedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

export function TrashDialog({ open, onClose, onRestored }: TrashDialogProps) {
  const { items, loading, restoringId, error, reload, restore } = useTrash(open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
      onClick={onClose}
    >
      <section
        className="flex max-h-[70vh] w-full max-w-xl flex-col rounded-lg border border-gray-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
        aria-label="回收站"
      >
        <header className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">回收站</h2>
            <p className="text-xs text-gray-500">文件保留原路径；恢复时绝不会覆盖同名内容。</p>
          </div>
          <button
            className="ml-auto rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
            onClick={onClose}
          >
            关闭
          </button>
        </header>

        {error && (
          <div className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
            <button className="ml-2 underline" onClick={() => void reload()}>重试</button>
          </div>
        )}

        <div className="min-h-32 flex-1 overflow-y-auto p-3">
          {loading && items.length === 0 && (
            <p className="p-4 text-center text-sm text-gray-400">加载中...</p>
          )}
          {!loading && items.length === 0 && (
            <p className="p-4 text-center text-sm text-gray-400">回收站为空</p>
          )}
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded border border-gray-200 px-3 py-2"
              >
                <span className="kind-chip" aria-hidden="true">{item.entryType === 'directory' ? 'DIR' : 'FILE'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-800" title={item.originalPath}>
                    {item.originalPath}
                  </p>
                  <p className="text-xs text-gray-400">移入时间：{formatDeletedAt(item.deletedAt)}</p>
                </div>
                <button
                  className="shrink-0 rounded bg-blue-50 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  disabled={restoringId !== null}
                  onClick={async () => {
                    if (await restore(item.id)) await onRestored();
                  }}
                >
                  {restoringId === item.id ? '恢复中...' : '恢复'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
