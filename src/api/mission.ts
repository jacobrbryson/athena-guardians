import { api } from './client';

export interface MissionFamily {
  key: string;
  name: string;
  region: string | null;
  onboarded: boolean;
}

export type MissionPhase = 'check_in' | 'active' | 'decrypting';

export interface CurrentMissionDescriptor {
  id: string;
  number: number;
  title: string;
  status: string;
  summary: string;
}

export interface CurrentMissionResponse {
  success: boolean;
  adventure_key: string;
  phase?: MissionPhase;
  mission: CurrentMissionDescriptor | null;
  families?: MissionFamily[];
}

/** Server-authoritative mission and persistent phase for this adventure. */
export function fetchCurrentMission() {
  return api.get<CurrentMissionResponse>('/api/v1/mission/current');
}
