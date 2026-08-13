#!/usr/bin/env node
/**
 * Windows-compatible wrapper: launches src/cli.ts via the project's local tsx.
 * npm link creates a shim that runs this file with node — no global tsx needed.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectDir = path.resolve(__dirname, '..');
const cliTs = path.join(projectDir, 'src', 'cli.ts');
const tsxBin = path.join(projectDir, 'node_modules', '.bin', 'tsx');
const tsxExe = fs.existsSync(tsxBin + '.cmd') ? tsxBin + '.cmd' : tsxBin;

const child = spawn(tsxExe, [cliTs, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd(),
});

child.on('exit', function (code) {
  process.exit(code || 0);
});
