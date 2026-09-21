import { useState, useRef, useEffect, useCallback } from 'react';
import type { PosturePayload, ConnectionState } from '../types/posture';

interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  connectionState: ConnectionState;
  latestData: PosturePayload | null;
  sendFrame: (data: Blob | ArrayBuffer | string) => boolean;
  sendCommand: (command: { type: string; [key: string]: unknown }) => boolean;
  reconnect: () => void;
  fps: number;
}

export function useWebSocket({
  url = 'ws://localhost:8000/ws/posture',
  autoConnect = true,
}: UseWebSocketOptions = {}): UseWebSocketReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [latestData, setLatestData] = useState<PosturePayload | null>(null);
  const [fps, setFps] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsCalcRef = useRef<number>(Date.now());
  const isDestroyedRef = useRef<boolean>(false);

  const connect = useCallback(() => {
    if (isDestroyedRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setConnectionState('connecting');

    try {
      const socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      wsRef.current = socket;

      socket.onopen = () => {
        if (isDestroyedRef.current) {
          socket.close();
          return;
        }
        setConnectionState('connected');
      };

      socket.onmessage = (event: MessageEvent) => {
        try {
          if (typeof event.data === 'string') {
            const parsed = JSON.parse(event.data);
            if (parsed.status && parsed.metrics) {
              setLatestData(parsed as PosturePayload);

              // FPS calculation
              frameCountRef.current += 1;
              const now = Date.now();
              const elapsed = now - lastFpsCalcRef.current;
              if (elapsed >= 1000) {
                setFps(Math.round((frameCountRef.current * 1000) / elapsed));
                frameCountRef.current = 0;
                lastFpsCalcRef.current = now;
              }
            }
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      socket.onerror = (err) => {
        console.warn('WebSocket error observed:', err);
        setConnectionState('error');
      };

      socket.onclose = () => {
        setConnectionState('disconnected');
        wsRef.current = null;

        // Auto-reconnect after 3 seconds if not destroyed
        if (!isDestroyedRef.current) {
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, 3000);
        }
      };
    } catch (err) {
      console.error('Failed to create WebSocket instance:', err);
      setConnectionState('error');
    }
  }, [url]);

  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    connect();
  }, [connect]);

  const sendFrame = useCallback((data: Blob | ArrayBuffer | string): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    try {
      // If client buffer is backing up, drop frame to maintain real-time responsiveness
      if (ws.bufferedAmount > 256 * 1024) {
        return false;
      }
      ws.send(data);
      return true;
    } catch (err) {
      console.error('Failed to send frame via WebSocket:', err);
      return false;
    }
  }, []);

  const sendCommand = useCallback((command: { type: string; [key: string]: unknown }): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    try {
      ws.send(JSON.stringify(command));
      return true;
    } catch (err) {
      console.error('Failed to send command via WebSocket:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    isDestroyedRef.current = false;
    if (autoConnect) {
      connect();
    }

    return () => {
      isDestroyedRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [autoConnect, connect]);

  return {
    connectionState,
    latestData,
    sendFrame,
    sendCommand,
    reconnect,
    fps,
  };
}
