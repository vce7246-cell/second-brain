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

interface TrashItem {
  id: string;
  originalPath: string;
  deletedAt: string;
  entryType: 'file' | 'directory';
}

async function createSandbox(): Promise<{ root: string; vault: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-manage-'));
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

  if (!isInsideTemp || !path.basename(resolvedRoot).startsWith('sb-manage-')) {
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

test('directory tree reports unified file kinds and hides metadata', async () => {
  const { root, vault } = await createSandbox();
  await Promise.all([
    fs.writeFile(path.join(vault, 'note.md'), '# Note'),
    fs.writeFile(path.join(vault, 'data.json'), '{}'),
    fs.writeFile(path.join(vault, 'photo.png'), 'image'),
    fs.writeFile(path.join(vault, 'manual.pdf'), 'pdf'),
    fs.mkdir(path.join(vault, 'folder')),
    fs.mkdir(path.join(vault, '.sb')),
  ]);
  await fs.writeFile(path.join(vault, '.sb', 'secret.txt'), 'hidden');
  const api = await startFileApi(vault);

  try {
    const response = await postJson(api.baseUrl, '/api/files/list', {});
    assert.equal(response.status, 200);
    const body = await response.json() as {
      children: Array<{ name: string; kind: string; extension?: string }>;
    };
    const entries = new Map(body.children.map((entry) => [entry.name, entry]));
    assert.equal(entries.get('note.md')?.kind, 'markdown');
    assert.equal(entries.get('data.json')?.kind, 'text');
    assert.equal(entries.get('photo.png')?.kind, 'image');
    assert.equal(entries.get('manual.pdf')?.kind, 'pdf');
    assert.equal(entries.get('folder')?.kind, 'directory');
    assert.equal(entries.get('note.md')?.extension, '.md');
    assert.equal(entries.has('.sb'), false);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('previews images, drawio exports, and PDFs without exposing other files', async () => {
  const { root, vault } = await createSandbox();
  await fs.writeFile(path.join(vault, 'photo.png'), Buffer.from([1, 2, 3]));
  await fs.writeFile(path.join(vault, 'diagram.drawio.svg'), '<svg></svg>');
  await fs.writeFile(path.join(vault, 'manual.pdf'), '%PDF-1.4');
  await fs.writeFile(path.join(vault, 'note.md'), '# Note');
  await fs.mkdir(path.join(vault, '.sb'));
  await fs.writeFile(path.join(vault, '.sb', 'secret.png'), 'secret');
  const api = await startFileApi(vault);

  try {
    const preview = (filePath: string) => fetch(
      `${api.baseUrl}/api/files/preview?filePath=${encodeURIComponent(filePath)}`
    );
    const image = await preview('photo.png');
    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type') ?? '', /^image\/png/);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from([1, 2, 3]));

    const drawioExport = await preview('diagram.drawio.svg');
    assert.equal(drawioExport.status, 200);
    assert.match(drawioExport.headers.get('content-type') ?? '', /^image\/svg\+xml/);
    assert.match(drawioExport.headers.get('content-security-policy') ?? '', /default-src 'none'/);

    const pdf = await preview('manual.pdf');
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type') ?? '', /^application\/pdf/);
    assert.equal((await preview('note.md')).status, 415);
    assert.equal((await preview('.sb/secret.png')).status, 400);
    assert.equal((await preview('../outside.png')).status, 400);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('creates folders without allowing collisions or metadata paths', async () => {
  const { root, vault } = await createSandbox();
  await fs.mkdir(path.join(vault, 'projects'));
  const api = await startFileApi(vault);

  try {
    const created = await postJson(api.baseUrl, '/api/files/create-folder', {
      dirPath: 'projects/new-folder',
    });
    assert.equal(created.status, 200);
    assert.equal((await fs.stat(path.join(vault, 'projects', 'new-folder'))).isDirectory(), true);

    const collision = await postJson(api.baseUrl, '/api/files/create-folder', {
      dirPath: 'projects/new-folder',
    });
    assert.equal(collision.status, 409);

    const metadata = await postJson(api.baseUrl, '/api/files/create-folder', {
      dirPath: '.sb/private',
    });
    assert.equal(metadata.status, 400);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('creating a note refuses to report success when the path exists', async () => {
  const { root, vault } = await createSandbox();
  const notePath = path.join(vault, 'note.md');
  await fs.writeFile(notePath, 'original');
  const api = await startFileApi(vault);

  try {
    const response = await postJson(api.baseUrl, '/api/files/create', {
      filePath: 'note.md', content: 'replacement',
    });
    assert.equal(response.status, 409);
    assert.equal(await fs.readFile(notePath, 'utf-8'), 'original');

    const metadataCreate = await postJson(api.baseUrl, '/api/files/create', {
      filePath: '.sb/hidden.md', content: 'hidden',
    });
    assert.equal(metadataCreate.status, 400);
    const disguisedMetadataCreate = await postJson(api.baseUrl, '/api/files/create', {
      filePath: 'folder/../.sb/hidden.md', content: 'hidden',
    });
    assert.equal(disguisedMetadataCreate.status, 400);
    const metadataList = await postJson(api.baseUrl, '/api/files/list', { dirPath: '.sb' });
    assert.equal(metadataList.status, 400);
    const metadataDaily = await postJson(api.baseUrl, '/api/files/daily-note', { dailyDir: '.sb' });
    assert.equal(metadataDaily.status, 400);
    const metadataImage = await postJson(api.baseUrl, '/api/files/upload-image', {
      currentNoteDir: '.sb', data: 'aW1hZ2U=', mimeType: 'image/png',
    });
    assert.equal(metadataImage.status, 400);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('moves files and rejects collisions and moving a directory into itself', async () => {
  const { root, vault } = await createSandbox();
  await fs.mkdir(path.join(vault, 'archive'));
  await fs.mkdir(path.join(vault, 'folder'));
  await fs.writeFile(path.join(vault, 'note.md'), 'note');
  await fs.writeFile(path.join(vault, 'other.md'), 'other');
  await fs.writeFile(path.join(vault, 'archive', 'existing.md'), 'existing');
  const api = await startFileApi(vault);

  try {
    const moved = await postJson(api.baseUrl, '/api/files/rename', {
      oldPath: 'note.md', newPath: 'archive/note.md',
    });
    assert.equal(moved.status, 200);
    assert.equal(await fs.readFile(path.join(vault, 'archive', 'note.md'), 'utf-8'), 'note');

    const collision = await postJson(api.baseUrl, '/api/files/rename', {
      oldPath: 'other.md', newPath: 'archive/existing.md',
    });
    assert.equal(collision.status, 409);
    assert.equal(await fs.readFile(path.join(vault, 'other.md'), 'utf-8'), 'other');

    const selfMove = await postJson(api.baseUrl, '/api/files/rename', {
      oldPath: 'folder', newPath: 'folder/nested',
    });
    assert.equal(selfMove.status, 400);
    assert.equal((await fs.stat(path.join(vault, 'folder'))).isDirectory(), true);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('moves a non-empty directory to trash and restores it', async () => {
  const { root, vault } = await createSandbox();
  const notePath = path.join(vault, 'folder', 'note.md');
  await fs.mkdir(path.dirname(notePath));
  await fs.writeFile(notePath, 'keep');
  const api = await startFileApi(vault);

  try {
    const deleted = await postJson(api.baseUrl, '/api/files/delete', { filePath: 'folder' });
    assert.equal(deleted.status, 200);
    const deletedBody = await deleted.json() as { item: TrashItem };
    assert.equal(deletedBody.item.originalPath, 'folder');
    assert.equal(deletedBody.item.entryType, 'directory');
    await assert.rejects(fs.access(notePath));

    const listResponse = await fetch(`${api.baseUrl}/api/files/trash`);
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json() as { items: TrashItem[] };
    assert.equal(listBody.items.length, 1);
    assert.equal(listBody.items[0].id, deletedBody.item.id);

    const restored = await postJson(api.baseUrl, '/api/files/restore', {
      trashId: deletedBody.item.id,
    });
    assert.equal(restored.status, 200);
    assert.equal(await fs.readFile(notePath, 'utf-8'), 'keep');
    const emptyTrash = await fetch(`${api.baseUrl}/api/files/trash`);
    assert.deepEqual((await emptyTrash.json() as { items: TrashItem[] }).items, []);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});

test('restore refuses to overwrite a path recreated after deletion', async () => {
  const { root, vault } = await createSandbox();
  const notePath = path.join(vault, 'note.md');
  await fs.writeFile(notePath, 'original');
  const api = await startFileApi(vault);

  try {
    const deleted = await postJson(api.baseUrl, '/api/files/delete', { filePath: 'note.md' });
    const { item } = await deleted.json() as { item: TrashItem };
    await fs.writeFile(notePath, 'new file');

    const restored = await postJson(api.baseUrl, '/api/files/restore', { trashId: item.id });
    assert.equal(restored.status, 409);
    assert.equal(await fs.readFile(notePath, 'utf-8'), 'new file');
    const listResponse = await fetch(`${api.baseUrl}/api/files/trash`);
    assert.equal((await listResponse.json() as { items: TrashItem[] }).items.length, 1);
  } finally {
    await closeServer(api.server);
    await removeSandbox(root);
  }
});
