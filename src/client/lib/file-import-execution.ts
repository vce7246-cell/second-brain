import { MAX_FILE_IMPORT_BYTES } from '../../shared/constants.js';
import { ApiError, ensureVaultImportFolder, importVaultFile } from './api.js';
import type { FileImportCollection, FileImportSkip } from './file-import-collection.js';
import { importDestinationPath } from './file-import-target.js';

export interface ImportFailure {
  name: string;
  reason: string;
}

export interface ImportSummary {
  importedPaths: string[];
  createdFolders: number;
  reusedFolders: number;
  failures: ImportFailure[];
  skipped: FileImportSkip[];
}

const IMPORT_LIMIT_LABEL = `${MAX_FILE_IMPORT_BYTES / 1024 / 1024} MB`;

export function readableImportFailure(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'PATH_EXISTS': return '同名文件或文件夹已存在';
      case 'FILE_TOO_LARGE': return `文件超过 ${IMPORT_LIMIT_LABEL}`;
      case 'PROTECTED_PATH': return '隐藏或元数据路径不可导入';
      case 'INVALID_PARENT': return '目标文件夹不存在或不可用';
    }
  }
  return error instanceof Error ? error.message : '导入失败';
}

interface ImportExecutionOptions {
  targetDirectory: string;
  onProgress: (progress: string) => void;
  onImported: () => void | Promise<void>;
}

export async function executeFileImport(
  collection: FileImportCollection,
  options: ImportExecutionOptions
): Promise<ImportSummary> {
  const { targetDirectory, onProgress, onImported } = options;
  const importedPaths: string[] = [];
  const failures: ImportFailure[] = [];
  let createdFolders = 0;
  let reusedFolders = 0;

  if (collection.files.length === 0 && collection.directories.length === 0 && collection.skipped.length === 0) {
    failures.push({ name: '选择内容', reason: '未检测到可导入的文件或文件夹' });
  }

  for (const [index, relativeDirectory] of collection.directories.entries()) {
    onProgress(`文件夹 ${index + 1}/${collection.directories.length}`);
    const destination = importDestinationPath(targetDirectory, relativeDirectory);
    try {
      const result = await ensureVaultImportFolder(destination);
      if (result.created) createdFolders += 1;
      else reusedFolders += 1;
    } catch (error) {
      failures.push({ name: relativeDirectory, reason: readableImportFailure(error) });
    }
  }

  for (const [index, item] of collection.files.entries()) {
    onProgress(`文件 ${index + 1}/${collection.files.length}`);
    if (item.file.size > MAX_FILE_IMPORT_BYTES) {
      failures.push({ name: item.relativePath, reason: `文件超过 ${IMPORT_LIMIT_LABEL}` });
      continue;
    }
    try {
      const destination = importDestinationPath(targetDirectory, item.relativePath);
      const result = await importVaultFile(destination, item.file);
      importedPaths.push(result.filePath);
    } catch (error) {
      failures.push({ name: item.relativePath, reason: readableImportFailure(error) });
    }
  }

  if (createdFolders > 0 || importedPaths.length > 0) {
    try {
      await onImported();
    } catch (error) {
      failures.push({ name: '文件树', reason: readableImportFailure(error) });
    }
  }

  return {
    importedPaths,
    createdFolders,
    reusedFolders,
    failures,
    skipped: collection.skipped,
  };
}
