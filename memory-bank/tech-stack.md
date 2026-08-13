# SecondBrain Lite — 技术选型文档

> 版本: v0.1 | 日期: 2026-07-16 | 基于: product-requirements-document.md v0.2

## 1. 技术栈总览
| 层级 | 选型 | 版本 | 选型理由 |
|------|------|------|----------|
| 运行时 | Node.js | ≥18 | 唯一可同时做文件系统操作 + HTTP 服务的 JS 运行时 |
| 语言 | TypeScript | 5.x | 全栈类型安全，PRD 要求可维护性 |
| 前端框架 | React | 18 | CodeMirror 6 和 D3.js 在 React 生态最成熟 |
| 构建工具 | Vite | 5 | 开发热更新快，React 插件完善 |
| 样式方案 | Tailwind CSS | 3 | 不做主题系统，utility-first 最快出 UI |
| 后端框架 | Express | 4 | 最熟悉的 HTTP 框架，中间件生态完备 |
| API 风格 | REST | — | CRUD 操作天然映射，无需 GraphQL 复杂度 |
| 实时通信 | `ws` | 8 | 轻量 WebSocket，比 Socket.IO 少 80% 体积 |
| Markdown 编辑器 | CodeMirror 6 | 6 | 程序化控制（补全、快捷键），React 绑定 `@uiw/react-codemirror` |
| Markdown 渲染 | `marked` | 12 | 轻量可扩展，自定义 renderer 支持 `[[]]` 语法 |
| 力导向图 | D3.js | 7 | 力导向模拟的唯一生产级实现 |
| 文件监听 | `chokidar` | 3 | 跨平台文件监听的事实标准 |
| Frontmatter 解析 | `gray-matter` | 4 | 轻量、零依赖、2000 万周下载 |
| CLI 参数解析 | `commander` | 12 | 比 `yargs` 更简洁的声明式 API |
| 运行时校验 | Zod | 3 | TypeScript 原生类型推断，API 输入验证 |
| 开发工具 | `tsx` + `concurrently` | — | `tsx` 直接跑 TS 无需编译；`concurrently` 并行启动前后端 |

## 2. 关键决策说明 (ADR)

### 决策 1: Express 而非 Hono
- **背景**: 需要 HTTP 服务器提供 REST API + WebSocket 升级 + 静态文件服务
- **方案对比**:
  - **Express**: 生态最大、中间件最多、文档最丰富。缺点：回调式 API 较旧
  - **Hono**: 更现代、TypeScript-native、更快。缺点：Node.js 适配器是二等公民，中间件生态小
- **最终选择**: Express — MVP 阶段开发速度优先，Express 的 `express.static` 和 `express-ws` 集成零配置
- **风险**: 无明显风险，Express 是维护最久的 Node.js 框架

### 决策 2: `marked` + 自定义扩展 而非 `markdown-it`
- **背景**: 需要在 Markdown 渲染中支持 `[[wikilink]]` 语法
- **方案对比**:
  - **`marked`**: 更轻量（~50KB），扩展方式是通过 `renderer` 和 `tokenizer` 钩子，API 简洁
  - **`markdown-it`**: 插件系统更完善，但体积更大（~120KB），配置更繁琐
- **最终选择**: `marked` — `[[wikilink]]` 只需要自定义一个 inline tokenizer，`marked` 的扩展 API 足够用
- **风险**: `marked` 的 tokenizer API 在不同大版本间有 breaking change，需要锁定版本

### 决策 3: `@uiw/react-codemirror` 而非裸 CodeMirror 6
- **背景**: CodeMirror 6 原生是框架无关的，在 React 中使用需要手动管理 DOM 生命周期
- **方案对比**:
  - **`@uiw/react-codemirror`**: 封装好的 React 组件，自带常用扩展，props 驱动配置
  - **裸 `@codemirror/*`**: 完全控制，但需要手动 `useRef` + `useEffect` 管理 view 生命周期
- **最终选择**: `@uiw/react-codemirror` — 减少 200+ 行样板代码，且暴露了底层 view 引用供高级操作
- **风险**: 封装层可能滞后 CodeMirror 核心更新，但 `@uiw` 维护活跃（周下载 50 万+）

