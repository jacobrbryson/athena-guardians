/**
 * Split a reply into the parts her voice is generated in, so she can start
 * talking once the first sentence is voiced instead of the whole reply.
 *
 * Voicing is roughly proportional to length, and every part is fetched at
 * once, so the first part is kept short — its opening clause when the first
 * sentence runs long — and the next only a little longer: each is ready
 * before the one in front of it finishes playing. Later parts are larger,
 * because every boundary is a place her phrasing restarts. Only a reply of a
 * few words stays whole.
 *
 * Mirrored in companion/src/athena/speechChunks.ts and, for hands-free, in
 * native-runtime's SpeechChunks.java. Keep the three in step.
 */

/** A reply this short is voiced in one go. */
const WHOLE_MAX = 60;
/** "Sure." alone is too short a part; it joins the next sentence. */
const FIRST_MIN = 30;
/** A first part longer than this is cut to its opening clause. */
const FIRST_MAX = 70;
/** Neither side of that cut is shorter than this, so no part is a word or two. */
const CLAUSE_MIN = 18;
const SECOND_MAX = 220;
const LATER_MAX = 400;
/** The server's limit on one /speech request (MAX_SPEECH_TEXT_LENGTH) is 800. */
const HARD_MAX = 780;

// A period after these is not the end of a sentence.
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'mt', 'jr', 'sr', 'vs', 'etc', 'e.g', 'i.e', 'a.m', 'p.m', 'approx',
]);

/** Sentences, each keeping its own punctuation and trailing space. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  const end = /[.!?…]+["'”’)\]]*\s+|\n+/g;
  let from = 0;
  for (let match = end.exec(text); match; match = end.exec(text)) {
    const cut = match.index + match[0].length;
    if (match[0][0] === '.') {
      const word = /([A-Za-z.]+)$/.exec(text.slice(from, match.index))?.[1]?.toLowerCase() ?? '';
      // "Dr. Smith", "e.g. this", "J. R. R. Tolkien": not an ending.
      if (ABBREVIATIONS.has(word) || /^[a-z]$/i.test(word)) continue;
    }
    out.push(text.slice(from, cut));
    from = cut;
  }
  if (from < text.length) out.push(text.slice(from));
  return out.filter((sentence) => sentence.trim());
}

// Where a sentence can pause: punctuation first, then before a conjunction.
const CLAUSE_BREAK = /[,;:]\s+|\s[—–-]\s/g;
const CONJUNCTION = /\s(?=(?:and|but|so|because|which|while|or|then)\s)/gi;

/**
 * Where to cut a long first part so her voice starts on its opening clause:
 * the earliest pause that leaves both sides at least CLAUSE_MIN, within
 * FIRST_MAX. -1 when there is none, and the part is voiced as it is.
 */
export function clauseCut(part: string): number {
  for (const pause of [CLAUSE_BREAK, CONJUNCTION]) {
    pause.lastIndex = 0;
    for (let match = pause.exec(part); match; match = pause.exec(part)) {
      const cut = match.index + match[0].length;
      if (cut > FIRST_MAX) break;
      if (cut >= CLAUSE_MIN && part.length - cut >= CLAUSE_MIN) return cut;
    }
  }
  return -1;
}

/** A run-on longer than one request allows, cut at the last space that fits. */
function fit(sentence: string): string[] {
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > HARD_MAX) {
    const space = rest.lastIndexOf(' ', HARD_MAX);
    const cut = space > HARD_MAX / 2 ? space + 1 : HARD_MAX;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  out.push(rest);
  return out;
}

export function speechChunks(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= WHOLE_MAX) return [clean];

  const parts: string[] = [];
  let current = '';
  const limit = () => (parts.length === 0 ? FIRST_MIN : parts.length === 1 ? SECOND_MAX : LATER_MAX);
  for (const sentence of sentences(clean).flatMap(fit)) {
    if (parts.length === 0) {
      // The first part closes as soon as it is long enough.
      if (current && (current + sentence).length > HARD_MAX) {
        // Too much for one request: what came before is the first part.
        parts.push(current);
        current = sentence;
        continue;
      }
      current += sentence;
      if (current.trim().length >= FIRST_MIN) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    if (current && (current + sentence).trim().length > limit()) {
      parts.push(current);
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) parts.push(current);
  const out = parts.map((part) => part.trim()).filter(Boolean);
  const cut = out[0].length > FIRST_MAX ? clauseCut(out[0]) : -1;
  if (cut > 0) out.splice(0, 1, out[0].slice(0, cut).trim(), out[0].slice(cut).trim());
  return out;
}
