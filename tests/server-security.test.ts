import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { startServer } from '../src/server/index.js';
import { createFileRouter } from '../src/server/routes/files.js';

interface TestApi {
  baseUrl: string;
  server: Server;
}

async function createSandbox(): Promise<{ root: string; vault: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-security-'));
  const vault = path.join(root, 'vault');
  await fs.mkdir(vault);
  return { root, vault };
}

async function removeSandbox(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, resolvedRoot);
  const isInsideTemp = relative !== ''
    && !relative.startsWith(`..${path.sep}`)
    && relative !== '..'
    && !path.isAbsolute(relative);

  if (!isInsideTemp || !path.basename(resolvedRoot).startsWith('sb-security-')) {
    throw new Error(`Refusing to remove unexpected test directory: ${resolvedRoot}`);
  }

  await fs.rm(resolvedRoot, { recursive: true, force: true });
}

async function startFileApi(notesDir: string): Promise<TestApi> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
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

async function withFileApi(
  notesDir: string,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const api = await startFileApi(notesDir);
  try {
    await run(api.baseUrl);
  } finally {
    await closeServer(api.server);
  }
}

test('valid file CRUD remains inside the vault', async () => {
  const { root, vault } = await createSandbox();
  try {
    await withFileApi(vault, async (baseUrl) => {
      const createResponse = await postJson(baseUrl, '/api/files/create', {
        filePath: 'notes/alpha.md',
        content: '# Alpha',
      });
      assert.equal(createResponse.status, 200);

      const readResponse = await postJson(baseUrl, '/api/files/read', {
        filePath: 'notes/alpha.md',
      });
      assert.equal(readResponse.status, 200);
      assert.equal((await readResponse.json() as { content: string }).content, '# Alpha');

      const saveResponse = await postJson(baseUrl, '/api/files/save', {
        filePath: 'notes/alpha.md',
        content: '# Updated',
      });
      assert.equal(saveResponse.status, 200);

      const imageResponse = await postJson(baseUrl, '/api/files/upload-image', {
        data: Buffer.from('image-data').toString('base64'),
        mimeType: 'image/png',
        currentNoteDir: 'notes',
      });
      assert.equal(imageResponse.status, 200);
      const imageBody = await imageResponse.json() as { path: string; markdown: string };
      assert.match(imageBody.path, /^notes\/images\/\d{14}\.png$/);
      assert.match(imageBody.markdown, /^!\[\]\(\.\/images\/\d{14}\.png\)$/);
      assert.equal(
        await fs.readFile(path.join(vault, ...imageBody.path.split('/')), 'utf-8'),
        'image-data'
      );

      const renameResponse = await postJson(baseUrl, '/api/files/rename', {
        oldPath: 'notes/alpha.md',
        newPath: 'archive/alpha.md',
      });
      assert.equal(renameResponse.status, 200);

      const deleteResponse = await postJson(baseUrl, '/api/files/delete', {
        filePath: 'archive/alpha.md',
      });
      assert.equal(deleteResponse.status, 200);
      await assert.rejects(fs.access(path.join(vault, 'archive', 'alpha.md')));
    });
  } finally {
    await removeSandbox(root);
  }
});

test('rejects traversal into a sibling directory with the same prefix', async () => {
  const { root, vault } = await createSandbox();
  const sibling = path.join(root, 'vault-private');
  await fs.mkdir(sibling);
  await fs.writeFile(path.join(sibling, 'secret.md'), 'secret');

  try {
    await withFileApi(vault, async (baseUrl) => {
      const response = await postJson(baseUrl, '/api/files/read', {
        filePath: '../vault-private/secret.md',
      });
      assert.equal(response.status, 400);
    });
  } finally {
    await removeSandbox(root);
  }
});

test('rejects absolute file paths', async () => {
  const { root, vault } = await createSandbox();
  const outsideFile = path.join(root, 'outside.md');
  await fs.writeFile(outsideFile, 'outside');

  try {
    await withFileApi(vault, async (baseUrl) => {
      const response = await postJson(baseUrl, '/api/files/read', {
        filePath: outsideFile,
      });
      assert.equal(response.status, 400);
    });
  } finally {
    await removeSandbox(root);
  }
});

test('rejects image uploads outside the vault', async () => {
  const { root, vault } = await createSandbox();
  const sibling = path.join(root, 'vault-private');
  await fs.mkdir(sibling);

  try {
    await withFileApi(vault, async (baseUrl) => {
      const response = await postJson(baseUrl, '/api/files/upload-image', {
        data: Buffer.from('not-an-image').toString('base64'),
        mimeType: 'image/png',
        currentNoteDir: '../vault-private',
      });
      assert.equal(response.status, 400);
      await assert.rejects(fs.access(path.join(sibling, 'images')));
    });
  } finally {
    await removeSandbox(root);
  }
});

test('moves directories to trash without destroying their contents', async () => {
  const { root, vault } = await createSandbox();
  const notePath = path.join(vault, 'folder', 'keep.md');
  const emptyDir = path.join(vault, 'empty-folder');
  await fs.mkdir(path.dirname(notePath));
  await fs.mkdir(emptyDir);
  await fs.writeFile(notePath, 'keep');

  try {
    await withFileApi(vault, async (baseUrl) => {
      const response = await postJson(baseUrl, '/api/files/delete', {
        filePath: 'folder',
      });
      assert.equal(response.status, 200);
      const folderItem = await response.json() as { item: { id: string } };
      await assert.rejects(fs.access(notePath));

      const restoreFolder = await postJson(baseUrl, '/api/files/restore', {
        trashId: folderItem.item.id,
      });
      assert.equal(restoreFolder.status, 200);
      assert.equal(await fs.readFile(notePath, 'utf-8'), 'keep');

      const emptyResponse = await postJson(baseUrl, '/api/files/delete', {
        filePath: 'empty-folder',
      });
      assert.equal(emptyResponse.status, 200);
      const emptyItem = await emptyResponse.json() as { item: { id: string } };
      await assert.rejects(fs.access(emptyDir));

      const restoreEmpty = await postJson(baseUrl, '/api/files/restore', {
        trashId: emptyItem.item.id,
      });
      assert.equal(restoreEmpty.status, 200);
      assert.equal((await fs.stat(emptyDir)).isDirectory(), true);
    });
  } finally {
    await removeSandbox(root);
  }
});

test('rejects access through a symbolic-link directory', async (context) => {
  const { root, vault } = await createSandbox();
  const outside = path.join(root, 'outside');
  const linkPath = path.join(vault, 'escape');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'secret.md'), 'secret');

  try {
    try {
      await fs.symlink(outside, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      const code = error instanceof Error && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (code === 'EPERM' || code === 'EACCES') {
        context.skip(`Symbolic links unavailable: ${String(code)}`);
        return;
      }
      throw error;
    }

    await withFileApi(vault, async (baseUrl) => {
      const response = await postJson(baseUrl, '/api/files/read', {
        filePath: 'escape/secret.md',
      });
      assert.equal(response.status, 400);
    });
  } finally {
    await removeSandbox(root);
  }
});

test('application server binds to IPv4 loopback only', async () => {
  const { root, vault } = await createSandbox();
  const started = await startServer({ notesDir: vault, port: 0, silent: true });

  try {
    const address = started.server.address();
    assert.ok(address && typeof address !== 'string');
    assert.equal(address.address, '127.0.0.1');
    assert.equal(started.port, address.port);
  } finally {
    await started.watcher.close();
    await closeServer(started.server);
    await removeSandbox(root);
  }
});
