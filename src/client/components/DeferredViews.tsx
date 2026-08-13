import { lazy, Suspense, type ComponentProps, type ReactNode } from 'react';
import type { Editor as EditorComponent } from './Editor.js';
import type { GraphView as GraphViewComponent } from './GraphView.js';
import type { MarkdownPreview as MarkdownPreviewComponent } from './MarkdownPreview.js';
import type { QuickSwitcher as QuickSwitcherComponent } from './QuickSwitcher.js';
import type { TagView as TagViewComponent } from './TagView.js';
import type { SearchView as SearchViewComponent } from './SearchView.js';
import { ViewState } from './ViewState.js';

const DeferredEditor = lazy(() => import('./Editor.js').then((mod) => ({ default: mod.Editor })));
const DeferredGraphView = lazy(() => import('./GraphView.js').then((mod) => ({ default: mod.GraphView })));
const DeferredMarkdownPreview = lazy(() => import('./MarkdownPreview.js').then((mod) => ({ default: mod.MarkdownPreview })));
const DeferredQuickSwitcher = lazy(() => import('./QuickSwitcher.js').then((mod) => ({ default: mod.QuickSwitcher })));
const DeferredTagView = lazy(() => import('./TagView.js').then((mod) => ({ default: mod.TagView })));
const DeferredSearchView = lazy(() => import('./SearchView.js').then((mod) => ({ default: mod.SearchView })));

type EditorProps = ComponentProps<typeof EditorComponent>;
type GraphViewProps = ComponentProps<typeof GraphViewComponent>;
type MarkdownPreviewProps = ComponentProps<typeof MarkdownPreviewComponent>;
type QuickSwitcherProps = ComponentProps<typeof QuickSwitcherComponent>;
type TagViewProps = ComponentProps<typeof TagViewComponent>;
type SearchViewProps = ComponentProps<typeof SearchViewComponent>;

function DeferredShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Suspense fallback={<ViewState title={title} busy />}>
      {children}
    </Suspense>
  );
}

export function Editor(props: EditorProps) {
  return (
    <DeferredShell title="正在加载编辑器">
      <DeferredEditor {...props} />
    </DeferredShell>
  );
}

export function GraphView(props: GraphViewProps) {
  return (
    <DeferredShell title="正在加载图谱视图">
      <DeferredGraphView {...props} />
    </DeferredShell>
  );
}

export function MarkdownPreview(props: MarkdownPreviewProps) {
  return (
    <DeferredShell title="正在加载预览">
      <DeferredMarkdownPreview {...props} />
    </DeferredShell>
  );
}

export function QuickSwitcher(props: QuickSwitcherProps) {
  return (
    <DeferredShell title="正在加载快速切换">
      <DeferredQuickSwitcher {...props} />
    </DeferredShell>
  );
}

export function TagView(props: TagViewProps) {
  return (
    <DeferredShell title="正在加载标签视图">
      <DeferredTagView {...props} />
    </DeferredShell>
  );
}

export function SearchView(props: SearchViewProps) {
  return (
    <DeferredShell title="正在加载搜索视图">
      <DeferredSearchView {...props} />
    </DeferredShell>
  );
}
