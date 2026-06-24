import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useChat } from '../athena/useChat';
import { useVoiceInput } from '../athena/useVoiceInput';
import { useSpeech } from '../athena/useSpeech';
import { UnityAthena, type AthenaBridge } from '../athena/UnityAthena';
import { SequenceOverlay } from '../components/SequenceOverlay';
import { ARRIVAL_MESSAGES, buildGreeting } from '../athena/sequences';

/**
 * Authenticated home: the Athena console. Athena is the main interface — large
 * and cinematic at the top, chat beneath, with big touch-friendly controls.
 *
 * First contact: on a fresh login we don't drop the Guardian into a blank chat.
 * Athena's avatar loads under mission-control status messages; when she's ready
 * she waves and greets the Guardian by name (new vs returning), spoken aloud.
 */

const ADVENTURE_LABELS: Record<string, string> = {
  lake_norman_guardians: 'Lake Norman Guardians',
  rescue_ratatouille: 'Rescue Ratatouille',
};

const ARRIVAL_MIN_MS = 2600; // minimum time the arrival sequence is shown
const ARRIVAL_MAX_MS = 14000; // safety cap if Unity stalls/fails to load

export function AthenaConsole() {
  const { guardian, logout, arrival, consumeArrival } = useAuth();
  const chat = useChat(guardian!.guardian_id);
  const tts = useSpeech();

  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const inputId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const spokenRef = useRef<string | null>(null);
  const ttsInitRef = useRef(false);

  // --- Athena arrival (first contact) ---
  // Capture the one-shot arrival signal once; consume it immediately so a later
  // re-render / reload never replays first contact.
  const arrivalRef = useRef(arrival);
  const [arriving, setArriving] = useState(!!arrival);
  const [unityReady, setUnityReady] = useState(false);
  const [minElapsed, setMinElapsed] = useState(!arrival);
  const bridgeRef = useRef<AthenaBridge | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (arrival) consumeArrival();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Voice: hands-free — a final transcript sends immediately.
  const voice = useVoiceInput((text) => {
    if (text) void chat.sendMessage(text).catch(() => undefined);
  });

  const finishArrival = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setArriving(false);

    // Friendly greeting animation from the existing Unity bridge.
    bridgeRef.current?.playGesture('Wave');

    // Personalized greeting — spoken via the TTS effect that watches messages.
    const greeting = buildGreeting(
      !!arrivalRef.current?.isFirstLogin,
      guardian!.display_name
    );
    chat.injectAthenaMessage(greeting);
  }, [chat, guardian]);

  // Arrival timers: hold for a minimum, give up after a max.
  useEffect(() => {
    if (!arrivalRef.current) return;
    const minId = window.setTimeout(() => setMinElapsed(true), ARRIVAL_MIN_MS);
    const maxId = window.setTimeout(() => finishArrival(), ARRIVAL_MAX_MS);
    return () => {
      window.clearTimeout(minId);
      window.clearTimeout(maxId);
    };
  }, [finishArrival]);

  // End the arrival once Athena is live AND the minimum beat has elapsed.
  useEffect(() => {
    if (arriving && unityReady && minElapsed) finishArrival();
  }, [arriving, unityReady, minElapsed, finishArrival]);

  const onUnityReady = useCallback((bridge: AthenaBridge) => {
    bridgeRef.current = bridge;
    setUnityReady(true);
  }, []);

  // Speak Athena's newest reply (TTS on by default) — but never replay history.
  useEffect(() => {
    if (!chat.ready) return;
    const last = chat.messages[chat.messages.length - 1];
    // On first populate, mark existing history as already "spoken".
    if (!ttsInitRef.current) {
      ttsInitRef.current = true;
      spokenRef.current = last?.uuid ?? null;
      return;
    }
    if (!last || last.is_human || spokenRef.current === last.uuid) return;
    spokenRef.current = last.uuid;
    tts.speak(last.text);
  }, [chat.messages, chat.ready, tts]);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.isThinking]);

  // Close the header menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void chat.sendMessage(text).catch(() => undefined);
  }

  const adventure = ADVENTURE_LABELS[guardian!.adventure_key] || guardian!.adventure_key;

  return (
    <div className="flex flex-col h-[100dvh] bg-black text-emerald-50">
      {/* Top status bar */}
      <header className="flex items-center justify-between px-4 py-2 text-[11px] font-mono uppercase tracking-[0.2em] border-b border-emerald-500/15">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              chat.wsConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
            }`}
            aria-hidden
          />
          <span className="truncate opacity-70">
            {guardian!.display_name || `Guardian ${guardian!.guardian_id}`} · {adventure}
          </span>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Menu"
            className="rounded border border-emerald-500/30 px-2 py-1 text-base leading-none hover:bg-emerald-500/10"
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-44 z-50 rounded border border-emerald-500/30 bg-black/95 backdrop-blur py-1 shadow-lg shadow-black/50"
            >
              {tts.isSupported && (
                <button
                  role="menuitemcheckbox"
                  aria-checked={tts.enabled}
                  onClick={tts.toggle}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-emerald-500/10"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-center text-base leading-none" aria-hidden>
                      {tts.enabled ? '🔊' : '🔇'}
                    </span>
                    Voice
                  </span>
                  <span className="opacity-50">{tts.enabled ? 'on' : 'off'}</span>
                </button>
              )}
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-emerald-500/10"
              >
                <span className="w-5 text-center text-base leading-none" aria-hidden>
                  🚪
                </span>
                Exit
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Athena — large and front-and-center */}
      <section className="relative flex-1 min-h-[42vh]">
        <UnityAthena
          sessionId={chat.sessionId}
          isThinking={chat.isThinking}
          onReady={onUnityReady}
        />
        {arriving && (
          <SequenceOverlay messages={ARRIVAL_MESSAGES} tone="overlay" eyebrow="first contact" />
        )}
      </section>

      {/* Chat beneath Athena */}
      <section className="flex flex-col border-t border-emerald-500/15 bg-black/95">
        <div
          ref={logRef}
          className="px-4 py-3 space-y-2 overflow-y-auto"
          style={{ maxHeight: '34vh', minHeight: '18vh' }}
        >
          {chat.messages.length === 0 && chat.ready && !arriving && (
            <p className="text-center text-xs font-mono opacity-40 py-6">
              {voice.isSupported
                ? 'Tap the mic or type to talk to Athena.'
                : 'Type a message to talk to Athena.'}
            </p>
          )}
          {chat.messages.map((m) => (
            <div key={m.uuid} className={`flex ${m.is_human ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                  m.is_human
                    ? 'bg-emerald-500/20 text-emerald-50'
                    : 'bg-white/5 text-emerald-100'
                }`}
              >
                {m.text}
              </p>
            </div>
          ))}
          {chat.isThinking && (
            <div className="flex justify-start">
              <p className="rounded-2xl bg-white/5 px-4 py-2 text-sm opacity-60">
                Athena is thinking
                <span className="animate-caret">…</span>
              </p>
            </div>
          )}
          {voice.listening && voice.interim && (
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl bg-emerald-500/10 px-4 py-2 text-sm italic opacity-70">
                {voice.interim}
              </p>
            </div>
          )}
        </div>

        {/* Composer with big touch targets */}
        <form
          onSubmit={onSubmit}
          className="flex items-center gap-2 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-emerald-500/10"
        >
          {voice.isSupported && (
            <button
              type="button"
              onClick={voice.toggle}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? 'Stop listening' : 'Start voice input'}
              className={`shrink-0 h-12 w-12 rounded-full border text-lg grid place-items-center transition active:scale-95 ${
                voice.listening
                  ? 'border-red-400 bg-red-500/20 text-red-200 animate-pulse'
                  : 'border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10'
              }`}
            >
              {voice.listening ? '■' : '🎤'}
            </button>
          )}
          <label htmlFor={inputId} className="sr-only">
            Message Athena
          </label>
          <input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={voice.listening ? 'listening…' : 'Tell Athena…'}
            autoComplete="off"
            className="flex-1 h-12 rounded-full bg-white/5 px-4 text-base outline-none placeholder:opacity-40 focus:bg-white/10"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="shrink-0 h-12 px-5 rounded-full bg-emerald-500/80 text-black font-semibold disabled:opacity-30 active:scale-95"
          >
            Send
          </button>
        </form>
        {voice.error && (
          <p className="px-4 pb-2 text-center text-xs text-red-300">{voice.error}</p>
        )}
      </section>
    </div>
  );
}
