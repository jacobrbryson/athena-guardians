import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useChat } from '../athena/useChat';
import { useVoiceInput } from '../athena/useVoiceInput';
import { useSpeech } from '../athena/useSpeech';
import { UnityAthena, type AthenaBridge } from '../athena/UnityAthena';
import { SequenceOverlay } from '../components/SequenceOverlay';
import { CurrentMission } from '../components/CurrentMission';
import { useMission } from '../missions/useMission';
import type { MissionContext } from '../athena/useChat';
import {
  ARRIVAL_MESSAGES,
  buildGreeting,
  NEW_GUARDIAN_PROMPT,
  buildNotebookPrompt,
} from '../athena/sequences';
import { TEST_GUARDIAN_ID, FORCE_ONBOARDING_KEY } from '../config';

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
  const chat = useChat(guardian!.guardian_id, {
    display_name: guardian!.display_name,
    adventure_key: guardian!.adventure_key,
  });
  const tts = useSpeech();

  // Current mission + live family onboarding status. Drives the "Current
  // Mission" panel and Athena's steering toward the active objective.
  const missionState = useMission(guardian!.adventure_key);
  const missionSendRef = useRef<MissionContext | undefined>(undefined);
  missionSendRef.current = missionState.chatContext;

  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const inputId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const spokenRef = useRef<string | null>(null);
  const ttsInitRef = useRef(false);

  // Dev-only onboarding replay (test Guardian only). When the flag is on, the
  // arrival sequence replays on every page load so it can be iterated on.
  const isTestUser = guardian!.guardian_id === TEST_GUARDIAN_ID;
  const [forceOnboarding, setForceOnboarding] = useState(
    () => isTestUser && localStorage.getItem(FORCE_ONBOARDING_KEY) === 'true'
  );

  // --- Athena arrival (first contact) ---
  // A fresh login provides the one-shot `arrival` signal; the dev toggle can
  // also force it. Captured once at mount so re-renders never replay it, and a
  // real login is consumed so a normal reload doesn't repeat first contact.
  const effectiveArrival = arrival ?? (forceOnboarding ? { isFirstLogin: true } : null);
  const arrivalRef = useRef(effectiveArrival);
  const [arriving, setArriving] = useState(!!effectiveArrival);
  const [unityReady, setUnityReady] = useState(false);
  const [minElapsed, setMinElapsed] = useState(!effectiveArrival);
  const bridgeRef = useRef<AthenaBridge | null>(null);
  const finishedRef = useRef(false);

  // --- First-contact onboarding conversation ---
  // After the greeting, Athena initiates a short scripted exchange instead of
  // dropping the Guardian into a blank chat. `onboardingStep` is 'awaiting-user'
  // while Athena waits for the Guardian's first reply (driving the mic pulse),
  // then null once the exchange completes and normal chat takes over. The ref
  // mirrors it so input handlers see the current step without a stale closure.
  type OnboardingStep = 'awaiting-user' | null;
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(null);
  const onboardingStepRef = useRef<OnboardingStep>(null);
  const promptDeliveredRef = useRef(false);
  // The scripted opener Athena just spoke, sent to the AI as the preceding turn
  // so her response to the Guardian's first reply has real context.
  const priorAthenaLineRef = useRef<string | null>(null);
  const setStep = useCallback((s: OnboardingStep) => {
    onboardingStepRef.current = s;
    setOnboardingStep(s);
  }, []);

  // During an onboarding/arrival session we don't surface the Guardian's prior
  // chat history — first contact should feel fresh, showing only the greeting
  // and anything said from there on. We snapshot the pre-existing history once
  // (when chat first loads) and filter those messages out of the transcript.
  const isOnboarding = !!arrivalRef.current;
  const historyUuidsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (arrival) consumeArrival();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!chat.ready || historyUuidsRef.current) return;
    historyUuidsRef.current = new Set(chat.messages.map((m) => m.uuid));
  }, [chat.ready, chat.messages]);

  const visibleMessages = isOnboarding
    ? historyUuidsRef.current
      ? chat.messages.filter((m) => !historyUuidsRef.current!.has(m.uuid))
      : []
    : chat.messages;

  const toggleOnboarding = useCallback(() => {
    setForceOnboarding((v) => {
      const next = !v;
      localStorage.setItem(FORCE_ONBOARDING_KEY, String(next));
      // Toggling ON needs a fresh mount to replay the arrival sequence;
      // reload now so the user doesn't have to do it manually.
      if (next) window.location.reload();
      return next;
    });
  }, []);

  // Inject + speak one of Athena's onboarding lines, pre-marking it spoken so
  // the message-watching TTS effect doesn't say it a second time.
  const sayAthena = useCallback(
    (text: string, onEnd?: () => void) => {
      const uuid = chat.injectAthenaMessage(text);
      if (uuid) {
        spokenRef.current = uuid;
        tts.speak(text, onEnd);
      } else {
        onEnd?.();
      }
    },
    [chat, tts]
  );

  // Athena initiates the conversation: new Guardians get a "communication
  // check", returning Guardians a note about their notebook. Guarded so the
  // greeting's TTS callback and the safety timer can't deliver it twice.
  const deliverOnboardingPrompt = useCallback(() => {
    if (promptDeliveredRef.current) return;
    promptDeliveredRef.current = true;
    const prompt = arrivalRef.current?.isFirstLogin
      ? NEW_GUARDIAN_PROMPT
      : buildNotebookPrompt(guardian!.display_name);
    priorAthenaLineRef.current = prompt;
    sayAthena(prompt);
    setStep('awaiting-user');
  }, [guardian, sayAthena, setStep]);

  // The Guardian's first reply (typed or spoken) completes onboarding. Rather
  // than scripting Athena's answer, we send the reply through the real chat
  // pipeline with onboarding context (the line she just said + new/returning),
  // so the live Athena AI responds in-character. Her reply arrives over the
  // WebSocket and is spoken by the message-watching TTS effect, exactly like a
  // normal turn — which is precisely what the conversation becomes from here.
  const completeOnboarding = useCallback(
    (userText: string) => {
      setStep(null);
      void chat
        .sendMessage(userText, {
          onboarding: {
            priorAthenaLine: priorAthenaLineRef.current || '',
            firstContact: !!arrivalRef.current?.isFirstLogin,
          },
          mission: missionSendRef.current,
        })
        .catch(() => undefined);
    },
    [chat, setStep]
  );

  // Single entry point for user input from both the composer and voice. During
  // the onboarding exchange it routes to the scripted handler; otherwise it
  // sends to Athena over the live chat channel.
  const handleUserInput = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (onboardingStepRef.current === 'awaiting-user') {
        completeOnboarding(trimmed);
        return;
      }
      const mission = missionSendRef.current;
      void chat
        .sendMessage(trimmed, mission ? { mission } : undefined)
        .catch(() => undefined);
    },
    [chat, completeOnboarding]
  );

  // Voice: hands-free — a final transcript is handled immediately.
  const voice = useVoiceInput(handleUserInput);

  const finishArrival = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setArriving(false);

    // Friendly greeting animation from the existing Unity bridge.
    bridgeRef.current?.playGesture('Wave');

    // Personalized greeting. We speak it directly here (and pre-mark it as
    // spoken) rather than leaving it to the message-watching TTS effect: if the
    // session/history fetch resolves after arrival, that effect's first-populate
    // guard would mark the greeting as already-spoken and swallow it. When the
    // greeting finishes (or right away if TTS is off), Athena opens the
    // onboarding conversation after a short beat.
    const greeting = buildGreeting(
      !!arrivalRef.current?.isFirstLogin,
      guardian!.display_name
    );
    sayAthena(greeting, () => window.setTimeout(deliverOnboardingPrompt, 1500));

    // Safety net: if the TTS end callback never fires (flaky speechSynthesis),
    // still open the conversation. The guard makes this idempotent.
    window.setTimeout(deliverOnboardingPrompt, 9000);
  }, [guardian, sayAthena, deliverOnboardingPrompt]);

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

  // In-chat mission reporting: a Guardian can report their piece by telling
  // Athena, which the backend records during her reply. When a new Athena
  // message arrives during a convergence mission, refresh so the panel reflects
  // any contribution that turn may have recorded.
  const missionRefreshSeenRef = useRef<string | null>(null);
  useEffect(() => {
    if (missionState.mission?.objective !== 'convergence') return;
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.is_human) return;
    if (missionRefreshSeenRef.current === last.uuid) return;
    missionRefreshSeenRef.current = last.uuid;
    missionState.refresh();
  }, [chat.messages, missionState]);

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
    handleUserInput(text);
  }

  const adventure = ADVENTURE_LABELS[guardian!.adventure_key] || guardian!.adventure_key;

  // While Athena is waiting for the Guardian's first onboarding reply, the mic
  // gently pulses to invite voice input. It stops the moment they start
  // interacting — typing a character or opening the mic — since voice is
  // encouraged but never required.
  const micPulsing =
    onboardingStep === 'awaiting-user' && !voice.listening && !draft.trim();

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
              {isTestUser && (
                <button
                  role="menuitemcheckbox"
                  aria-checked={forceOnboarding}
                  onClick={toggleOnboarding}
                  title="Replay the onboarding sequence on every page load (test account only)"
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-emerald-500/10"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-center text-base leading-none" aria-hidden>
                      🎬
                    </span>
                    Onboarding
                  </span>
                  <span className="opacity-50">{forceOnboarding ? 'on' : 'off'}</span>
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
      <section className="relative min-h-0 flex-1">
        <UnityAthena
          sessionId={chat.sessionId}
          isThinking={chat.isThinking}
          onReady={onUnityReady}
        />
        {/* Overlays Athena so mission details never shrink the Unity stage. */}
        <CurrentMission state={missionState} guardianId={guardian!.guardian_id} />
        {arriving && (
          <SequenceOverlay messages={ARRIVAL_MESSAGES} tone="overlay" eyebrow="first contact" />
        )}
      </section>

      {/* Chat beneath Athena */}
      <section className="flex shrink-0 flex-col border-t border-emerald-500/15 bg-black/95">
        <div
          ref={logRef}
          className="px-4 py-3 space-y-2 overflow-y-auto"
          style={{ maxHeight: '34vh', minHeight: '18vh' }}
        >
          {visibleMessages.length === 0 && chat.ready && !arriving && (
            <p className="text-center text-xs font-mono opacity-40 py-6">
              {voice.isSupported
                ? 'Tap the mic or type to talk to Athena.'
                : 'Type a message to talk to Athena.'}
            </p>
          )}
          {visibleMessages.map((m) => (
            <div key={m.uuid} className={`flex ${m.is_human ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2 text-sm leading-relaxed ${
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
                  : micPulsing
                    ? 'border-emerald-400 text-emerald-100 ring-2 ring-emerald-400/40 animate-pulse'
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
            placeholder={
              voice.listening
                ? 'listening…'
                : onboardingStep === 'awaiting-user'
                  ? 'Type, or tap the mic…'
                  : 'Tell Athena…'
            }
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
