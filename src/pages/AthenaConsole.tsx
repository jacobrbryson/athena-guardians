import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useChat } from '../athena/useChat';
import { useVoiceInput } from '../athena/useVoiceInput';
import { useSpeech } from '../athena/useSpeech';
import { UnityAthena, type AthenaBridge } from '../athena/UnityAthena';
import { SequenceOverlay } from '../components/SequenceOverlay';
import { CurrentMission } from '../components/CurrentMission';
import { useMission } from '../missions/useMission';
import { SignalDecoder } from '../decode/SignalDecoder';
import { getSignalsDecoded } from '../decode/decodeStats';
import type { Message, MissionContext, SendOptions } from '../athena/useChat';
import type { PreparedSpeech } from '../athena/useSpeech';
import {
  ARRIVAL_MESSAGES,
  buildGreeting,
  NEW_GUARDIAN_PROMPT,
  buildNotebookPrompt,
  buildRatatouilleAlarm,
  RATATOUILLE_ALARM_DELAY_MS,
} from '../athena/sequences';
import { TEST_GUARDIAN_ID, FORCE_ONBOARDING_KEY } from '../config';
import { resetTrail } from '../api/mission';

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

// Voice sync: Athena's text stays hidden (still "thinking") while her voice is
// generated, so the reveal and the audio start together. This caps how much
// extra thinking time the voice may add — past it, the text shows anyway and
// the audio joins whenever it lands (the old, out-of-sync behavior). Neural
// generation regularly takes 10-15s, so the cap sits well above that; per
// the product call, a longer "thinking" beat is preferred over a desynced
// reveal.
const MAX_VOICE_HOLD_MS = 20000;

