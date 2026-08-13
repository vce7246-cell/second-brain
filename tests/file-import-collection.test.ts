import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectDroppedImportItems,
  collectSelectedImportItems,
} from '../src/client/lib/file-import-collection.js';

function fakeFile(name: string, webkitRelativePath = ''): File {
  return { name, size: 1, webkitRelativePath } as File;
}

function fakeFileEntry(file: File): FileSystemFileEntry {
  return {
    name: file.name,
    isFile: true,
    isDirectory: false,
    file: (callback: FileCallback) => callback(file),
  } as unknown as FileSystemFileEntry;
}

function fakeDirectoryEntry(
  name: string,
  batches: FileSystemEntry[][]
): FileSystemDirectoryEntry {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let index = 0;
      return {
        readEntries: (callback: FileSystemEntriesCallback) => callback(batches[index++] ?? []),
      };
    },
  } as unknown as FileSystemDirectoryEntry;
}

function fakeTransfer(entries: FileSystemEntry[]): DataTransfer {
  return {
    files: [] as unknown as FileList,
    items: entries.map((entry) => ({
      kind: 'file',
      webkitGetAsEntry: () => entry,
      getAsFile: () => null,
    })) as unknown as DataTransferItemList,
  } as DataTransfer;
}

test('recursively collects dropped folders across every reader batch', async () => {
  const hidden = fakeDirectoryEntry('.private', [[fakeFileEntry(fakeFile('secret.md'))], []]);
  const dependencies = fakeDirectoryEntry('node_modules', [[fakeFileEntry(fakeFile('pkg.js'))], []]);
  const assets = fakeDirectoryEntry('assets', [
    [fakeFileEntry(fakeFile('diagram.drawio'))],
    [fakeFileEntry(fakeFile('photo.png'))],
    [],
  ]);
  const empty = fakeDirectoryEntry('empty', [[]]);
  const project = fakeDirectoryEntry('Project', [
    [fakeFileEntry(fakeFile('README.md')), hidden],
    [assets, empty, dependencies],
    [],
  ]);

  const collection = await collectDroppedImportItems(fakeTransfer([project]));

  assert.deepEqual(collection.directories, ['Project', 'Project/assets', 'Project/empty']);
  assert.deepEqual(collection.files.map(({ relativePath }) => relativePath), [
    'Project/README.md',
    'Project/assets/diagram.drawio',
    'Project/assets/photo.png',
  ]);
  assert.deepEqual(collection.skipped, [
    { path: 'Project/.private', reason: '隐藏或依赖目录已跳过' },
    { path: 'Project/node_modules', reason: '隐藏或依赖目录已跳过' },
  ]);
});

test('folder-picker paths keep their structure and exclude protected segments', () => {
  const collection = collectSelectedImportItems([
    fakeFile('note.md', 'Research/note.md'),
    fakeFile('root.pdf'),
    fakeFile('secret.md', 'Research/.private/secret.md'),
    fakeFile('pkg.js', 'Research/node_modules/pkg.js'),
  ]);

  assert.deepEqual(collection.directories, ['Research']);
  assert.deepEqual(collection.files.map(({ relativePath }) => relativePath), [
    'Research/note.md',
    'root.pdf',
  ]);
  assert.deepEqual(collection.skipped, [
    { path: 'Research/.private/secret.md', reason: '隐藏或依赖目录已跳过' },
    { path: 'Research/node_modules/pkg.js', reason: '隐藏或依赖目录已跳过' },
  ]);
});

test('drop collection falls back to plain files when entry access is unavailable', async () => {
  const fallbackFile = fakeFile('fallback.txt');
  const transfer = {
    files: [] as unknown as FileList,
    items: [{
      kind: 'file',
      webkitGetAsEntry: () => { throw new Error('unsupported'); },
      getAsFile: () => fallbackFile,
    }] as unknown as DataTransferItemList,
  } as DataTransfer;

  const collection = await collectDroppedImportItems(transfer);
  assert.deepEqual(collection.files.map(({ relativePath }) => relativePath), ['fallback.txt']);
});
