import type { ManagedFileKind } from '../../shared/file-types.js';
import { KnowledgeSidebar } from './KnowledgeSidebar.js';

interface ManagedFileViewProps {
  filePath: string;
  kind: ManagedFileKind;
  insertTarget?: string | null;
  onInsertReference?: (reference: string) => void;
  linkStoreVersion?: number;
  onNavigate?: (filePath: string) => void;
}

function kindLabel(kind: ManagedFileViewProps['kind']): string {
  switch (kind) {
    case 'document': return 'Office / 文档文件';
    case 'other': return '其他文件';
  }
}

function kindIcon(kind: ManagedFileViewProps['kind']): string {
  switch (kind) {
    case 'document': return 'DOC';
    case 'other': return 'FILE';
  }
}

function supportSummary(kind: ManagedFileViewProps['kind']): string {
  switch (kind) {
    case 'document': return '当前作为 Office / 文档附件管理；不在浏览器内解析或上传到云端。';
    case 'other': return '当前作为通用附件管理，保留在本地知识库中。';
  }
}

export function ManagedFileView({
  filePath,
  kind,
  insertTarget = null,
  onInsertReference,
  linkStoreVersion = 0,
  onNavigate,
}: ManagedFileViewProps) {
  return (
    <section className="flex h-full min-w-0 flex-col bg-gray-50">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3">
        <span className="kind-chip" aria-hidden="true">{kindIcon(kind)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-700" title={filePath}>
          {filePath}
        </span>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">仅管理</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-6">
          <div className="w-full max-w-xl rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-center">
            <div className="kind-chip mb-3" aria-hidden="true">{kindIcon(kind)}</div>
            <h2 className="mb-2 text-base font-medium text-gray-800">{kindLabel(kind)}</h2>
            <p className="text-sm leading-6 text-gray-500">
              SecondBrain 当前不会编辑或预览这个文件类型，但会把它保留在你的本地知识库中。
              你仍然可以在左侧文件树中对它执行重命名、移动或移入回收站。
            </p>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            你可以在右侧为这个附件添加标签和关联；内容仍保持仅管理，不会被解析或改写。
          </p>
          </div>
        </div>
        <KnowledgeSidebar
          filePath={filePath}
          typeLabel={kindLabel(kind)}
          capability={supportSummary(kind)}
          insertTarget={insertTarget}
          onInsertReference={onInsertReference}
          linkStoreVersion={linkStoreVersion}
          onNavigate={onNavigate}
        />
      </div>
    </section>
  );
}
