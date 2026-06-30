/**
 * Decryption mission — the "bot check" challenges.
 *
 * Athena is decrypting an intercepted message and needs a human to prove they
 * aren't a bot. Each solved challenge decrypts one fragment of the message
 * (see DECRYPTED_MESSAGE); finishing all of them uncovers the family's corner
 * of a map torn into four.
 *
 * Answers are validated CLIENT-SIDE (this is a kids' game) — only the family's
 * final completion is recorded on the server, which keeps the four-corner map
 * assembly server-gated. See components/DecryptionConsole.tsx for the UI and
 * missions/useMission.ts for how completion reports the family's piece.
 *
 * AUTHORING
 * ---------
 * Each challenge uses a deliberately different mechanic ("all challenges should
 * be unique"). Two render kinds:
 *   - `grid`    : a rows×cols board of clickable tiles. `multi` = select all
 *                 matching tiles; `ordered` = tap tiles in the right sequence.
 *                 `image` (optional) overlays the board on one picture sliced
 *                 into tiles; without it, `cells[]` labels render each tile so
 *                 the check is playable before final art lands.
 *   - `choices` : a row of option tiles; tap the one(s) that match. Each option
 *                 carries an `image` (path under public/decryption/) or a `label`
 *                 fallback (emoji/text) so it renders without art.
 *
 * Image paths point at guardians/public/decryption/ — drop matching files there.
 * Answer keys (`correct`) are 0-based tile indices (grid) or option ids
 * (choices). Defaults below are placeholders matched to the emoji fallbacks;
 * confirm each against your real art and mark resolved.  // TODO author
 */

/** Where bot-check art lives (public/ is served at the site root). */
export const DECRYPTION_ASSET_BASE = '/decryption';

export interface GridChallenge {
  id: string;
  kind: 'grid';
  /** What Athena asks — shown above the board. */
  prompt: string;
  rows: number;
  cols: number;
  /** Optional single image sliced into rows×cols tiles. */
  image?: string;
  /** Per-tile fallback content (emoji/char), row-major. Used when no `image`. */
  cells?: string[];
  /** Select every matching tile (vs. a single tile). Ignored when `ordered`. */
  multi?: boolean;
  /** Tap tiles in sequence; `correct` is then an ordered list. */
  ordered?: boolean;
  /** Answer key: 0-based tile indices (a set for `multi`, a sequence for `ordered`). */
  correct: number[];
}

export interface ChoiceOption {
  id: string;
  /** Path under public/decryption/, e.g. '/decryption/c1-yellow.png'. */
  image?: string;
  /** Fallback shown when there's no image (emoji/short text). */
  label?: string;
}

export interface ChoicesChallenge {
  id: string;
  kind: 'choices';
  prompt: string;
  options: ChoiceOption[];
  /** Answer key: option id(s) that count as correct. */
  correct: string[];
}

export type Challenge = GridChallenge | ChoicesChallenge;

/**
 * The five bot-checks, in order. Each unlocks the next DECRYPTED_MESSAGE
 * fragment. Keep them short and forgiving — a wrong tap just re-arms the check.
 */
export const CHALLENGES: Challenge[] = [
  // 1 — pick-one by color/shape (Athena's own example).
  {
    id: 'c1-yellow-circle',
    kind: 'choices',
    prompt: 'To begin, prove you are human: tap the yellow circle.',
    options: [
      { id: 'red', label: '🔴', image: `${DECRYPTION_ASSET_BASE}/c1-red.png` },
      { id: 'yellow', label: '🟡', image: `${DECRYPTION_ASSET_BASE}/c1-yellow.png` },
      { id: 'blue', label: '🔵', image: `${DECRYPTION_ASSET_BASE}/c1-blue.png` },
      { id: 'green', label: '🟢', image: `${DECRYPTION_ASSET_BASE}/c1-green.png` },
    ],
    correct: ['yellow'], // TODO author
  },

  // 2 — multi-select grid: tap every tile that matches.
  {
    id: 'c2-find-stars',
    kind: 'grid',
    prompt: 'Select every square that contains a star.',
    rows: 3,
    cols: 3,
    multi: true,
    // Stars at indices 0, 4, 8 (the diagonal). Every correct tile uses the
    // exact same monochrome star; decoys are unambiguously different shapes so
    // children are never asked to judge whether a sparkle is also a star.
    cells: ['★', '●', '◆', '▲', '★', '■', '⬢', '✚', '★'],
    correct: [0, 4, 8], // TODO author
  },

  // 3 — sequence/pattern: which symbol comes next?
  {
    id: 'c3-pattern-next',
    kind: 'choices',
    prompt: 'The signal repeats:  △  ▽  △  ▽  …  —  which symbol comes next?',
    options: [
      { id: 'up', label: '△' },
      { id: 'down', label: '▽' },
      { id: 'diamond', label: '◇' },
      { id: 'square', label: '▢' },
    ],
    correct: ['up'], // TODO author
  },

  // 4 — ordered grid: tap the tiles in the right sequence.
  {
    id: 'c4-tap-in-order',
    kind: 'grid',
    prompt: 'Realign the cipher: tap the numbers in order — 1, then 2, then 3.',
    rows: 1,
    cols: 3,
    ordered: true,
    // Shown shuffled; the answer is the index sequence that spells 1→2→3.
    cells: ['3', '1', '2'],
    correct: [1, 2, 0], // TODO author (index of '1', then '2', then '3')
  },

  // 5 — image choice: pick the matching picture (final fragment).
  {
    id: 'c5-find-the-lake',
    kind: 'choices',
    prompt: 'Last check — tap the picture of the lake.',
    options: [
      { id: 'mountain', label: '🏔️', image: `${DECRYPTION_ASSET_BASE}/c5-mountain.png` },
      { id: 'lake', label: '🏞️', image: `${DECRYPTION_ASSET_BASE}/c5-lake.png` },
      { id: 'desert', label: '🏜️', image: `${DECRYPTION_ASSET_BASE}/c5-desert.png` },
      { id: 'city', label: '🏙️', image: `${DECRYPTION_ASSET_BASE}/c5-city.png` },
    ],
    correct: ['lake'], // TODO author
  },
];

/**
 * The intercepted message, one fragment per challenge. `cipher` is the garbled
 * text shown before that fragment is decrypted; `clear` is what it resolves to
 * once the matching challenge is solved. Placeholder copy — edit freely.
 * (Keep `cipher` roughly the same length as `clear` so the reveal lines up.)
 */
export interface MessageFragment {
  cipher: string;
  clear: string;
}

export const DECRYPTED_MESSAGE: MessageFragment[] = [
  { cipher: 'Xk7#qZ ', clear: 'GUARDIAN ' }, // TODO author
  { cipher: '∆9vR†2 ', clear: 'NETWORK ' },
  { cipher: 'µ4Wp%! ', clear: 'CONVERGE ' },
  { cipher: 'b8§Lo¬ ', clear: 'AT THE ' },
  { cipher: 'Q1z∂x∞.', clear: 'TORN MAP.' },
];

/** Convenience: the fully decrypted message as a single string. */
export const DECRYPTED_TEXT = DECRYPTED_MESSAGE.map((f) => f.clear).join('');

/** Total number of bot-checks — the denominator for "n/5 fragments". */
export const CHALLENGE_COUNT = CHALLENGES.length;
