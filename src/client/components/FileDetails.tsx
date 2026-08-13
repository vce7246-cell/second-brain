import { useState } from 'react';
import { getFileExtension } from '../../shared/file-types.js';
import { markdownAttachmentReference } from '../lib/attachments.js';
import { useFileMetadata } from '../hooks/useFileMetadata.js';
import { InlineNotice } from './InlineNotice.js';

interface FileDetailsProps {
  filePath: string;
  typeLabel: string;
  capability: string;
  refreshKey?: number;
  compact?: boolean;
  insertTarget?: string | null;
  onInsertReference?: (reference: string) => void;
}

function fileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function folderName(filePath: string): string {
  const parts = filePath.split('/');
  parts.pop();
  return parts.length ? parts.join('/') : '根目录';
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(mtimeMs: number): string {
  return new Date(mtimeMs).toLocaleString('zh-CN');
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('浏览器不允许写入剪贴板');
}

export function FileDetails({
  filePath,
  typeLabel,
  capability,
  refreshKey = 0,
  compact = false,
  insertTarget = null,
  onInsertReference,
}: FileDetailsProps) {
  const { metadata, error } = useFileMetadata(filePath, refreshKey);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const extension = metadata?.extension ?? getFileExtension(filePath);
  const rows: Array<readonly [string, string]> = [
    ['文件名', fileName(filePath)],
    ['所在位置', folderName(filePath)],
    ['扩展名', extension ?? '无扩展名'],
    ['类型', typeLabel],
    ['文件大小', metadata ? formatSize(metadata.size) : '加载中...'],
    ['修改时间', metadata ? formatDate(metadata.mtimeMs) : '加载中...'],
    ['当前能力', capability],
  ];
  const buttonClass = 'rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50';
  const reference = markdownAttachmentReference(filePath, insertTarget);

  async function handleCopy(label: string, value: string): Promise<void> {
    setCopyStatus(null);
    setCopyError(null);
    try {
      await copyText(value);
      setCopyStatus(`已复制：${label}`);
    } catch (copyFailure) {
      setCopyError(copyFailure instanceof Error ? copyFailure.message : '复制失败');
    }
  }

  return (
    <>
      {error && (
        <InlineNotice tone="warning" className={`${compact ? 'mb-3' : 'mt-4'} rounded`}>
          文件元数据加载失败：{error}
        </InlineNotice>
      )}
      <div className={`${compact ? '' : 'mt-5'} flex flex-wrap gap-2`}>
        <button
          type="button"
          className={buttonClass}
          onClick={() => void handleCopy('相对路径', filePath)}
        >
          复制路径
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => void handleCopy('Markdown 引用', reference)}
        >
          复制 Markdown 引用
        </button>
        {insertTarget && onInsertReference && (
          <button
            type="button"
            className={buttonClass}
            title={`插入到 ${insertTarget}`}
            onClick={() => {
              onInsertReference(reference);
              setCopyError(null);
              setCopyStatus('已插入到当前笔记');
            }}
          >
            插入到当前笔记
          </button>
        )}
      </div>
      {copyStatus && (
        <InlineNotice tone="info" className="mt-3 rounded">
          {copyStatus}
        </InlineNotice>
      )}
      {copyError && (
        <InlineNotice tone="warning" className="mt-3 rounded">
          复制失败：{copyError}
        </InlineNotice>
      )}
      <dl className="mt-3 divide-y divide-gray-100 rounded border border-gray-100 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className={`grid ${compact ? 'grid-cols-[76px_1fr] gap-2' : 'grid-cols-[88px_1fr] gap-3'} px-3 py-2`}>
            <dt className="text-gray-400">{label}</dt>
            <dd className="break-words text-gray-700">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
