import { useCallback, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { autocompletion } from '@codemirror/autocomplete';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { wikilinkCompletionSource } from './WikilinkAutocomplete.js';
import { AttachmentPicker } from './AttachmentPicker.js';
import { useImagePaste } from '../hooks/useImagePaste.js';

interface EditorProps {
  /** 当前编辑的文件路径（null 表示未选择文件） */
  filePath: string | null;
  /** 当前编辑器内容（由父组件管理） */
  content: string;
  /** 内容变更时通知父组件 */
  onChange: (value: string) => void;
  /** 暴露 ref 供外部操作 */
  editorRef?: React.Ref<ReactCodeMirrorRef>;
  /** 是否正在加载 */
  loading?: boolean;
  /** 错误信息 */
  error?: string | null;
  /** 是否有未保存变更 */
  dirty?: boolean;
  /** 是否正在保存 */
  saving?: boolean;
  /** 是否检测到磁盘版本冲突 */
  conflict?: boolean;
  /** 保存回调 */
  onSave?: () => void;
  /** 放弃本地修改并重新加载 */
  onReload?: () => void;
  /** 明确覆盖磁盘版本 */
  onForceSave?: () => void;
}

export function Editor({
  filePath,
  content,
  onChange,
  editorRef,
  loading,
  error,
  dirty,
  saving,
  conflict,
  onSave,
  onReload,
  onForceSave,
}: EditorProps) {
  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);
  // 内部 ref，用于 useImagePaste
  const internalRef = useRef<ReactCodeMirrorRef | null>(null);
  const resolvedRef = (editorRef as React.RefObject<ReactCodeMirrorRef>) || internalRef;

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage }),
      autocompletion({
        override: [wikilinkCompletionSource()],
        defaultKeymap: true,
        closeOnBlur: true,
      }),
    ],
    []
  );

  const handleChange = useCallback(
    (value: string) => {
      onChange(value);
    },
    [onChange]
  );

  // Ctrl+S 保存
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (onSave && dirty) {
          onSave();
        }
      }
    },
    [onSave, dirty]
  );

  // 剪贴板图片粘贴
  useImagePaste(resolvedRef, filePath, (newContent) => {
    onChange(newContent);
  });

  const handleAttachmentSelect = useCallback((reference: string) => {
    const view = resolvedRef.current?.view;
    if (!view) {
      const separator = content.length === 0 || content.endsWith('\n') ? '' : '\n';
      onChange(`${content}${separator}${reference}\n`);
      return;
    }

    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: reference },
      selection: { anchor: selection.from + reference.length },
    });
    onChange(view.state.doc.toString());
    window.requestAnimationFrame(() => view.focus());
  }, [content, onChange, resolvedRef]);

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        选择一篇笔记开始编辑
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        加载中...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white" onKeyDown={handleKeyDown}>
      {/* 标题栏 */}
      <div className="editor-bar flex items-center px-3 py-1 border-b shrink-0">
        <span className="editor-path truncate flex-1">{filePath}</span>
        <button
          type="button"
          className="paper-button ml-2 shrink-0 px-2 py-1 text-xs"
          title="搜索知识库附件并插入到当前光标"
          onClick={() => setShowAttachmentPicker(true)}
        >
          插入附件
        </button>
        {saving ? (
          <span className="text-xs text-blue-500 ml-2 shrink-0">保存中…</span>
        ) : dirty && (
          <span className="ml-2 shrink-0 text-xs text-orange-500">未保存</span>
        )}
      </div>
      {error && (
        <div className={`flex items-center gap-2 px-3 py-2 text-xs border-b ${
          conflict
            ? 'bg-amber-50 text-amber-800 border-amber-200'
            : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          <span className="flex-1">{error}</span>
          {conflict ? (
            <>
              <button className="underline" onClick={onReload} disabled={saving}>重新加载</button>
              <button className="underline font-medium" onClick={onForceSave} disabled={saving}>仍然覆盖</button>
            </>
          ) : dirty && (
            <button className="underline" onClick={onSave} disabled={saving}>重试保存</button>
          )}
        </div>
      )}
      {/* 编辑器 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeMirror
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ref={resolvedRef as any}
          value={content}
          onChange={handleChange}
          extensions={extensions}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
          }}
          theme="light"
          className="paper-codemirror h-full"
          style={{ height: '100%' }}
        />
      </div>
      {showAttachmentPicker && (
        <AttachmentPicker
          currentNotePath={filePath}
          onClose={() => setShowAttachmentPicker(false)}
          onSelect={handleAttachmentSelect}
        />
      )}
    </div>
  );
}
