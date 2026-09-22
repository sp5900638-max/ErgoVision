/**
 * WebSocket hook for streaming numeric ergonomic telemetry to backend (/ws/telemetry).
 * Under NO circumstances are video frames sent over the network.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ConnectionState, TelemetryPacket } from '../types/ergosense';

interface TelemetryWebSocketProps {
  sessionToken: string;
  enabled?: boolean;
}

export interface TelemetryWebSocketHook {
  connectionState: ConnectionState;
  sendTelemetry: (packet: Partial<TelemetryPacket>) => void;
  sendStretchEvent: (stretchName: string, heldDurationSec: number) => void;
  sendCalibration: (baselines: { ipd: number; cva: number; shoulder_tilt: number }) => void;
  reconnect: () => void;
  lastServerMessage: any;
}

export function useTelemetryWebSocket({
  sessionToken,
  enabled = true,
}: TelemetryWebSocketProps): TelemetryWebSocketHook {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastServerMessage, setLastServerMessage] = useState<any>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const isManuallyClosedRef = useRef<boolean>(false);

  const connect = useCallback(() => {
    if (!enabled || !sessionToken) return;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionState('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // Works with Vite dev proxy or production FastAPI
    const wsUrl = `${protocol}//${host}/ws/telemetry`;

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        // Initial handshake with session token
        ws.send(
          JSON.stringify({
            type: 'handshake',
            session_token: sessionToken,
            timestamp: new Date().toISOString(),
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastServerMessage(data);
        } catch {
          // ignore parsing error
        }
      };

      ws.onerror = () => {
        setConnectionState('error');
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
        socketRef.current = null;
        if (!isManuallyClosedRef.current) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, 3000);
        }
      };
    } catch (err) {
      console.warn('WebSocket connection error:', err);
      setConnectionState('error');
    }
  }, [enabled, sessionToken]);

  const sendTelemetry = useCallback(
    (packet: Partial<TelemetryPacket>) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'telemetry',
            session_token: sessionToken,
            ...packet,
            timestamp: new Date().toISOString(),
          })
        );
      }
    },
    [sessionToken]
  );

  const sendStretchEvent = useCallback(
    (stretchName: string, heldDurationSec: number) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'stretch',
            session_token: sessionToken,
            stretch_name: stretchName,
            held_duration_sec: heldDurationSec,
            timestamp: new Date().toISOString(),
          })
        );
      }
    },
    [sessionToken]
  );

  const sendCalibration = useCallback(
    (baselines: { ipd: number; cva: number; shoulder_tilt: number }) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'calibration',
            session_token: sessionToken,
            ...baselines,
            timestamp: new Date().toISOString(),
          })
        );
      }
    },
    [sessionToken]
  );

  const reconnect = useCallback(() => {
    isManuallyClosedRef.current = false;
    if (socketRef.current) {
      socketRef.current.close();
    }
    connect();
  }, [connect]);

  useEffect(() => {
    isManuallyClosedRef.current = false;
    connect();

    return () => {
      isManuallyClosedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  return {
    connectionState,
    sendTelemetry,
    sendStretchEvent,
    sendCalibration,
    reconnect,
    lastServerMessage,
  };
}
