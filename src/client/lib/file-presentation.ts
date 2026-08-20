import type { FileKind } from '../../shared/file-types.js';

export function fileKindIcon(kind: FileKind): string {
  switch (kind) {
    case 'markdown': return 'MD';
    case 'drawio': return 'DRAW';
    case 'text': return 'TXT';
    case 'image': return 'IMG';
    case 'pdf': return 'PDF';
    case 'document': return 'DOC';
    case 'audio': return 'AUD';
    case 'video': return 'VID';
    case 'other': return 'FILE';
    case 'directory': return 'DIR';
  }
}

export function fileKindLabel(kind: FileKind): string {
  switch (kind) {
    case 'markdown': return '笔记';
    case 'drawio': return 'Draw.io';
    case 'text': return '文本';
    case 'image': return '图片';
    case 'pdf': return 'PDF';
    case 'document': return '文档';
    case 'audio': return '音频';
    case 'video': return '视频';
    case 'other': return '附件';
    case 'directory': return '文件夹';
  }
}
