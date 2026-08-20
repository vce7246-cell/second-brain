import { useState, useCallback } from 'react';
import { FileTree } from './components/FileTree.js';
import { BacklinksPanel } from './components/BacklinksPanel.js';
import { LinkPanel } from './components/LinkPanel.js';
import { Dashboard } from './components/Dashboard.js';
import { AppHeader, type Panel } from './components/AppHeader.js';
import { GraphView, MarkdownPreview, QuickSwitcher, SearchView, TagView } from './components/DeferredViews.js';
import { WorkspaceContent } from './components/WorkspaceContent.js';
import { InlineNotice } from './components/InlineNotice.js';
import { FileImportSurface } from './components/FileImportSurface.js';
import { createDailyNote } from './lib/api.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useFileEditor } from './hooks/useFileEditor.js';
import { useWikilinkNavigation } from './hooks/useWikilinkNavigation.js';
import { useConfirmAction } from './hooks/useConfirmAction.js';
import { useWorkspaceFileViews } from './hooks/useWorkspaceFileViews.js';
import { markdownAttachmentReference } from './lib/attachments.js';
import { getFileKind } from '../shared/file-types.js';
import { useAppShortcuts } from './hooks/useAppShortcuts.js';
import { migrateKnowledgePath, recordRecentPath, removeKnowledgePath } from './lib/knowledge-history.js';

