import type { Challenge, MessageFragment } from '../missions/challenges';
import { randomGlitchString } from './glitch';

/**
 * Procedural puzzle generator for the repeatable Signal Decoder.
 *
 * Every "signal" is a freshly generated run: an in-fiction intercepted message
 * split into fragments, plus one challenge per fragment drawn from eight
 * puzzle families. Difficulty scales with the Guardian's lifetime decode count
 * (bigger boards, longer sequences, sneakier look-alike decoys), and within a
 * run the last challenges are always a notch harder than the first.
 *
 * Everything renders through the existing Challenge types, so the shared
 * boards in decode/boards.tsx provide the animations and sounds unchanged.
 */

export interface Signal {
  /** Uniquish id so React can key a fresh run. */
  id: string;
  /** The full decoded message, for the reveal panel. */
  message: string;
  fragments: MessageFragment[];
  challenges: Challenge[];
}

/* ------------------------------------------------------------------ */
/* Random helpers                                                      */
/* ------------------------------------------------------------------ */

const randInt = (min: number, max: number) =>
  min + Math.floor(Math.random() * (max - min + 1));

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** n distinct items from arr (n clamped to arr.length). */
const sample = <T>(arr: readonly T[], n: number): T[] =>
  shuffle(arr).slice(0, Math.min(n, arr.length));

let uid = 0;
const nextId = (family: string) => `sig-${family}-${Date.now()}-${uid++}`;

/* ------------------------------------------------------------------ */
/* Difficulty                                                          */
/* ------------------------------------------------------------------ */

export const MAX_DIFFICULTY = 5;

/** Lifetime decode count → difficulty tier 0..5. Ramps every few signals. */
export function difficultyFor(totalDecoded: number): number {
  if (totalDecoded < 2) return 0;
  if (totalDecoded < 5) return 1;
  if (totalDecoded < 9) return 2;
  if (totalDecoded < 14) return 3;
  if (totalDecoded < 20) return 4;
  return MAX_DIFFICULTY;
}

/** Challenges per signal: short runs early, up to 6 for veterans. */
function challengeCountFor(difficulty: number): number {
  return Math.min(6, 3 + Math.ceil(difficulty / 2));
}

/* ------------------------------------------------------------------ */
/* Puzzle family: odd one out                                          */
/* ------------------------------------------------------------------ */

// [crowd, imposter] pairs, grouped by how sneaky the imposter is.
const ODD_PAIRS_EASY: readonly [string, string][] = [
  ['🍎', '🍌'], ['🐟', '🦀'], ['⭐', '🌙'], ['🌲', '🌵'],
  ['🔑', '🧭'], ['🐸', '🦆'], ['⛵', '🚂'], ['🎈', '⚽'],
];
const ODD_PAIRS_MEDIUM: readonly [string, string][] = [
  ['🐱', '🐯'], ['🐶', '🦊'], ['🍩', '🍪'], ['🦋', '🐛'],
  ['🌕', '🌗'], ['🐢', '🐊'], ['🦉', '🦅'], ['🚤', '⛵'],
];
const ODD_PAIRS_HARD: readonly [string, string][] = [
  ['★', '☆'], ['◆', '◇'], ['●', '◉'], ['▲', '△'],
  ['■', '□'], ['✦', '✧'], ['♠', '♤'], ['⬢', '⬡'],
];

function genOddOneOut(d: number): Challenge {
  const pool = d <= 1 ? ODD_PAIRS_EASY : d <= 3 ? ODD_PAIRS_MEDIUM : ODD_PAIRS_HARD;
  const [crowd, imposter] = pick(pool);
  const [rows, cols] = d <= 1 ? [2, 3] : d <= 3 ? [3, 3] : [4, 4];
  const total = rows * cols;
  const oddIndex = randInt(0, total - 1);
  const cells = Array.from({ length: total }, (_, i) =>
    i === oddIndex ? imposter : crowd
  );
  return {
    id: nextId('odd'),
    kind: 'grid',
    prompt:
      d <= 3
        ? 'One tile slipped into this signal that does not belong. Tap the odd one out.'
        : 'A corrupted glyph is hiding in this block. Tap the one that does not match the rest.',
    rows,
    cols,
    cells,
    correct: [oddIndex],
  };
}

