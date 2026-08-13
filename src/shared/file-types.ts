export type FileKind =
  | 'directory'
  | 'markdown'
  | 'text'
  | 'image'
  | 'pdf'
  | 'document'
  | 'audio'
  | 'video'
  | 'other';

export type PreviewFileKind = Extract<FileKind, 'text' | 'image' | 'pdf' | 'audio' | 'video'>;
export type ManagedFileKind = Exclude<FileKind, 'directory' | 'markdown' | PreviewFileKind>;

export function isPreviewFileKind(kind: FileKind): kind is PreviewFileKind {
  return kind === 'text'
    || kind === 'image'
    || kind === 'pdf'
    || kind === 'audio'
    || kind === 'video';
}

export interface TrashItem {
  id: string;
  originalPath: string;
  deletedAt: string;
  entryType: 'file' | 'directory';
}

const TEXT_EXTENSIONS = new Set([
  '.txt', '.json', '.jsonl', '.yaml', '.yml', '.toml', '.csv', '.tsv',
  '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.xml', '.sql', '.py',
  '.java', '.c', '.h', '.cpp', '.hpp', '.rs', '.go', '.sh', '.ps1',
]);
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif',
]);
const DOCUMENT_EXTENSIONS = new Set([
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
]);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v']);

export function getFileExtension(fileName: string): string | undefined {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return undefined;
  return fileName.slice(dotIndex).toLowerCase();
}

export function getFileKind(fileName: string, isDirectory = false): FileKind {
  if (isDirectory) return 'directory';
  const extension = getFileExtension(fileName);
  if (extension === '.md' || extension === '.markdown') return 'markdown';
  if (extension && TEXT_EXTENSIONS.has(extension)) return 'text';
  if (extension && IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (extension === '.pdf') return 'pdf';
  if (extension && DOCUMENT_EXTENSIONS.has(extension)) return 'document';
  if (extension && AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (extension && VIDEO_EXTENSIONS.has(extension)) return 'video';
  return 'other';
}
