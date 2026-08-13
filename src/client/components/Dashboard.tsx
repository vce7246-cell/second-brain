import { useState, useEffect, useCallback } from 'react';
import type { DashboardData, DashboardItem } from '../types/index.js';
import { fetchDashboard } from '../lib/api.js';
import { fileKindIcon, fileKindLabel } from '../lib/file-presentation.js';
import { ViewState } from './ViewState.js';

interface DashboardProps {
  onNavigate?: (filePath: string) => void;
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

export function Dashboard({ onNavigate, refreshKey = 0 }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        {data.totalItems === 0 ? (
          <ViewState
            title="这个知识库还没有内容"
            detail="新建笔记或导入本地文件后，概览会开始呈现你的知识结构。"
          />
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
