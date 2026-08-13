import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { fetchGraph, addLink } from '../lib/api';
import { ViewState } from './ViewState.js';
import {
  LARGE_GRAPH_NODE_LIMIT,
  bfsSubgraph,
  computeNodeStyles,
  type GraphData,
  type GraphLink,
  type GraphNode,
} from './graph-model.js';

export interface GraphViewProps {
  onNodeClick?: (filePath: string) => void;
  /** Increment to trigger a full graph reload (e.g. after external link changes) */
  linkStoreVersion?: number;
  /** Enable local-graph mode (BFS from centerNode) */
  localMode?: boolean;
  /** Center node file-path for local-graph mode */
  centerNode?: string | null;
  /** BFS depth for local-graph mode (default 1) */
  localDepth?: number;
}

export function GraphView({
  onNodeClick,
  linkStoreVersion = 0,
  localMode,
  centerNode,
  localDepth = 1,
}: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [allowLargeGraph, setAllowLargeGraph] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGraph()
      .then((d) => {
        if (!cancelled) {
          setData(d as GraphData);
          setAllowLargeGraph(false);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [linkStoreVersion, reloadTick]);

  const displayData = useMemo<GraphData | null>(() => {
    if (!data) return null;
    if (localMode && centerNode) {
      return bfsSubgraph(data.nodes, data.links, centerNode, localDepth);
    }
    return data;
  }, [data, localMode, centerNode, localDepth]);

  const triggerReload = useCallback(() => setReloadTick((t) => t + 1), []);
  const isLargeFullGraph = !localMode
    && !allowLargeGraph
    && Boolean(displayData && displayData.nodes.length > LARGE_GRAPH_NODE_LIMIT);

  const renderGraph = useCallback(
    (svg: SVGSVGElement, graphData: GraphData) => {
      const W = svg.clientWidth;
      const H = svg.clientHeight;
      const theme = getComputedStyle(svg);
      const lineColor = theme.getPropertyValue('--sb-line-strong').trim() || '#cfc2af';
      const accentColor = theme.getPropertyValue('--sb-accent').trim() || '#9b4c34';
      const paperColor = theme.getPropertyValue('--sb-paper').trim() || '#fffdf7';
      const textColor = theme.getPropertyValue('--sb-muted').trim() || '#746b60';

      d3.select(svg).selectAll('*').remove();

      d3.select(svg).on('mousemove.graphlink', null);
      d3.select(svg).on('mouseup.graphlink', null);

      const g = d3.select(svg).append('g');

      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => g.attr('transform', event.transform));
      d3.select(svg).call(zoom);

      const simulation = d3.forceSimulation<GraphNode>(graphData.nodes)
        .force(
          'link',
          d3.forceLink<GraphNode, GraphLink>(graphData.links)
            .id((d) => d.id)
            .distance(100),
        )
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(W / 2, H / 2))
        .force('collision', d3.forceCollide(40));

      const nodeStyles = computeNodeStyles(graphData.nodes, graphData.links);

      const link = g
        .append('g')
        .attr('stroke', lineColor)
        .attr('stroke-opacity', 0.4)
        .attr('stroke-width', 1.5)
        .selectAll('line')
        .data(graphData.links)
        .join('line');

      let dragSrc: GraphNode | null = null;
      let dragLine: d3.Selection<SVGLineElement, unknown, null, undefined> | null = null;

      const node = g
        .append('g')
        .selectAll<SVGGElement, GraphNode>('g')
        .data(graphData.nodes)
        .join('g')
        .call(
          d3.drag<SVGGElement, GraphNode>()
            .on('start', function (event, d) {
              if (event.sourceEvent.shiftKey) {
                // Enter link-drag mode
                dragSrc = d;
                simulation.stop();
                const x0 = d.x ?? 0;
                const y0 = d.y ?? 0;
                dragLine = g
                  .append('line')
                  .attr('stroke', accentColor)
                  .attr('stroke-width', 2)
                  .attr('stroke-dasharray', '6,4')
                  .attr('x1', x0)
                  .attr('y1', y0)
                  .attr('x2', x0)
                  .attr('y2', y0);
                return;
              }
              // Normal drag
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on('drag', function (event, d) {
              if (dragSrc) return; // link-drag: svg-level handlers take over
              d.fx = event.x;
              d.fy = event.y;
            })
            .on('end', function (event, d) {
              if (dragSrc) return;
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            }),
        );

      node
        .append('circle')
        .attr('r', (d) => nodeStyles.get(d.id)?.radius ?? 6)
        .attr('fill', (d) => nodeStyles.get(d.id)?.color ?? accentColor)
        .attr('stroke', paperColor)
        .attr('stroke-width', 2);

      node
        .append('text')
        .text((d) => (d.label.length > 15 ? d.label.slice(0, 15) + '…' : d.label))
        .attr('x', 10)
        .attr('y', 4)
        .attr('font-size', '11px')
        .attr('fill', textColor);

      node.append('title').text((d) => `${d.label} · ${d.kind}`);

      node.on('click', (_event, d) => {
        if (onNodeClick) onNodeClick(d.id);
      });

      d3.select(svg).on('mousemove.graphlink', (event) => {
        if (!dragSrc || !dragLine) return;
        const gEl = g.node();
        if (!gEl) return;
        const [mx, my] = d3.pointer(event, gEl);
        dragLine.attr('x2', mx).attr('y2', my);
      });

      d3.select(svg).on('mouseup.graphlink', async (event) => {
        if (!dragSrc) return;
        const srcId = dragSrc.id;
        const line = dragLine;
        dragSrc = null;
        dragLine = null;

        if (line) line.remove();

        const gEl = g.node();
        if (!gEl) return;

        simulation.stop();
        const [mx, my] = d3.pointer(event, gEl);

        let target: GraphNode | null = null;
        let best = 20;
        for (const n of graphData.nodes) {
          if (n.id === srcId || n.x == null || n.y == null) continue;
          const d = Math.hypot(n.x - mx, n.y - my);
          if (d < best) {
            best = d;
            target = n;
          }
        }

        if (target) {
          try {
            await addLink(srcId, target.id);
            triggerReload();
          } catch {
            /* server error – silently ignore */
          }
        }

        simulation.alphaTarget(0.3).restart();
      });

      simulation.on('tick', () => {
        link
          .attr('x1', (d) => (d.source as GraphNode).x!)
          .attr('y1', (d) => (d.source as GraphNode).y!)
          .attr('x2', (d) => (d.target as GraphNode).x!)
          .attr('y2', (d) => (d.target as GraphNode).y!);

        node.attr('transform', (d) => `translate(${d.x},${d.y})`);
      });
    },
    [onNodeClick, triggerReload],
  );

  useEffect(() => {
    if (!svgRef.current || !displayData || isLargeFullGraph) return;
    const svg = svgRef.current;
    const observer = new ResizeObserver(() => {
      if (displayData.nodes.length > 0) renderGraph(svg, displayData);
    });
    observer.observe(svg);
    renderGraph(svg, displayData);
    return () => observer.disconnect();
  }, [displayData, isLargeFullGraph, renderGraph]);

  if (loading) {
    return (
      <ViewState title="正在加载图谱" detail="正在整理笔记、附件和链接关系。" busy />
    );
  }

  if (error) {
    return (
      <ViewState title="图谱加载失败" detail={error} actionLabel="重试" onAction={triggerReload} tone="danger" />
    );
  }

  if (!displayData || displayData.nodes.length === 0) {
    return (
      <ViewState
        title={localMode ? '当前知识条目没有可展示的局部图谱' : '暂无可展示的图谱'}
        detail={localMode ? '可以先为这个条目添加 wikilink 或界面链接。' : '导入或创建知识条目后，这里会显示笔记、附件及其关系。'}
      />
    );
  }

  if (isLargeFullGraph) {
    return (
      <ViewState
        title="全局图谱较大"
        detail={`${displayData.nodes.length} 个节点、${displayData.links.length} 条连线。建议先从某篇笔记进入局部图谱；确实需要全局视角时再渲染全图。`}
        actionLabel="仍然渲染全图"
        onAction={() => setAllowLargeGraph(true)}
      />
    );
  }

  return (
    <div className="h-full w-full relative">
      <svg ref={svgRef} className="h-full w-full bg-gray-50" />
      <div className="absolute bottom-3 left-3 text-xs text-gray-400 select-none pointer-events-none">
        {displayData.nodes.length} 节点 · {displayData.links.length} 连线 · 滚轮缩放 · 拖拽节点 · Shift+拖拽连线
      </div>
    </div>
  );
}