export function App() {
  const [activePanel, setActivePanel] = useState<Panel>('dashboard');
  const showEditor = useCallback(() => setActivePanel('editor'), []);
  const {
    selectedFile, previewFile, managedFile, openNote, openPreview, openManaged,
    openAttachment, closeAttachment, refreshPreview, removeDeletedAttachment,
    clearSelectedFile, moveActiveFile, clearAllFiles,
  } = useWorkspaceFileViews(showEditor);
  const [treeVersion, setTreeVersion] = useState(0);
  const [linkStoreVersion, setLinkStoreVersion] = useState(0);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [creatingDailyNote, setCreatingDailyNote] = useState(false);
  const [dailyNoteError, setDailyNoteError] = useState<string | null>(null);
  const { confirmAction, confirmDialog } = useConfirmAction();
  const {
    content, setContent, dirty, loading, saving, error, conflict,
    save: handleSave,
    forceSave,
    reloadFromDisk,
    handleExternalChange,
    handleExternalDelete,
  } = useFileEditor(selectedFile);

  // WebSocket 热更新
  useWebSocket(
    useCallback((msg) => {
      switch (msg.type) {
        case 'refresh-tree':
          setTreeVersion((v) => v + 1);
          break;
        case 'file-changed':
          if (msg.path) void handleExternalChange(msg.path);
          if (msg.path) refreshPreview(msg.path);
          break;
        case 'file-deleted':
          if (msg.path) {
            const deletedPath = msg.path;
            removeDeletedAttachment(deletedPath);
            void handleExternalDelete(deletedPath).then((shouldClear) => {
              if (shouldClear) clearSelectedFile(deletedPath);
            });
          }
          break;
        case 'links-changed':
          setLinkStoreVersion((v) => v + 1);
          break;
        case 'tags-changed':
          setLinkStoreVersion((v) => v + 1);
          break;
      }
    }, [clearSelectedFile, handleExternalChange, handleExternalDelete, refreshPreview, removeDeletedAttachment])
  );

  useAppShortcuts({
    openQuickSwitcher: useCallback(() => setShowQuickSwitcher(true), []),
    openSearch: useCallback(() => setActivePanel('search'), []),
    save: handleSave,
  });

  const confirmLeaveCurrentFile = useCallback((nextFile: string | undefined, action: () => void) => {
    if (!dirty || nextFile === selectedFile) {
      action();
      return;
    }
    confirmAction({
      title: '放弃未保存内容',
      description: '当前笔记有未保存内容，确定放弃并切换吗？',
      confirmLabel: '放弃并切换',
      tone: 'danger',
    }, action);
  }, [confirmAction, dirty, selectedFile]);

  const handleNavigate = useCallback((filePath: string) => {
    const navigate = () => {
      openNote(filePath || null);
    };
    confirmLeaveCurrentFile(filePath, navigate);
  }, [confirmLeaveCurrentFile, openNote]);
  const handleKnowledgeNavigate = useCallback((filePath: string) => {
    recordRecentPath(filePath);
    if (getFileKind(filePath) === 'markdown') handleNavigate(filePath);
    else openAttachment(filePath);
  }, [handleNavigate, openAttachment]);
  const { handleWikilinkClick, wikilinkNotice } = useWikilinkNavigation(handleNavigate);

  const handleInsertAttachmentReference = useCallback((reference: string) => {
    if (!selectedFile) return;
    setContent((current) => {
      const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';
      return `${current}${separator}${reference}\n`;
    });
    closeAttachment();
  }, [closeAttachment, selectedFile, setContent]);

  const handleInsertImportedFiles = useCallback((filePaths: string[]) => {
    if (!selectedFile || filePaths.length === 0) return;
    const references = filePaths.map((filePath) => markdownAttachmentReference(filePath, selectedFile));
    setContent((current) => {
      const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';
      return `${current}${separator}${references.join('\n')}\n`;
    });
    closeAttachment();
  }, [closeAttachment, selectedFile, setContent]);

  const handleReload = useCallback(() => {
    if (dirty) {
      confirmAction({
        title: '重新加载笔记',
        description: '重新加载会放弃当前未保存内容，确定继续吗？',
        confirmLabel: '重新加载',
        tone: 'danger',
      }, () => void reloadFromDisk());
      return;
    }
    void reloadFromDisk();
  }, [confirmAction, dirty, reloadFromDisk]);

  const handleForceSave = useCallback(() => {
    confirmAction({
      title: '覆盖磁盘内容',
      description: '这会覆盖磁盘上的较新内容，确定继续吗？',
      confirmLabel: '覆盖保存',
      tone: 'danger',
    }, () => void forceSave());
  }, [confirmAction, forceSave]);

  async function handleDailyNote() {
    confirmLeaveCurrentFile(undefined, () => {
      void createAndOpenDailyNote();
    });
  }

  async function createAndOpenDailyNote() {
    setCreatingDailyNote(true);
    setDailyNoteError(null);
    try {
      const res = await createDailyNote('daily');
      openNote(res.filePath);
      setTreeVersion((version) => version + 1);
    } catch (dailyError) {
      setDailyNoteError(dailyError instanceof Error ? dailyError.message : '今日笔记创建失败');
    } finally {
      setCreatingDailyNote(false);
    }
  }

  return (
    <div className="app-shell paper-theme flex h-full flex-col">
      <AppHeader
        activePanel={activePanel}
        hasSelectedKnowledge={Boolean(previewFile || managedFile || selectedFile)}
        creatingDailyNote={creatingDailyNote}
        onPanelChange={setActivePanel}
        onDailyNote={() => void handleDailyNote()}
      />
      {dailyNoteError && (
        <InlineNotice tone="danger" className="border-x-0 border-t-0 px-4" onClose={() => setDailyNoteError(null)}>
          今日笔记创建失败：{dailyNoteError}
        </InlineNotice>
      )}
      {wikilinkNotice}

      {activePanel === 'dashboard' && (
        <div className="app-panel flex-1 min-h-0">
          <Dashboard
            onNavigate={handleKnowledgeNavigate}
            onStartWriting={showEditor}
            refreshKey={linkStoreVersion}
          />
        </div>
      )}

      {activePanel === 'tags' && (
        <div className="app-panel flex-1 min-h-0">
          <TagView onNavigate={handleKnowledgeNavigate} refreshKey={linkStoreVersion} />
        </div>
      )}

      {activePanel === 'search' && (
        <div className="app-panel flex-1 min-h-0">
          <SearchView onNavigate={handleKnowledgeNavigate} refreshKey={treeVersion} />
        </div>
      )}

      {activePanel === 'editor' && (
        <div className="workspace-layout flex flex-1 min-h-0">
          <aside className="workspace-tree shrink-0 border-r">
            <FileTree
              selectedPath={previewFile?.filePath ?? managedFile?.filePath ?? selectedFile ?? null}
              onSelect={handleNavigate}
              onPreview={openPreview}
              onManageFile={openManaged}
              refreshKey={treeVersion}
              hasUnsavedChanges={dirty}
              onPathMoved={(oldPath, newPath, selectedPathAfterMove) => {
                migrateKnowledgePath(oldPath, newPath);
                moveActiveFile(selectedPathAfterMove);
              }}
              onPathTrashed={(trashedPath, selectedPathWasTrashed) => {
                removeKnowledgePath(trashedPath);
                if (selectedPathWasTrashed) clearAllFiles();
              }}
              currentNotePath={selectedFile}
              onInsertImported={handleInsertImportedFiles}
            />
          </aside>

          <main className="workspace-main flex-1 min-w-0">
            <WorkspaceContent
              previewFile={previewFile}
              managedFile={managedFile}
              selectedFile={selectedFile}
              content={content}
              loading={loading}
              error={error}
              dirty={dirty}
              saving={saving}
              conflict={conflict}
              linkStoreVersion={linkStoreVersion}
              onChange={setContent}
              onSave={handleSave}
              onReload={handleReload}
              onForceSave={handleForceSave}
              onInsertReference={handleInsertAttachmentReference}
              onKnowledgeNavigate={handleKnowledgeNavigate}
            />
          </main>

          {!previewFile && !managedFile && <aside className="workspace-inspector shrink-0 border-l flex flex-col">
            <div className="flex-1 min-h-0 overflow-hidden">
              <MarkdownPreview
                content={content}
                currentFilePath={selectedFile}
                onWikilinkClick={handleWikilinkClick}
                onAttachmentClick={openAttachment}
              />
            </div>
            <div className="shrink-0 border-t border-gray-200" style={{ height: '140px' }}>
              <LinkPanel
                filePath={selectedFile}
                linkStoreVersion={linkStoreVersion}
                onNavigate={handleKnowledgeNavigate}
              />
            </div>
            <div className="shrink-0 border-t border-gray-200" style={{ height: '160px' }}>
              <BacklinksPanel
                filePath={selectedFile}
                onNavigate={handleKnowledgeNavigate}
                linkStoreVersion={linkStoreVersion}
              />
            </div>
          </aside>}
        </div>
      )}

      {activePanel === 'graph' && (
        <div className="app-panel flex-1 min-h-0">
          <GraphView
            onNodeClick={handleKnowledgeNavigate}
            linkStoreVersion={linkStoreVersion}
          />
        </div>
      )}

      {activePanel === 'local-graph' && (
        <div className="app-panel flex-1 min-h-0">
          <GraphView
            onNodeClick={handleKnowledgeNavigate}
            linkStoreVersion={linkStoreVersion}
            localMode={true}
            centerNode={previewFile?.filePath ?? managedFile?.filePath ?? selectedFile}
          />
        </div>
      )}

      {showQuickSwitcher && (
        <QuickSwitcher
          onClose={() => setShowQuickSwitcher(false)}
          onSelect={handleKnowledgeNavigate}
        />
      )}
      {confirmDialog}
      <FileImportSurface mode="global" selectedPath={activePanel === 'editor' ? (previewFile?.filePath ?? managedFile?.filePath ?? selectedFile) : null} currentNotePath={activePanel === 'editor' ? selectedFile : null} onImported={() => setTreeVersion((version) => version + 1)} onInsert={handleInsertImportedFiles} />
    </div>
  );
}
