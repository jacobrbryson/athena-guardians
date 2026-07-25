import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { completeIndexClue } from '../api/mission';
import { useDecodeSound } from '../missions/useDecodeSound';
import type { Challenge, MessageFragment } from '../missions/challenges';
import {
  ChallengeView,
  DecodingPanel,
  MessageStrip,
  useFragmentDecode,
} from './boards';
import { fragmentMessage, generateChallenges } from './signalGenerator';

type Status = 'playing' | 'saving' | 'done' | 'error';

/**
 * Mission 3's resumable "next card" decoder. The puzzle decrypts a generic
 * location signal; the exact hint is requested only after the final challenge,
 * allowing the server to substitute a different target if another Guardian
 * found the original card while this puzzle was open.
 */
export function IndexClueDecrypt({
  challengeCount,
  onClose,
  onRevealed,
}: {
  challengeCount: number;
  onClose: () => void;
  onRevealed: () => void;
}) {
  const count = Math.max(1, challengeCount);
  const [fragments] = useState<MessageFragment[]>(() =>
    fragmentMessage('LOCATING AN UNRECOVERED FIRST WATCH RECORD', count)
  );
  const [challenges] = useState<Challenge[]>(() => generateChallenges(count, 2));
  const [solved, setSolved] = useState(0);
  const [status, setStatus] = useState<Status>('playing');
  const [clue, setClue] = useState<string | null>(null);
  const savingRef = useRef(false);
  const sound = useDecodeSound();

  const advance = useCallback(() => {
    setSolved((value) => Math.min(value + 1, challenges.length));
  }, [challenges.length]);
  const { decoding, glitchText, begin } = useFragmentDecode(sound, advance);

  const solve = useCallback(() => {
    const fragment = fragments[solved];
    if (fragment) begin(fragment.clear.length);
    else advance();
  }, [advance, begin, fragments, solved]);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setStatus('saving');
    try {
      const result = await completeIndexClue();
      if (result.success && result.clue?.text) {
        setClue(result.clue.text);
        setStatus('done');
        sound.playComplete();
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      savingRef.current = false;
    }
  }, [sound]);

  useEffect(() => {
    if (solved >= challenges.length && status === 'playing') void save();
  }, [challenges.length, save, solved, status]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-emerald-50">
      <header className="flex items-center justify-between border-b border-cyan-500/20 px-4 py-3">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em]">
          <span aria-hidden className="animate-pulse text-amber-300">🔐</span>
          <span className="opacity-70">Next-card decryption</span>
          <span className="tabular-nums opacity-50">
            {Math.min(solved, challenges.length)}/{challenges.length}
          </span>
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
      </header>

      <MessageStrip
        fragments={fragments}
        solved={solved}
        decodingIndex={decoding ? solved : null}
        glitchText={glitchText}
        label="Encrypted First Watch location signal"
      />

      <div className="flex-1 overflow-y-auto px-4 py-5">
        {decoding ? (
          <DecodingPanel />
        ) : status === 'done' && clue ? (
          <div className="mx-auto max-w-md py-5 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-amber-300">
              Unfound card located
            </p>
            <p className="mt-5 break-words font-mono text-lg leading-relaxed text-emerald-100">
              {clue}
            </p>
            <p className="mt-5 text-sm leading-relaxed opacity-65">
              This location was checked against the live Guardian Index when the
              decryption finished.
            </p>
            <button
              onClick={onRevealed}
              className="mt-7 rounded-full bg-amber-400/90 px-6 py-2.5 text-sm font-semibold text-black transition active:scale-95"
            >
              Return to Athena
            </button>
          </div>
        ) : status === 'saving' ? (
          <p className="animate-pulse py-10 text-center font-mono text-xs uppercase tracking-[0.3em] text-cyan-200">
            Checking the live Guardian Index…
          </p>
        ) : status === 'error' ? (
          <div className="mx-auto max-w-sm py-8 text-center">
            <p className="text-sm text-amber-200">
              The Network connection flickered. Your pending clue is still safe.
            </p>
            <button
              onClick={() => void save()}
              className="mt-5 rounded-full bg-cyan-500/80 px-6 py-2.5 text-sm font-semibold text-black"
            >
              Try again
            </button>
          </div>
        ) : challenges[solved] ? (
          <ChallengeView
            key={challenges[solved]?.id}
            challenge={challenges[solved]}
            onSolved={solve}
          />
        ) : null}
      </div>
    </div>,
    document.body
  );
}
