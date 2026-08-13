export interface FileImportItem {
  file: File;
  relativePath: string;
}

export interface FileImportSkip {
  path: string;
  reason: string;
}

export interface FileImportCollection {
  files: FileImportItem[];
  directories: string[];
  skipped: FileImportSkip[];
}

const PROTECTED_REASON = '隐藏或依赖目录已跳过';
const INVALID_PATH_REASON = '无效相对路径已跳过';

function comparePath(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function parseRelativePath(rawPath: string): { path: string; protected: boolean } | null {
  const segments = rawPath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    return null;
  }
  return {
    path: segments.join('/'),
    protected: segments.some((segment) => segment.startsWith('.') || segment === 'node_modules'),
  };
}

function addParentDirectories(filePath: string, directories: Set<string>): void {
  const segments = filePath.split('/');
  let current = '';
  for (const segment of segments.slice(0, -1)) {
    current = current ? `${current}/${segment}` : segment;
    directories.add(current);
  }
}

function finishCollection(
  files: FileImportItem[],
  directories: Set<string>,
  skipped: FileImportSkip[]
): FileImportCollection {
  return {
    files: files.sort((left, right) => comparePath(left.relativePath, right.relativePath)),
    directories: Array.from(directories).sort((left, right) => {
      const depthDifference = left.split('/').length - right.split('/').length;
      return depthDifference || comparePath(left, right);
    }),
    skipped: skipped.sort((left, right) => comparePath(left.path, right.path)),
  };
}

export function collectSelectedImportItems(selectedFiles: File[]): FileImportCollection {
  const files: FileImportItem[] = [];
  const directories = new Set<string>();
  const skipped: FileImportSkip[] = [];

  for (const file of selectedFiles) {
    const rawPath = file.webkitRelativePath || file.name;
    const parsed = parseRelativePath(rawPath);
    if (!parsed) {
      skipped.push({ path: rawPath || file.name, reason: INVALID_PATH_REASON });
      continue;
    }
    if (parsed.protected) {
      skipped.push({ path: parsed.path, reason: PROTECTED_REASON });
      continue;
    }
    files.push({ file, relativePath: parsed.path });
    addParentDirectories(parsed.path, directories);
  }

  return finishCollection(files, directories, skipped);
}

function readFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectory(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const entries: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

async function collectEntry(
  entry: FileSystemEntry,
  parentPath: string,
  files: FileImportItem[],
  directories: Set<string>,
  skipped: FileImportSkip[]
): Promise<void> {
  const rawPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  const parsed = parseRelativePath(rawPath);
  if (!parsed) {
    skipped.push({ path: rawPath, reason: INVALID_PATH_REASON });
    return;
  }
  if (parsed.protected) {
    skipped.push({ path: parsed.path, reason: PROTECTED_REASON });
    return;
  }

  try {
    if (entry.isFile) {
      files.push({ file: await readFile(entry as FileSystemFileEntry), relativePath: parsed.path });
      addParentDirectories(parsed.path, directories);
      return;
    }
    if (entry.isDirectory) {
      const children = await readDirectory(entry as FileSystemDirectoryEntry);
      directories.add(parsed.path);
      for (const child of children) {
        await collectEntry(child, parsed.path, files, directories, skipped);
      }
    }
  } catch {
    skipped.push({ path: parsed.path, reason: '浏览器无法读取此条目' });
  }
}

export async function collectDroppedImportItems(
  transfer: DataTransfer
): Promise<FileImportCollection> {
  const entries: FileSystemEntry[] = [];
  const fallbackFiles: File[] = [];

  for (const item of Array.from(transfer.items ?? [])) {
    if (item.kind !== 'file') continue;
    let entry: FileSystemEntry | null = null;
    try {
      entry = item.webkitGetAsEntry();
    } catch {
      // Fall back to the plain File API below.
    }
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) fallbackFiles.push(file);
    }
  }

  if (entries.length === 0) {
    const transferFiles = Array.from(transfer.files ?? []);
    return collectSelectedImportItems(transferFiles.length > 0 ? transferFiles : fallbackFiles);
  }

  const files: FileImportItem[] = [];
  const directories = new Set<string>();
  const skipped: FileImportSkip[] = [];
  for (const entry of entries) {
    await collectEntry(entry, '', files, directories, skipped);
  }
  const fallback = collectSelectedImportItems(fallbackFiles);
  for (const item of fallback.files) {
    files.push(item);
    addParentDirectories(item.relativePath, directories);
  }
  for (const directory of fallback.directories) directories.add(directory);
  skipped.push(...fallback.skipped);
  return finishCollection(files, directories, skipped);
}
