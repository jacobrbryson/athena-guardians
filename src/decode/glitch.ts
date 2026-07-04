/** Glyphs used to scramble text while it's "decoding". */
export const GLITCH_CHARS = '#@$%&*▓▒░01∆µ¬§∞∂≠≈Ωπ¥£¢XYZ?!/\\<>{}[]'.split('');

export function randomGlitchString(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
  }
  return s;
}
