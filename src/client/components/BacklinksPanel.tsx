import { useState, useEffect, useCallback } from 'react';
import type { LinkInfo, UnlinkedMention } from '../types/index.js';
import { fetchMergedLinks, fetchUnlinkedMentions, addLink } from '../lib/api.js';
import { ViewState } from './ViewState.js';
import { InlineNotice } from './InlineNotice.js';

interface BacklinksPanelProps {
  filePath: string | null;
  onNavigate?: (filePath: string) => void;
  /** 链接数据变更版本号 */
  linkStoreVersion?: number;
  /** 非 Markdown 文件不执行正文提及扫描 */
  showUnlinkedMentions?: boolean;
}

export function BacklinksPanel({
  filePath,
  onNavigate,
  linkStoreVersion = 0,
  showUnlinkedMentions = true,
}: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<LinkInfo[]>([]);
  const [mentions, setMentions] = useState<UnlinkedMention[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [mentionError, setMentionError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyMention, setBusyMention] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!filePath) {
      setBacklinks([]);
      setMentions([]);
      setLinkError(null);
      setMentionError(null);
      setActionError(null);
      return;
    }

    setLoading(true);
    setLinkError(null);
    setMentionError(null);

    const [linkResult, mentionResult] = await Promise.allSettled([
      fetchMergedLinks(filePath),
      showUnlinkedMentions
        ? fetchUnlinkedMentions(filePath)
        : Promise.resolve({ mentions: [] }),
    ]);

    if (linkResult.status === 'fulfilled') {
      setBacklinks(linkResult.value.backlinks);
    } else {
      setBacklinks([]);
      setLinkError('反向链接加载失败');
    }

    if (mentionResult.status === 'fulfilled') {
      setMentions(mentionResult.value.mentions);
    } else {
      setMentions([]);
      setMentionError('未链接提及检测失败');
    }

    setLoading(false);
  }, [filePath, showUnlinkedMentions]);

  useEffect(() => { load(); }, [load, linkStoreVersion]);

  async function handleConnectMention(mention: UnlinkedMention) {
    setBusyMention(mention.targetPath);
    setActionError(null);
    try {
      await addLink(mention.sourcePath, mention.targetPath);
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '链接创建失败');
    } finally {
      setBusyMention(null);
    }
  }

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 p-3">
        打开笔记查看反向链接
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-200">
        <h3 className="text-xs font-medium text-gray-500">
          反向链接
          {!loading && backlinks.length > 0 && (
            <span className="ml-1 text-gray-400">({backlinks.length})</span>
          )}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <ViewState title="正在加载反向链接" detail="正在检查已链接来源和可转成链接的提及。" busy compact />
        ) : (
          <>
            {actionError && (
              <InlineNotice tone="danger" className="mx-3 mt-3 rounded">
                {actionError}
              </InlineNotice>
            )}

            {linkError ? (
              <ViewState
                title="反向链接加载失败"
                detail={linkError}
                actionLabel="重试"
                onAction={() => void load()}
                tone="danger"
                compact
              />
            ) : backlinks.length > 0 ? (
              <>
                <p className="px-3 pt-2 text-xs text-gray-400">已链接</p>
                <ul className="py-1">
                  {backlinks.map((link, i) => (
                    <li key={`${link.source}-${i}`}>
                      <button
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 transition-colors group"
                        onClick={() => { onNavigate?.(link.source); }}
                      >
                        <span className="text-blue-600 group-hover:underline">{link.source}</span>
                        {link.sourceType === 'ui' && (
                          <span className="text-gray-400 ml-1 text-[10px]">界面</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ViewState title="暂无反向链接" detail="当其他知识条目用 wikilink 或界面链接指向这里时，会显示在这里。" compact />
            )}

            {showUnlinkedMentions && (mentionError ? (
              <ViewState
                title="未链接提及检测失败"
                detail={mentionError}
                actionLabel="重试"
                onAction={() => void load()}
                tone="danger"
                compact
              />
            ) : mentions.length > 0 ? (
              <>
                <p className="px-3 pt-2 text-xs text-gray-400">未链接提及</p>
                <ul className="py-1">
                  {mentions.map((mention, i) => (
                    <li key={`${mention.targetPath}-${i}`} className="px-3 py-1 flex items-center gap-1">
                      <button
                        className="flex-1 text-left text-xs text-gray-500 hover:text-blue-600"
                        onClick={() => { onNavigate?.(mention.targetPath); }}
                      >
                        {mention.targetPath}
                        <span className="text-gray-400 ml-1">含 "{mention.matchedText}"</span>
                      </button>
                      <button
                        className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 shrink-0 disabled:opacity-50"
                        onClick={() => handleConnectMention(mention)}
                        disabled={Boolean(busyMention)}
                      >
                        {busyMention === mention.targetPath ? '链接中' : '链接'}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ViewState title="暂无未链接提及" detail="系统没有发现当前笔记里提到其他笔记标题但尚未建立链接的内容。" compact />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