/* ------------------------------------------------------------------ */
/* Puzzle family: find all matching                                    */
/* ------------------------------------------------------------------ */

const FIND_SETS: readonly { name: string; target: string; decoys: string[]; sneaky: string[] }[] = [
  { name: 'star', target: '★', decoys: ['●', '◆', '▲', '■', '⬢'], sneaky: ['☆', '✦'] },
  { name: 'key', target: '🔑', decoys: ['🧭', '🔦', '📖', '🪙', '🎒'], sneaky: ['🗝️'] },
  { name: 'fish', target: '🐟', decoys: ['🐚', '🌊', '🦀', '⚓', '🪸'], sneaky: ['🐠'] },
  { name: 'moon', target: '🌙', decoys: ['⭐', '☁️', '🪐', '☀️', '⚡'], sneaky: ['🌛'] },
  { name: 'diamond', target: '◆', decoys: ['●', '▲', '■', '✚', '⬢'], sneaky: ['◇', '◈'] },
  { name: 'butterfly', target: '🦋', decoys: ['🐝', '🐞', '🌸', '🍃', '🐌'], sneaky: ['🐛'] },
];

function genFindAll(d: number): Challenge {
  const set = pick(FIND_SETS);
  const [rows, cols] = d <= 1 ? [3, 3] : d <= 3 ? [3, 4] : [4, 4];
  const total = rows * cols;
  const targetCount = Math.min(randInt(2 + Math.ceil(d / 2), 3 + d), total - 2);
  // Harder tiers mix near-lookalikes into the decoys.
  const decoyPool = d >= 3 ? [...set.decoys, ...set.sneaky] : set.decoys;
  const indices = shuffle(Array.from({ length: total }, (_, i) => i));
  const targetIdx = new Set(indices.slice(0, targetCount));
  const cells = Array.from({ length: total }, (_, i) =>
    targetIdx.has(i) ? set.target : pick(decoyPool)
  );
  return {
    id: nextId('all'),
    kind: 'grid',
    prompt: `Clean the channel: select every tile with a ${set.name} (${set.target}), then verify.`,
    rows,
    cols,
    multi: true,
    cells,
    correct: [...targetIdx].sort((a, b) => a - b),
  };
}

/* ------------------------------------------------------------------ */
/* Puzzle family: tap in order                                         */
/* ------------------------------------------------------------------ */

const ALPHABET = 'ABCDEFGHIJ'.split('');

function orderedGridOf(labels: string[], prompt: string): Challenge {
  const n = labels.length;
  const [rows, cols] = n <= 4 ? [1, n] : [2, Math.ceil(n / 2)];
  const total = rows * cols;
  // Pad odd counts with blanks that are never part of the answer.
  const padded = [...labels];
  while (padded.length < total) padded.push('');
  const cells = shuffle(padded);
  const correct = labels.map((label) => cells.indexOf(label));
  return {
    id: nextId('ord'),
    kind: 'grid',
    prompt,
    rows,
    cols,
    ordered: true,
    cells,
    correct,
  };
}

function genTapOrder(d: number): Challenge {
  const n = Math.min(3 + d, 8);
  if (d >= 4 && Math.random() < 0.5) {
    // Descending numbers — a veteran twist.
    const labels = Array.from({ length: n }, (_, i) => String(n - i));
    return orderedGridOf(
      labels,
      `Reverse the cipher: tap the numbers from HIGHEST to lowest — ${n} down to 1.`
    );
  }
  if (d >= 2 && Math.random() < 0.5) {
    const labels = ALPHABET.slice(0, n);
    return orderedGridOf(
      labels,
      `Realign the signal: tap the letters in alphabet order — A first.`
    );
  }
  const labels = Array.from({ length: n }, (_, i) => String(i + 1));
  return orderedGridOf(
    labels,
    `Realign the cipher: tap the numbers in order — 1 first.`
  );
}

/* ------------------------------------------------------------------ */
/* Puzzle family: symbol memory sequence                               */
/* ------------------------------------------------------------------ */

const SEQ_SYMBOLS = ['★', '●', '▲', '■', '◆', '⬢', '✚', '☾'];

