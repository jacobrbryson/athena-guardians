import { api } from './client';

export interface MissionFamily {
  key: string;
  name: string;
  region: string | null;
  onboarded: boolean;
}

export type MissionPhase = 'check_in' | 'active' | 'decrypting' | 'key_hunt';

export interface CurrentMissionDescriptor {
  id: string;
  number: number;
  title: string;
  status: string;
  summary: string;
}

/** One unlocked leg of the Rescue Ratatouille trail. */
export interface TrailClue {
  index: number;
  distance: number;
  bearing: number;
  description: string;
  /** The full sentence the decrypt game de-glitches. */
  text: string;
}

/** A reported key awaiting its decryption challenges. */
export interface TrailPending {
  keyCode: string;
  clueIndex: number;
  clue: TrailClue;
  challenges: number;
}

/** Live Rescue Ratatouille trail-mission state (server-authoritative). */
export interface TrailState {
  keysTotal: number;
  keysUsed: number;
  complete: boolean;
  clues: TrailClue[];
  pending: TrailPending | null;
}

export interface CurrentMissionResponse {
  success: boolean;
  adventure_key: string;
  phase?: MissionPhase;
  mission: CurrentMissionDescriptor | null;
  families?: MissionFamily[];
  trail?: TrailState;
}

export type TrailReportFailure =
  | 'invalid'
  | 'used'
  | 'pending_other'
  | 'complete'
  | 'retry';

export interface TrailReportResponse {
  success: boolean;
  reason?: TrailReportFailure;
  clueIndex?: number;
  clue?: TrailClue;
  challenges?: number;
}

export interface TrailCompleteResponse {
  success: boolean;
  reason?: string;
  clue?: TrailClue;
  trail?: TrailState;
}

/** Server-authoritative mission and persistent phase for this adventure. */
export function fetchCurrentMission() {
  return api.get<CurrentMissionResponse>('/api/v1/mission/current');
}

/** Report a decryption key from a found clue card. */
export function reportTrailKey(key: string) {
  return api.post<TrailReportResponse>('/api/v1/mission/trail/report-key', { key });
}

/** Decryption challenges done — unlock the pending key's clue. */
export function completeTrailKey(key: string) {
  return api.post<TrailCompleteResponse>('/api/v1/mission/trail/complete-key', { key });
}

/** Test-account-only: wipe the caller's own trail progress. */
export function resetTrail() {
  return api.post<{ success: boolean; trail?: TrailState }>(
    '/api/v1/mission/trail/reset',
    {}
  );
}
