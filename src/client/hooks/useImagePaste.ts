import { useEffect } from 'react';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdownAttachmentReference } from '../lib/attachments.js';

/**
 * 监听粘贴事件，处理剪贴板中的图片
 * @param editorRef CodeMirror 编辑器引用
 * @param currentNotePath 当前笔记路径（用于确定图片存储位置和可移植引用）
 * @param onInsert 插入 Markdown 文本后的回调（如触发 onChange）
 */
export function useImagePaste(
  editorRef: React.RefObject<ReactCodeMirrorRef | null>,
  currentNotePath: string | null,
  onInsert?: (markdown: string) => void
) {
  useEffect(() => {
    const dom = editorRef.current?.view?.dom;
    if (!dom) return;
    const currentNoteDir = currentNotePath
      ? currentNotePath.replace(/[/\\][^/\\]*$/, '')
      : '';

    async function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          e.stopPropagation();

          const file = item.getAsFile();
          if (!file) continue;

          try {
            // 读取为 base64
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                // 去掉 data:xxx;base64, 前缀
                const comma = result.indexOf(',');
                resolve(result.slice(comma + 1));
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });

            // 上传到后端
            const res = await fetch('/api/files/upload-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                data: base64,
                mimeType: item.type,
                currentNoteDir,
              }),
            });

            if (!res.ok) {
              throw new Error('Upload failed');
            }

            const payload: unknown = await res.json();
            const imagePath = payload && typeof payload === 'object' && 'path' in payload
              ? (payload as { path?: unknown }).path
              : undefined;
            if (typeof imagePath !== 'string') throw new Error('Upload response did not include an image path');
            const markdown = markdownAttachmentReference(imagePath, currentNotePath);

            // view 可能在 await 期间变为 null（组件卸载）
            const currentView = editorRef.current?.view;
            if (!currentView) return;

            // 在光标位置插入 Markdown 图片语法
            const cursor = currentView.state.selection.main.head;
            currentView.dispatch({
              changes: { from: cursor, to: cursor, insert: markdown },
              selection: { anchor: cursor + markdown.length },
            });

            if (onInsert) {
              // 通知父组件内容已变更
              const newContent = currentView.state.doc.toString();
              onInsert(newContent);
            }
          } catch (err) {
            console.error('[useImagePaste] Paste failed:', err);
          }

          // 只处理一张图片
          break;
        }
      }
    }

    dom.addEventListener('paste', handlePaste);
    return () => {
      dom.removeEventListener('paste', handlePaste);
    };
  }, [editorRef, currentNotePath, onInsert]);
}
