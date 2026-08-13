import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startServer } from '../src/server/index.js';

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

async function removeSandbox(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, resolvedRoot);
  const isInsideTemp = relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
  if (!isInsideTemp || !path.basename(resolvedRoot).startsWith('sb-metadata-')) {
    throw new Error(`Refusing to remove unexpected test directory: ${resolvedRoot}`);
  }
  await fs.rm(resolvedRoot, { recursive: true, force: true });
}

test('move, trash, and restore keep note metadata and indexes consistent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-metadata-'));
  const vault = path.join(root, 'vault');
  await fs.mkdir(vault);
  await fs.writeFile(path.join(vault, 'source.md'), '# Source');
  await fs.writeFile(path.join(vault, 'target.md'), '# Target');
  const started = await startServer({ notesDir: vault, port: 0, silent: true });
  const baseUrl = `http://127.0.0.1:${started.port}`;

  try {
    assert.equal((await postJson(baseUrl, '/api/links/add', {
      from: 'source.md', to: 'target.md',
    })).status, 200);
    assert.equal((await postJson(baseUrl, '/api/tags/add', {
      filePath: 'source.md', tags: ['important'],
    })).status, 200);

    const moveResponse = await postJson(baseUrl, '/api/files/rename', {
      oldPath: 'source.md', newPath: 'archive/source.md',
    });
    assert.equal(moveResponse.status, 200);

    const linksResponse = await postJson(baseUrl, '/api/links/list', {
      filePath: 'archive/source.md',
    });
    const links = await linksResponse.json() as {
      links: Array<{ resolvedPath: string | null; sourceType?: string }>;
      tags: string[];
    };
    assert.equal(
      links.links.some((link) => link.resolvedPath === 'target.md' && link.sourceType === 'ui'),
      true
    );
    assert.deepEqual(links.tags, ['important']);

    const tagsResponse = await postJson(baseUrl, '/api/tags/filter', {
      tags: ['important'],
    });
    const tags = await tagsResponse.json() as { notes: Array<{ path: string }> };
    assert.deepEqual(tags.notes.map((note) => note.path), ['archive/source.md']);

    const graphResponse = await fetch(`${baseUrl}/api/notes/graph`);
    const graph = await graphResponse.json() as {
      nodes: Array<{ id: string }>;
      links: Array<{ source: string; target: string }>;
    };
    assert.equal(graph.nodes.some((node) => node.id === 'archive/source.md'), true);
    assert.equal(graph.nodes.some((node) => node.id === 'source.md'), false);

    const deleteResponse = await postJson(baseUrl, '/api/files/delete', {
      filePath: 'archive/source.md',
    });
    assert.equal(deleteResponse.status, 200);
    const deleted = await deleteResponse.json() as { item: { id: string } };

    const trashedGraph = await fetch(`${baseUrl}/api/notes/graph`).then((response) => response.json()) as {
      nodes: Array<{ id: string }>;
      links: Array<{ source: string; target: string }>;
    };
    assert.equal(trashedGraph.nodes.some((node) => node.id === 'archive/source.md'), false);
    assert.equal(
      trashedGraph.links.some((link) => link.source === 'archive/source.md' || link.target === 'archive/source.md'),
      false
    );
    const trashedTags = await postJson(baseUrl, '/api/tags/filter', { tags: ['important'] })
      .then((response) => response.json()) as { notes: Array<{ path: string }> };
    assert.deepEqual(trashedTags.notes, []);

    const restoreResponse = await postJson(baseUrl, '/api/files/restore', {
      trashId: deleted.item.id,
    });
    assert.equal(restoreResponse.status, 200);
    const restoredTags = await postJson(baseUrl, '/api/tags/filter', { tags: ['important'] })
      .then((response) => response.json()) as { notes: Array<{ path: string }> };
    assert.deepEqual(restoredTags.notes.map((note) => note.path), ['archive/source.md']);
    const restoredGraph = await fetch(`${baseUrl}/api/notes/graph`).then((response) => response.json()) as {
      nodes: Array<{ id: string }>;
      links: Array<{ source: string; target: string }>;
    };
    assert.equal(restoredGraph.nodes.some((node) => node.id === 'archive/source.md'), true);
    assert.equal(
      restoredGraph.links.some((link) => link.source === 'archive/source.md' && link.target === 'target.md'),
      true
    );
  } finally {
    await started.watcher.close();
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => error ? reject(error) : resolve());
    });
    await removeSandbox(root);
  }
});
