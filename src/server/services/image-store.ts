/**
 * 图片存储服务 — 剪贴板粘贴保存
 * 图片以原始格式保存到笔记所在目录的 images/ 子目录
 */
import fs from 'fs/promises';
import path from 'path';
import { resolveManagedPath } from './file-management.js';

/** 根据 MIME type 推断文件扩展名 */
function getExtFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
  };
  return map[mimeType] || '.png';
}

/** 生成时间戳文件名：yyyyMMddHHmmss.ext */
function generateFilename(ext: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
  return `${timestamp}${ext}`;
}

/**
 * 保存图片到磁盘
 * @param notesDir 笔记库根目录
 * @param currentNoteDir 当前笔记所在目录（相对于 notesDir），如 "folder" 或 ""
 * @param base64Data base64 编码的图片数据（不含 data:xxx;base64, 前缀）
 * @param mimeType 图片 MIME 类型
 * @returns 图片的相对路径（相对于 notesDir），如 "folder/images/20260716120000.png"
 */
export async function saveImage(
  notesDir: string,
  currentNoteDir: string,
  base64Data: string,
  mimeType: string
): Promise<string> {
  const ext = getExtFromMime(mimeType);
  const filename = generateFilename(ext);
  const relativePath = currentNoteDir
    ? path.join(currentNoteDir, 'images', filename)
    : path.join('images', filename);
  const filePath = await resolveManagedPath(notesDir, relativePath);
  const imageDir = path.dirname(filePath);

  // 确保目录存在
  await fs.mkdir(imageDir, { recursive: true });

  const buffer = Buffer.from(base64Data, 'base64');
  await fs.writeFile(filePath, buffer);

  // 返回相对于 notesDir 的路径
  const relPath = relativePath.replace(/\\/g, '/');

  console.log(`[image-store] Saved: ${relPath}`);
  return relPath;
}
