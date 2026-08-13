# SecondBrain Lite — 实施计划

> 版本: v0.1 | 日期: 2026-07-16 | 总步骤数: 16

## Phase 1: 项目脚手架与基础设施

- [x] **Step 1.1**: 初始化项目 — 创建 `package.json`，安装全部依赖
  - **产出物**: `package.json`, `node_modules/`
  - **验证方法**: `npm install` 无报错，`node -e "require('express')"` 不报错
  - **预估时间**: 5 分钟

- [x] **Step 1.2**: TypeScript + Vite + Tailwind 配置
  - **产出物**: `tsconfig.json`, `vite.config.ts`
  - **验证方法**: `npx tsc --noEmit` 通过（创建占位 .ts 文件测试）
  - **预估时间**: 10 分钟

- [x] **Step 1.3**: Express 服务器骨架 + WebSocket 基础设施
  - **产出物**: `src/server/index.ts`, `src/server/ws.ts`
  - **验证方法**: `npx tsx src/server/index.ts` 启动，curl `/api/health` 返回 200，WebSocket 能连接
  - **预估时间**: 15 分钟

- [ ] **Step 1.4**: CLI 入口 + 开发启动脚本
  - **产出物**: `src/cli.ts`
  - **验证方法**: `npx tsx src/cli.ts start ./test-notes` 启动服务器并自动打开浏览器
  - **预估时间**: 10 分钟

- [ ] **Step 1.5**: React 应用外壳 + 三栏布局
  - **产出物**: `index.html`, `src/client/main.tsx`, `src/client/App.tsx`
  - **验证方法**: `npm run dev` 启动，浏览器看到三栏布局占位（左 240px | 中 flex | 右 280px）
  - **预估时间**: 15 分钟

## Phase 2: 核心功能模块

- [ ] **Step 2.1**: 文件 CRUD API（列出目录树、读取文件内容、创建/删除/重命名文件）
  - **产出物**: `src/server/routes/files.ts`
  - **验证方法**: curl POST `/api/files/list` 返回目录树 JSON；curl POST `/api/files/read` 返回文件内容
  - **预估时间**: 20 分钟

- [ ] **Step 2.2**: 文件树侧边栏组件 + API 客户端
  - **产出物**: `src/client/components/FileTree.tsx`, `src/client/lib/api.ts`
  - **验证方法**: 浏览器左侧显示 `test-notes/` 目录树，点击文件名有选中态
  - **预估时间**: 20 分钟

- [ ] **Step 2.3**: CodeMirror 6 编辑器封装
  - **产出物**: `src/client/components/Editor.tsx`
  - **验证方法**: 点击文件树中的 `.md` 文件 → 中间面板出现 CodeMirror 编辑器，Markdown 语法高亮正常
  - **预估时间**: 20 分钟

- [ ] **Step 2.4**: Markdown 预览组件（marked + 图片渲染）
  - **产出物**: `src/client/components/MarkdownPreview.tsx`
  - **验证方法**: 编辑器中输入 `# Hello` → 右侧预览面板实时渲染为 H1 标题
  - **预估时间**: 15 分钟

- [ ] **Step 2.5**: Wikilink 索引引擎（解析 `[[]]` + 构建正反向索引）
  - **产出物**: `src/server/services/indexer.ts`
  - **验证方法**: 准备 3 篇互相链接的测试笔记，调用 `indexer.rebuild()`，检查返回的 links 和 backlinks 数据正确
  - **预估时间**: 25 分钟

- [ ] **Step 2.6**: Wikilink `[[` 自动补全
  - **产出物**: `src/client/components/WikilinkAutocomplete.tsx`
  - **验证方法**: 编辑器中输入 `[[` → 弹出笔记标题下拉列表 → 选择后自动插入 `[[标题]]`
  - **预估时间**: 20 分钟

- [ ] **Step 2.7**: 反向链接面板
  - **产出物**: `src/client/components/BacklinksPanel.tsx`
  - **验证方法**: 打开一篇被其他笔记引用的笔记 → 右侧面板列出所有引用它的笔记，点击可跳转
  - **预估时间**: 15 分钟

- [ ] **Step 2.8**: 图片剪贴板粘贴
  - **产出物**: `src/server/services/image-store.ts`, `src/client/hooks/useImagePaste.ts`
  - **验证方法**: Ctrl+V 粘贴图片 → `images/` 目录下生成图片文件（原始格式）→ 编辑器插入 `![](images/xxx.ext)` → 预览渲染图片
  - **预估时间**: 20 分钟

- [ ] **Step 2.9**: 文件监听 + WebSocket 热更新
  - **产出物**: `src/server/services/watcher.ts`, `src/client/hooks/useWebSocket.ts`
  - **验证方法**: 用外部编辑器（如记事本）修改一篇 `.md` 文件并保存 → 浏览器中自动刷新显示新内容
  - **预估时间**: 20 分钟

## Phase 3: 知识图谱

- [ ] **Step 3.1**: D3.js 力导向图谱
  - **产出物**: `src/client/components/GraphView.tsx`
  - **验证方法**: 点击"图谱"视图 → 节点（笔记）+ 连线（链接）以力导向布局渲染，节点可拖拽，点击节点跳转到对应笔记
  - **预估时间**: 30 分钟

- [ ] **Step 3.2**: 视图切换导航（编辑器 ↔ 图谱）
  - **产出物**: 更新 `src/client/App.tsx`，新增顶部导航栏
  - **验证方法**: 顶部导航栏在"编辑"和"图谱"之间切换，切换后状态保持
  - **预估时间**: 10 分钟

## Phase 4: 打磨

- [ ] **Step 4.1**: Frontmatter 解析 + 文件树显示标题
  - **产出物**: 更新 `src/server/services/indexer.ts`, `src/client/components/FileTree.tsx`
  - **验证方法**: 有 `title:` frontmatter 的笔记在文件树中显示标题而非文件名
  - **预估时间**: 15 分钟

- [ ] **Step 4.2**: 生产构建 + 端到端烟雾测试
  - **产出物**: 更新 `package.json` build 脚本，验证完整流程
  - **验证方法**: `npm run build` 成功 → `sb start ./test-notes` → 浏览器中完成"新建笔记 → 写内容 → 建链接 → 粘贴图片 → 看图谱"全流程无报错
  - **预估时间**: 20 分钟
