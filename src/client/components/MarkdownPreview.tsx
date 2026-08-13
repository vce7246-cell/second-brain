import { useMemo } from 'react';
import { marked } from 'marked';
import { filePreviewUrl } from '../lib/api.js';
import { getFileExtension, getFileKind } from '../../shared/file-types.js';
import { resolveAttachmentPath } from '../lib/attachments.js';

// wikilink 正则：[[title]] 或 [[title|alias]]
const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

interface MarkdownPreviewProps {
  /** Markdown 源文本 */
  content: string;
  /** 当前笔记路径，用于解析显式相对附件引用 */
  currentFilePath?: string | null;
  /** 点击 wikilink 时的回调 */
  onWikilinkClick?: (target: string) => void;
  /** 点击本地非 Markdown 附件时的回调 */
  onAttachmentClick?: (filePath: string) => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hasSafeUrl(href: string, image: boolean): boolean {
  let normalized = href.trim().replace(/&(?:colon|#0*58|#x0*3a);/gi, ':');
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    return false;
  }
  const prefix = normalized.split(/[/?#]/, 1)[0];
  if (prefix.includes('&')) return false;
  normalized = normalized.replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(normalized)?.[1];
  if (!scheme) return true;
  return image ? scheme === 'http' || scheme === 'https' : ['http', 'https', 'mailto'].includes(scheme);
}

function imageSource(href: string, currentFilePath?: string | null): string | null {
  const trimmed = href.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) {
    return href;
  }
  const filePath = resolveAttachmentPath(trimmed, currentFilePath);
  return filePath ? filePreviewUrl(filePath) : null;
}

function localAttachmentPath(href: string, currentFilePath?: string | null): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return null;
  }

  const filePath = resolveAttachmentPath(trimmed, currentFilePath);
  if (!filePath) return null;
  if (!getFileExtension(filePath) || getFileKind(filePath) === 'markdown') return null;
  return filePath;
}

/** 自定义 marked renderer：将 [[wikilink]] 渲染为可点击链接 */
export function renderMarkdown(content: string, currentFilePath?: string | null): string {
  // 先将 [[wikilink]] 转为 HTML 链接标记，再经过 marked 处理
  // 但 marked 会 escape HTML，所以我们需要用 marked 扩展机制
  // 策略：使用 marked 的自定义 tokenizer + renderer
  const markedInstance = new marked.Renderer();
  const renderLink = markedInstance.link.bind(markedInstance);
  const renderImage = markedInstance.image.bind(markedInstance);
  markedInstance.html = (html: string) => escapeHtml(html);
  markedInstance.link = (href, title, text) => {
    if (!hasSafeUrl(href, false)) return text;
    const rendered = renderLink(href, title, text);
    const attachmentPath = localAttachmentPath(href, currentFilePath);
    return attachmentPath
      ? rendered.replace('<a ', `<a data-attachment-path="${escapeHtml(attachmentPath)}" `)
      : rendered;
  };
  markedInstance.image = (href, title, text) => {
    if (!hasSafeUrl(href, true)) return escapeHtml(text);
    const source = imageSource(href, currentFilePath);
    return source ? renderImage(source, title, text) : escapeHtml(text);
  };
  // 存储解析出的 wikilink 信息
  const wikilinks: Array<{ placeholder: string; title: string; alias: string }> = [];
  let idx = 0;

  // 预处理：将 wikilink 替换为唯一占位符
  const processed = content.replace(WIKILINK_RE, (_match, title, alias) => {
    const display = (alias || title).trim();
    const target = title.trim();
    const placeholder = `WIKILINKTOKEN${idx}END`;
    wikilinks.push({ placeholder, title: target, alias: display });
    idx++;
    return placeholder;
  });

  markedInstance.text = (text: string) => {
    // 检查是否包含占位符
    let result = text;
    for (const wl of wikilinks) {
      if (result.includes(wl.placeholder)) {
        result = result.replace(
          wl.placeholder,
          `<a class="wikilink cursor-pointer" data-target="${escapeHtml(wl.title)}">${escapeHtml(wl.alias)}</a>`
        );
      }
    }
    return result;
  };

  const html = marked.parse(processed, { renderer: markedInstance, breaks: true, gfm: true }) as string;
  return html;
}

export function MarkdownPreview({ content, currentFilePath, onWikilinkClick, onAttachmentClick }: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(content, currentFilePath), [content, currentFilePath]);

  if (!content.trim()) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        暂无内容
      </div>
    );
  }

  return (
    <div className="reading-preview h-full overflow-y-auto">
      <article
        className="reading-article"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const attachmentLink = target.closest<HTMLAnchorElement>('a[data-attachment-path]');
          const attachmentPath = attachmentLink?.dataset.attachmentPath;
          if (attachmentPath && onAttachmentClick) {
            e.preventDefault();
            onAttachmentClick(attachmentPath);
            return;
          }
          if (target.classList.contains('wikilink')) {
            const noteTitle = target.getAttribute('data-target');
            if (noteTitle && onWikilinkClick) {
              onWikilinkClick(noteTitle);
            }
          }
        }}
      />
    </div>
  );
}
