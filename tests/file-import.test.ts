import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import {
  importDestinationPath,
  importTargetDirectory,
} from '../src/client/lib/file-import-target.js';
import { bindGlobalFileDrop } from '../src/client/lib/global-file-drop.js';
import { createFileImportRouter } from '../src/server/routes/file-import.js';
import { createFileRouter } from '../src/server/routes/files.js';

interface TestApi {
  baseUrl: string;
  server: Server;
}

async function createSandbox(): Promise<{ root: string; vault: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-import-'));
  const vault = path.join(root, 'vault');
  await fs.mkdir(vault);
  return { root, vault };
}

async function removeSandbox(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, resolvedRoot);
  if (
    relative === ''
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
    || !path.basename(resolvedRoot).startsWith('sb-import-')
  ) {
    throw new Error(`Refusing to remove unexpected test directory: ${resolvedRoot}`);
  }
  await fs.rm(resolvedRoot, { recursive: true, force: true });
}

async function startImportApi(notesDir: string, maxBytes?: number): Promise<TestApi> {
  const app = express();
  app.use(maxBytes === undefined
    ? createFileRouter(notesDir)
    : createFileImportRouter(notesDir, { maxBytes }));
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

function importFile(
  baseUrl: string,
  filePath: string,
  body: Buffer,
  contentType = 'application/octet-stream'
): Promise<Response> {
  const query = new URLSearchParams({ filePath });
  return fetch(`${baseUrl}/api/files/import?${query.toString()}`, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

function ensureImportFolder(baseUrl: string, dirPath: string): Promise<Response> {
  const query = new URLSearchParams({ dirPath });
  return fetch(`${baseUrl}/api/files/import-folder?${query.toString()}`, { method: 'POST' });
}

test('global imports target the visible item folder or the vault root', () => {
  assert.equal(importTargetDirectory(null), '');
  assert.equal(importTargetDirectory('note.md'), '');
  assert.equal(importTargetDirectory('projects/topic.md'), 'projects');
  assert.equal(importTargetDirectory('projects\\assets\\diagram.drawio'), 'projects/assets');
  assert.equal(importDestinationPath('projects', 'reference.pdf'), 'projects/reference.pdf');
  assert.equal(importDestinationPath('', 'reference.pdf'), 'reference.pdf');
});

function fakeTransfer(fileNames: string[]): DataTransfer {
  return {
    types: ['Files'],
    files: fileNames.map((name) => ({ name, size: 1 })) as unknown as FileList,
    dropEffect: 'none',
  } as DataTransfer;
}

function fakeDragEvent(type: string, transfer: DataTransfer): DragEvent {
  const event = new Event(type, { cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  return event;
}

test('global file drop reports dragging and passes dropped files to the importer', () => {
  const target = new EventTarget();
  const draggingStates: boolean[] = [];
  const droppedNames: string[][] = [];
  const stop = bindGlobalFileDrop(target, {
    onDraggingChange: (dragging) => draggingStates.push(dragging),
    onTransferDrop: (droppedTransfer) => {
      droppedNames.push(Array.from(droppedTransfer.files).map((file) => file.name));
    },
  });
  const transfer = fakeTransfer(['global.md', 'diagram.drawio']);

  assert.equal(target.dispatchEvent(fakeDragEvent('dragenter', transfer)), false);
  assert.equal(target.dispatchEvent(fakeDragEvent('dragover', transfer)), false);
  assert.equal(transfer.dropEffect, 'copy');
  assert.equal(target.dispatchEvent(fakeDragEvent('drop', transfer)), false);
  assert.deepEqual(draggingStates, [true, true, false]);
  assert.deepEqual(droppedNames, [['global.md', 'diagram.drawio']]);

  stop();
  target.dispatchEvent(fakeDragEvent('dragenter', transfer));
  assert.deepEqual(draggingStates, [true, true, false]);
});

test('global file drop defers to a local surface that already handled the event', () => {
  const target = new EventTarget();
  const draggingStates: boolean[] = [];
  const droppedNames: string[][] = [];
  bindGlobalFileDrop(target, {
    onDraggingChange: (dragging) => draggingStates.push(dragging),
    onTransferDrop: (droppedTransfer) => {
      droppedNames.push(Array.from(droppedTransfer.files).map((file) => file.name));
    },
  });
  const event = fakeDragEvent('drop', fakeTransfer(['local.md']));
  event.preventDefault();

  target.dispatchEvent(event);
  assert.deepEqual(draggingStates, [false]);
  assert.deepEqual(droppedNames, []);
});

test('imports binary files without changing their bytes or overwriting collisions', async () => {
  const { root, vault } = await createSandbox();
  await fs.mkdir(path.join(vault, 'assets'));
  const api = await startImportApi(vault);
  const payload = Buffer.from([0, 255, 1, 2, 3]);

  try {
    const imported = await importFile(api.baseUrl, 'assets/media.bin', payload);
    assert.equal(imported.status, 201);
    assert.deepEqual(await imported.json(), {
      filePath: 'assets/media.bin',
      imported: true,
      size: payload.length,
    });
    assert.deepEqual(await fs.readFile(path.join(vault, 'assets', 'media.bin')), payload);

    const collision = await importFile(api.baseUrl, 'assets/media.bin', Buffer.from('replacement'));
    assert.equal(collision.status, 409);
    assert.equal((await collision.json() as { code?: string }).code, 'PATH_EXISTS');
    assert.deepEqual(await fs.readFile(path.join(vault, 'assets', 'media.bin')), payload);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('folder imports create missing directories and safely reuse existing directories', async () => {
  const { root, vault } = await createSandbox();
  const api = await startImportApi(vault);

  try {
    const created = await ensureImportFolder(api.baseUrl, 'Project');
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { dirPath: 'Project', created: true });

    const reused = await ensureImportFolder(api.baseUrl, 'Project');
    assert.equal(reused.status, 200);
    assert.deepEqual(await reused.json(), { dirPath: 'Project', created: false });

    assert.equal((await ensureImportFolder(api.baseUrl, 'Project/assets')).status, 201);
    const imported = await importFile(api.baseUrl, 'Project/assets/diagram.drawio', Buffer.from('<mxfile />'));
    assert.equal(imported.status, 201);

    await fs.writeFile(path.join(vault, 'occupied'), 'file');
    const collision = await ensureImportFolder(api.baseUrl, 'occupied');
    assert.equal(collision.status, 409);
    assert.equal((await collision.json() as { code?: string }).code, 'PATH_EXISTS');
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('rejects oversized imports and removes incomplete temporary files', async () => {
  const { root, vault } = await createSandbox();
  const api = await startImportApi(vault, 4);

  try {
    const response = await importFile(api.baseUrl, 'too-large.bin', Buffer.from([1, 2, 3, 4, 5]));
    assert.equal(response.status, 413);
    assert.equal((await response.json() as { code?: string }).code, 'FILE_TOO_LARGE');
    await assert.rejects(fs.access(path.join(vault, 'too-large.bin')));
    assert.deepEqual(await fs.readdir(vault), []);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('rejects unsafe destinations and non-binary request bodies', async () => {
  const { root, vault } = await createSandbox();
  await fs.mkdir(path.join(vault, '.sb'));
  const api = await startImportApi(vault);

  try {
    for (const unsafePath of [
      '../outside.bin',
      '.sb/secret.bin',
      'folder/../inside.bin',
      'folder/../../outside.bin',
      path.join(root, 'absolute.bin'),
    ]) {
      const response = await importFile(api.baseUrl, unsafePath, Buffer.from('blocked'));
      assert.equal(response.status, 400, unsafePath);
    }
    const missingParent = await importFile(api.baseUrl, 'missing/file.bin', Buffer.from('blocked'));
    assert.equal(missingParent.status, 400);
    assert.equal((await missingParent.json() as { code?: string }).code, 'INVALID_PARENT');

    const wrongType = await importFile(api.baseUrl, 'data.bin', Buffer.from('{}'), 'application/json');
    assert.equal(wrongType.status, 415);
    await assert.rejects(fs.access(path.join(vault, 'data.bin')));
    await assert.rejects(fs.access(path.join(root, 'outside.bin')));
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('rejects imports through a symbolic-link directory', async (context) => {
  const { root, vault } = await createSandbox();
  const outside = path.join(root, 'outside');
  const linkPath = path.join(vault, 'escape');
  await fs.mkdir(outside);

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

    const api = await startImportApi(vault);
    try {
      const folderResponse = await ensureImportFolder(api.baseUrl, 'escape');
      assert.equal(folderResponse.status, 400);
      const response = await importFile(api.baseUrl, 'escape/outside.bin', Buffer.from('blocked'));
      assert.equal(response.status, 400);
      await assert.rejects(fs.access(path.join(outside, 'outside.bin')));
    } finally {
      await closeServer(api.server);
    }
  } finally {
    await removeSandbox(root);
  }
});
