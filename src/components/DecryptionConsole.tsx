import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CHALLENGES,
  CHALLENGE_COUNT,
  DECRYPTED_MESSAGE,
  type Challenge,
  type ChoiceOption,
  type GridChallenge,
} from '../missions/challenges';
import { getSolvedCount, setSolvedCount } from '../missions/decryptionProgress';

/** Glyphs used to scramble a fragment while it's "decoding". */
const GLITCH_CHARS = '#@$%&*▓▒░01∆µ¬§∞∂≠≈Ωπ¥£¢XYZ?!/\\<>{}[]'.split('');

function randomGlitchString(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
  }
  return s;
}

/** How long a fragment "decodes" for before settling — randomized each time. */
const DECODE_MIN_MS = 1000;
const DECODE_MAX_MS = 2600;
const CHOICE_DECRYPT_MS = 480;

function choiceDecryptDelay(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0
    : CHOICE_DECRYPT_MS;
}

/**
 * Full-screen "decryption console" — the bot-check experience.
 *
 * Athena prompts the Guardian to prove they're human; each solved challenge
 * decrypts one fragment of the intercepted message. After the last one the full
 * message resolves and the family's map corner is revealed, at which point we
 * call `onComplete` (which records the family's piece on the server).
 *
 * Answers are checked locally against each challenge's `correct` key — a wrong
 * tap just re-arms the check, never penalizes. Progress persists per Guardian
 * (localStorage) so they can close and resume; only the final completion is
 * reported to the backend.
 */
