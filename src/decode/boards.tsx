import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Challenge,
  ChoiceOption,
  GridChallenge,
  MessageFragment,
} from '../missions/challenges';
import { randomGlitchString } from './glitch';

/**
 * Shared "decryption" play pieces — the challenge boards, tap-to-decrypt
 * overlays and glitchy message strip originally built for the mission
 * DecryptionConsole, extracted so the repeatable Signal Decoder plays with the
 * exact same animations, sounds and feel.
 */

/** How long a fragment "decodes" for before settling — randomized each time. */
export const DECODE_MIN_MS = 1000;
export const DECODE_MAX_MS = 2600;
const CHOICE_DECRYPT_MS = 480;

export function randomDecodeDuration(): number {
  return DECODE_MIN_MS + Math.random() * (DECODE_MAX_MS - DECODE_MIN_MS);
}

export function choiceDecryptDelay(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0
    : CHOICE_DECRYPT_MS;
}

/**
 * The cipher text up top. Solved fragments render in clear; the fragment
 * currently being unscrambled shows a flickering, chromatic-aberration glitch
 * (reusing the app's `.gd-glitch` effect) instead of snapping straight to text.
 */
export function MessageStrip({
  fragments,
  solved,
  decodingIndex,
  glitchText,
  label = 'Intercepted transmission',
}: {
  fragments: MessageFragment[];
  solved: number;
  decodingIndex: number | null;
  glitchText: string;
  label?: string;
}) {
  return (
    <div className="border-b border-emerald-500/10 bg-emerald-500/[0.03] px-4 py-3">
      <p className="mb-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] opacity-40">
        <span>{label}</span>
        {decodingIndex !== null && (
          <span className="animate-pulse text-amber-300 opacity-100">
            · decoding…
          </span>
        )}
      </p>
      <p className="break-words font-mono text-sm leading-relaxed">
        {fragments.map((f, i) => {
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
export function DecodingPanel() {
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

/**
 * Drives the glitch-text + blip-loop "decoding" interstitial shared by both
 * consoles. Call `begin(length)` when a challenge is solved; `onSettled` fires
 * once the fragment resolves. Timers/sound are cleaned up on unmount.
 */
export function useFragmentDecode(
  sound: { startDecodingLoop: () => () => void; playSolved: () => void },
  onSettled: () => void
) {
  const [decoding, setDecoding] = useState(false);
  const [glitchText, setGlitchText] = useState('');
  const timersRef = useRef<{ interval?: number; timeout?: number; stopSound?: () => void }>({});
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  useEffect(
    () => () => {
      if (timersRef.current.interval) window.clearInterval(timersRef.current.interval);
      if (timersRef.current.timeout) window.clearTimeout(timersRef.current.timeout);
      timersRef.current.stopSound?.();
    },
    []
  );

  const begin = useCallback(
    (length: number) => {
      setDecoding(true);
      setGlitchText(randomGlitchString(length));
      const interval = window.setInterval(() => {
        setGlitchText(randomGlitchString(length));
      }, 55);
      const stopSound = sound.startDecodingLoop();
      const timeout = window.setTimeout(() => {
        window.clearInterval(interval);
        stopSound();
        setDecoding(false);
        sound.playSolved();
        settledRef.current();
      }, randomDecodeDuration());
      timersRef.current = { interval, timeout, stopSound };
    },
    [sound]
  );

  return { decoding, glitchText, begin };
}

/** Routes a challenge to its renderer and reports a correct solve. */
export function ChallengeView({
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
export function DecryptAttemptOverlay() {
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
