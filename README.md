# SecondBrain Lite

[简体中文](README.zh-CN.md) | English

A local-first personal knowledge base for Markdown notes and related files. SecondBrain Lite adds browser-based editing, wikilinks, backlinks, tags, local full-text search, file management, and interactive knowledge graphs on top of an ordinary folder you control.

> **Status: pre-release technical preview (`v0.1.0`).** The core local workflow is usable and covered by automated tests. GitHub Actions now verifies Node.js 18, 20, and 22 on pushes and pull requests; installers, packaged releases, and formal cross-platform release validation are still out of scope.

## Why SecondBrain Lite?

- **Your files stay yours.** Markdown notes remain ordinary UTF-8 `.md` files.
- **Local by default.** The HTTP and WebSocket server bind to `127.0.0.1` only.
- **Links without forced rewrites.** Standard `[[wikilinks]]` live in Markdown; UI-created links and manual tags live separately in `.sb/links.json`.
- **More than Markdown storage.** Attachments can participate in search, tags, manual links, backlinks, dashboards, and graphs according to their supported capabilities.

## Features

- CodeMirror 6 Markdown editor with syntax highlighting and live preview
- `[[wikilink]]` completion, exact navigation, outgoing links, backlinks, and unlinked mentions
- Global and local D3 force-directed knowledge graphs
- Dashboard for notes, attachments, relationships, folders, orphaned items, and recent changes
- Folder tags and independent manual tags
- Quick switcher across notes and attachments with `Ctrl/Cmd + O`
- Local full-text search with `Ctrl/Cmd + Shift + F`
- Daily-note creation
- Create, rename, move, trash, and restore files and folders
- Drag-and-drop or picker-based import for files and folders
- Conflict-aware saving when a file changes outside the app
- Clipboard image paste and portable relative attachment references
- File-system watching with live browser updates

## File support

| File type | In-app capability | Content search |
| --- | --- | --- |
| Markdown (`.md`, `.markdown`) | Edit and preview | Yes, up to 1 MiB |
| Text and common code files | Read-only preview, up to 1 MiB | Yes, up to 1 MiB |
| Images | Read-only preview | File name and path only |
| PDF | Read-only browser preview | File name and path only |
| Audio and video | Local playback with browser controls | File name and path only |
| Office documents | Manage, link, tag, and graph only | File name and path only |
| Native `.drawio` | Read-only XML structure preview, manage, link, tag, and graph | File name and path only |
| `.drawio.svg` / `.drawio.png` exports | Read-only image preview | File name and path only |

Every visible regular file can become a knowledge item and participate in manual relationships. Non-Markdown files are not parsed for wikilinks and do not receive automatic semantic relationships.

## Data model and privacy

Point SecondBrain Lite at a dedicated vault folder:

```text
your-vault/
├── notes.md
├── projects/
├── attachments/
└── .sb/
    ├── links.json      # UI links and manual tags
    ├── links.json.bak  # previous valid metadata generation
    └── trash/          # recoverable deletions
```

- The app does not require an account, cloud database, or telemetry service.
- Imported files are **copied into the vault**. They are not linked to or synchronized with the original external files.
- Hidden entries, `.sb`, and `node_modules` are excluded from normal knowledge views and imports.
- The server is local-only and has no authentication. Do not expose it through port forwarding, a public reverse proxy, or a LAN bind.
- Do not use the repository root or a valuable unbacked-up folder as a test vault.

## Requirements

- Node.js 18 or later
- npm
- A modern desktop browser

The current repository has been verified locally with Node.js 24.15.0 and npm 11.12.1. Node.js 18+ is the intended runtime range, and GitHub Actions verifies Node.js 18, 20, and 22.

## Quick start

After cloning or downloading the repository:

```bash
npm ci
npm run build
npm start -- "/absolute/path/to/your-vault"
```

The CLI starts the local server on port `3000` and opens the browser. To keep it in the terminal only:

```bash
npm start -- "/absolute/path/to/your-vault" --no-open
```

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Use a different port when needed:

```bash
npm start -- "/absolute/path/to/your-vault" --port 4310
```

On Windows PowerShell, use `npm.cmd` if the execution policy blocks `npm.ps1`:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start -- "D:\Notes\MyVault" --no-open
```

## Development

Start the Express server and Vite development server together.

macOS/Linux:

```bash
SB_NOTES_DIR="/absolute/path/to/your-vault" npm run dev
```

Windows PowerShell:

```powershell
$env:SB_NOTES_DIR = "D:\Notes\MyVault"
npm.cmd run dev
```

The backend uses port `3000`; Vite uses port `5173` and proxies `/api` and `/ws` to the backend.

## Verification commands

```bash
# TypeScript strict-mode check
npm run typecheck

# 64 server, persistence, security, import, preview, navigation, and search tests
npm test

# Frontend production build
npm run build
```

There is currently no lint command, installer, packaged desktop release, or standalone server build. The production frontend is built by Vite, while the server still runs TypeScript through `tsx`.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + O` | Open the unified knowledge switcher |
| `Ctrl/Cmd + Shift + F` | Open local full-text search |
| `Ctrl/Cmd + S` | Save the current Markdown note |

## Project structure

```text
src/
├── cli.ts              # `sb start` command
├── shared/             # Shared constants and file-type contracts
├── server/
│   ├── index.ts        # Express, HTTP, and WebSocket entry point
│   ├── routes/         # Files, notes, links, tags, search, and metadata APIs
│   └── services/       # Indexing, watching, safe paths, persistence, and LinkStore
└── client/
    ├── App.tsx         # Application views and shared state
    ├── components/     # Editor, tree, preview, search, dashboard, and graphs
    ├── hooks/          # Editing, metadata, paste, navigation, and WebSocket hooks
    └── lib/api.ts      # Frontend API client
tests/                  # Node Test Runner integration and regression tests
bin/sb.cjs              # Windows-compatible local CLI wrapper
```

## Current limitations

- The interface is currently Chinese-only and optimized for a desktop browser.
- There is no cloud sync, user account, collaboration, mobile app, plugin system, or theme system.
- Office files and native `.drawio` files cannot be edited or previewed in the app.
- PDF/OCR extraction, attachment semantic indexing, and automatic relationship generation are not implemented.
- Full-text search is local substring matching, not fuzzy or semantic search.
- Imported external files are copied once; later changes to the originals are not synchronized.
- Large-vault behavior still needs broader real-world validation. The graph asks for confirmation above 1,000 nodes.
- There is no installer, signed binary, automatic updater, release migration system, or npm-published CLI.
- Linting, formal browser compatibility testing, and packaged release automation are not yet configured.

## Contributing

Before changing code, read [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md). Keep changes focused and run the type check, relevant tests, and production build before submitting them.

## License

No license has been selected yet. Until a `LICENSE` file is added, copyright is reserved and public repository visibility does not grant permission to copy, modify, or redistribute the code.
