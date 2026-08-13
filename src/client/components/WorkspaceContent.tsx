import type { ManagedFile, PreviewFile } from '../hooks/useWorkspaceFileViews.js';
import { Editor } from './DeferredViews.js';
import { FilePreview } from './FilePreview.js';
import { ManagedFileView } from './ManagedFileView.js';

interface WorkspaceContentProps {
  previewFile: PreviewFile | null;
  managedFile: ManagedFile | null;
  selectedFile: string | null;
  content: string;
  loading: boolean;
  error: string | null;
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
  linkStoreVersion: number;
  onChange: (content: string) => void;
  onSave: () => void;
  onReload: () => void;
  onForceSave: () => void;
  onInsertReference: (reference: string) => void;
  onKnowledgeNavigate: (filePath: string) => void;
}

export function WorkspaceContent({
  previewFile,
  managedFile,
  selectedFile,
  content,
  loading,
  error,
  dirty,
  saving,
  conflict,
  linkStoreVersion,
  onChange,
  onSave,
  onReload,
  onForceSave,
  onInsertReference,
  onKnowledgeNavigate,
}: WorkspaceContentProps) {
  if (previewFile) {
    return (
      <FilePreview
        {...previewFile}
        insertTarget={selectedFile}
        onInsertReference={onInsertReference}
        linkStoreVersion={linkStoreVersion}
        onNavigate={onKnowledgeNavigate}
      />
    );
  }
  if (managedFile) {
    return (
      <ManagedFileView
        {...managedFile}
        insertTarget={selectedFile}
        onInsertReference={onInsertReference}
        linkStoreVersion={linkStoreVersion}
        onNavigate={onKnowledgeNavigate}
      />
    );
  }
  return (
    <Editor
      filePath={selectedFile}
      content={content}
      onChange={onChange}
      loading={loading}
      error={error}
      dirty={dirty}
      saving={saving}
      conflict={conflict}
      onSave={onSave}
      onReload={onReload}
      onForceSave={onForceSave}
    />
  );
}
