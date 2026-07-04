/**
 * Per-Guardian Signal Decoder stats, persisted in localStorage. This is a pure
 * fun-and-flavor data point: nothing gates on it. The lifetime total drives
 * puzzle difficulty, the rank titles on the reveal screen, and is sent along
 * with chat messages so Athena can acknowledge the Guardian's decoding help.
 */

const keyFor = (guardianId: string) => `guardian_signals_decoded:${guardianId}`;

/** Lifetime signals this Guardian has fully decoded. */
export function getSignalsDecoded(guardianId: string): number {
  try {
    const raw = localStorage.getItem(keyFor(guardianId));
    const n = raw == null ? 0 : parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Bump the lifetime total by one; returns the new total. */
export function incrementSignalsDecoded(guardianId: string): number {
  const next = getSignalsDecoded(guardianId) + 1;
  try {
    localStorage.setItem(keyFor(guardianId), String(next));
  } catch {
    /* localStorage unavailable (private mode) — the count just won't persist. */
  }
  return next;
}

/** Decoder ranks — earned by lifetime total, shown on the reveal screen. */
const RANKS: readonly { at: number; title: string }[] = [
  { at: 0, title: 'Cipher Cadet' },
  { at: 3, title: 'Signal Scout' },
  { at: 6, title: 'Glyph Hunter' },
  { at: 10, title: 'Code Breaker' },
  { at: 15, title: 'Cipher Sleuth' },
  { at: 21, title: 'Signal Master' },
  { at: 30, title: 'Legendary Cryptographer' },
];

export interface DecoderRank {
  title: string;
  /** Next rank title + how many more signals to reach it; null at the top. */
  next: { title: string; remaining: number } | null;
}

export function rankFor(total: number): DecoderRank {
  let current = RANKS[0];
  let next: (typeof RANKS)[number] | null = null;
  for (const rank of RANKS) {
    if (total >= rank.at) current = rank;
    else {
      next = rank;
      break;
    }
  }
  return {
    title: current.title,
    next: next ? { title: next.title, remaining: next.at - total } : null,
  };
}
