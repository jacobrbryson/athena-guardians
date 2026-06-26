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

/** Non-sensitive guardian identity sent with each message to personalize Athena. */
export interface GuardianContext {
  display_name?: string | null;
  adventure_key?: string | null;
}

/** Onboarding turn context: the line Athena just said + new-vs-returning. */
export interface OnboardingContext {
  priorAthenaLine: string;
  firstContact: boolean;
}

export interface SendOptions {
  onboarding?: OnboardingContext;
}

export interface ChatState {
  sessionId: string | null;
  messages: Message[];
  isThinking: boolean;
  wsConnected: boolean;
  ready: boolean;
  sendMessage: (text: string, opts?: SendOptions) => Promise<void>;
  /**
   * Append a local Athena message (e.g. the arrival greeting). Not persisted.
   * Returns the generated uuid (or null for empty text) so callers can reconcile
   * it with side effects like TTS.
   */
  injectAthenaMessage: (text: string) => string | null;
}

export function useChat(guardianId: string, guardian?: GuardianContext): ChatState {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [ready, setReady] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<string | null>(null);
  const closedRef = useRef(false);

  // Latest guardian identity, mirrored to a ref so the stable sendMessage
  // callback can read it without being re-created on every render.
  const guardianRef = useRef<GuardianContext | undefined>(guardian);
  guardianRef.current = guardian;

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
        // Guardians chat with Athena in companion (open-ended) mode, not the
        // default knowledge-grading "teach" mode. Anonymous guardian sessions
        // are not permission-gated, so this is honored; an existing teach
        // session is switched to companion on load.
        params.set('mode', 'companion');

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

  const sendMessage = useCallback(async (text: string, opts?: SendOptions) => {
    const session = sessionRef.current;
    const trimmed = text.trim();
    if (!session || !trimmed) return;

    const body: Record<string, unknown> = { text: trimmed, sessionId: session };
    // Personalize Athena (whole-session Guardian persona) and, during the
    // onboarding exchange, give the AI the line she just said + first/returning.
    if (guardianRef.current) body.guardian = guardianRef.current;
    if (opts?.onboarding) body.onboarding = opts.onboarding;

    setIsThinking(true);
    try {
      const res = await api.post<{ message?: Message }>('/api/v1/message', body);
      if (res?.message) {
        setMessages((prev) => [...prev, res.message as Message]);
      }
    } catch (err) {
      setIsThinking(false);
      throw err;
    }
  }, []);

  const injectAthenaMessage = useCallback((text: string): string | null => {
    if (!text?.trim()) return null;
    const uuid = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [
      ...prev,
      {
        uuid,
        is_human: false,
        text: text.trim(),
      },
    ]);
    return uuid;
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
