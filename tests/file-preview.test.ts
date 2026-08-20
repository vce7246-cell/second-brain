import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createFileRouter } from '../src/server/routes/files.js';

async function createSandbox(): Promise<{ root: string; vault: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-preview-'));
  const vault = path.join(root, 'vault');
  await fs.mkdir(vault);
  return { root, vault };
}

async function removeSandbox(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const relative = path.relative(path.resolve(os.tmpdir()), resolvedRoot);
  const safe = relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
    && path.basename(resolvedRoot).startsWith('sb-preview-');
  if (!safe) throw new Error(`Refusing to remove unexpected test directory: ${resolvedRoot}`);
  await fs.rm(resolvedRoot, { recursive: true, force: true });
}

async function startFileApi(notesDir: string): Promise<{ baseUrl: string; server: Server }> {
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

function preview(baseUrl: string, filePath: string, headers?: Record<string, string>): Promise<Response> {
  const query = new URLSearchParams({ filePath });
  return fetch(`${baseUrl}/api/files/preview?${query.toString()}`, { headers });
}

test('text previews are plain text and reject oversized files', async () => {
  const { root, vault } = await createSandbox();
  await fs.writeFile(path.join(vault, 'sample.html'), '<script>alert(1)</script>');
  await fs.writeFile(path.join(vault, 'large.txt'), 'x'.repeat(1024 * 1024 + 1));
  const api = await startFileApi(vault);
  try {
    const text = await preview(api.baseUrl, 'sample.html');
    assert.equal(text.status, 200);
    assert.match(text.headers.get('content-type') ?? '', /^text\/plain/);
    assert.equal(text.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await text.text(), '<script>alert(1)</script>');
    assert.equal((await preview(api.baseUrl, 'large.txt')).status, 413);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('drawio source files are available as safe XML text previews', async () => {
  const { root, vault } = await createSandbox();
  await fs.writeFile(path.join(vault, 'diagram.drawio'), '<mxfile><diagram name="首页"><mxGraphModel><root><mxCell id="0" /></root></mxGraphModel></diagram></mxfile>');
  const api = await startFileApi(vault);
  try {
    const response = await preview(api.baseUrl, 'diagram.drawio');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/plain/);
    assert.match(await response.text(), /mxfile/);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('audio and video previews support local media responses and ranges', async () => {
  const { root, vault } = await createSandbox();
  await fs.writeFile(path.join(vault, 'sample.mp3'), Buffer.from([1, 2, 3, 4]));
  await fs.writeFile(path.join(vault, 'sample.mp4'), Buffer.from([5, 6, 7, 8]));
  const api = await startFileApi(vault);
  try {
    const audio = await preview(api.baseUrl, 'sample.mp3', { Range: 'bytes=0-1' });
    assert.equal(audio.status, 206);
    assert.match(audio.headers.get('content-type') ?? '', /^audio\/mpeg/);
    assert.match(audio.headers.get('content-range') ?? '', /^bytes 0-1\/4$/);
    assert.deepEqual(Buffer.from(await audio.arrayBuffer()), Buffer.from([1, 2]));

    const video = await preview(api.baseUrl, 'sample.mp4');
    assert.equal(video.status, 200);
    assert.match(video.headers.get('content-type') ?? '', /^video\/mp4/);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('preview still rejects editable, unsupported, metadata, and escaped paths', async () => {
  const { root, vault } = await createSandbox();
  await fs.writeFile(path.join(vault, 'note.md'), '# Note');
  await fs.writeFile(path.join(vault, 'report.docx'), 'document');
  await fs.mkdir(path.join(vault, '.sb'));
  await fs.writeFile(path.join(vault, '.sb', 'secret.txt'), 'secret');
  const api = await startFileApi(vault);
  try {
    assert.equal((await preview(api.baseUrl, 'note.md')).status, 415);
    assert.equal((await preview(api.baseUrl, 'report.docx')).status, 415);
    assert.equal((await preview(api.baseUrl, '.sb/secret.txt')).status, 400);
    assert.equal((await preview(api.baseUrl, '../outside.txt')).status, 400);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});
