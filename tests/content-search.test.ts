import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startServer } from '../src/server/index.js';

interface SearchResult {
  path: string;
  title: string;
  kind: string;
  matchSource: 'title' | 'path' | 'content';
  snippet: string;
}

async function createVault(): Promise<{ root: string; vault: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-content-search-'));
  const vault = path.join(root, 'vault');
  await fs.mkdir(path.join(vault, '.hidden'), { recursive: true });
  await fs.writeFile(path.join(vault, 'project.md'), [
    '---',
    'title: Needle Project',
    '---',
    'A searchable project note.',
  ].join('\n'));
  await fs.writeFile(path.join(vault, 'body.md'), '# Body\nA private constellation grows here.');
  await fs.writeFile(path.join(vault, 'source.ts'), 'export const constellationToken = true;');
  await fs.writeFile(path.join(vault, 'constellation-map.pdf'), '%PDF constellation body');
  await fs.writeFile(path.join(vault, 'diagram.drawio'), '<mxfile>constellation</mxfile>');
  await fs.writeFile(path.join(vault, 'large.txt'), `constellation${'x'.repeat(1024 * 1024)}`);
  await fs.writeFile(path.join(vault, '.hidden', 'secret.txt'), 'constellation');
  return { root, vault };
}

async function removeVault(root: string): Promise<void> {
  const resolved = path.resolve(root);
  const relative = path.relative(path.resolve(os.tmpdir()), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
    || !path.basename(resolved).startsWith('sb-content-search-')) {
    throw new Error(`Refusing to remove unexpected test directory: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}

async function stopServer(running: Awaited<ReturnType<typeof startServer>>): Promise<void> {
  await running.watcher.close();
  await new Promise<void>((resolve, reject) => {
    running.server.close((error) => error ? reject(error) : resolve());
  });
}

async function search(baseUrl: string, query: string, limit = 20): Promise<{
  response: Response;
  results: SearchResult[];
}> {
  const response = await fetch(`${baseUrl}/api/search/content`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, limit }),
  });
  const payload = await response.json() as { results?: SearchResult[] };
  return { response, results: payload.results ?? [] };
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 4_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail('Timed out waiting for search index update');
}

test('content search covers names and eligible local text without parsing binary files', async () => {
  const { root, vault } = await createVault();
  const running = await startServer({ notesDir: vault, port: 0, silent: true });
  const baseUrl = `http://127.0.0.1:${running.port}`;

  try {
    const titleSearch = await search(baseUrl, 'Needle Project');
    assert.equal(titleSearch.response.status, 200);
    assert.deepEqual(titleSearch.results.map(({ path: filePath, matchSource }) => [filePath, matchSource]), [
      ['project.md', 'title'],
    ]);
    assert.equal(titleSearch.results[0]?.snippet, 'A searchable project note.');

    const contentSearch = await search(baseUrl, 'constellation');
    assert.deepEqual(contentSearch.results.map(({ path: filePath, kind, matchSource }) => [
      filePath,
      kind,
      matchSource,
    ]), [
      ['constellation-map.pdf', 'pdf', 'title'],
      ['body.md', 'markdown', 'content'],
      ['source.ts', 'text', 'content'],
    ]);
    assert.match(contentSearch.results[1]?.snippet ?? '', /constellation/i);
    assert.match(contentSearch.results[2]?.snippet ?? '', /constellation/i);
    assert.equal(contentSearch.results.some((result) => result.path === 'diagram.drawio'), false);
    assert.equal(contentSearch.results.some((result) => result.path === 'large.txt'), false);
    assert.equal(contentSearch.results.some((result) => result.path.includes('.hidden')), false);
  } finally {
    await stopServer(running);
    await removeVault(root);
  }
});

test('content search reflects saves, external edits, and deletions without restart', async () => {
  const { root, vault } = await createVault();
  await fs.writeFile(path.join(vault, 'live.txt'), 'before token');
  const running = await startServer({ notesDir: vault, port: 0, silent: true });
  const watcherReady = new Promise<void>((resolve) => running.watcher.once('ready', resolve));
  const baseUrl = `http://127.0.0.1:${running.port}`;

  try {
    const readResponse = await fetch(`${baseUrl}/api/files/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filePath: 'body.md' }),
    });
    const { version } = await readResponse.json() as { version: string };
    const saveResponse = await fetch(`${baseUrl}/api/files/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filePath: 'body.md',
        content: '# Body\nsaved-search-token',
        expectedVersion: version,
      }),
    });
    assert.equal(saveResponse.status, 200);
    assert.deepEqual((await search(baseUrl, 'saved-search-token')).results.map((result) => result.path), [
      'body.md',
    ]);

    await watcherReady;
    await fs.writeFile(path.join(vault, 'live.txt'), 'external-search-token');
    await waitFor(async () => (await search(baseUrl, 'external-search-token')).results.length === 1);

    await fs.unlink(path.join(vault, 'live.txt'));
    await waitFor(async () => (await search(baseUrl, 'external-search-token')).results.length === 0);
  } finally {
    await stopServer(running);
    await removeVault(root);
  }
});

test('content search rejects blank, oversized, and invalid limit queries', async () => {
  const { root, vault } = await createVault();
  const running = await startServer({ notesDir: vault, port: 0, silent: true });
  const baseUrl = `http://127.0.0.1:${running.port}`;

  try {
    assert.equal((await search(baseUrl, '   ')).response.status, 400);
    assert.equal((await search(baseUrl, 'x'.repeat(201))).response.status, 400);
    assert.equal((await search(baseUrl, 'needle', 101)).response.status, 400);
  } finally {
    await stopServer(running);
    await removeVault(root);
  }
});
