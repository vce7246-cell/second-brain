# 项目架构记录

> 最后更新: 2026-07-16 12:30 — MVP 完成

## 文件清单
| 文件路径 | 用途 | 依赖项 | 被依赖方 |
|----------|------|--------|----------|
| `package.json` | 项目配置 + 依赖声明 | Node.js, npm | 所有模块 |
| `tsconfig.json` | TypeScript 编译配置 | TypeScript 5 | 所有 .ts/.tsx 文件 |
| `vite.config.ts` | Vite 构建 + API 代理配置 | Vite 5, React 插件 | 前端构建流程 |
| `tailwind.config.js` | Tailwind CSS 内容扫描路径 | Tailwind 3, PostCSS | 前端样式 |
| `postcss.config.js` | PostCSS 插件链 | tailwindcss, autoprefixer | 前端样式构建 |
| `index.html` | Vite 入口 HTML | Vite | 浏览器 |
| `src/shared/constants.ts` | 前后端共享常量 | 无 | server/, client/ |
| `src/cli.ts` | CLI 入口（`sb start` 命令） | commander, express | 用户 |
| `src/server/index.ts` | Express 服务器入口 | express, ws, routes, indexer, watcher | cli.ts |
| `src/server/ws.ts` | WebSocket 管理器 | ws | index.ts, watcher.ts |
| `src/server/routes/files.ts` | 文件 CRUD API + 图片上传 | express, zod, image-store | index.ts |
| `src/server/routes/notes.ts` | 笔记链接/搜索/图谱 API | express, zod, indexer | index.ts |
| `src/server/services/indexer.ts` | Wikilink 全量解析 + 反向索引 | fs, path, gray-matter | notes.ts, watcher.ts |
| `src/server/services/watcher.ts` | chokidar 文件监听 + WS 广播 | chokidar, ws.ts, indexer | index.ts |
| `src/server/services/image-store.ts` | 图片保存（剪贴板粘贴） | fs, path | routes/files.ts |
| `src/client/main.tsx` | ReactDOM 入口 | react, react-dom, App | index.html |
| `src/client/App.tsx` | 根组件 — 三栏布局 + 状态管理 | react, FileTree, Editor, MarkdownPreview, BacklinksPanel, GraphView, hooks | main.tsx |
| `src/client/types/index.ts` | 共享类型定义 | 无 | client/ |
| `src/client/lib/api.ts` | 前端 API 客户端 | 无 | components/ |
| `src/client/components/FileTree.tsx` | 文件树侧边栏（含 frontmatter 标题） | react, api.ts | App.tsx |
| `src/client/components/Editor.tsx` | CodeMirror 6 编辑器封装 | @uiw/react-codemirror, hooks | App.tsx |
| `src/client/components/MarkdownPreview.tsx` | Markdown 渲染 + wikilink | marked | App.tsx |
| `src/client/components/WikilinkAutocomplete.tsx` | [[ 自动补全 CodeMirror 扩展 | @codemirror/autocomplete, api.ts | Editor.tsx |
| `src/client/components/BacklinksPanel.tsx` | 反向链接列表 | react, api.ts | App.tsx |
| `src/client/components/GraphView.tsx` | D3.js 力导向知识图谱 | d3, react | App.tsx |
| `src/client/hooks/useImagePaste.ts` | 剪贴板图片粘贴 Hook | react, @uiw/react-codemirror | Editor.tsx |
| `src/client/hooks/useWebSocket.ts` | WebSocket 连接管理 + 热更新 | react | App.tsx |

## 模块关系图
```
cli.ts → server/index.ts → routes/files.ts
                          → routes/notes.ts → services/indexer.ts
                          → services/watcher.ts → ws.ts → WebSocket
                          → services/image-store.ts

main.tsx → App.tsx → FileTree.tsx
                    → Editor.tsx → WikilinkAutocomplete.tsx
                                 → hooks/useImagePaste.ts
                    → MarkdownPreview.tsx
                    → BacklinksPanel.tsx
                    → GraphView.tsx
                    → hooks/useWebSocket.ts

API Client (api.ts) ← all frontend components
```

## v2 新增文件
| 文件路径 | 用途 | 依赖项 | 被依赖方 |
|----------|------|--------|----------|
| `src/server/services/link-store.ts` | `.sb/links.json` 读写 + 标签管理 | fs, path, constants | routes/notes.ts, indexer.ts |
| `src/client/components/LinkPanel.tsx` | 界面链接管理面板（添加/删除链接+标签） | react, api.ts | App.tsx |
| `src/client/components/Dashboard.tsx` | 知识库概览仪表盘（统计+核心节点+孤岛+分组） | react, api.ts | App.tsx |
| `src/client/components/TagView.tsx` | 标签视图（文件夹/手动标签分栏+多选过滤） | react, api.ts | App.tsx |
| `src/client/components/QuickSwitcher.tsx` | Ctrl+O 模糊搜索快速跳转弹窗 | react, api.ts | App.tsx |

## v2 修改文件
| 文件路径 | 变更说明 |
|----------|----------|
| `src/shared/constants.ts` | 新增 `SB_DIR`, `LINKS_FILE`, `CONFIG_FILE` |
| `src/client/types/index.ts` | 新增 `UILink`, `LinkStoreData`, `GraphNodeEnriched`, `DashboardData`, `UnlinkedMention`, `TagEntry`；`LinkInfo` 增加 `sourceType` |
| `src/server/services/indexer.ts` | 注入 `LinkStore`，新增 `getMergedLinks/Backlinks/GraphData` 合并 wikilink + UI 链接双数据源 |
| `src/server/routes/notes.ts` | 新增 `createLinksRouter`（10 个端点：链接/标签 CRUD + 仪表盘 + 未链接提及 + 合并图谱） |
| `src/server/index.ts` | 初始化 `LinkStore`，注入 `indexer`，挂载 `createLinksRouter` |
| `src/server/routes/files.ts` | 新增 `POST /api/files/daily-note` 每日笔记端点 |
| `src/client/lib/api.ts` | 新增 `getRequest` + 12 个 v2 API 函数 |
| `src/client/App.tsx` | 5 视图路由（概览/编辑/标签/图谱/局部图谱），集成全部新组件，WS 链接/标签事件处理，Ctrl+O/S 快捷键 |
| `src/client/components/GraphView.tsx` | 拖拽连线创建链接、按文件夹标签着色节点、孤岛节点灰色、局部图谱 BFS 展开 |
| `src/client/components/BacklinksPanel.tsx` | 拆分为已链接+未链接提及两个区域 |
| `src/client/components/FileTree.tsx` | 右键菜单"链接到..." |

## v2 模块关系图
```
.sb/links.json → link-store.ts → routes/notes.ts (createLinksRouter)
                                → indexer.ts (merged data)
                                
App.tsx → Dashboard.tsx
        → TagView.tsx
        → QuickSwitcher.tsx
        → LinkPanel.tsx (right sidebar)
        → BacklinksPanel.tsx (upgraded)
        → GraphView.tsx (upgraded: drag-to-link, tag coloring, local graph)
        → FileTree.tsx (context menu)
```

## 关键设计决策记录
- 2026-07-16: 采用同仓单 package 结构，前端 Vite + 后端 Express 共用 TypeScript 项目
- 2026-07-16: 反向链接使用启动时全量扫描 + 内存缓存，不引入 SQLite
- 2026-07-16: 图片粘贴端点集成在 files.ts 路由中（避免过度拆分）
- 2026-07-16: Editor 采用受控组件模式，内容状态提升到 App 层，实现编辑→预览实时同步
- 2026-07-16: WebSocket 用于文件变更广播（服务端→客户端），REST API 用于读写操作
- 2026-07-21: v2 链接外挂存储到 `.sb/links.json`，不侵入笔记原文；界面链接与 `[[]]` wikilink 双数据源合并展示
- 2026-07-21: 文件夹路径自动作为隐式标签（📁），用户手动标签独立存储（🏷️）
- 2026-07-21: 默认首页从编辑器改为仪表盘，提供知识库全局视图
