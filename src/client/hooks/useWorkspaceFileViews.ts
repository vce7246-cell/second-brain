import { useCallback, useState } from 'react';
import {
  getFileKind,
  isPreviewFileKind,
  type ManagedFileKind,
  type PreviewFileKind,
} from '../../shared/file-types.js';

export interface PreviewFile {
  filePath: string;
  kind: PreviewFileKind;
  revision: number;
}

export interface ManagedFile {
  filePath: string;
  kind: ManagedFileKind;
}

export function useWorkspaceFileViews(showEditor: () => void) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [managedFile, setManagedFile] = useState<ManagedFile | null>(null);

  const openNote = useCallback((filePath: string | null) => {
    setPreviewFile(null);
    setManagedFile(null);
    setSelectedFile(filePath);
    showEditor();
  }, [showEditor]);

  const openPreview = useCallback((filePath: string, kind: PreviewFile['kind']) => {
    setManagedFile(null);
    setPreviewFile({ filePath, kind, revision: 0 });
    showEditor();
  }, [showEditor]);

  const openManaged = useCallback((filePath: string, kind: ManagedFileKind) => {
    setPreviewFile(null);
    setManagedFile({ filePath, kind });
    showEditor();
  }, [showEditor]);

  const openAttachment = useCallback((filePath: string) => {
    const kind = getFileKind(filePath);
    if (isPreviewFileKind(kind)) {
      openPreview(filePath, kind);
    } else if (kind !== 'directory' && kind !== 'markdown') {
      openManaged(filePath, kind);
    }
  }, [openManaged, openPreview]);

  const closeAttachment = useCallback(() => {
    setPreviewFile(null);
    setManagedFile(null);
    showEditor();
  }, [showEditor]);

  const refreshPreview = useCallback((filePath: string) => {
    setPreviewFile((current) => current?.filePath === filePath
      ? { ...current, revision: current.revision + 1 }
      : current);
  }, []);

  const removeDeletedAttachment = useCallback((filePath: string) => {
    setPreviewFile((current) => current?.filePath === filePath ? null : current);
    setManagedFile((current) => current?.filePath === filePath ? null : current);
  }, []);

  const clearSelectedFile = useCallback((filePath: string) => {
    setSelectedFile((current) => current === filePath ? null : current);
  }, []);

  const moveActiveFile = useCallback((filePath: string | null) => {
    if (!filePath) return;
    if (previewFile) setPreviewFile({ ...previewFile, filePath });
    else if (managedFile) setManagedFile({ ...managedFile, filePath });
    else if (selectedFile) setSelectedFile(filePath);
  }, [managedFile, previewFile, selectedFile]);

  const clearAllFiles = useCallback(() => {
    setSelectedFile(null);
    setPreviewFile(null);
    setManagedFile(null);
  }, []);

  return {
    selectedFile,
    previewFile,
    managedFile,
    openNote,
    openPreview,
    openManaged,
    openAttachment,
    closeAttachment,
    refreshPreview,
    removeDeletedAttachment,
    clearSelectedFile,
    moveActiveFile,
    clearAllFiles,
  };
}
