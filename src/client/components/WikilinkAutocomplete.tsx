/**
 * Wikilink [[ 自动补全 — CodeMirror 6 扩展
 * 输入 [[ 时触发，从后端查询笔记列表并展示下拉补全
 */
import type { CompletionSource, Completion } from '@codemirror/autocomplete';
import { searchNotes } from '../lib/api.js';

/** 创建 wikilink 自动补全源 */
export function wikilinkCompletionSource(): CompletionSource {
  return async (context): Promise<{ from: number; options: Completion[] } | null> => {
    // 检查是否在 [[ 之后
    const pos = context.pos;
    const line = context.state.doc.lineAt(pos);
    const lineText = line.text;
    const cursorCol = pos - line.from;

    // 查找光标前的 [[
    const beforeCursor = lineText.slice(0, cursorCol);
    const match = beforeCursor.match(/\[\[([^\]]*)$/);
    if (!match) return null;

    const query = match[1]; // [[ 后面已输入的文本
    const linkStart = line.from + match.index!; // [[ 的起始位置

    try {
      const { results } = await searchNotes(query, 15);
      if (results.length === 0) return null;

      return {
        from: linkStart + 2, // 从 [[ 之后开始替换
        options: results.map((r): Completion => ({
          label: r.title,
          detail: r.path,
          apply: (view, completion, from, to) => {
            // 替换 [[query → [[title]]
            const insert = `${r.title}]]`;
            view.dispatch({
              changes: { from, to, insert },
              // 选中插入的标题文本（方便用户修改）
              selection: { anchor: from + insert.length },
            });
          },
        })),
      };
    } catch {
      return null;
    }
  };
}
