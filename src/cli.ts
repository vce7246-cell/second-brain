#!/usr/bin/env tsx
/**
 * CLI 入口 — `sb start` 命令启动 SecondBrain Lite
 */
import { Command } from 'commander';
import { startServer } from './server/index.js';
import { DEFAULT_PORT } from './shared/constants.js';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

const program = new Command();

program
  .name('sb')
  .description('SecondBrain Lite — 本地 Markdown 知识库')
  .version('0.1.0');

program
  .command('start [notesDir]')
  .description('启动 SecondBrain Lite 服务器')
  .option('-p, --port <number>', 'HTTP 端口', String(DEFAULT_PORT))
  .option('--no-open', '不自动打开浏览器')
  .action(async (notesDir: string | undefined, options: { port: string; open: boolean }) => {
    const resolvedDir = path.resolve(notesDir || process.cwd());

    // 检查目录是否存在
    if (!fs.existsSync(resolvedDir)) {
      console.error(`[cli] Error: Directory not found: ${resolvedDir}`);
      process.exit(1);
    }

    const port = parseInt(options.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`[cli] Error: Invalid port: ${options.port}`);
      process.exit(1);
    }

    const { port: actualPort } = await startServer({
      notesDir: resolvedDir,
      port,
    });

    // 自动打开浏览器
    if (options.open) {
      const url = `http://localhost:${actualPort}`;
      const platform = process.platform;
      let cmd: string;
      if (platform === 'darwin') {
        cmd = `open "${url}"`;
      } else if (platform === 'win32') {
        cmd = `start "" "${url}"`;
      } else {
        cmd = `xdg-open "${url}"`;
      }
      exec(cmd, (err) => {
        if (err) {
          console.warn(`[cli] Failed to open browser: ${err.message}`);
          console.warn(`[cli] Please open ${url} manually.`);
        }
      });
    }
  });

program.parse();
