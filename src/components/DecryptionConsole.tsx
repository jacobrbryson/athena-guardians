import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CHALLENGES,
  CHALLENGE_COUNT,
  DECRYPTED_MESSAGE,
  type Challenge,
} from '../missions/challenges';
import { getSolvedCount, setSolvedCount } from '../missions/decryptionProgress';
import { useDecodeSound } from '../missions/useDecodeSound';
import {
  ChallengeView,
  DecodingPanel,
  MessageStrip,
  useFragmentDecode,
} from '../decode/boards';

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
 *
 * The boards, glitch animations and sounds live in decode/boards.tsx, shared
 * with the repeatable Signal Decoder.
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
  const sound = useDecodeSound();

  // Advance one step once decoding finishes.
  const advance = useCallback(() => {
    setSolved((prev) => {
      const next = Math.min(prev + 1, CHALLENGE_COUNT);
      setSolvedCount(guardianId, next);
      if (next >= CHALLENGE_COUNT && !completedRef.current) {
        completedRef.current = true;
        sound.playComplete();
        // Record the family's piece. Fire-and-forget; the panel refreshes state.
        void Promise.resolve(onComplete()).catch(() => undefined);
      }
      return next;
    });
  }, [guardianId, onComplete, sound]);

  // "Decoding" interstitial: plays between a correct answer and the fragment
  // actually settling into clear text, so it feels like real-time decryption
  // rather than an instant swap.
  const { decoding, glitchText, begin } = useFragmentDecode(sound, advance);

  // A challenge was just solved: scramble its fragment for a random stretch
  // before revealing the clear text and moving on (or completing).
  const onChallengeSolved = useCallback(() => {
    const fragment = DECRYPTED_MESSAGE[solved];
    if (!fragment) {
      advance();
      return;
    }
    begin(fragment.clear.length);
  }, [solved, advance, begin]);

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
        fragments={DECRYPTED_MESSAGE}
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