export function AthenaConsole() {
  const { guardian, logout, arrival, consumeArrival } = useAuth();
  const tts = useSpeech();
  const ttsRef = useRef(tts);
  ttsRef.current = tts;

  // Voice-sync gate handed to useChat: start generating the voice for an
  // incoming Athena message and hold the reveal until it is ready (or the cap
  // expires). The prepared audio is stashed by message uuid so the reveal
  // effect below can start playback the instant the text appears.
  const preparedSpeechRef = useRef(new Map<string, PreparedSpeech>());
  const holdForVoice = useCallback(async (message: Message) => {
    const speech = ttsRef.current;
    if (!speech.enabled || !speech.isSupported || !message.text?.trim()) return;
    const prepared = speech.prepare(message.text);
    preparedSpeechRef.current.set(message.uuid, prepared);
    await Promise.race([
      prepared.ready,
      new Promise((resolve) => window.setTimeout(resolve, MAX_VOICE_HOLD_MS)),
    ]);
  }, []);

  // Another device on this credential changed shared mission state (trail
  // key reported/decrypted/reset) — re-fetch so this panel stays live. The
  // ref breaks the useChat ↔ useMission declaration-order cycle.
  const missionRefreshRef = useRef<() => void>(() => {});
  const onTrailUpdate = useCallback(() => missionRefreshRef.current(), []);

  const chat = useChat(
    guardian!.guardian_id,
    {
      display_name: guardian!.display_name,
      adventure_key: guardian!.adventure_key,
    },
    { onBeforeAthenaMessage: holdForVoice, onTrailUpdate }
  );

  // Current mission + live family onboarding status. Drives the "Current
  // Mission" panel and Athena's steering toward the active objective.
  const missionState = useMission(guardian!.adventure_key);
  const missionSendRef = useRef<MissionContext | undefined>(undefined);
  missionSendRef.current = missionState.chatContext;
  missionRefreshRef.current = missionState.refresh;

  // Signal Decoder — the repeatable "help Athena decode signals" side activity.
  // Always available once Mission 1 (family check-in) is behind them. The
  // lifetime count rides along with every chat message so Athena knows.
  const [decoderOpen, setDecoderOpen] = useState(false);
  const decoderAvailable = !!missionState.phase && missionState.phase !== 'check_in';
  const decodesContext = useCallback((): SendOptions['decodes'] => {
    const total = getSignalsDecoded(guardian!.guardian_id);
    return total > 0 ? { total } : undefined;
  }, [guardian]);

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
  // Which scripted beat the awaited reply answers: the opening channel check /
  // notebook question, or the Ratatouille alarm that interrupts afterwards.
  const onboardingBeatRef = useRef<'opening' | 'ratatouille_alarm'>('opening');
  // Set when the channel-check reply should be followed by the panicked
  // "Ratatouille is MISSING" reveal (first-login Rescue Ratatouille only).
  const alarmPendingRef = useRef(false);
  const alarmTimerRef = useRef<number | null>(null);
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

  // Dev-only trail reset (test Guardian only): wipes this account's key/clue
  // progress on the server so the Ratatouille hunt can be run again.
  const [resettingTrail, setResettingTrail] = useState(false);
  const resetTrailProgress = useCallback(async () => {
    if (resettingTrail) return;
    setResettingTrail(true);
    try {
      await resetTrail();
      // Let the panel auto-expand announce the freshly reset mission again.
      localStorage.removeItem('guardian-mission-seen:mission-1-ratatouille-trail:key_hunt');
      missionState.refresh();
    } catch {
      // Leave state as-is; the menu stays open so the tester can retry.
      return;
    } finally {
      setResettingTrail(false);
    }
    setMenuOpen(false);
  }, [resettingTrail, missionState]);

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
  // the message-watching TTS effect doesn't say it a second time. Like live
  // replies, the text is held until the voice is ready (capped) so both start
  // together.
  const sayAthena = useCallback(
    (text: string, onEnd?: () => void) => {
      const speech = ttsRef.current;
      if (!text?.trim()) {
        onEnd?.();
        return;
      }
      if (!speech.enabled || !speech.isSupported) {
        const uuid = chat.injectAthenaMessage(text);
        if (uuid) spokenRef.current = uuid;
        onEnd?.();
        return;
      }

      const prepared = speech.prepare(text);
      let revealed = false;
      const reveal = () => {
        if (revealed) return;
        revealed = true;
        const uuid = chat.injectAthenaMessage(text);
        if (uuid) spokenRef.current = uuid;
      };
      const holdTimer = window.setTimeout(reveal, MAX_VOICE_HOLD_MS);
      void prepared.ready.then((ok) => {
        window.clearTimeout(holdTimer);
        reveal();
        if (ok) prepared.play(onEnd);
        else onEnd?.();
      });
    },
    [chat]
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
      const beat = onboardingBeatRef.current;
      setStep(null);
      // The channel check done, a brand-new Rescue Ratatouille Guardian is due
      // the campaign hook: once Athena's welcome reply lands, she is
      // interrupted by the "Ratatouille is MISSING" alert.
      if (
        beat === 'opening' &&
        !!arrivalRef.current?.isFirstLogin &&
        guardian!.adventure_key === 'rescue_ratatouille'
      ) {
        alarmPendingRef.current = true;
      }
      void chat
        .sendMessage(userText, {
          onboarding: {
            priorAthenaLine: priorAthenaLineRef.current || '',
            firstContact: beat === 'opening' && !!arrivalRef.current?.isFirstLogin,
            ...(beat === 'ratatouille_alarm' ? { beat } : {}),
          },
          mission: missionSendRef.current,
          decodes: decodesContext(),
        })
        .catch(() => undefined);
    },
    [chat, guardian, setStep, decodesContext]
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
      void chat
        .sendMessage(trimmed, {
          mission: missionSendRef.current,
          decodes: decodesContext(),
        })
        .catch(() => undefined);
    },
    [chat, completeOnboarding, decodesContext]
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

    // Safety net: if speech generation/playback never reports completion,
    // still open the conversation. The guard makes this idempotent. Sized past
    // MAX_VOICE_HOLD_MS so it can't fire before the greeting text has appeared.
    window.setTimeout(deliverOnboardingPrompt, MAX_VOICE_HOLD_MS + 6000);
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
    tts.attachUnity(bridge);
    setUnityReady(true);
  }, [tts]);

  // Speak Athena's newest reply (TTS on by default) — but never replay history.
  // Replies that came through the voice-sync gate already have their audio
  // prepared, so playback starts the same instant the text appears; anything
  // else (gate off at arrival time) falls back to the fire-and-forget speak.
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
    const prepared = preparedSpeechRef.current.get(last.uuid);
    if (prepared) {
      preparedSpeechRef.current.delete(last.uuid);
      // Instant when generation beat the hold cap; late (old behavior) if not.
      void prepared.ready.then((ok) => {
        if (ok) prepared.play();
      });
    } else {
      tts.speak(last.text);
    }
  }, [chat.messages, chat.ready, tts]);

  // The Ratatouille inciting incident: once Athena's (AI) reply to the channel
  // check has been revealed, hold a short beat, then interrupt with the scripted
  // panicked alarm and await the Guardian's reaction — which flows back through
  // the onboarding pipeline tagged with the 'ratatouille_alarm' beat so the live
  // AI answers it in-character.
  useEffect(() => {
    if (!alarmPendingRef.current) return;
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.is_human || last.uuid.startsWith('local-')) return;
    alarmPendingRef.current = false;
    const alarm = buildRatatouilleAlarm(guardian!.display_name);
    alarmTimerRef.current = window.setTimeout(() => {
      alarmTimerRef.current = null;
      priorAthenaLineRef.current = alarm;
      onboardingBeatRef.current = 'ratatouille_alarm';
      sayAthena(alarm);
      setStep('awaiting-user');
    }, RATATOUILLE_ALARM_DELAY_MS);
  }, [chat.messages, guardian, sayAthena, setStep]);
  useEffect(
    () => () => {
      if (alarmTimerRef.current !== null) window.clearTimeout(alarmTimerRef.current);
    },
    []
  );

  // Mission transitions happen from chat messages on the backend. Refresh after
  // each new persisted turn so PORTICO and the final cipher update the panel.
  const missionRefreshSeenRef = useRef<string | null>(null);
  useEffect(() => {
    const last = chat.messages[chat.messages.length - 1];
    if (!last?.uuid || last.uuid.startsWith('local-')) return;
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
              chat.wsConnected
                ? 'bg-emerald-400'
                : chat.connected
                  ? 'bg-amber-400'
                  : 'bg-amber-400 animate-pulse'
            }`}
            title={
              chat.wsConnected
                ? 'Live link'
                : chat.connected
                  ? 'Backup link — reconnecting'
                  : 'Connecting…'
            }
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
              {isTestUser && guardian!.adventure_key === 'rescue_ratatouille' && (
                <button
                  role="menuitem"
                  onClick={() => void resetTrailProgress()}
                  disabled={resettingTrail}
                  title="Wipe this account's trail-mission keys and clues (test account only)"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  <span className="w-5 text-center text-base leading-none" aria-hidden>
                    ♻️
                  </span>
                  {resettingTrail ? 'Resetting…' : 'Reset trail'}
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
        {/* Overlays Athena so mission details never shrink the Unity stage.
            Auto-expand is held back during first contact so the cinematic
            onboarding (greeting → channel check → Ratatouille alarm) plays
            out uncovered; the compact mission bar stays visible. */}
        <CurrentMission state={missionState} autoOpen={!isOnboarding} />
        {/* Signal Decoder launcher — the always-on side activity once Mission 1 is done. */}
        {decoderAvailable && !arriving && (
          <button
            onClick={() => setDecoderOpen(true)}
            className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-full border border-cyan-400/40 bg-black/80 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-200 shadow-lg shadow-black/50 backdrop-blur-sm transition hover:bg-cyan-500/10 active:scale-95"
          >
            <span aria-hidden className="animate-pulse">📡</span>
            Decode signals
          </button>
        )}
        {arriving && (
          <SequenceOverlay messages={ARRIVAL_MESSAGES} tone="overlay" eyebrow="first contact" />
        )}
      </section>

      {decoderOpen && (
        <SignalDecoder
          guardianId={guardian!.guardian_id}
          onClose={() => setDecoderOpen(false)}
        />
      )}

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
