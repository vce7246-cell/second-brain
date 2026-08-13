# CLAUDE.md — SecondBrain Lite AI 协作规则

## 强制约束

1. **记忆库优先**: 写任何代码前必须先读取 `/memory-bank` 下的所有 `.md` 文件获取项目上下文
2. **反单体**: 单一文件不超过 300 行（含注释），每个组件/模块有明确职责边界
3. **类型安全**: 禁止 `any` 类型，除非有充分理由并加注释说明
4. **验证先行**: 后端所有 API 路由用 Zod 做输入验证
5. **单步死循环**: 一次只做一步，未经"测试通过"确认不进入下一步

## 技术栈速查

- 前端: React 18 + TypeScript + Vite 5 + Tailwind CSS 3
- 后端: Express 4 + TypeScript + `ws` (WebSocket)
- 编辑器: CodeMirror 6 (`@uiw/react-codemirror`)
- 渲染: `marked` + 自定义 wikilink 扩展
- 图谱: D3.js v7 force simulation
- 文件监听: `chokidar`
- 校验: Zod
- 开发: `tsx` (后端热执行) + `concurrently` (前后端并行)

## 项目结构

```
src/
├── server/          # Express 后端（API + WebSocket + 文件监听）
├── client/          # React 前端（组件 + hooks + API 客户端）
├── cli.ts           # CLI 入口
└── shared/          # 共享常量/类型
```

## 禁止事项

- ❌ 不要在循环中执行同步文件操作
- ❌ 不要在前端直接 `import` 后端模块（反之亦然）
- ❌ 不要引入 `any` 类型
- ❌ 不要裸写 `useEffect` 做数据获取（用 `useNotes` hook 封装）
- ❌ 不要硬编码端口号（通过环境变量或 CLI 参数传入）
- ❌ 不要在生产代码中留 `console.log`
