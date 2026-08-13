import { BacklinksPanel } from './BacklinksPanel.js';
import { FileDetails } from './FileDetails.js';
import { LinkPanel } from './LinkPanel.js';

interface KnowledgeSidebarProps {
  filePath: string;
  typeLabel: string;
  capability: string;
  refreshKey?: number;
  insertTarget?: string | null;
  onInsertReference?: (reference: string) => void;
  linkStoreVersion?: number;
  onNavigate?: (filePath: string) => void;
}

export function KnowledgeSidebar({
  filePath,
  typeLabel,
  capability,
  refreshKey = 0,
  insertTarget = null,
  onInsertReference,
  linkStoreVersion = 0,
  onNavigate,
}: KnowledgeSidebarProps) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="max-h-[44%] shrink-0 overflow-y-auto p-3">
        <h2 className="mb-3 text-sm font-medium text-gray-700">文件详情</h2>
        <FileDetails
          filePath={filePath}
          typeLabel={typeLabel}
          capability={capability}
          refreshKey={refreshKey}
          compact={true}
          insertTarget={insertTarget}
          onInsertReference={onInsertReference}
        />
      </div>
      <div className="min-h-[150px] flex-1 border-t border-gray-200 bg-gray-50">
        <LinkPanel
          filePath={filePath}
          linkStoreVersion={linkStoreVersion}
          onNavigate={onNavigate}
        />
      </div>
      <div className="h-40 shrink-0 border-t border-gray-200 bg-gray-50">
        <BacklinksPanel
          filePath={filePath}
          linkStoreVersion={linkStoreVersion}
          onNavigate={onNavigate}
          showUnlinkedMentions={false}
        />
      </div>
    </aside>
  );
}
