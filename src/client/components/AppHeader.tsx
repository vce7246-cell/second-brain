export type Panel = 'dashboard' | 'editor' | 'search' | 'graph' | 'tags' | 'local-graph';

interface AppHeaderProps {
  activePanel: Panel;
  hasSelectedKnowledge: boolean;
  creatingDailyNote: boolean;
  onPanelChange: (panel: Panel) => void;
  onDailyNote: () => void;
}

function navButtonClass(active: boolean): string {
  return `app-nav-button${active ? ' is-active' : ''}`;
}

export function AppHeader({
  activePanel,
  hasSelectedKnowledge,
  creatingDailyNote,
  onPanelChange,
  onDailyNote,
}: AppHeaderProps) {
  return (
    <header className="app-header shrink-0">
      <div className="app-brand">
        <strong>SecondBrain Lite</strong>
        <span>LOCAL KNOWLEDGE</span>
      </div>
      <nav className="app-nav" aria-label="主导航">
        <button
          className={navButtonClass(activePanel === 'dashboard')}
          aria-current={activePanel === 'dashboard' ? 'page' : undefined}
          onClick={() => onPanelChange('dashboard')}
        >
          概览
        </button>
        <button
          className={navButtonClass(activePanel === 'editor')}
          aria-current={activePanel === 'editor' ? 'page' : undefined}
          onClick={() => onPanelChange('editor')}
        >
          编辑
        </button>
        <button
          className={navButtonClass(activePanel === 'tags')}
          aria-current={activePanel === 'tags' ? 'page' : undefined}
          onClick={() => onPanelChange('tags')}
        >
          标签
        </button>
        <button
          className={navButtonClass(activePanel === 'search')}
          aria-current={activePanel === 'search' ? 'page' : undefined}
          onClick={() => onPanelChange('search')}
        >
          搜索
        </button>
        <button
          className={navButtonClass(activePanel === 'graph')}
          aria-current={activePanel === 'graph' ? 'page' : undefined}
          onClick={() => onPanelChange('graph')}
        >
          图谱
        </button>
        {hasSelectedKnowledge && (
          <button
            className={navButtonClass(activePanel === 'local-graph')}
            aria-current={activePanel === 'local-graph' ? 'page' : undefined}
            onClick={() => onPanelChange('local-graph')}
          >
            局部图谱
          </button>
        )}
      </nav>
      <div className="app-actions">
        <button
          className="app-action-button"
          onClick={onDailyNote}
          disabled={creatingDailyNote}
        >
          {creatingDailyNote ? '正在创建…' : '今日笔记'}
        </button>
      </div>
    </header>
  );
}