export function DecryptionConsole({
  guardianId,
  corner,
  onClose,
  onComplete,
}: {
  guardianId: string;
  /** The family's map-corner id (e.g. 'nw'); null if not a participant. */
  corner: string | null;
  onClose: () => void;
  onComplete: () => void | Promise<void>;
}) {
  const [solved, setSolved] = useState(() => getSolvedCount(guardianId));
  const completedRef = useRef(false);
  const done = solved >= CHALLENGE_COUNT;
  const challenge: Challenge | undefined = CHALLENGES[solved];

  // "Decoding" interstitial: plays between a correct answer and the fragment
  // actually settling into clear text, so it feels like real-time decryption
  // rather than an instant swap. `glitchText` is the scrambled stand-in shown
  // in the transmission strip while it runs.
  const [decoding, setDecoding] = useState(false);
  const [glitchText, setGlitchText] = useState('');
  const timersRef = useRef<{ interval?: number; timeout?: number }>({});

  useEffect(
    () => () => {
      if (timersRef.current.interval) window.clearInterval(timersRef.current.interval);
      if (timersRef.current.timeout) window.clearTimeout(timersRef.current.timeout);
    },
    []
  );

  // Advance one step once decoding finishes.
  const advance = useCallback(() => {
    setSolved((prev) => {
      const next = Math.min(prev + 1, CHALLENGE_COUNT);
      setSolvedCount(guardianId, next);
      if (next >= CHALLENGE_COUNT && !completedRef.current) {
        completedRef.current = true;
        // Record the family's piece. Fire-and-forget; the panel refreshes state.
        void Promise.resolve(onComplete()).catch(() => undefined);
      }
      return next;
    });
  }, [guardianId, onComplete]);

  // A challenge was just solved: scramble its fragment for a random stretch
  // before revealing the clear text and moving on (or completing).
  const onChallengeSolved = useCallback(() => {
    const fragment = DECRYPTED_MESSAGE[solved];
    if (!fragment) {
      advance();
      return;
    }
    const len = fragment.clear.length;
    setDecoding(true);
    setGlitchText(randomGlitchString(len));
    const interval = window.setInterval(() => {
      setGlitchText(randomGlitchString(len));
    }, 55);
    const duration = DECODE_MIN_MS + Math.random() * (DECODE_MAX_MS - DECODE_MIN_MS);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      setDecoding(false);
      advance();
    }, duration);
    timersRef.current = { interval, timeout };
  }, [solved, advance]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-emerald-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-emerald-500/20 px-4 py-3">
        <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.25em]">
          <span aria-hidden className="text-amber-300 animate-pulse">
            ◆
          </span>
          <span className="opacity-70">Decryption</span>
          <span className="tabular-nums opacity-50">
            {Math.min(solved, CHALLENGE_COUNT)}/{CHALLENGE_COUNT}
          </span>
        </span>
        <button
          onClick={onClose}
          aria-label="Close decryption"
          className="rounded border border-emerald-500/30 px-3 py-1 text-sm leading-none hover:bg-emerald-500/10"
        >
          ✕
        </button>
      </header>

      {/* The intercepted message, decrypting fragment by fragment. */}
      <MessageStrip
        solved={solved}
        decodingIndex={decoding ? solved : null}
        glitchText={glitchText}
      />

      {/* Body: decoding interstitial, the active challenge, or the reveal. */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {decoding ? (
          <DecodingPanel />
        ) : done ? (
          <RevealPanel corner={corner} onClose={onClose} />
        ) : challenge ? (
          <ChallengeView
            key={challenge.id}
            challenge={challenge}
            onSolved={onChallengeSolved}
          />
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/**
 * The cipher text up top. Solved fragments render in clear; the fragment
 * currently being unscrambled shows a flickering, chromatic-aberration glitch
 * (reusing the app's `.gd-glitch` effect) instead of snapping straight to text.
 */
function MessageStrip({
  solved,
  decodingIndex,
  glitchText,
}: {
  solved: number;
  decodingIndex: number | null;
  glitchText: string;
}) {
  return (
    <div className="border-b border-emerald-500/10 bg-emerald-500/[0.03] px-4 py-3">
      <p className="mb-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] opacity-40">
        <span>Intercepted transmission</span>
        {decodingIndex !== null && (
          <span className="animate-pulse text-amber-300 opacity-100">
            · decoding…
          </span>
        )}
      </p>
      <p className="break-words font-mono text-sm leading-relaxed">
        {DECRYPTED_MESSAGE.map((f, i) => {
          if (i === decodingIndex) {
            return (
              <span
                key={i}
                data-text={glitchText}
                className="gd-glitch animate-glitchShift text-amber-300"
              >
                {glitchText}
              </span>
            );
          }
          return i < solved ? (
            <span key={i} className="text-emerald-200">
              {f.clear}
            </span>
          ) : (
            <span key={i} className="text-emerald-500/40">
              {f.cipher}
            </span>
          );
        })}
      </p>
    </div>
  );
}

/** Shown while a solved challenge's fragment is mid-"decode" — a brief beat before the next check. */
function DecodingPanel() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <span aria-hidden className="animate-glitchShift text-4xl">
        🔓
      </span>
      <p
        data-text="DECODING FRAGMENT"
        className="gd-glitch text-sm font-mono uppercase tracking-[0.3em] text-amber-300"
      >
        Decoding fragment
      </p>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-500/40">
        Stand by…
      </p>
    </div>
  );
}

/** Routes a challenge to its renderer and reports a correct solve. */
function ChallengeView({
  challenge,
  onSolved,
}: {
  challenge: Challenge;
  onSolved: () => void;
}) {
  const [wrong, setWrong] = useState(false);

  // Brief red flash on a wrong answer; never blocks retry.
  const flashWrong = useCallback(() => {
    setWrong(true);
    window.setTimeout(() => setWrong(false), 600);
  }, []);

  return (
    <div className="mx-auto max-w-md">
      <p className="mb-4 text-center text-base leading-relaxed text-emerald-100">
        {challenge.prompt}
      </p>

      {challenge.kind === 'choices' ? (
        <ChoicesBoard
          challenge={challenge}
          onCorrect={onSolved}
          onWrong={flashWrong}
        />
      ) : (
        <GridBoard challenge={challenge} onCorrect={onSolved} onWrong={flashWrong} />
      )}

      <p
        className={`mt-4 text-center text-xs font-mono transition ${
          wrong ? 'text-red-300' : 'text-transparent'
        }`}
        aria-live="polite"
      >
        Not quite — try again.
      </p>
    </div>
  );
}

/** A row/grid of option tiles; tap the matching one. */
function ChoicesBoard({
  challenge,
  onCorrect,
  onWrong,
}: {
  challenge: Extract<Challenge, { kind: 'choices' }>;
  onCorrect: () => void;
  onWrong: () => void;
}) {
  const correct = useMemo(() => new Set(challenge.correct), [challenge.correct]);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {challenge.options.map((opt) => (
        <ChoiceTile
          key={opt.id}
          option={opt}
          onClick={() => (correct.has(opt.id) ? onCorrect() : onWrong())}
        />
      ))}
    </div>
  );
}

