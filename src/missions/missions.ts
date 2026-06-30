/**
 * Mission definitions for the Guardian Network.
 *
 * The mission *content* (titles, copy, Athena's steering directive) is authored
 * statically in missions.json. Live progress — which families have made contact
 * — comes from the backend (see api/mission.ts), so this file only models the
 * fixed mission catalog and exposes the currently active mission.
 */
import data from './missions.json';

export type MissionObjective = 'family_onboarding' | 'convergence';
export type MissionStatus = 'active' | 'locked' | 'complete';

export interface Mission {
  id: string;
  order: number;
  status: MissionStatus;
  /** Adventures this mission belongs to. Missions are campaign-specific —
   *  e.g. "Gather the Guardians" (family onboarding) is Lake Norman only;
   *  Rescue Ratatouille has its own missions. */
  adventureKeys: string[];
  title: string;
  summary: string;
  objective: MissionObjective;
  /** Per-target note shown for items still outstanding (e.g. families to reach). */
  incompleteNote: string;
  /** Shown once every target is met. */
  completeMessage: string;
  /** Steering text sent to Athena while this mission is active. */
  athenaDirective: string;
}

const MISSIONS: Mission[] = (data.missions as Mission[])
  .slice()
  .sort((a, b) => a.order - b.order);

export function getMissions(): Mission[] {
  return MISSIONS;
}

/**
 * The mission the Guardian is currently working on for their adventure, or null
 * if that campaign has no active mission. Missions are campaign-specific, so the
 * adventure key selects which catalog entry applies.
 */
export function getActiveMission(adventureKey: string | null | undefined): Mission | null {
  if (!adventureKey) return null;
  return (
    MISSIONS.find(
      (m) => m.status === 'active' && m.adventureKeys.includes(adventureKey)
    ) ?? null
  );
}
