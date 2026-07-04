import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDecodeSound } from '../missions/useDecodeSound';
import {
  ChallengeView,
  DecodingPanel,
  MessageStrip,
  useFragmentDecode,
} from './boards';
import { generateSignal, type Signal } from './signalGenerator';
import { getSignalsDecoded, incrementSignalsDecoded, rankFor } from './decodeStats';

/**
 * The repeatable Signal Decoder — "help Athena decode intercepted signals."
 *
 * Unlocked once Mission 1 is complete and always available after that. Each
 * run is a freshly generated signal (see signalGenerator.ts): a garbled
 * message up top that resolves fragment by fragment as the Guardian solves
 * puzzle challenges, with the same glitch animations and synthesized sounds
 * as the mission decryption console. Finishing a signal bumps the Guardian's
 * lifetime decode count — a pure flavor stat that scales difficulty, earns
 * decoder ranks, and lets Athena acknowledge the help in chat. Nothing else
 * gates on it.
 */
export function SignalDecoder({
  guardianId,
  onClose,
}: {
  guardianId: string;
  onClose: () => void;
}) {
  const [total, setTotal] = useState(() => getSignalsDecoded(guardianId));
  const [signal, setSignal] = useState<Signal>(() => generateSignal(total));
  const [solved, setSolved] = useState(0);
  const completedRef = useRef(false);
  const sound = useDecodeSound();

  const done = solved >= signal.challenges.length;
  const challenge = signal.challenges[solved];

  // Advance one step once the fragment finishes its glitch-decode beat.
  const advance = useCallback(() => {
    setSolved((prev) => {
      const next = Math.min(prev + 1, signal.challenges.length);
      if (next >= signal.challenges.length && !completedRef.current) {
        completedRef.current = true;
        sound.playComplete();
        setTotal(incrementSignalsDecoded(guardianId));
      }
      return next;
    });
  }, [guardianId, signal.challenges.length, sound]);

  const { decoding, glitchText, begin } = useFragmentDecode(sound, advance);

  const onChallengeSolved = useCallback(() => {
    const fragment = signal.fragments[solved];
    if (!fragment) {
      advance();
      return;
    }
    begin(fragment.clear.length);
  }, [signal.fragments, solved, advance, begin]);

  // The repeatability loop: pull a brand-new signal, one notch harder if the
  // Guardian just crossed a difficulty threshold.
  const decodeAnother = useCallback(() => {
    completedRef.current = false;
    setSolved(0);
    setSignal(generateSignal(getSignalsDecoded(guardianId)));
  }, [guardianId]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-emerald-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-cyan-500/20 px-4 py-3">
        <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.25em]">
          <span aria-hidden className="text-cyan-300 animate-pulse">
            📡
          </span>
          <span className="opacity-70">Signal Decoder</span>
          <span className="tabular-nums opacity-50">
            {Math.min(solved, signal.challenges.length)}/{signal.challenges.length}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-200/60">
            decoded <span className="tabular-nums text-cyan-200">{total}</span>
          </span>
          <button
            onClick={onClose}
            aria-label="Close signal decoder"
            className="rounded border border-emerald-500/30 px-3 py-1 text-sm leading-none hover:bg-emerald-500/10"
          >
            ✕
          </button>
        </span>
      </header>

      {/* The intercepted signal, decoding fragment by fragment. */}
      <MessageStrip
        fragments={signal.fragments}
        solved={solved}
        decodingIndex={decoding ? solved : null}
        glitchText={glitchText}
        label="Live intercept"
      />

      {/* Body: decoding interstitial, the active challenge, or the reveal. */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {decoding ? (
          <DecodingPanel />
        ) : done ? (
          <SignalRevealPanel
            signal={signal}
            total={total}
            onAnother={decodeAnother}
            onClose={onClose}
          />
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

/** The payoff: the clear message, the running total and rank, and Decode Another. */
function SignalRevealPanel({
  signal,
  total,
  onAnother,
  onClose,
}: {
  signal: Signal;
  total: number;
  onAnother: () => void;
  onClose: () => void;
}) {
  const rank = rankFor(total);
  return (
    <div className="mx-auto max-w-md text-center">
      <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-cyan-300">
        Signal decoded
      </p>
      <p className="mt-2 break-words font-mono text-lg leading-relaxed text-emerald-100">
        {signal.message}
      </p>

      <div className="mx-auto mt-6 max-w-xs rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.05] px-4 py-4">
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] opacity-50">
          Signals decoded for Athena
        </p>
        <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-cyan-200">
          {total}
        </p>
        <p className="mt-2 text-[11px] font-mono uppercase tracking-[0.2em] text-emerald-200">
          Rank: {rank.title}
        </p>
        {rank.next && (
          <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.15em] opacity-45">
            {rank.next.remaining} more to {rank.next.title}
          </p>
        )}
      </div>

      <p className="mt-5 text-sm leading-relaxed opacity-70">
        Athena logs every signal you clear. The channels stay clean because
        Guardians like you keep decoding.
      </p>

      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          onClick={onAnother}
          className="rounded-full bg-cyan-500/80 px-6 py-2.5 text-sm font-semibold text-black transition active:scale-95"
        >
          📡 Decode another signal
        </button>
        <button
          onClick={onClose}
          className="rounded-full border border-emerald-500/30 px-6 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/10 active:scale-95"
        >
          Back to Athena
        </button>
      </div>
    </div>
  );
}
