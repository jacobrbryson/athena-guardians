/**
 * Per-Guardian decryption progress, persisted in localStorage so a kid can
 * close the console and resume where they left off. This tracks how many of the
 * bot-checks they've solved locally; the *family's* completion is what gets
 * recorded on the server (see useMission.contribute), so this is purely a
 * resume convenience and never the source of truth for the mission gate.
 */
import { CHALLENGE_COUNT } from './challenges';

const keyFor = (guardianId: string) => `guardian_decryption:${guardianId}`;

/** How many bot-checks this Guardian has solved (clamped to [0, total]). */
export function getSolvedCount(guardianId: string): number {
  try {
    const raw = localStorage.getItem(keyFor(guardianId));
    const n = raw == null ? 0 : parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, CHALLENGE_COUNT);
  } catch {
    return 0;
  }
}

/** Persist the solved count (clamped). Safe to call from render-adjacent code. */
export function setSolvedCount(guardianId: string, count: number): void {
  try {
    const clamped = Math.max(0, Math.min(count, CHALLENGE_COUNT));
    localStorage.setItem(keyFor(guardianId), String(clamped));
  } catch {
    /* localStorage unavailable (private mode) — progress just won't persist. */
  }
}

/** True once every bot-check has been solved locally. */
export function isDecryptionComplete(guardianId: string): boolean {
  return getSolvedCount(guardianId) >= CHALLENGE_COUNT;
}