/** One option tile: shows its image, falling back to the emoji/text label if it fails to load. */
function ChoiceTile({
  option,
  onClick,
}: {
  option: ChoiceOption;
  onClick: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [attempting, setAttempting] = useState(false);
  const attemptTimerRef = useRef<number | null>(null);
  const showImage = !!option.image && !imgFailed;

  useEffect(
    () => () => {
      if (attemptTimerRef.current !== null) window.clearTimeout(attemptTimerRef.current);
    },
    []
  );

  const attemptDecrypt = () => {
    if (attempting) return;
    setAttempting(true);
    attemptTimerRef.current = window.setTimeout(() => {
      attemptTimerRef.current = null;
      setAttempting(false);
      onClick();
    }, choiceDecryptDelay());
  };

  return (
    <button
      onClick={attemptDecrypt}
      disabled={attempting}
      className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl border border-emerald-500/30 bg-white/5 text-5xl transition active:scale-95 hover:bg-emerald-500/10 disabled:opacity-100"
    >
      <span
        className={`absolute inset-0 grid place-items-center transition-opacity ${
          attempting ? 'opacity-35' : 'opacity-100'
        }`}
      >
        {showImage && (
          <img
            src={option.image}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        )}
        {/* Fallback label — shown whenever there's no image, or it failed to load. */}
        <span className={showImage ? 'sr-only' : ''} aria-hidden={showImage}>
          {option.label}
        </span>
      </span>
      {attempting && <DecryptAttemptOverlay />}
    </button>
  );
}

/** Shared tap feedback: every candidate visibly attempts decryption before evaluation. */
function DecryptAttemptOverlay() {
  return (
    <span className="absolute inset-0 z-10 grid animate-decryptAttempt place-items-center overflow-hidden bg-black/70 font-mono text-emerald-200">
      <span
        aria-hidden
        data-text="▓▒░ DECRYPTING ░▒▓"
        className="gd-glitch animate-glitchShift text-[10px] font-bold tracking-[0.12em]"
      >
        ▓▒░ DECRYPTING ░▒▓
      </span>
      <span
        aria-hidden
        className="absolute inset-x-0 h-px animate-decryptScan bg-emerald-200 shadow-[0_0_10px_rgba(167,243,208,0.9)]"
      />
      <span className="sr-only">Attempting to decrypt choice</span>
    </span>
  );
}

/** Background-position for one tile of an image sliced into rows×cols. */
function tileStyle(image: string, rows: number, cols: number, i: number) {
  const row = Math.floor(i / cols);
  const col = i % cols;
  const x = cols > 1 ? (col / (cols - 1)) * 100 : 0;
  const y = rows > 1 ? (row / (rows - 1)) * 100 : 0;
  return {
    backgroundImage: `url(${image})`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  } as const;
}

/** A rows×cols board: single-pick, multi-select (with Verify), or ordered taps. */
function GridBoard({
  challenge,
  onCorrect,
  onWrong,
}: {
  challenge: GridChallenge;
  onCorrect: () => void;
  onWrong: () => void;
}) {
  const { rows, cols, image, cells, multi, ordered, correct } = challenge;
  const total = rows * cols;
  // Selection state: a set for multi, an ordered list for sequence taps.
  const [selected, setSelected] = useState<number[]>([]);
  const [attemptingCell, setAttemptingCell] = useState<number | null>(null);
  const attemptTimerRef = useRef<number | null>(null);

  const correctSet = useMemo(() => new Set(correct), [correct]);
  const reset = () => setSelected([]);

  useEffect(
    () => () => {
      if (attemptTimerRef.current !== null) window.clearTimeout(attemptTimerRef.current);
    },
    []
  );

  const evaluateTile = (i: number) => {
    if (ordered) {
      // Each tap must continue the correct sequence; a wrong tap resets.
      const nextIndex = selected.length;
      if (correct[nextIndex] === i) {
        const next = [...selected, i];
        setSelected(next);
        if (next.length === correct.length) {
          window.setTimeout(onCorrect, 150);
        }
      } else {
        onWrong();
        reset();
      }
      return;
    }
    if (multi) {
      setSelected((prev) =>
        prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
      );
      return;
    }
    // Single-pick: the tap is the answer.
    if (correctSet.has(i)) onCorrect();
    else onWrong();
  };

  const handleTile = (i: number) => {
    if (attemptingCell !== null) return;
    setAttemptingCell(i);
    attemptTimerRef.current = window.setTimeout(() => {
      attemptTimerRef.current = null;
      setAttemptingCell(null);
      evaluateTile(i);
    }, choiceDecryptDelay());
  };

  const verifyMulti = () => {
    const sel = new Set(selected);
    const ok =
      sel.size === correctSet.size && [...correctSet].every((i) => sel.has(i));
    if (ok) onCorrect();
    else {
      onWrong();
      reset();
    }
  };

  const orderOf = (i: number) => selected.indexOf(i);

  return (
    <div className="mx-auto w-full max-w-xs">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: total }, (_, i) => {
          const isSelected = selected.includes(i);
          return (
            <button
              key={i}
              onClick={() => handleTile(i)}
              aria-pressed={isSelected}
              disabled={attemptingCell !== null}
              className={`relative grid aspect-square place-items-center overflow-hidden rounded-xl border bg-white/5 text-3xl transition active:scale-95 disabled:opacity-100 ${
                isSelected
                  ? 'border-emerald-400 ring-2 ring-emerald-400/60'
                  : 'border-emerald-500/30 hover:bg-emerald-500/10'
              }`}
              style={image ? tileStyle(image, rows, cols, i) : undefined}
            >
              {!image && <span aria-hidden>{cells?.[i] ?? ''}</span>}
              {ordered && isSelected && (
                <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-400 text-xs font-bold text-black">
                  {orderOf(i) + 1}
                </span>
              )}
              {multi && isSelected && (
                <span className="absolute right-1 top-1 text-emerald-300">✓</span>
              )}
              {attemptingCell === i && <DecryptAttemptOverlay />}
            </button>
          );
        })}
      </div>

      {multi && (
        <button
          onClick={verifyMulti}
          disabled={selected.length === 0}
          className="mt-4 w-full rounded-full bg-emerald-500/80 px-4 py-2.5 text-sm font-semibold text-black transition active:scale-95 disabled:opacity-30"
        >
          Verify
        </button>
      )}
    </div>
  );
}