function genSymbolSequence(d: number): Challenge {
  const len = Math.min(3 + Math.ceil(d / 2), 6);
  const symbols = sample(SEQ_SYMBOLS, Math.min(len + 2, SEQ_SYMBOLS.length));
  const order = symbols.slice(0, len);
  const challenge = orderedGridOf(
    shuffle(symbols),
    `The key sequence is  ${order.join('  ')}  — tap the tiles in exactly that order.`
  );
  // orderedGridOf built the answer from its own label list; rebuild for ours.
  const grid = challenge as Extract<Challenge, { kind: 'grid' }>;
  grid.correct = order.map((s) => grid.cells!.indexOf(s));
  return grid;
}

/* ------------------------------------------------------------------ */
/* Puzzle family: what comes next                                      */
/* ------------------------------------------------------------------ */

function genPatternNext(d: number): Challenge {
  const symbols = sample(SEQ_SYMBOLS, 4);
  const [a, b, c] = symbols;
  const patterns: { seq: string[]; next: string }[] =
    d <= 1
      ? [
          { seq: [a, b, a, b, a], next: b },
          { seq: [a, a, b, a, a], next: b },
        ]
      : d <= 3
        ? [
            { seq: [a, b, c, a, b], next: c },
            { seq: [a, a, b, b, a, a], next: b },
            { seq: [a, b, b, a, b], next: b },
          ]
        : [
            { seq: [a, b, a, c, a, b, a], next: c },
            { seq: [a, b, c, c, b, a, a, b], next: c },
            { seq: [a, b, b, c, c, c, a], next: b },
          ];
  const { seq, next } = pick(patterns);
  const options = shuffle(symbols).map((s, i) => ({ id: `opt-${i}`, label: s }));
  return {
    id: nextId('pat'),
    kind: 'choices',
    prompt: `The signal repeats:  ${seq.join('  ')}  …  — which symbol comes next?`,
    options,
    correct: options.filter((o) => o.label === next).map((o) => o.id),
  };
}

/* ------------------------------------------------------------------ */
/* Puzzle family: count the symbols                                    */
/* ------------------------------------------------------------------ */

const COUNT_SETS: readonly { name: string; target: string; decoys: string[]; sneaky: string[] }[] = [
  { name: 'fish', target: '🐟', decoys: ['🌊', '🐚', '⚓'], sneaky: ['🐠'] },
  { name: 'stars', target: '⭐', decoys: ['🌙', '☁️', '🪐'], sneaky: ['🌟'] },
  { name: 'keys', target: '🔑', decoys: ['🧭', '🔦', '🪙'], sneaky: ['🗝️'] },
  { name: 'frogs', target: '🐸', decoys: ['🍃', '🪷', '🐢'], sneaky: [] },
  { name: 'acorns', target: '🌰', decoys: ['🍂', '🍄', '🌿'], sneaky: [] },
];

function genCount(d: number): Challenge {
  const set = pick(COUNT_SETS);
  const count = randInt(3 + Math.floor(d / 2), 4 + d);
  const noise = randInt(3 + d, 5 + d);
  const decoyPool = d >= 3 && set.sneaky.length ? [...set.decoys, ...set.sneaky] : set.decoys;
  const scatter = shuffle([
    ...Array.from({ length: count }, () => set.target),
    ...Array.from({ length: noise }, () => pick(decoyPool)),
  ]).join(' ');
  // Four consecutive number options bracketing the answer.
  const low = Math.max(1, count - randInt(1, 2));
  const options = Array.from({ length: 4 }, (_, i) => low + i);
  return {
    id: nextId('cnt'),
    kind: 'choices',
    prompt: `How many ${set.name} (${set.target}) are hiding in this burst?\n${scatter}`,
    options: options.map((n) => ({ id: `n-${n}`, label: String(n) })),
    correct: [`n-${count}`],
  };
}

/* ------------------------------------------------------------------ */
/* Puzzle family: find the exact glyph                                 */
/* ------------------------------------------------------------------ */

const GLYPH_FAMILIES: readonly string[][] = [
  ['◈', '◇', '◆', '◊', '⟐'],
  ['Ω', 'Θ', 'Φ', 'Ψ', 'Δ'],
  ['◐', '◑', '◒', '◓', '●'],
  ['♜', '♞', '♝', '♛', '♟'],
  ['⌘', '⌥', '⌦', '⌫', '⎋'],
  ['☰', '☱', '☲', '☴', '☵'],
];

