import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDecodeSound } from '../missions/useDecodeSound';
import {
  ChallengeView,
  DecodingPanel,
  MessageStrip,
  useFragmentDecode,
} from './boards';
import { fragmentMessage, generateChallenges } from './signalGenerator';
import { completeTrailKey, type TrailClue } from '../api/mission';
import type { Challenge, MessageFragment } from '../missions/challenges';

/**
 * Trail-mission clue decryption — the payoff for finding a clue card.
 *
 * A reported key parks the next trail clue behind a short, randomized run of
 * the existing decode challenges (same boards, sounds and glitch animations as
 * the Signal Decoder). The clue's actual text de-glitches fragment by fragment
 * as the Guardian solves, and the final challenge flips the key to "used" on
 * the server, unlocking the clue for good. Difficulty ramps gently across the
 * ten clues so the hunt stays fun but never trivial.
 *
 * Closing mid-run is safe: the key stays pending server-side and the mission
 * panel offers to resume the decryption.
 */

/** Clue index (0..9) → challenge difficulty tier. Early legs easy, finale spicy. */
function tierFor(clueIndex: number): number {
  return Math.min(4, 1 + Math.floor(clueIndex / 3));
}

type CompleteStatus = 'playing' | 'saving' | 'done' | 'error';

export function ClueDecrypt({
  keyCode,
  clue,
  challengeCount,
  keysTotal,
  onUnlocked,
  onClose,
}: {
  keyCode: string;
  clue: TrailClue;
  challengeCount: number;
  keysTotal: number;
  /** Called after the clue is revealed and the Guardian heads back. */
  onUnlocked: () => void;
  /** Close mid-run — the key stays pending and can be resumed. */
  onClose: () => void;
}) {
  // One fixed run per mount: the clue text split across the challenges.
  const [fragments] = useState<MessageFragment[]>(() =>
    fragmentMessage(clue.text, challengeCount)
  );
  const [challenges] = useState<Challenge[]>(() =>
    generateChallenges(challengeCount, tierFor(clue.index))
  );
  const [solved, setSolved] = useState(0);
  const [status, setStatus] = useState<CompleteStatus>('playing');
  const savingRef = useRef(false);
  const sound = useDecodeSound();

  const allSolved = solved >= challenges.length;
  const challenge = challenges[solved];

  const advance = useCallback(() => {
    setSolved((prev) => Math.min(prev + 1, challenges.length));
  }, [challenges.length]);

  const { decoding, glitchText, begin } = useFragmentDecode(sound, advance);

  const onChallengeSolved = useCallback(() => {
    const fragment = fragments[solved];
    if (!fragment) {
      advance();
      return;
    }
    begin(fragment.clear.length);
  }, [fragments, solved, advance, begin]);

  // Every challenge cleared: lock the key in on the server, then reveal.
  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setStatus('saving');
    try {
      const res = await completeTrailKey(keyCode);
      if (res?.success) {
        sound.playComplete();
        setStatus('done');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      savingRef.current = false;
    }
  }, [keyCode, sound]);

  useEffect(() => {
    if (allSolved && status === 'playing') void save();
  }, [allSolved, status, save]);

  const clueNumber = clue.index + 1;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-emerald-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-cyan-500/20 px-4 py-3">
        <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.25em]">
          <span aria-hidden className="text-amber-300 animate-pulse">
            🔐
          </span>
          <span className="opacity-70">Clue decryption</span>
          <span className="tabular-nums opacity-50">
            {Math.min(solved, challenges.length)}/{challenges.length}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-amber-200/60">
            clue <span className="tabular-nums text-amber-200">{clueNumber}</span> of{' '}
            <span className="tabular-nums">{keysTotal}</span>
          </span>
          {status !== 'done' && (
            <button
              onClick={onClose}
              aria-label="Close clue decryption"
              className="rounded border border-emerald-500/30 px-3 py-1 text-sm leading-none hover:bg-emerald-500/10"
            >
              ✕
            </button>
          )}
        </span>
      </header>

      {/* The clue itself, de-glitching fragment by fragment. */}
      <MessageStrip
        fragments={fragments}
        solved={solved}
        decodingIndex={decoding ? solved : null}
        glitchText={glitchText}
        label={`Encrypted trail clue · key ${keyCode}`}
      />

      <div className="flex-1 overflow-y-auto px-4 py-5">
        {decoding ? (
          <DecodingPanel />
        ) : status === 'done' ? (
          <ClueRevealPanel
            clue={clue}
            keysTotal={keysTotal}
            onBack={onUnlocked}
          />
        ) : status === 'saving' ? (
          <p className="py-10 text-center font-mono text-xs uppercase tracking-[0.3em] text-cyan-200 animate-pulse">
            Confirming with the Guardian Network…
          </p>
        ) : status === 'error' ? (
          <div className="mx-auto max-w-sm py-8 text-center">
            <p className="text-sm text-amber-200">
              The Network connection flickered — the decryption is done, it just
              needs to be confirmed.
            </p>
            <button
              onClick={() => void save()}
              className="mt-5 rounded-full bg-cyan-500/80 px-6 py-2.5 text-sm font-semibold text-black transition active:scale-95"
            >
              Try again
            </button>
          </div>
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

/** The unlocked clue, loud and proud, plus the way back to the mission. */
function ClueRevealPanel({
  clue,
  keysTotal,
  onBack,
}: {
  clue: TrailClue;
  keysTotal: number;
  onBack: () => void;
}) {
  const isStart = clue.index === 0;
  const isFinal = clue.index === keysTotal - 1;
  return (
    <div className="mx-auto max-w-md text-center">
      <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-amber-300">
        Clue {clue.index + 1} of {keysTotal} decrypted
      </p>
      <p className="mt-3 break-words font-mono text-lg leading-relaxed text-emerald-100">
        {clue.text}
      </p>

      {!isStart && (
        <div className="mx-auto mt-6 flex max-w-xs items-stretch justify-center gap-3">
          <div className="flex-1 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-3">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] opacity-50">
              Distance
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-200">
              {clue.distance}
              <span className="ml-1 text-sm font-normal opacity-60">m</span>
            </p>
          </div>
          <div className="flex-1 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-3">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] opacity-50">
              Bearing
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-200">
              {clue.bearing}
              <span className="ml-1 text-sm font-normal opacity-60">°</span>
            </p>
          </div>
        </div>
      )}

      <p className="mt-5 text-sm leading-relaxed opacity-70">
        {isFinal
          ? 'That was the last key — the whole trail is revealed. Follow every leg in order from the very start. Ratatouille is counting on you!'
          : 'The trail grows. Keep searching the property for cards marked with the Guardians logo — every key brings you closer to Ratatouille.'}
      </p>

      <button
        onClick={onBack}
        className="mt-6 rounded-full bg-amber-400/90 px-6 py-2.5 text-sm font-semibold text-black transition active:scale-95"
      >
        {isFinal ? '🏆 See the full trail' : 'Back to the mission'}
      </button>
    </div>
  );
}
