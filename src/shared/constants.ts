/** 前后端共享常量 */

/** 默认服务器端口 */
export const DEFAULT_PORT = 3000;

/** Local-only HTTP bind address. */
export const LOOPBACK_HOST = '127.0.0.1';

/** 前端开发服务器端口 */
export const CLIENT_DEV_PORT = 5173;

/** WebSocket 路径 */
export const WS_PATH = '/ws';

/** sb 元数据目录名（相对于笔记根目录） */
export const SB_DIR = '.sb';

/** 链接数据文件名 */
export const LINKS_FILE = 'links.json';

/** 用户配置文件名 */
export const CONFIG_FILE = 'config.json';

/** 可恢复删除存储目录（位于 .sb/ 下） */
export const TRASH_DIR = 'trash';

/** 单个拖拽/选择导入文件的最大字节数（256 MiB）。 */
export const MAX_FILE_IMPORT_BYTES = 256 * 1024 * 1024;

/** 单个文本文件可用于只读预览和正文搜索的最大字节数（1 MiB）。 */
export const MAX_TEXT_CONTENT_BYTES = 1024 * 1024;