function genGlyphMatch(d: number): Challenge {
  const family = pick(GLYPH_FAMILIES);
  const key = pick(family);
  const decoys = family.filter((g) => g !== key);
  const [rows, cols] = d <= 2 ? [2, 3] : [3, 3];
  const total = rows * cols;
  const keyIndex = randInt(0, total - 1);
  const cells = Array.from({ length: total }, (_, i) =>
    i === keyIndex ? key : pick(decoys)
  );
  return {
    id: nextId('gly'),
    kind: 'grid',
    prompt: `The signal key is  ${key}  — tap its EXACT match. The others are close, but wrong.`,
    rows,
    cols,
    cells,
    correct: [keyIndex],
  };
}

/* ------------------------------------------------------------------ */
/* Puzzle family: letter cipher (higher tiers)                         */
/* ------------------------------------------------------------------ */

const CIPHER_WORDS = ['CAT', 'MAP', 'KEY', 'OWL', 'FOX', 'SUN', 'BOAT', 'LAKE', 'STAR'];

const shiftLetter = (ch: string, by: number) =>
  String.fromCharCode(((ch.charCodeAt(0) - 65 + by + 26) % 26) + 65);

const shiftWord = (word: string, by: number) =>
  word.split('').map((c) => shiftLetter(c, by)).join('');

function genCipher(d: number): Challenge {
  if (d >= 4) {
    // Decode a whole word by stepping each letter back by one.
    const word = pick(CIPHER_WORDS);
    const encoded = shiftWord(word, 1);
    const decoyWords = sample(CIPHER_WORDS.filter((w) => w !== word), 3);
    return {
      id: nextId('cip'),
      kind: 'choices',
      prompt: `Guardian cipher: every letter stepped FORWARD by one when this was encrypted (A→B). Decode "${encoded}" by stepping each letter back.`,
      options: shuffle([word, ...decoyWords]).map((w) => ({ id: `w-${w}`, label: w })),
      correct: [`w-${word}`],
    };
  }
  // Single letter, forward shift of 1 (or 2 at tier 3).
  const by = d >= 3 ? 2 : 1;
  const idx = randInt(0, 25 - by);
  const letter = String.fromCharCode(65 + idx);
  const answer = shiftLetter(letter, by);
  const decoys = sample(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((c) => c !== answer && c !== letter),
    3
  );
  return {
    id: nextId('cip'),
    kind: 'choices',
    prompt: `Guardian cipher: every letter steps forward by ${by === 1 ? 'one (A→B, B→C)' : 'TWO (A→C, B→D)'}. Which letter does ${letter} become?`,
    options: shuffle([answer, ...decoys]).map((c) => ({ id: `l-${c}`, label: c })),
    correct: [`l-${answer}`],
  };
}

/* ------------------------------------------------------------------ */
/* Signal messages                                                     */
/* ------------------------------------------------------------------ */

const CODENAMES = [
  'BLUE HERON', 'RED FOX', 'NIGHT OWL', 'FIREFLY', 'RIVER OTTER',
  'GRAY WOLF', 'SNAPPING TURTLE', 'SILVER MOTH', 'KINGFISHER', 'BOBCAT',
];
const THINGS = [
  'THE BRASS KEY', 'A GLOWING MAP FRAGMENT', 'THE THIRD COIN', 'AN OLD JOURNAL PAGE',
  'A SEALED RELIC CRATE', 'THE MISSING COMPASS', 'A CARVED STONE MARKER',
  'AN UNOPENED GUARDIAN LETTER', 'THE LANTERN SIGNAL', 'A LOCKED ARCHIVE BOX',
];
const PLACES = [
  'THE OLD DOCK', 'ISLAND SEVEN', 'THE LIGHTHOUSE STAIRS', 'THE ROCK GARDEN',
  'THE BOAT HOUSE', 'THE TALL PINES', 'THE SUNKEN BRIDGE', 'THE NORTH COVE',
  'THE RANGER STATION', 'THE HOLLOW OAK',
];
const SIGNOFFS = [
  'STAY CURIOUS.', 'TELL NO ONE ELSE.', 'THE NETWORK IS WATCHING.',
  'MORE SOON.', 'KEEP YOUR NOTEBOOK CLOSE.', 'GOOD WORK, GUARDIAN.',
];

type Pools = { codename: string; thing: string; place: string; signoff: string };

