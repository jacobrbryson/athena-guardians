import { api } from './client';

/** One family's onboarding status for the current adventure. */
export interface MissionFamily {
  key: string;
  name: string;
  region: string | null;
  onboarded: boolean;
}

export interface MissionFamiliesResponse {
  success: boolean;
  adventure_key: string;
  families: MissionFamily[];
}

/**
 * Family onboarding status for the signed-in Guardian's adventure. Auth rides on
 * the httpOnly session cookie; the backend derives the adventure from the token.
 */
export function fetchMissionFamilies() {
  return api.get<MissionFamiliesResponse>('/api/v1/mission/families');
}

/* --- Cooperative missions (Mission 2 "Convergence") --------------------- */

/** One family's report status for a cooperative mission. */
export interface ConvergenceFamily {
  key: string;
  name: string;
  /** This family's map corner — revealed to everyone once THEY report; null until then. */
  corner: string | null;
  reported: boolean;
}

export interface MissionStateResponse {
  success: boolean;
  mission: string;
  adventure_key: string;
  /** The signed-in Guardian's own family + the piece they hold. */
  family: {
    key: string | null;
    fragment: string | null;
    /** The map corner this family earns by decrypting; null if not a participant. */
    corner: string | null;
    is_participant: boolean;
    reported: boolean;
  };
  progress: {
    families: ConvergenceFamily[];
    reported: number;
    total: number;
    complete: boolean;
  };
  /** Kept for potential later use; players now read the assembled map, not coordinates. */
  convergence: { lat: number; lng: number } | null;
}

/** Current cooperative-mission state for the signed-in Guardian. */
export function fetchMissionState(mission: string) {
  return api.get<MissionStateResponse>(
    `/api/v1/mission/state?mission=${encodeURIComponent(mission)}`
  );
}

/** Report the signed-in Guardian's family piece. Returns the updated state. */
export function postMissionContribute(mission: string) {
  return api.post<MissionStateResponse>('/api/v1/mission/contribute', { mission });
}
