import { useCallback, useEffect, useState } from 'react';
import {
  fetchMissionFamilies,
  fetchMissionState,
  postMissionContribute,
  type MissionFamily,
  type MissionStateResponse,
} from '../api/mission';
import { getActiveMission, type Mission } from './missions';
import type { MissionContext } from '../athena/useChat';

/**
 * Loads the active mission plus its live progress, and derives the steering
 * context Athena receives. Handles both objectives:
 *  - family_onboarding (Mission 1): per-family contact status.
 *  - convergence (Mission 2): the family's own piece + the "all families" gate.
 * Shared by the Current Mission panel and the chat steering so both read one
 * source of truth.
 */
export interface MissionState {
  mission: Mission | null;
  /** family_onboarding */
  families: MissionFamily[];
  pending: MissionFamily[];
  /** convergence */
  convergence: MissionStateResponse | null;
  /** True once the active mission's objective is met. */
  complete: boolean;
  loading: boolean;
  error: boolean;
  refresh: () => void;
  /** convergence: report this family's piece. No-op for other objectives. */
  contribute: () => Promise<void>;
  /** Steering sent to Athena with each chat turn, or undefined when none applies. */
  chatContext: MissionContext | undefined;
}

export function useMission(adventureKey: string | null | undefined): MissionState {
  const mission = getActiveMission(adventureKey);
  const objective = mission?.objective;

  const [families, setFamilies] = useState<MissionFamily[]>([]);
  const [convergence, setConvergence] = useState<MissionStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const done = () => {
      if (!cancelled) setLoading(false);
    };
    if (objective === 'family_onboarding') {
      fetchMissionFamilies()
        .then((r) => {
          if (!cancelled) setFamilies(Array.isArray(r.families) ? r.families : []);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        })
        .finally(done);
    } else if (objective === 'convergence' && mission) {
      fetchMissionState(mission.id)
        .then((r) => {
          if (!cancelled) setConvergence(r);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        })
        .finally(done);
    } else {
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [objective, mission]);

  useEffect(() => load(), [load]);

  const contribute = useCallback(async () => {
    if (!mission || objective !== 'convergence') return;
    try {
      const r = await postMissionContribute(mission.id);
      setConvergence(r);
    } catch {
      setError(true);
    }
  }, [mission, objective]);

  // --- Derived progress + Athena steering, per objective ---
  const pending = families.filter((f) => !f.onboarded);
  let complete = false;
  let chatContext: MissionContext | undefined;

  if (mission && objective === 'family_onboarding') {
    complete = families.length > 0 && pending.length === 0;
    chatContext =
      !complete && families.length > 0
        ? {
            id: mission.id,
            title: mission.title,
            directive: mission.athenaDirective,
            pendingFamilies: pending.map((f) =>
              f.region ? `${f.name} (${f.region})` : f.name
            ),
          }
        : undefined;
  } else if (mission && objective === 'convergence') {
    complete = convergence?.progress.complete ?? false;
    if (convergence) {
      const pendingNames = convergence.progress.families
        .filter((f) => !f.reported)
        .map((f) => f.name);
      chatContext = {
        id: mission.id,
        title: mission.title,
        directive: mission.athenaDirective,
        fragment: convergence.family.fragment ?? undefined,
        reporting: {
          reported: convergence.progress.reported,
          total: convergence.progress.total,
          pending: pendingNames,
        },
        complete,
        destination:
          complete && convergence.convergence
            ? `${convergence.convergence.lat}, ${convergence.convergence.lng}`
            : undefined,
      };
    } else {
      // State not loaded yet — still let Athena know the mission is on.
      chatContext = { id: mission.id, title: mission.title, directive: mission.athenaDirective };
    }
  }

  return {
    mission,
    families,
    pending,
    convergence,
    complete,
    loading,
    error,
    refresh: load,
    contribute,
    chatContext,
  };
}
