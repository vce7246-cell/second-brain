import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createFileRouter } from '../src/server/routes/files.js';

interface TestApi {
  baseUrl: string;
  server: Server;
}

async function createSandbox(): Promise<{ root: string; vault: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-meta-'));
  const vault = path.join(root, 'vault');
  await fs.mkdir(vault);
  return { root, vault };
}

async function removeSandbox(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, resolvedRoot);
  const isInsideTemp = relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);

  if (!isInsideTemp || !path.basename(resolvedRoot).startsWith('sb-meta-')) {
    throw new Error(`Refusing to remove unexpected test directory: ${resolvedRoot}`);
  }
  await fs.rm(resolvedRoot, { recursive: true, force: true });
}

async function startFileApi(notesDir: string): Promise<TestApi> {
  const app = express();
  app.use(express.json());
  app.use(createFileRouter(notesDir));
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function postJson(
  baseUrl: string,
  endpoint: string,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('file metadata reports type, size, and modified time for managed files', async () => {
  const { root, vault } = await createSandbox();
  const filePath = path.join(vault, 'attachments', 'diagram.drawio');
  await fs.mkdir(path.dirname(filePath));
  await fs.writeFile(filePath, '<mxfile>diagram</mxfile>');
  const stat = await fs.stat(filePath);
  const api = await startFileApi(vault);

  try {
    const response = await postJson(api.baseUrl, '/api/files/meta', {
      filePath: 'attachments/diagram.drawio',
    });
    assert.equal(response.status, 200);
    const body = await response.json() as {
      filePath: string;
      kind: string;
      extension: string;
      size: number;
      mtimeMs: number;
    };
    assert.equal(body.filePath, 'attachments/diagram.drawio');
    assert.equal(body.kind, 'drawio');
    assert.equal(body.extension, '.drawio');
    assert.equal(body.size, Buffer.byteLength('<mxfile>diagram</mxfile>'));
    assert.equal(Math.abs(body.mtimeMs - stat.mtimeMs) < 1000, true);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('file metadata rejects directories and unsafe paths', async () => {
  const { root, vault } = await createSandbox();
  await fs.mkdir(path.join(vault, 'folder'));
  await fs.mkdir(path.join(vault, '.sb'));
  await fs.writeFile(path.join(vault, '.sb', 'secret.txt'), 'secret');
  const api = await startFileApi(vault);

  try {
    const directory = await postJson(api.baseUrl, '/api/files/meta', { filePath: 'folder' });
    assert.equal(directory.status, 415);

    const metadata = await postJson(api.baseUrl, '/api/files/meta', {
      filePath: '.sb/secret.txt',
    });
    assert.equal(metadata.status, 400);

    const outside = await postJson(api.baseUrl, '/api/files/meta', {
      filePath: '../outside.txt',
    });
    assert.equal(outside.status, 400);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});
