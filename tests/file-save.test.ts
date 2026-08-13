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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-save-'));
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

  if (!isInsideTemp || !path.basename(resolvedRoot).startsWith('sb-save-')) {
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
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Test server did not receive a TCP address');
  }

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

test('read returns a version and matching save returns the new version', async () => {
  const { root, vault } = await createSandbox();
  const filePath = path.join(vault, 'note.md');
  await fs.writeFile(filePath, 'first');
  const api = await startFileApi(vault);

  try {
    const readResponse = await postJson(api.baseUrl, '/api/files/read', {
      filePath: 'note.md',
    });
    assert.equal(readResponse.status, 200);
    const readBody = await readResponse.json() as { content: string; version: string };
    assert.equal(readBody.content, 'first');
    assert.match(readBody.version, /^[a-f0-9]{64}$/);

    const saveResponse = await postJson(api.baseUrl, '/api/files/save', {
      filePath: 'note.md',
      content: 'second',
      expectedVersion: readBody.version,
    });
    assert.equal(saveResponse.status, 200);
    const saveBody = await saveResponse.json() as { version: string };
    assert.match(saveBody.version, /^[a-f0-9]{64}$/);
    assert.notEqual(saveBody.version, readBody.version);
    assert.equal(await fs.readFile(filePath, 'utf-8'), 'second');
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('stale save is rejected without overwriting an external edit', async () => {
  const { root, vault } = await createSandbox();
  const filePath = path.join(vault, 'note.md');
  await fs.writeFile(filePath, 'first');
  const api = await startFileApi(vault);

  try {
    const readResponse = await postJson(api.baseUrl, '/api/files/read', {
      filePath: 'note.md',
    });
    const readBody = await readResponse.json() as { version: string };
    await fs.writeFile(filePath, 'external edit');

    const saveResponse = await postJson(api.baseUrl, '/api/files/save', {
      filePath: 'note.md',
      content: 'stale browser edit',
      expectedVersion: readBody.version,
    });
    assert.equal(saveResponse.status, 409);
    const errorBody = await saveResponse.json() as {
      code: string;
      currentVersion: string | null;
    };
    assert.equal(errorBody.code, 'FILE_VERSION_CONFLICT');
    assert.match(errorBody.currentVersion ?? '', /^[a-f0-9]{64}$/);
    assert.equal(await fs.readFile(filePath, 'utf-8'), 'external edit');
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('only one concurrent save can use the same version', async () => {
  const { root, vault } = await createSandbox();
  const filePath = path.join(vault, 'note.md');
  await fs.writeFile(filePath, 'first');
  const api = await startFileApi(vault);

  try {
    const readResponse = await postJson(api.baseUrl, '/api/files/read', {
      filePath: 'note.md',
    });
    const { version } = await readResponse.json() as { version: string };

    const responses = await Promise.all([
      postJson(api.baseUrl, '/api/files/save', {
        filePath: 'note.md', content: 'save A', expectedVersion: version,
      }),
      postJson(api.baseUrl, '/api/files/save', {
        filePath: 'note.md', content: 'save B', expectedVersion: version,
      }),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);

    const savedContent = await fs.readFile(filePath, 'utf-8');
    assert.ok(savedContent === 'save A' || savedContent === 'save B');
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('failed save leaves the target directory and no temporary file', async () => {
  const { root, vault } = await createSandbox();
  const targetDir = path.join(vault, 'note.md');
  await fs.mkdir(targetDir);
  await fs.writeFile(path.join(targetDir, 'keep.txt'), 'keep');
  const api = await startFileApi(vault);

  try {
    const response = await postJson(api.baseUrl, '/api/files/save', {
      filePath: 'note.md',
      content: 'cannot replace a directory',
    });
    assert.equal(response.status, 400);
    assert.equal(await fs.readFile(path.join(targetDir, 'keep.txt'), 'utf-8'), 'keep');
    const entries = await fs.readdir(vault);
    assert.equal(entries.some((entry) => entry.endsWith('.tmp')), false);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});
