import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LinkStore, LinkStoreLoadError } from '../src/server/services/link-store.js';
import { startServer } from '../src/server/index.js';

async function createSandbox(): Promise<{ root: string; vault: string; storePath: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-link-store-'));
  const vault = path.join(root, 'vault');
  const metadataDir = path.join(vault, '.sb');
  await fs.mkdir(metadataDir, { recursive: true });
  return { root, vault, storePath: path.join(metadataDir, 'links.json') };
}

async function removeSandbox(root: string): Promise<void> {
  const resolved = path.resolve(root);
  const temp = path.resolve(os.tmpdir());
  const relative = path.relative(temp, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
    || !path.basename(resolved).startsWith('sb-link-store-')) {
    throw new Error(`Refusing to remove unexpected test directory: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}

test('missing LinkStore initializes once without creating a fake backup', async () => {
  const { root, vault, storePath } = await createSandbox();
  try {
    const store = new LinkStore(vault);
    await store.load();
    assert.deepEqual(JSON.parse(await fs.readFile(storePath, 'utf-8')), {
      version: 1, links: [], tags: {},
    });
    await assert.rejects(fs.stat(`${storePath}.bak`), { code: 'ENOENT' });
  } finally {
    await removeSandbox(root);
  }
});

test('corrupt, invalid, and unknown LinkStore data is preserved and rejected', async () => {
  const { root, vault, storePath } = await createSandbox();
  const invalidContents = [
    '{broken',
    JSON.stringify({ version: 1, links: [{ from: '', to: 'b.md' }], tags: {} }),
    JSON.stringify({ version: 99, links: [], tags: {} }),
  ];
  try {
    for (const content of invalidContents) {
      await fs.writeFile(storePath, content, 'utf-8');
      const store = new LinkStore(vault);
      await assert.rejects(store.load(), LinkStoreLoadError);
      assert.equal(await fs.readFile(storePath, 'utf-8'), content);
    }
  } finally {
    await removeSandbox(root);
  }
});

test('mutations back up the previous valid generation before atomic replacement', async () => {
  const { root, vault, storePath } = await createSandbox();
  const original = `${JSON.stringify({
    version: 1,
    links: [],
    tags: { 'a.md': ['existing'] },
  }, null, 2)}\n`;
  try {
    await fs.writeFile(storePath, original, 'utf-8');
    const store = new LinkStore(vault);
    await store.load();
    await store.addLink('a.md', 'b.md');
    assert.equal(await fs.readFile(`${storePath}.bak`, 'utf-8'), original);
    const afterLink = await fs.readFile(storePath, 'utf-8');
    assert.deepEqual(JSON.parse(afterLink).links, [{ from: 'a.md', to: 'b.md' }]);

    await store.addTags('a.md', ['new']);
    assert.equal(await fs.readFile(`${storePath}.bak`, 'utf-8'), afterLink);
    assert.deepEqual(store.getTags('a.md'), ['existing', 'new']);
  } finally {
    await removeSandbox(root);
  }
});

test('an external LinkStore edit is not overwritten by a later mutation', async () => {
  const { root, vault, storePath } = await createSandbox();
  try {
    await fs.writeFile(storePath, JSON.stringify({ version: 1, links: [], tags: {} }), 'utf-8');
    const store = new LinkStore(vault);
    await store.load();
    const external = JSON.stringify({ version: 1, links: [], tags: { 'external.md': ['kept'] } });
    await fs.writeFile(storePath, external, 'utf-8');
    await assert.rejects(store.addLink('a.md', 'b.md'), /changed on disk/i);
    assert.equal(await fs.readFile(storePath, 'utf-8'), external);
    assert.deepEqual(store.getAllLinks(), []);
  } finally {
    await removeSandbox(root);
  }
});

test('the API reports an external LinkStore edit as a conflict', async () => {
  const { root, vault, storePath } = await createSandbox();
  await fs.writeFile(path.join(vault, 'a.md'), '# A');
  await fs.writeFile(path.join(vault, 'b.md'), '# B');
  await fs.writeFile(storePath, JSON.stringify({ version: 1, links: [], tags: {} }), 'utf-8');
  const started = await startServer({ notesDir: vault, port: 0, silent: true });
  try {
    const external = JSON.stringify({ version: 1, links: [], tags: { 'a.md': ['external'] } });
    await fs.writeFile(storePath, external, 'utf-8');
    const response = await fetch(`http://127.0.0.1:${started.port}/api/links/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'a.md', to: 'b.md' }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json() as { code: string }).code, 'LINK_STORE_CHANGED');
    assert.equal(await fs.readFile(storePath, 'utf-8'), external);
  } finally {
    await started.watcher.close();
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => error ? reject(error) : resolve());
    });
    await removeSandbox(root);
  }
});