### 决策 4: `ws` 而非 Socket.IO
- **背景**: 文件变更后需要推送浏览器刷新（单向通知），不需要房间/重连/ACK
- **方案对比**:
  - **`ws`**: 纯 WebSocket 实现，API 就是 Node.js 原生 `WebSocket`，体积 ~10KB
  - **Socket.IO**: 自动重连、房间、事件名路由、HTTP 长轮询降级。体积 ~150KB
- **最终选择**: `ws` — 我们只需要服务端 → 客户端单向通知，Socket.IO 的功能全部多余
- **风险**: 需手动处理断线重连（3 行代码：`onclose` → `setTimeout` → `new WebSocket`）

### 决策 5: 后端直读文件系统 而非数据库索引
- **背景**: 需要反向链接查询（"哪些笔记链向了我"），有两种做法
- **方案对比**:
  - **数据库索引（SQLite）**: 每次文件变更后重建索引，查询快但同步逻辑复杂
  - **启动时全量扫描 + 内存缓存**: 启动时解析所有 `.md` 的 `[[]]`，构建反向索引 Map，chokidar 监听增量更新
- **最终选择**: 内存缓存 — 5000 篇笔记的全量解析 < 1 秒，避免引入 SQLite 依赖和同步逻辑
- **风险**: 10 万+ 笔记时会变慢，届时迁移到 SQLite 索引

## 3. 项目文件结构规划
```
secondbrain-lite/
├── src/
│   ├── server/                 # 后端（Express + 业务逻辑）
│   │   ├── index.ts            # Express 服务器入口
│   │   ├── routes/
│   │   │   ├── files.ts        # 文件 CRUD API
│   │   │   └── notes.ts        # 笔记搜索 API（自动补全用）
│   │   ├── services/
│   │   │   ├── indexer.ts      # Wikilink 全量解析 + 反向索引
│   │   │   ├── watcher.ts      # chokidar 文件监听 + WS 广播
│   │   │   └── image-store.ts  # 图片保存（剪贴板粘贴）
│   │   └── ws.ts               # WebSocket 管理
│   ├── client/                 # 前端（React SPA）
│   │   ├── App.tsx             # 根组件 + 路由
│   │   ├── main.tsx            # ReactDOM 入口
│   │   ├── components/
│   │   │   ├── Layout.tsx      # 三栏布局（文件树 | 编辑器+预览 | 面板）
│   │   │   ├── FileTree.tsx    # 文件树侧边栏
│   │   │   ├── Editor.tsx      # CodeMirror 6 编辑器封装
│   │   │   ├── MarkdownPreview.tsx  # Markdown 渲染 + 图片
│   │   │   ├── GraphView.tsx   # D3.js 力导向图谱
│   │   │   ├── BacklinksPanel.tsx   # 反向链接列表
│   │   │   └── WikilinkAutocomplete.tsx  # [[补全下拉
│   │   ├── hooks/
│   │   │   ├── useNotes.ts     # 笔记数据 + API 调用
│   │   │   ├── useWebSocket.ts # WS 连接管理 + 热更新
│   │   │   └── useImagePaste.ts # 剪贴板图片粘贴
│   │   ├── lib/
│   │   │   └── api.ts          # 前端 API 客户端（fetch 封装）
│   │   └── types/
│   │       └── index.ts        # 共享类型定义
│   ├── cli.ts                  # CLI 入口（`sb start` 命令）
│   └── shared/
│       └── constants.ts        # 前后端共享常量
├── index.html                  # Vite 入口 HTML
├── package.json
├── tsconfig.json               # 前端 TS 配置
├── tsconfig.server.json        # 后端 TS 配置（target: ESNext, module: CommonJS）
├── vite.config.ts              # Vite 配置（含 API 代理）
├── tailwind.config.js
└── postcss.config.js
```

## 4. AI 协作规则文件
将在项目根目录创建 `CLAUDE.md`，写入以下强制约束：
- 写任何代码前必须先读取 `/memory-bank` 下的所有 `.md` 文件
- 所有代码必须保持高度模块化，单一文件不超过 300 行
- 每个组件/模块必须有明确的职责边界
- 后端所有 API 路由必须用 Zod 做输入验证
- 禁止 `any` 类型（除非有充分理由并注释说明）