const TEMPLATES: readonly ((p: Pools) => string)[] = [
  (p) => `AGENT ${p.codename} SPOTTED ${p.thing} NEAR ${p.place}. ${p.signoff}`,
  (p) => `ARCHIVE NOTE: ${p.thing} IS SAFE AT ${p.place}. ${p.signoff}`,
  (p) => `${p.codename} TO BASE: ${p.thing} IS STILL HIDDEN AT ${p.place}.`,
  (p) => `ALERT FROM ${p.codename}: MOVE ${p.thing} BEFORE THE NEXT FULL MOON. ${p.signoff}`,
  (p) => `FIELD REPORT: STRANGE LIGHTS OVER ${p.place}. ${p.codename} IS INVESTIGATING. ${p.signoff}`,
  (p) => `RELAY TO ALL GUARDIANS: ${p.thing} HAS BEEN RECOVERED FROM ${p.place}. ${p.signoff}`,
  (p) => `${p.codename} REQUESTS BACKUP AT ${p.place}. BRING ${p.thing}. ${p.signoff}`,
  (p) => `OLD RECORD FOUND: ELIAS WARD ONCE HID ${p.thing} NEAR ${p.place}. ${p.signoff}`,
  (p) => `WEATHER WATCH: FOG ROLLING OVER ${p.place}. ${p.codename} HOLDS POSITION. ${p.signoff}`,
  (p) => `SUPPLY DROP CONFIRMED AT ${p.place}. CONTENTS: ${p.thing}. ${p.signoff}`,
];

function generateMessage(): string {
  const pools: Pools = {
    codename: pick(CODENAMES),
    thing: pick(THINGS),
    place: pick(PLACES),
    signoff: pick(SIGNOFFS),
  };
  return pick(TEMPLATES)(pools);
}

/** Split a message into n word-balanced fragments with matching glitch ciphers. */
export function fragmentMessage(message: string, n: number): MessageFragment[] {
  const words = message.split(' ');
  const count = Math.max(1, Math.min(n, words.length));
  const base = Math.floor(words.length / count);
  let extra = words.length % count;
  const fragments: MessageFragment[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const take = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    const chunk = words.slice(cursor, cursor + take).join(' ');
    cursor += take;
    const clear = i < count - 1 ? `${chunk} ` : chunk;
    fragments.push({ clear, cipher: randomGlitchString(clear.length) });
  }
  return fragments;
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

type Generator = (d: number) => Challenge;

/** Families available at a given difficulty (ciphers unlock at tier 2). */
function familiesFor(d: number): Generator[] {
  const base: Generator[] = [
    genOddOneOut,
    genFindAll,
    genTapOrder,
    genPatternNext,
    genCount,
    genGlyphMatch,
    genSymbolSequence,
  ];
  if (d >= 2) base.push(genCipher);
  return base;
}

/**
 * A random, no-repeat run of challenges at a given difficulty tier — the same
 * puzzle families the Signal Decoder draws from, for callers that bring their
 * own message (e.g. the trail-mission ClueDecrypt). The last two challenges
 * run one tier hotter, mirroring generateSignal's ramp.
 */
export function generateChallenges(count: number, tier: number): Challenge[] {
  const clamped = Math.max(0, Math.min(MAX_DIFFICULTY, tier));
  const order = shuffle(familiesFor(clamped));
  return Array.from({ length: count }, (_, i) => {
    const d = Math.min(MAX_DIFFICULTY, i >= count - 2 ? clamped + 1 : clamped);
    const gen = order[i % order.length];
    return gen(d);
  });
}

/** Build a fresh signal for a Guardian with `totalDecoded` signals behind them. */
export function generateSignal(totalDecoded: number): Signal {
  const tier = difficultyFor(totalDecoded);
  const count = challengeCountFor(tier);
  const message = generateMessage();
  const fragments = fragmentMessage(message, count);

  // No family repeats within a run; the final stretch runs one tier hotter.
  const order = shuffle(familiesFor(tier));
  const challenges = Array.from({ length: count }, (_, i) => {
    const d = Math.min(MAX_DIFFICULTY, i >= count - 2 ? tier + 1 : tier);
    const gen = order[i % order.length];
    return gen(d);
  });

  return {
    id: nextId('signal'),
    message,
    fragments,
    challenges,
  };
}
