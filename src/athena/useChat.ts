import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { wsUrl } from '../config';

/**
 * Chat hook — a React port of the marketing app's ChatService. It reuses the
 * exact same proxy endpoints and WebSocket contract:
 *
 *   GET  /api/v1/session?sessionId=...        -> { session: { uuid, ... } }
 *   GET  /api/v1/message?sessionId=...        -> Message[]
 *   POST /api/v1/message { text, sessionId }  -> { message }
 *   WS   /ws?sessionId=...                     -> rpc: addMessage | sessionStatus
 *
 * Auth rides on the httpOnly session cookie (sent automatically), so no token
 * is threaded through the URL.
 */

export interface Message {
  uuid: string;
  is_human: boolean;
  text: string;
  created_at?: string | number;
}

export interface ChatState {
  sessionId: string | null;
  messages: Message[];
  isThinking: boolean;
  wsConnected: boolean;
  ready: boolean;
  sendMessage: (text: string) => Promise<void>;
  /** Append a local Athena message (e.g. the arrival greeting). Not persisted. */
  injectAthenaMessage: (text: string) => void;
}

export function useChat(guardianId: string): ChatState {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [ready, setReady] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<string | null>(null);
  const closedRef = useRef(false);

  const storageKey = `guardian_sessionId:${guardianId}`;

  const connectWebSocket = useCallback(() => {
    const session = sessionRef.current;
    if (!session || closedRef.current) return;

    const url = wsUrl(`/ws?sessionId=${encodeURIComponent(session)}`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.rpc === 'addMessage' && msg.message) {
          setMessages((prev) => [...prev, msg.message]);
          if (msg.session?.is_busy === false) setIsThinking(false);
        }
        if (msg?.rpc === 'sessionStatus' && typeof msg.session?.is_busy === 'boolean') {
          setIsThinking(msg.session.is_busy);
        }
      } catch (err) {
        console.error('useChat: invalid WS JSON', err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      if (!closedRef.current) scheduleReconnect();
    };

    ws.onerror = () => {
      setWsConnected(false);
      ws.close();
    };
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectRef.current) return;
    reconnectRef.current = setTimeout(() => {
      reconnectRef.current = null;
      connectWebSocket();
    }, 2000);
  }, [connectWebSocket]);

  // Boot: resolve session, load history, open WebSocket.
  useEffect(() => {
    closedRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        const stored = localStorage.getItem(storageKey);
        const params = new URLSearchParams();
        if (stored) params.set('sessionId', stored);

        const res = await api.get<{ session?: { uuid?: string } }>(
          `/api/v1/session?${params.toString()}`
        );
        const uuid = res?.session?.uuid;
        if (!uuid || cancelled) return;

        localStorage.setItem(storageKey, uuid);
        sessionRef.current = uuid;
        setSessionId(uuid);

        const history = await api
          .get<Message[]>(`/api/v1/message?sessionId=${encodeURIComponent(uuid)}`)
          .catch(() => []);
        if (!cancelled && Array.isArray(history)) setMessages(history);

        if (!cancelled) {
          setReady(true);
          connectWebSocket();
        }
      } catch (err) {
        console.error('useChat: session init failed', err);
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      closedRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const sendMessage = useCallback(async (text: string) => {
    const session = sessionRef.current;
    const trimmed = text.trim();
    if (!session || !trimmed) return;

    setIsThinking(true);
    try {
      const res = await api.post<{ message?: Message }>('/api/v1/message', {
        text: trimmed,
        sessionId: session,
      });
      if (res?.message) {
        setMessages((prev) => [...prev, res.message as Message]);
      }
    } catch (err) {
      setIsThinking(false);
      throw err;
    }
  }, []);

  const injectAthenaMessage = useCallback((text: string) => {
    if (!text?.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        uuid: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        is_human: false,
        text: text.trim(),
      },
    ]);
  }, []);

  return {
    sessionId,
    messages,
    isThinking,
    wsConnected,
    ready,
    sendMessage,
    injectAthenaMessage,
  };
}
