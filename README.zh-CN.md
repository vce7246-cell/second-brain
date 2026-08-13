# SecondBrain Lite

简体中文 | [English](README.md)

一个本地优先的个人知识库，为普通文件夹中的 Markdown 笔记和相关附件提供浏览器编辑、双向链接、标签、本地全文搜索、文件管理与交互式知识图谱。

> **当前状态：预发布技术预览版（`v0.1.0`）。** 核心本地使用流程已经可用并有自动化测试保护，但项目暂时没有安装包、正式发布产物、CI 流程或完整的跨平台发布验证。

## 为什么使用 SecondBrain Lite？

- **数据属于你。** Markdown 笔记始终是普通 UTF-8 `.md` 文件。
- **默认只在本机运行。** HTTP 和 WebSocket 服务仅监听 `127.0.0.1`。
- **建立关系但不强制改写正文。** 标准 `[[wikilink]]` 保存在 Markdown 中；界面创建的链接和手动标签单独保存在 `.sb/links.json`。
- **不只管理 Markdown。** 附件可根据其实际能力参与搜索、标签、手动链接、反向链接、概览页和知识图谱。

## 主要功能

- 基于 CodeMirror 6 的 Markdown 编辑器、语法高亮和实时预览
- `[[wikilink]]` 自动补全、精确跳转、出链、反向链接和未链接提及
- D3 全局与局部力导向知识图谱
- 笔记、附件、关系、目录、孤立条目和最近修改概览
- 文件夹隐式标签与独立手动标签
- `Ctrl/Cmd + O` 统一知识切换器
- `Ctrl/Cmd + Shift + F` 本地全文搜索
- 今日笔记创建
- 文件和文件夹的新建、重命名、移动、移入回收站与恢复
- 通过拖拽或选择器导入文件和文件夹
- 检测外部文件改动，避免静默覆盖未保存内容
- 剪贴板图片粘贴与可移植的相对附件引用
- 文件系统监听和浏览器实时更新

## 文件格式支持

| 文件类型 | 应用内能力 | 正文搜索 |
| --- | --- | --- |
| Markdown（`.md`、`.markdown`） | 编辑和预览 | 支持，不超过 1 MiB |
| 文本和常见代码文件 | 只读预览，不超过 1 MiB | 支持，不超过 1 MiB |
| 图片 | 只读预览 | 仅文件名和路径 |
| PDF | 浏览器内只读预览 | 仅文件名和路径 |
| 音频和视频 | 使用浏览器原生控件本地播放 | 仅文件名和路径 |
| Office 文档 | 仅管理、链接、标签和图谱 | 仅文件名和路径 |
| 原生 `.drawio` | 仅管理、链接、标签和图谱 | 仅文件名和路径 |
| `.drawio.svg` / `.drawio.png` 导出文件 | 作为图片只读预览 | 仅文件名和路径 |

所有可见普通文件都可以成为知识条目，并参与手动知识关系。非 Markdown 文件不会解析 wikilink，也不会自动生成语义关系。

## 数据模型与隐私

请为 SecondBrain Lite 指定一个独立的知识库目录：

```text
你的知识库/
├── notes.md
├── projects/
├── attachments/
└── .sb/
    ├── links.json      # 界面链接和手动标签
    ├── links.json.bak  # 上一代有效元数据备份
    └── trash/          # 可恢复删除内容
```

- 应用不需要账号、云数据库或遥测服务。
- 导入会将文件**复制进知识库**，不会与外部原文件建立链接或持续同步。
- 隐藏条目、`.sb` 和 `node_modules` 不会进入普通知识视图和导入结果。
- 服务没有认证系统，因为它仅为本机使用设计。不要通过端口转发、公网反向代理或局域网监听对外暴露。
- 不要把项目仓库根目录或没有备份的重要目录作为测试知识库。

## 环境要求

- Node.js 18 或更高版本
- npm
- 现代桌面浏览器