/** Shown once every challenge is solved: the resolved message + map corner. */
function RevealPanel({
  corner,
  onClose,
}: {
  corner: string | null;
  onClose: () => void;
}) {
  return (
    <div className="mx-auto max-w-md text-center">
      <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-emerald-300">
        Decryption complete
      </p>
      <p className="mt-2 break-words font-mono text-lg leading-relaxed text-emerald-100">
        {DECRYPTED_MESSAGE.map((f) => f.clear).join('')}
      </p>

      {corner && (
        <div className="mt-6">
          <p className="mb-2 text-[11px] font-mono uppercase tracking-[0.25em] opacity-50">
            Your corner of the map
          </p>
          <div className="mx-auto grid aspect-square w-48 place-items-center overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04]">
            <img
              src={`/map/${corner}.png`}
              alt="Your corner of the torn map"
              className="h-full w-full object-cover"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement;
                el.style.display = 'none';
                el.insertAdjacentHTML(
                  'afterend',
                  '<span class="px-3 text-xs font-mono opacity-50">map corner: ' +
                    corner +
                    '</span>'
                );
              }}
            />
          </div>
        </div>
      )}

      <p className="mt-6 text-sm leading-relaxed opacity-70">
        Your piece is in. Rally the other families — the full map appears only when
        every corner is recovered.
      </p>

      <button
        onClick={onClose}
        className="mt-6 rounded-full bg-emerald-500/80 px-6 py-2.5 text-sm font-semibold text-black transition active:scale-95"
      >
        Back to Athena
      </button>
    </div>
  );
}
