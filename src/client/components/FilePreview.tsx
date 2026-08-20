import { useEffect, useState } from 'react';
import type { PreviewFileKind } from '../../shared/file-types.js';
import { useTextFilePreview } from '../hooks/useTextFilePreview.js';
import { filePreviewUrl } from '../lib/api.js';
import { KnowledgeSidebar } from './KnowledgeSidebar.js';
import { ViewState } from './ViewState.js';

interface FilePreviewProps {
  filePath: string;
  kind: PreviewFileKind;
  revision: number;
  insertTarget?: string | null;
  onInsertReference?: (reference: string) => void;
  linkStoreVersion?: number;
  onNavigate?: (filePath: string) => void;
}

function kindIcon(kind: PreviewFileKind): string {
  switch (kind) {
    case 'text': return 'TXT';
    case 'drawio': return 'DRAW';
    case 'image': return 'IMG';
    case 'pdf': return 'PDF';
    case 'audio': return 'AUD';
    case 'video': return 'VID';
  }
}

function typeLabel(kind: PreviewFileKind): string {
  switch (kind) {
    case 'text': return '文本 / 代码文件';
    case 'drawio': return 'Draw.io 图表';
    case 'image': return '图片 / 导出图';
    case 'pdf': return 'PDF 文档';
    case 'audio': return '音频文件';
    case 'video': return '视频文件';
  }
}

function capabilitySummary(kind: PreviewFileKind): string {
  switch (kind) {
    case 'text': return '最多 1 MB 的 UTF-8 纯文本只读预览；不会执行 HTML 或代码。';
    case 'drawio': return '最多 1 MB 的 Draw.io XML 只读结构预览；不会执行或改写图表。';
    case 'image': return '只读预览；适合查看图片和 .drawio.svg/.drawio.png 导出图。';
    case 'pdf': return '浏览器内只读预览；不会解析、编辑或上传内容。';
    case 'audio': return '使用浏览器原生控件在本地播放；不会上传内容。';
    case 'video': return '使用浏览器原生控件在本地播放；不会上传内容。';
  }
}

function DrawioPreview({ content }: { content: string }) {
  const document = new DOMParser().parseFromString(content, 'application/xml');
  const hasParserError = document.querySelector('parsererror') !== null;
  const pages = Array.from(document.getElementsByTagName('diagram'));
  const cells = document.getElementsByTagName('mxCell').length;
  const pageNames = pages.map((page, index) => page.getAttribute('name') || `页面 ${index + 1}`);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto rounded border border-gray-200 bg-white p-5">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-600">DIAGRAM SOURCE</p>
        <h2 className="text-base font-medium text-gray-800">Draw.io 图表源文件</h2>
        <p className="mt-2 text-xs leading-5 text-gray-500">
          这是安全的只读结构预览。SecondBrain 不会执行 XML，也不会修改原文件；需要编辑时可用 diagrams.net 打开原文件。
        </p>
      </div>
      {hasParserError ? (
        <ViewState title="XML 结构无法解析" detail="仍可查看原始文本，但无法生成页面统计。" tone="danger" compact />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded border border-gray-100 bg-gray-50 p-3"><strong className="block text-sm text-gray-800">{pages.length}</strong><span className="text-xs text-gray-500">页面</span></div>
          <div className="rounded border border-gray-100 bg-gray-50 p-3"><strong className="block text-sm text-gray-800">{cells}</strong><span className="text-xs text-gray-500">图形单元</span></div>
        </div>
      )}
      {pageNames.length > 0 && <p className="text-xs text-gray-500">页面：{pageNames.join('、')}</p>}
      <details>
        <summary className="cursor-pointer text-xs text-blue-600">查看 XML 源文本</summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-3 font-mono text-[11px] leading-5 text-gray-600">{content}</pre>
      </details>
    </div>
  );
}

export function FilePreview({
  filePath,
  kind,
  revision,
  insertTarget = null,
  onInsertReference,
  linkStoreVersion = 0,
  onNavigate,
}: FilePreviewProps) {
  const [mediaFailed, setMediaFailed] = useState(false);
  const url = filePreviewUrl(filePath, revision);
  const textPreview = useTextFilePreview(filePath, revision, kind === 'text' || kind === 'drawio');

  useEffect(() => setMediaFailed(false), [filePath, revision]);

  function previewContent(): JSX.Element {
    if (kind === 'text' || kind === 'drawio') {
      if (textPreview.loading) return <ViewState title="正在加载文本预览" busy />;
      if (textPreview.error) {
        return <ViewState title="文本预览加载失败" detail={textPreview.error} tone="danger" />;
      }
      if (kind === 'drawio') return <DrawioPreview content={textPreview.content} />;
      return (
        <pre className="h-full overflow-auto whitespace-pre-wrap break-words rounded border border-gray-200 bg-white p-4 font-mono text-xs leading-5 text-gray-700">
          {textPreview.content}
        </pre>
      );
    }
    if (mediaFailed) {
      return <ViewState title="文件无法加载" detail="文件可能已移动，或浏览器不支持该媒体编码。" tone="danger" />;
    }
    if (kind === 'image') {
      return <img className="h-full w-full object-contain" src={url} alt={filePath} onError={() => setMediaFailed(true)} />;
    }
    if (kind === 'pdf') {
      return <iframe className="h-full w-full rounded border border-gray-200 bg-white" src={url} title={`${filePath} PDF 预览`} />;
    }
    if (kind === 'audio') {
      return (
        <div className="flex h-full items-center justify-center">
          <audio className="w-full max-w-xl" controls preload="metadata" src={url} onError={() => setMediaFailed(true)}>
            浏览器不支持音频播放。
          </audio>
        </div>
      );
    }
    return (
      <video className="h-full w-full object-contain" controls preload="metadata" playsInline src={url} onError={() => setMediaFailed(true)}>
        浏览器不支持视频播放。
      </video>
    );
  }

  return (
    <section className="flex h-full min-w-0 flex-col bg-gray-100">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3">
        <span className="kind-chip" aria-hidden="true">{kindIcon(kind)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-700" title={filePath}>{filePath}</span>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
          {kind === 'audio' || kind === 'video' ? '本地播放' : '只读预览'}
        </span>
        <a className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50" href={url} target="_blank" rel="noreferrer">
          新标签页打开
        </a>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 p-4">{previewContent()}</div>
        <KnowledgeSidebar
          filePath={filePath}
          typeLabel={typeLabel(kind)}
          capability={capabilitySummary(kind)}
          refreshKey={revision}
          insertTarget={insertTarget}
          onInsertReference={onInsertReference}
          linkStoreVersion={linkStoreVersion}
          onNavigate={onNavigate}
        />
      </div>
    </section>
  );
}
