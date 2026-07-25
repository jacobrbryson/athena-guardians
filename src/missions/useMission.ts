import { useCallback, useEffect, useState } from 'react';
import {
  fetchCurrentMission,
  type CurrentMissionDescriptor,
  type MissionFamily,
  type MissionPhase,
  type IndexState,
  type IndexClueState,
  type TrailState,
} from '../api/mission';
import type { MissionContext } from '../athena/useChat';

export interface MissionState {
  mission: CurrentMissionDescriptor | null;
  phase: MissionPhase | null;
  families: MissionFamily[];
  pending: MissionFamily[];
  /** Rescue Ratatouille trail-mission state (null for other adventures). */
  trail: TrailState | null;
  index: IndexState | null;
  indexClue: IndexClueState | null;
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
  const [trail, setTrail] = useState<TrailState | null>(null);
  const [index, setIndex] = useState<IndexState | null>(null);
  const [indexClue, setIndexClue] = useState<IndexClueState | null>(null);
  const [loading, setLoading] = useState(Boolean(adventureKey));
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    if (!adventureKey) {
      setMission(null);
      setPhase(null);
      setFamilies([]);
      setTrail(null);
      setIndex(null);
      setIndexClue(null);
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
        setTrail(response.trail ?? null);
        setIndex(response.index ?? null);
        setIndexClue(response.indexClue ?? null);
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

  // Staleness safety net for shared missions: the WebSocket 'trailUpdate'
  // ping is the fast path for cross-device sync, but devices stuck on the
  // HTTP-polling fallback (or that missed a broadcast) still converge — the
  // panel re-fetches whenever the tab becomes visible again and, during the
  // cooperative key hunt, on a slow background cadence.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  useEffect(() => {
    if (phase !== 'key_hunt' && phase !== 'active') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [phase, load]);

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
    trail,
    index,
    indexClue,
    complete: trail?.complete ?? index?.complete ?? false,
    loading,
    error,
    refresh: load,
    chatContext,
  };
}