当前仓库已在 Node.js 24.15.0、npm 11.12.1 环境完成本地验证。Node.js 18+ 是预期运行范围，但目前尚未配置多版本自动化 CI。

## 快速开始

克隆或下载仓库后执行：

```bash
npm ci
npm run build
npm start -- "/你的知识库绝对路径"
```

CLI 默认在 `3000` 端口启动本地服务并自动打开浏览器。如需只在终端启动：

```bash
npm start -- "/你的知识库绝对路径" --no-open
```

然后访问 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

如需使用其他端口：

```bash
npm start -- "/你的知识库绝对路径" --port 4310
```

如果 Windows PowerShell 的执行策略拦截 `npm.ps1`，请使用 `npm.cmd`：

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start -- "D:\Notes\MyVault" --no-open
```

## 开发模式

同时启动 Express 后端和 Vite 开发服务器。

macOS/Linux：

```bash
SB_NOTES_DIR="/你的知识库绝对路径" npm run dev
```

Windows PowerShell：

```powershell
$env:SB_NOTES_DIR = "D:\Notes\MyVault"
npm.cmd run dev
```

后端使用 `3000` 端口，Vite 使用 `5173` 端口，并将 `/api` 和 `/ws` 代理到后端。

## 验证命令

```bash
# TypeScript strict 模式检查
npx tsc --noEmit --pretty false

# 64 项服务端、持久化、安全、导入、预览、导航与搜索测试
npm test

# 前端生产构建
npm run build
```

项目当前没有 lint 命令，也没有桌面应用或独立服务端打包。生产前端由 Vite 构建，服务端仍通过 `tsx` 直接运行 TypeScript。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl/Cmd + O` | 打开统一知识切换器 |
| `Ctrl/Cmd + Shift + F` | 打开本地全文搜索 |
| `Ctrl/Cmd + S` | 保存当前 Markdown 笔记 |

## 项目结构

```text
src/
├── cli.ts              # `sb start` 命令
├── shared/             # 前后端共享常量和文件类型契约
├── server/
│   ├── index.ts        # Express、HTTP 和 WebSocket 入口
│   ├── routes/         # 文件、笔记、链接、标签、搜索和元数据 API
│   └── services/       # 索引、监听、安全路径、持久化和 LinkStore
└── client/
    ├── App.tsx         # 应用视图和共享状态
    ├── components/     # 编辑器、文件树、预览、搜索、概览和图谱
    ├── hooks/          # 编辑、元数据、粘贴、导航和 WebSocket hooks
    └── lib/api.ts      # 前端 API 客户端
tests/                  # Node Test Runner 集成与回归测试
bin/sb.cjs              # 兼容 Windows 的本地 CLI 包装器
```

## 当前限制

- 界面目前只有中文，主要面向桌面浏览器。
- 暂无云同步、账号、多人协作、移动端、插件系统或主题系统。
- Office 文件和原生 `.drawio` 文件暂不支持应用内编辑或预览。
- 尚未实现 PDF/OCR 正文抽取、附件语义索引和自动关系生成。
- 全文搜索采用本地子字符串匹配，不是模糊搜索或语义搜索。
- 外部文件导入后只复制一次，原文件后续修改不会同步。
- 大型知识库仍需更多真实场景验证；图谱超过 1,000 个节点时会先请求用户确认。
- 暂无安装包、签名二进制、自动更新、发布迁移机制或发布到 npm 的 CLI。
- 尚未配置 CI、lint、正式浏览器兼容性测试和可复现发布自动化。

## 参与开发

修改代码前请先阅读 [AGENTS.md](AGENTS.md) 和 [CLAUDE.md](CLAUDE.md)。提交变更前应完成类型检查、相关自动化测试和生产构建。

## 许可证

项目目前尚未选择许可证。在添加 `LICENSE` 文件之前，公开展示仓库并不代表他人获得复制、修改或再分发代码的许可，相关权利仍然保留。

