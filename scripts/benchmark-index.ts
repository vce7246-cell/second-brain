import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import { WikilinkIndexer } from '../src/server/services/indexer.js';

const BENCH_PREFIX = 'secondbrain-index-benchmark-';

interface BenchmarkOptions {
  notes: number;
  linksPerNote: number;
  keep: boolean;
}

interface BenchmarkResult {
  name: string;
  ms: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptions(argv: string[]): BenchmarkOptions {
  const options: BenchmarkOptions = { notes: 1000, linksPerNote: 3, keep: false };

  for (const arg of argv) {
    if (arg.startsWith('--notes=')) {
      options.notes = parsePositiveInt(arg.slice('--notes='.length), options.notes);
    } else if (arg.startsWith('--links=')) {
      options.linksPerNote = parsePositiveInt(arg.slice('--links='.length), options.linksPerNote);
    } else if (arg === '--keep') {
      options.keep = true;
    }
  }

  return options;
}

function noteTitle(index: number): string {
  return `Note ${String(index).padStart(4, '0')}`;
}

function notePath(index: number): string {
  const group = Math.floor(index / 100);
  return `group-${String(group).padStart(2, '0')}/note-${String(index).padStart(4, '0')}.md`;
}

function noteContent(index: number, linksPerNote: number): string {
  const links: string[] = [];
  for (let offset = 1; offset <= linksPerNote; offset += 1) {
    const target = index - offset;
    if (target < 0) break;
    links.push(`[[${noteTitle(target)}]]`);
  }

  return [
    '---',
    `title: ${noteTitle(index)}`,
    `tags: [benchmark, group-${Math.floor(index / 100)}]`,
    '---',
    '',
    `# ${noteTitle(index)}`,
    '',
    `This is generated benchmark note ${index}.`,
    links.length > 0 ? `Links: ${links.join(', ')}` : 'Links: none',
    '',
  ].join('\n');
}

async function writeBatch(root: string, start: number, end: number, linksPerNote: number): Promise<void> {
  await Promise.all(
    Array.from({ length: end - start }, async (_, offset) => {
      const index = start + offset;
      const relPath = notePath(index);
      const fullPath = path.join(root, relPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, noteContent(index, linksPerNote), 'utf-8');
    })
  );
}

async function createVault(root: string, notes: number, linksPerNote: number): Promise<void> {
  const batchSize = 100;
  for (let start = 0; start < notes; start += batchSize) {
    await writeBatch(root, start, Math.min(start + batchSize, notes), linksPerNote);
  }
}

async function timeStep(name: string, fn: () => Promise<void> | void): Promise<BenchmarkResult> {
  const start = performance.now();
  await fn();
  return { name, ms: performance.now() - start };
}

function runTitleSearch(indexer: WikilinkIndexer, query: string, limit: number): number {
  const lowerQuery = query.toLowerCase();
  const results: Array<{ path: string; title: string }> = [];
  const pathToTitle = indexer.getPathToTitle();

  for (const filePath of indexer.getAllPaths()) {
    const title = pathToTitle.get(filePath) || filePath;
    if (!query || title.toLowerCase().includes(lowerQuery) || filePath.toLowerCase().includes(lowerQuery)) {
      results.push({ path: filePath, title });
    }
  }

  results.sort((a, b) => {
    const aStarts = a.title.toLowerCase().startsWith(lowerQuery);
    const bStarts = b.title.toLowerCase().startsWith(lowerQuery);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.title.localeCompare(b.title);
  });

  return results.slice(0, limit).length;
}

async function cleanup(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const resolvedTemp = path.resolve(os.tmpdir());
  const base = path.basename(resolvedRoot);
  if (!base.startsWith(BENCH_PREFIX) || !resolvedRoot.startsWith(resolvedTemp)) {
    throw new Error(`Refusing to remove unsafe benchmark path: ${resolvedRoot}`);
  }
  await fs.rm(resolvedRoot, { recursive: true, force: true });
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), BENCH_PREFIX));
  const results: BenchmarkResult[] = [];

  try {
    results.push(await timeStep('generate temp vault', () => createVault(root, options.notes, options.linksPerNote)));

    const indexer = new WikilinkIndexer(root);
    results.push(await timeStep('initial index rebuild', () => indexer.rebuild()));

    let graphNodes = 0;
    let graphLinks = 0;
    results.push(await timeStep('merged graph data', () => {
      const graph = indexer.getMergedGraphData();
      graphNodes = graph.nodes.length;
      graphLinks = graph.links.length;
    }));

    let searchHits = 0;
    results.push(await timeStep('title search', () => {
      searchHits = runTitleSearch(indexer, 'Note 09', 20);
    }));

    const changedIndex = Math.max(0, Math.floor(options.notes / 2));
    const changedRelPath = notePath(changedIndex);
    const stableTitle = noteTitle(changedIndex);
    await fs.writeFile(
      path.join(root, changedRelPath),
      [
        '---',
        `title: ${stableTitle}`,
        '---',
        '',
        `# ${stableTitle}`,
        '',
        'Content-only benchmark edit.',
        '[[Note 0001]]',
        '',
      ].join('\n'),
      'utf-8'
    );

    results.push(await timeStep('content-only index refresh', () => indexer.updateFile(changedRelPath)));

    const changedTitle = `${stableTitle} Edited`;
    await fs.writeFile(
      path.join(root, changedRelPath),
      [
        '---',
        `title: ${changedTitle}`,
        '---',
        '',
        `# ${changedTitle}`,
        '',
        'Title-change benchmark edit.',
        '[[Note 0001]]',
        '',
      ].join('\n'),
      'utf-8'
    );

    results.push(await timeStep('title-change index refresh', () => indexer.updateFile(changedRelPath)));
    const resolvedEditedTitle = indexer.getTitleToPath().get(changedTitle.toLowerCase());
    if (resolvedEditedTitle !== changedRelPath) {
      throw new Error('Index refresh did not expose the edited title.');
    }

    console.log(JSON.stringify({
      notes: options.notes,
      linksPerNote: options.linksPerNote,
      vault: root,
      graphNodes,
      graphLinks,
      searchHits,
      results: results.map((result) => ({
        name: result.name,
        ms: Math.round(result.ms * 10) / 10,
      })),
    }, null, 2));
  } finally {
    if (options.keep) {
      console.log(`Kept benchmark vault: ${root}`);
    } else {
      await cleanup(root);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
