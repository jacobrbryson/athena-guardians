import { useCallback, useEffect, useState } from 'react';
import {
  fetchCurrentMission,
  type CurrentMissionDescriptor,
  type MissionFamily,
  type MissionPhase,
} from '../api/mission';
import type { MissionContext } from '../athena/useChat';

export interface MissionState {
  mission: CurrentMissionDescriptor | null;
  phase: MissionPhase | null;
  families: MissionFamily[];
  pending: MissionFamily[];
  complete: boolean;
  loading: boolean;
  error: boolean;
  refresh: () => void;
  chatContext: MissionContext | undefined;
}

export function useMission(adventureKey: string | null | undefined): MissionState {
  const [mission, setMission] = useState<CurrentMissionDescriptor | null>(null);
  const [phase, setPhase] = useState<MissionPhase | null>(null);
  const [families, setFamilies] = useState<MissionFamily[]>([]);
  const [loading, setLoading] = useState(Boolean(adventureKey));
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    if (!adventureKey) {
      setMission(null);
      setPhase(null);
      setFamilies([]);
      setLoading(false);
      return () => undefined;
    }

    setLoading(true);
    setError(false);
    fetchCurrentMission()
      .then((response) => {
        if (cancelled) return;
        setMission(response.mission);
        setPhase(response.phase ?? null);
        setFamilies(Array.isArray(response.families) ? response.families : []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [adventureKey]);

  useEffect(() => load(), [load]);

  const pending = families.filter((family) => !family.onboarded);
  const chatContext = mission
    ? {
        id: mission.id,
        title: mission.title,
        directive: mission.summary,
        phase: phase ?? undefined,
        pendingFamilies: pending.map((family) =>
          family.region ? `${family.name} (${family.region})` : family.name
        ),
      }
    : undefined;

  return {
    mission,
    phase,
    families,
    pending,
    complete: false,
    loading,
    error,
    refresh: load,
    chatContext,
  };
}
