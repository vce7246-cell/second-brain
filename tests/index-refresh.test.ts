import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startServer } from '../src/server/index.js';
import { WikilinkIndexer } from '../src/server/services/indexer.js';

async function createVault(): Promise<{ root: string; vault: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-index-'));
  const vault = path.join(root, 'vault');
  await fs.mkdir(vault);
  return { root, vault };
}

async function removeVault(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const relative = path.relative(path.resolve(os.tmpdir()), resolvedRoot);
  const isInsideTemp = relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);

  if (!isInsideTemp || !path.basename(resolvedRoot).startsWith('sb-index-')) {
    throw new Error(`Refusing to remove unexpected test directory: ${resolvedRoot}`);
  }
  await fs.rm(resolvedRoot, { recursive: true, force: true });
}

test('editing titles and links refreshes every dependent index', async () => {
  const { root, vault } = await createVault();

  try {
    await fs.writeFile(path.join(vault, 'source.md'), '[[Target Old]]');
    await fs.writeFile(path.join(vault, 'destination.md'), '---\ntitle: Target Old\n---\n');
    const indexer = new WikilinkIndexer(vault);
    await indexer.rebuild();

    assert.equal(indexer.getLinks('source.md')[0]?.resolvedPath, 'destination.md');
    assert.equal(indexer.getBacklinks('destination.md').length, 1);

    await fs.writeFile(path.join(vault, 'destination.md'), '---\ntitle: Target New\n---\n');
    await indexer.updateFile('destination.md');

    assert.equal(indexer.getPathToTitle().get('destination.md'), 'Target New');
    assert.equal(indexer.getTitleToPath().has('target old'), false);
    assert.equal(indexer.getTitleToPath().get('target new'), 'destination.md');
    assert.equal(indexer.getLinks('source.md')[0]?.resolvedPath, null);
    assert.equal(indexer.getBacklinks('destination.md').length, 0);

    await fs.writeFile(path.join(vault, 'source.md'), '[[Target New]]');
    await indexer.updateFile('source.md');

    assert.equal(indexer.getLinks('source.md')[0]?.resolvedPath, 'destination.md');
    assert.equal(indexer.getBacklinks('destination.md').length, 1);
  } finally {
    await removeVault(root);
  }
});

test('editing one source note only replaces its own link edges', async () => {
  const { root, vault } = await createVault();

  try {
    await fs.writeFile(path.join(vault, 'alpha.md'), '[[Beta]]');
    await fs.writeFile(path.join(vault, 'gamma.md'), '[[Beta]]');
    await fs.writeFile(path.join(vault, 'beta.md'), '---\ntitle: Beta\n---\n');
    await fs.writeFile(path.join(vault, 'delta.md'), '---\ntitle: Delta\n---\n');
    const indexer = new WikilinkIndexer(vault);
    await indexer.rebuild();

    assert.equal(indexer.getBacklinks('beta.md').length, 2);
    assert.equal(indexer.getBacklinks('delta.md').length, 0);

    await fs.writeFile(path.join(vault, 'alpha.md'), '[[Delta]]');
    await indexer.updateFile('alpha.md');

    assert.equal(indexer.getLinks('alpha.md')[0]?.resolvedPath, 'delta.md');
    assert.deepEqual(
      indexer.getBacklinks('beta.md').map((link) => link.source),
      ['gamma.md']
    );
    assert.deepEqual(
      indexer.getBacklinks('delta.md').map((link) => link.source),
      ['alpha.md']
    );
  } finally {
    await removeVault(root);
  }
});

test('save response waits until note indexes reflect the saved content', async () => {
  const { root, vault } = await createVault();
  await fs.writeFile(path.join(vault, 'note.md'), '---\ntitle: Before\n---\n');
  const running = await startServer({ notesDir: vault, port: 0, silent: true });
  const baseUrl = `http://127.0.0.1:${running.port}`;

  try {
    const readResponse = await fetch(`${baseUrl}/api/files/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filePath: 'note.md' }),
    });
    const { version } = await readResponse.json() as { version: string };

    const saveResponse = await fetch(`${baseUrl}/api/files/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filePath: 'note.md',
        content: '---\ntitle: After\n---\n',
        expectedVersion: version,
      }),
    });
    assert.equal(saveResponse.status, 200);

    const titlesResponse = await fetch(`${baseUrl}/api/notes/titles`);
    const { titles } = await titlesResponse.json() as { titles: Record<string, string> };
    assert.equal(titles['note.md'], 'After');
  } finally {
    await running.watcher.close();
    await new Promise<void>((resolve, reject) => {
      running.server.close((error) => error ? reject(error) : resolve());
    });
    await removeVault(root);
  }
});
