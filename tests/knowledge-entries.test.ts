import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startServer } from '../src/server/index.js';

async function createVault(): Promise<{ root: string; vault: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-knowledge-'));
  const vault = path.join(root, 'vault');
  await fs.mkdir(path.join(vault, 'docs'), { recursive: true });
  await fs.mkdir(path.join(vault, '.hidden'), { recursive: true });
  await fs.mkdir(path.join(vault, 'node_modules'), { recursive: true });
  await fs.writeFile(path.join(vault, 'note.md'), '# Note\n');
  await fs.writeFile(path.join(vault, 'diagram.drawio'), '<mxfile />');
  await fs.writeFile(path.join(vault, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await fs.writeFile(path.join(vault, 'docs', 'reference.pdf'), '%PDF-test');
  await fs.writeFile(path.join(vault, '.hidden', 'secret.txt'), 'hidden');
  await fs.writeFile(path.join(vault, 'node_modules', 'ignored.txt'), 'ignored');
  return { root, vault };
}

async function removeVault(root: string): Promise<void> {
  const resolved = path.resolve(root);
  const temp = path.resolve(os.tmpdir());
  const relative = path.relative(temp, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
    || !path.basename(resolved).startsWith('sb-knowledge-')) {
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

async function postJson(baseUrl: string, route: string, body: object): Promise<Response> {
  return fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('visible non-Markdown files are searchable knowledge entries and graph nodes', async () => {
  const { root, vault } = await createVault();
  const running = await startServer({ notesDir: vault, port: 0, silent: true });
  const baseUrl = `http://127.0.0.1:${running.port}`;

  try {
    const graphResponse = await fetch(`${baseUrl}/api/notes/graph`);
    const graph = await graphResponse.json() as {
      nodes: Array<{ id: string; label: string; kind: string }>;
    };
    assert.deepEqual(
      graph.nodes.map((node) => [node.id, node.kind]),
      [
      ['diagram.drawio', 'drawio'],
        ['docs/reference.pdf', 'pdf'],
        ['image.png', 'image'],
        ['note.md', 'markdown'],
      ]
    );
    assert.equal(graph.nodes.find((node) => node.id === 'note.md')?.label, 'note');
    assert.equal(graph.nodes.some((node) => node.id.includes('.hidden')), false);
    assert.equal(graph.nodes.some((node) => node.id.includes('node_modules')), false);

    const searchResponse = await postJson(baseUrl, '/api/knowledge/search', {
      query: 'reference',
      limit: 10,
    });
    assert.equal(searchResponse.status, 200);
    assert.deepEqual(await searchResponse.json(), {
      results: [{ path: 'docs/reference.pdf', title: 'reference.pdf' }],
    });

    const noteSearchResponse = await postJson(baseUrl, '/api/notes/search', {
      query: 'reference',
      limit: 10,
    });
    assert.deepEqual(await noteSearchResponse.json(), { results: [] });
  } finally {
    await stopServer(running);
    await removeVault(root);
  }
});

test('attachments can persist tags and manual relations used by graph and tag filtering', async () => {
  const { root, vault } = await createVault();
  const running = await startServer({ notesDir: vault, port: 0, silent: true });
  const baseUrl = `http://127.0.0.1:${running.port}`;

  try {
    assert.equal((await postJson(baseUrl, '/api/links/add', {
      from: 'image.png',
      to: 'note.md',
    })).status, 200);
    assert.equal((await postJson(baseUrl, '/api/links/add', {
      from: 'note.md',
      to: 'docs/reference.pdf',
    })).status, 200);
    assert.equal((await postJson(baseUrl, '/api/tags/add', {
      filePath: 'image.png',
      tags: ['素材'],
    })).status, 200);

    const imageRelations = await postJson(baseUrl, '/api/links/list', { filePath: 'image.png' });
    assert.deepEqual(await imageRelations.json(), {
      filePath: 'image.png',
      links: [{
        source: 'image.png',
        target: 'note.md',
        resolvedPath: 'note.md',
        sourceType: 'ui',
      }],
      backlinks: [],
      tags: ['素材'],
    });

    const graph = await (await fetch(`${baseUrl}/api/notes/graph`)).json() as {
      links: Array<{ source: string; target: string }>;
    };
    assert.deepEqual(graph.links, [
      { source: 'image.png', target: 'note.md' },
      { source: 'note.md', target: 'docs/reference.pdf' },
    ]);

    const filtered = await postJson(baseUrl, '/api/tags/filter', { tags: ['素材'] });
    assert.deepEqual(await filtered.json(), {
      items: [{ path: 'image.png', title: 'image.png' }],
      notes: [{ path: 'image.png', title: 'image.png' }],
    });
  } finally {
    await stopServer(running);
    await removeVault(root);
  }
});

test('dashboard summarizes visible notes and attachments as one knowledge library', async () => {
  const { root, vault } = await createVault();
  await fs.writeFile(path.join(vault, 'linked.md'), '# Linked\n[[Note]]\n');

  const orderedPaths = [
    'diagram.drawio',
    'note.md',
    'linked.md',
    'image.png',
    'docs/reference.pdf',
  ];
  const baseTime = Date.now() - 60_000;
  for (const [index, filePath] of orderedPaths.entries()) {
    const timestamp = new Date(baseTime + index * 1_000);
    await fs.utimes(path.join(vault, filePath), timestamp, timestamp);
  }

  const running = await startServer({ notesDir: vault, port: 0, silent: true });
  const baseUrl = `http://127.0.0.1:${running.port}`;

  try {
    assert.equal((await postJson(baseUrl, '/api/links/add', {
      from: 'image.png',
      to: 'note.md',
    })).status, 200);
    assert.equal((await postJson(baseUrl, '/api/links/add', {
      from: 'note.md',
      to: 'docs/reference.pdf',
    })).status, 200);
    assert.equal((await postJson(baseUrl, '/api/tags/add', {
      filePath: 'image.png',
      tags: ['素材'],
    })).status, 200);

    const response = await fetch(`${baseUrl}/api/dashboard`);
    assert.equal(response.status, 200);
    const dashboard = await response.json() as {
      totalItems: number;
      totalNotes: number;
      totalAttachments: number;
      totalLinks: number;
      totalTags: number;
      coreNodes: Array<{ path: string; title: string; kind: string; relationCount: number }>;
      orphanItems: Array<{ path: string; title: string; kind: string }>;
      folderGroups: Array<{ name: string; count: number; linkCount: number }>;
      recentItems: Array<{ path: string; kind: string }>;
      health: {
        brokenLinks: number;
        brokenLinkItems: Array<{ source: string; target: string }>;
        orphanCount: number;
        untaggedAttachments: number;
        untaggedAttachmentItems: Array<{ path: string; title: string; kind: string }>;
        duplicateTitleCount: number;
        duplicateTitleItems: Array<{ title: string; paths: string[] }>;
      };
    };

    assert.deepEqual({
      totalItems: dashboard.totalItems,
      totalNotes: dashboard.totalNotes,
      totalAttachments: dashboard.totalAttachments,
      totalLinks: dashboard.totalLinks,
      totalTags: dashboard.totalTags,
    }, {
      totalItems: 5,
      totalNotes: 2,
      totalAttachments: 3,
      totalLinks: 3,
      totalTags: 1,
    });
    assert.deepEqual(dashboard.health, {
      brokenLinks: 0,
      brokenLinkItems: [],
      orphanCount: 1,
      untaggedAttachments: 2,
      untaggedAttachmentItems: [
        { path: 'diagram.drawio', title: 'diagram.drawio', kind: 'drawio' },
        { path: 'docs/reference.pdf', title: 'reference.pdf', kind: 'pdf' },
      ],
      duplicateTitleCount: 0,
      duplicateTitleItems: [],
    });
    assert.deepEqual(dashboard.coreNodes, [
      { path: 'note.md', title: 'note', kind: 'markdown', relationCount: 3 },
      { path: 'docs/reference.pdf', title: 'reference.pdf', kind: 'pdf', relationCount: 1 },
      { path: 'image.png', title: 'image.png', kind: 'image', relationCount: 1 },
      { path: 'linked.md', title: 'linked', kind: 'markdown', relationCount: 1 },
    ]);
    assert.deepEqual(dashboard.orphanItems, [
      { path: 'diagram.drawio', title: 'diagram.drawio', kind: 'drawio' },
    ]);
    assert.deepEqual(dashboard.folderGroups, [
      { name: 'docs', count: 1, linkCount: 1 },
    ]);
    assert.deepEqual(
      dashboard.recentItems,
      [...dashboard.recentItems].sort((a, b) => orderedPaths.indexOf(b.path) - orderedPaths.indexOf(a.path))
    );
    assert.deepEqual(
      dashboard.recentItems.map(({ path: filePath, kind }) => [filePath, kind]),
      [
        ['docs/reference.pdf', 'pdf'],
        ['image.png', 'image'],
        ['linked.md', 'markdown'],
        ['note.md', 'markdown'],
        ['diagram.drawio', 'drawio'],
      ]
    );
  } finally {
    await stopServer(running);
    await removeVault(root);
  }
});

test('knowledge mutations reject missing, directory, hidden, and escaping paths without persistence', async () => {
  const { root, vault } = await createVault();
  const running = await startServer({ notesDir: vault, port: 0, silent: true });
  const baseUrl = `http://127.0.0.1:${running.port}`;

  try {
    const invalidRequests = [
      ['/api/links/add', { from: '../outside.md', to: 'note.md' }],
      ['/api/links/add', { from: 'missing.pdf', to: 'note.md' }],
      ['/api/links/add', { from: 'docs', to: 'note.md' }],
      ['/api/tags/add', { filePath: '.hidden/secret.txt', tags: ['secret'] }],
    ] as const;

    for (const [route, body] of invalidRequests) {
      const response = await postJson(baseUrl, route, body);
      assert.equal(response.status, 400, `${route} should reject ${JSON.stringify(body)}`);
    }

    const persisted = JSON.parse(
      await fs.readFile(path.join(vault, '.sb', 'links.json'), 'utf-8')
    ) as { links: unknown[]; tags: Record<string, string[]> };
    assert.deepEqual(persisted.links, []);
    assert.deepEqual(persisted.tags, {});
  } finally {
    await stopServer(running);
    await removeVault(root);
  }
});
