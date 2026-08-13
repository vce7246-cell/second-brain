/**
 * WebSocket 管理器 — 向所有连接的客户端广播文件变更通知
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

let wss: WebSocketServer | null = null;

/** 在现有 HTTP 服务器上挂载 WebSocket */
export function attachWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[ws] client connected');

    ws.on('close', () => {
      console.log('[ws] client disconnected');
    });

    ws.on('error', (err: Error) => {
      console.error('[ws] client error:', err.message);
    });
  });

  console.log('[ws] WebSocket server attached on /ws');
  return wss;
}

/** 向所有连接的客户端广播消息 */
export function broadcast(message: object): void {
  if (!wss) return;
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
