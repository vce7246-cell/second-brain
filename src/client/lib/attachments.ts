import { getFileKind, type FileKind } from '../../shared/file-types.js';
import type { TreeNode } from '../types/index.js';

export interface AttachmentEntry {
  name: string;
  path: string;
  kind: Exclude<FileKind, 'directory' | 'markdown'>;
}

function fileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function markdownDestination(filePath: string): string {
  const encoded = filePath
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  return /[\s()<>]/.test(filePath) ? `<${encoded}>` : encoded;
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/([\\\]])/g, '\\$1');
}

function vaultParts(filePath: string): string[] {
  return filePath.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
}

function relativeAttachmentPath(filePath: string, currentNotePath?: string | null): string {
  const targetParts = vaultParts(filePath);
  if (!currentNotePath) return targetParts.join('/');

  const noteDirectory = vaultParts(currentNotePath);
  noteDirectory.pop();
  let commonLength = 0;
  while (
    commonLength < noteDirectory.length
    && commonLength < targetParts.length
    && noteDirectory[commonLength] === targetParts[commonLength]
  ) {
    commonLength++;
  }
  const relative = [
    ...noteDirectory.slice(commonLength).map(() => '..'),
    ...targetParts.slice(commonLength),
  ].join('/');
  return relative.startsWith('..') ? relative : `./${relative}`;
}

export function resolveAttachmentPath(referencePath: string, currentNotePath?: string | null): string | null {
  const withoutQuery = referencePath.trim().split(/[?#]/, 1)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery).replace(/\\/g, '/');
  } catch {
    return null;
  }

  const explicitlyRelative = decoded.startsWith('./') || decoded.startsWith('../');
  const resolvedParts = explicitlyRelative && currentNotePath
    ? vaultParts(currentNotePath).slice(0, -1)
    : [];
  const pathToResolve = explicitlyRelative ? decoded : decoded.replace(/^\/+/, '');
  for (const part of pathToResolve.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (resolvedParts.length === 0) return null;
      resolvedParts.pop();
    } else {
      resolvedParts.push(part);
    }
  }
  return resolvedParts.length ? resolvedParts.join('/') : null;
}

export function markdownAttachmentReference(filePath: string, currentNotePath?: string | null): string {
  const destination = markdownDestination(relativeAttachmentPath(filePath, currentNotePath));
  if (getFileKind(filePath) === 'image') return `![](${destination})`;
  return `[${escapeMarkdownLabel(fileName(filePath))}](${destination})`;
}

export function collectAttachments(tree: TreeNode): AttachmentEntry[] {
  const attachments: AttachmentEntry[] = [];

  function visit(node: TreeNode): void {
    if (node.type === 'directory') {
      node.children?.forEach(visit);
      return;
    }
    if (node.kind === 'directory' || node.kind === 'markdown') return;
    attachments.push({ name: node.name, path: node.path, kind: node.kind });
  }

  visit(tree);
  return attachments.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}
