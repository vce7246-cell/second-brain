import { useEffect, useRef, useCallback } from 'react';

interface WSMessage {
  type: string;
  path?: string;
}

type MessageHandler = (msg: WSMessage) => void;

/**
 * WebSocket 连接管理 Hook
 * 自动连接 /ws，支持断线重连
 */
export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const onMessageRef = useRef<MessageHandler>(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    // 确定 WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[ws] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        onMessageRef.current(msg);
      } catch {
        // 忽略非 JSON 消息
      }
    };

    ws.onclose = () => {
      console.log('[ws] Disconnected, reconnecting in 3s...');
      wsRef.current = null;
      // 3 秒后重连
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      // onclose 会在 onerror 后触发，由 onclose 处理重连
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // 防止重连
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);
}
