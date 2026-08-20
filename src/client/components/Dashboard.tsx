import { useState, useEffect, useCallback } from 'react';
import type { DashboardData, DashboardItem } from '../types/index.js';
import { fetchDashboard } from '../lib/api.js';
import { fetchFile, saveFile, searchNotes } from '../lib/api.js';
import { fileKindIcon, fileKindLabel } from '../lib/file-presentation.js';
import { ViewState } from './ViewState.js';

interface DashboardProps {
  onNavigate?: (filePath: string) => void;
  onStartWriting?: () => void;
  refreshKey?: number;
}

function formatTime(ms: number): string {
  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

function DashboardRow({
  item,
  meta,
  onNavigate,
}: {
  item: DashboardItem;
  meta: string;
  onNavigate?: (filePath: string) => void;
}) {
  return (
    <button
      className="knowledge-row"
      onClick={() => onNavigate?.(item.path)}
      title={`打开 ${item.path}`}
    >
      <span className="kind-chip" aria-label={fileKindLabel(item.kind)}>{fileKindIcon(item.kind)}</span>
      <span className="min-w-0 flex-1">
        <span className="knowledge-row-title">{item.title || item.path}</span>
        <span className="knowledge-row-path">{item.path}</span>
      </span>
      <span className="knowledge-row-meta">{meta}</span>
    </button>
  );
}

export function Dashboard({ onNavigate, onStartWriting, refreshKey = 0 }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [repairing, setRepairing] = useState<{ source: string; target: string } | null>(null);
  const [repairQuery, setRepairQuery] = useState('');
  const [repairResults, setRepairResults] = useState<Array<{ path: string; title: string }>>([]);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDashboard());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return <ViewState title="正在加载概览" detail="正在统计笔记、附件、关系、标签和最近修改。" busy />;
  }

  if (error) {
    return <ViewState title="概览加载失败" detail={error} actionLabel="重试" onAction={load} tone="danger" />;
  }

  if (!data) {
    return <ViewState title="暂无概览数据" detail="知识库准备好后，这里会显示整体结构。" />;
  }

  const hasRelationships = data.totalLinks > 0;

  async function copyLinkTarget(target: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(`[[${target}]]`);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => current === key ? null : current), 1600);
    } catch {
      setCopiedKey(null);
    }
  }

  useEffect(() => {
    if (!repairing || repairQuery.trim().length < 1) {
      setRepairResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchNotes(repairQuery.trim(), 10)
        .then((response) => setRepairResults(response.results.filter((item) => item.path !== repairing.source)))
        .catch(() => setRepairResults([]));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [repairQuery, repairing]);

  async function repairBrokenLink(result: { path: string; title: string }): Promise<void> {
    if (!repairing) return;
    setRepairBusy(true);
    setRepairError(null);
    try {
      const loaded = await fetchFile(repairing.source);
      const escapedTarget = repairing.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\[\\[${escapedTarget}(?:\\|([^\\]]+))?\\]\\]`);
      if (!pattern.test(loaded.content)) throw new Error('未找到对应的原始链接，文件可能已被修改。');
      const nextContent = loaded.content.replace(pattern, (_match, alias: string | undefined) => `[[${result.title}${alias ? `|${alias}` : ''}]]`);
      await saveFile(repairing.source, nextContent, loaded.version);
      setRepairing(null);
      setRepairQuery('');
      await load();
    } catch (repairFailure) {
      setRepairError(repairFailure instanceof Error ? repairFailure.message : '链接修复失败');
    } finally {
      setRepairBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="dashboard-page">
        <header className="dashboard-hero">
          <div>
            <p className="dashboard-kicker">LOCAL KNOWLEDGE OVERVIEW</p>
            <h1 className="dashboard-title">先看结构，再决定今天要整理什么。</h1>
            <p className="dashboard-copy">
              从最近修改、知识关系和目录分布里，找到下一篇值得继续写、继续连接的内容。
            </p>
          </div>
          <p className="dashboard-insight">
            {hasRelationships
              ? `当前已有 ${data.totalLinks} 条关系，可以从核心条目继续向外梳理。`
              : '当前知识条目还没有建立关系，可以从孤立条目开始连接。'}
          </p>
        </header>

        <section className="metric-strip" aria-label="知识库统计">
          <div className="metric"><div className="metric-value">{data.totalItems}</div><div className="metric-label">知识条目</div></div>
          <div className="metric"><div className="metric-value">{data.totalNotes}</div><div className="metric-label">Markdown</div></div>
          <div className="metric"><div className="metric-value">{data.totalAttachments}</div><div className="metric-label">附件</div></div>
          <div className="metric"><div className="metric-value">{data.totalLinks}</div><div className="metric-label">关系</div></div>
          <div className="metric"><div className="metric-value">{data.totalTags}</div><div className="metric-label">手动标签</div></div>
        </section>

        <section className={`health-strip ${data.health.brokenLinks > 0 ? 'is-warning' : 'is-healthy'}`} aria-label="知识库健康检查">
          <div>
            <strong>知识库健康</strong>
            <span>{data.health.brokenLinks > 0 ? '发现需要处理的链接问题。' : '暂未发现失效 wikilink。'}</span>
          </div>
          <div className="health-stats">
            <span><b>{data.health.brokenLinks}</b> 失效链接</span>
            <span><b>{data.health.orphanCount}</b> 孤立条目</span>
            <span><b>{data.health.untaggedAttachments}</b> 未加手动标签附件</span>
          </div>
        </section>
        {(data.health.brokenLinks > 0 || data.health.untaggedAttachments > 0 || data.health.duplicateTitleCount > 0) && (
          <section className="health-details" aria-label="健康问题详情">
            {data.health.brokenLinks > 0 && (
              <details open>
                <summary>失效链接 · {data.health.brokenLinks}</summary>
                <div className="health-detail-list">
                  {data.health.brokenLinkItems.map((item) => (
                    <div key={`${item.source}-${item.target}`} className="health-detail-row">
                      <span className="min-w-0 flex-1 truncate">{item.source}</span>
                      <span className="truncate text-gray-400">→ [[{item.target}]]</span>
                      <button className="health-detail-action" onClick={() => onNavigate?.(item.source)}>打开</button>
                      <button className="health-detail-action" onClick={() => { setRepairing(item); setRepairQuery(''); setRepairError(null); }}>修复</button>
                      <button className="health-detail-action" onClick={() => void copyLinkTarget(item.target, `${item.source}-${item.target}`)}>
                        {copiedKey === `${item.source}-${item.target}` ? '已复制' : '复制'}
                      </button>
                    </div>
                  ))}
                  {data.health.brokenLinks > data.health.brokenLinkItems.length && <p>还有 {data.health.brokenLinks - data.health.brokenLinkItems.length} 条，请逐篇检查。</p>}
                </div>
              </details>
            )}
            {data.health.untaggedAttachments > 0 && (
              <details>
                <summary>未加手动标签附件 · {data.health.untaggedAttachments}</summary>
                <div className="health-detail-list">
                  {data.health.untaggedAttachmentItems.map((item) => (
                    <button key={item.path} className="health-detail-row" onClick={() => onNavigate?.(item.path)}>
                      <span className="min-w-0 flex-1 truncate">{item.title || item.path}</span>
                      <span className="truncate text-gray-400">{item.path}</span>
                    </button>
                  ))}
                </div>
              </details>
            )}
            {data.health.duplicateTitleCount > 0 && (
              <details>
                <summary>重复标题 · {data.health.duplicateTitleCount}</summary>
                <div className="health-detail-list">
                  <p>建议为重复标题改成唯一名称，或使用界面链接连接到明确的文件。</p>
                  {data.health.duplicateTitleItems.map((item) => (
                    <div key={item.title} className="health-detail-row">
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <span className="truncate text-gray-400">{item.paths.join('、')}</span>
                    </div>
                  ))}
                  {data.health.duplicateTitleCount > data.health.duplicateTitleItems.length && <p>还有 {data.health.duplicateTitleCount - data.health.duplicateTitleItems.length} 个重复标题。</p>}
                </div>
              </details>
            )}
          </section>
        )}

        {repairing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onClick={() => !repairBusy && setRepairing(null)}>
            <section className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="repair-link-title">
              <h2 id="repair-link-title" className="text-sm font-semibold text-gray-800">重新选择链接目标</h2>
              <p className="mt-1 text-xs text-gray-400">来源：{repairing.source} · 当前目标：[[{repairing.target}]]</p>
              {repairError && <p className="mt-3 rounded bg-red-50 px-2 py-1.5 text-xs text-red-600">{repairError}</p>}
              <input className="mt-3 w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" placeholder="搜索 Markdown 笔记..." value={repairQuery} onChange={(event) => setRepairQuery(event.target.value)} disabled={repairBusy} autoFocus />
              <div className="mt-2 max-h-48 overflow-y-auto">
                {repairResults.map((result) => <button key={result.path} className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs hover:bg-blue-50" onClick={() => void repairBrokenLink(result)} disabled={repairBusy}><span className="truncate">{result.title}</span><span className="ml-3 truncate text-gray-400">{result.path}</span></button>)}
                {repairQuery && repairResults.length === 0 && <p className="px-2 py-2 text-xs text-gray-400">没有匹配的 Markdown 笔记。</p>}
              </div>
              <div className="mt-3 flex justify-end"><button className="rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50" onClick={() => setRepairing(null)} disabled={repairBusy}>取消</button></div>
            </section>
          </div>
        )}

        {data.totalItems === 0 ? (
          <section className="onboarding-card" aria-labelledby="onboarding-title">
            <div className="onboarding-copy">
              <p className="dashboard-kicker">GET STARTED LOCALLY</p>
              <h2 id="onboarding-title">从一个小入口开始建立你的第二大脑。</h2>
              <p>这里是当前启动的本地知识库。你可以先写一篇 Markdown 笔记，也可以把文件或文件夹直接拖到页面里导入。</p>
              {onStartWriting && (
                <button className="paper-button onboarding-primary" onClick={onStartWriting}>
                  开始写第一篇笔记
                </button>
              )}
            </div>
            <ol className="onboarding-steps">
              <li><strong>写下来</strong><span>在编辑页新建笔记，普通 UTF-8 Markdown 始终归你所有。</span></li>
              <li><strong>拖进来</strong><span>图片、PDF、代码和其他附件会复制到当前知识库。</span></li>
              <li><strong>连起来</strong><span>使用 <code>[[笔记标题]]</code> 或界面链接，关系会出现在图谱中。</span></li>
            </ol>
          </section>
        ) : (
          <div className="dashboard-columns">
            <div className="dashboard-stack">
              {data.recentItems.length > 0 && (
                <section>
                  <div className="dashboard-section-heading">
                    <h2>最近修改</h2>
                    <span>按本地修改时间</span>
                  </div>
                  <div className="knowledge-list">
                    {data.recentItems.map((item) => (
                      <DashboardRow key={item.path} item={item} meta={formatTime(item.mtime)} onNavigate={onNavigate} />
                    ))}
                  </div>
                </section>
              )}

              {data.coreNodes.length > 0 && (
                <section>
                  <div className="dashboard-section-heading">
                    <h2>核心条目</h2>
                    <span>关系最密集的知识入口</span>
                  </div>
                  <div className="knowledge-list">
                    {data.coreNodes.map((item) => (
                      <DashboardRow key={item.path} item={item} meta={`${item.relationCount} 条关系`} onNavigate={onNavigate} />
                    ))}
                  </div>
                </section>
              )}

              {data.orphanItems.length > 0 && (
                <section>
                  <div className="dashboard-section-heading">
                    <h2>孤立条目</h2>
                    <span>{data.orphanItems.length} 个条目尚无关系</span>
                  </div>
                  <div className="knowledge-list">
                    {data.orphanItems.map((item) => (
                      <DashboardRow key={item.path} item={item} meta="建立关系 →" onNavigate={onNavigate} />
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="dashboard-stack">
              {data.folderGroups.length > 0 && (
                <section>
                  <div className="dashboard-section-heading">
                    <h2>目录</h2>
                    <span>{data.folderGroups.length} 个分组</span>
                  </div>
                  {data.folderGroups.map((group) => (
                    <div key={group.name} className="folder-card">
                      <strong>{group.name}</strong>
                      <span>{group.count} 个条目 · {group.linkCount} 条关系</span>
                    </div>
                  ))}
                </section>
              )}
              <div className="dashboard-note">
                <strong>整理建议</strong>
                {data.orphanItems.length > 0
                  ? `优先打开一个孤立条目，为它补充 wikilink 或界面链接。`
                  : '知识条目已经建立基本关系，可以从核心条目检查关联是否仍然准确。'}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
