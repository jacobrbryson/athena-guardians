import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A presentational, full-screen "connecting" overlay: it cycles through status
 * messages with the terminal/scanline aesthetic, evoking mission control rather
 * than a hacker console. Timing is owned by the parent — this just rotates the
 * lines until it is unmounted.
 *
 *   - `messages`: pool of lines to show (a shuffled subset is cycled).
 *   - `intervalMs`: time per line (default 650ms).
 *   - `tone`: visual treatment ('terminal' for the gate, 'overlay' over Athena).
 */

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface Props {
  messages: string[];
  intervalMs?: number;
  tone?: 'terminal' | 'overlay';
  /** Optional small label above the rotating line. */
  eyebrow?: string;
}

export function SequenceOverlay({
  messages,
  intervalMs = 650,
  tone = 'terminal',
  eyebrow = 'guardian network',
}: Props) {
  // A stable, shuffled order for this mount.
  const order = useMemo(() => shuffle(messages), [messages]);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      // Advance, then hold on the last line (don't loop back jarringly).
      indexRef.current = Math.min(indexRef.current + 1, order.length - 1);
      setIndex(indexRef.current);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [order.length, intervalMs]);

  const current = order[index] ?? '';
  const isOverlay = tone === 'overlay';

  return (
    <div
      className={`absolute inset-0 z-40 grid place-items-center px-6 font-mono select-none ${
        isOverlay ? 'bg-black/85 text-emerald-100' : 'gd-scanlines gd-sweep'
      }`}
      aria-live="polite"
    >
      <div className="w-full max-w-sm text-center">
        <p className="text-[10px] uppercase tracking-[0.5em] opacity-40 animate-flicker">
          {eyebrow}
        </p>

        {/* Animated signal dots */}
        <div className="my-6 flex items-center justify-center gap-2" aria-hidden>
          {[0, 1, 2].map((d) => (
            <span
              key={d}
              className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"
              style={{ animationDelay: `${d * 180}ms`, opacity: 0.8 }}
            />
          ))}
        </div>

        {/* Rotating status line with a glitch echo */}
        <p
          key={index}
          className="text-sm md:text-base tracking-[0.2em] gd-glitch transition-opacity duration-200"
          data-text={current}
        >
          {current}
          <span className="animate-caret ml-1" aria-hidden>
            _
          </span>
        </p>

        {/* Progress ticks */}
        <div className="mt-6 flex items-center justify-center gap-1" aria-hidden>
          {order.map((_, i) => (
            <span
              key={i}
              className={`h-px w-6 transition-colors duration-300 ${
                i <= index ? 'bg-current' : 'bg-current/20'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
