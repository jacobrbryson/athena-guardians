import { useEffect, useRef, useState } from 'react';
import type { MissionFamily, MissionPhase } from '../api/mission';
import type { MissionState } from '../missions/useMission';

export function CurrentMission({ state }: { state: MissionState }) {
  const { mission, phase, families, pending, loading, error } = state;
  const [open, setOpen] = useState(false);
  const previousPhase = useRef<MissionPhase | null>(null);

  useEffect(() => {
    if (phase && phase !== 'check_in' && previousPhase.current !== phase) setOpen(true);
    previousPhase.current = phase;
  }, [phase]);

  if (!mission) return null;

  const checkedIn = families.length - pending.length;
  const compactStatus =
    loading && !phase
      ? '...'
      : error
        ? '!'
        : phase === 'check_in'
          ? `${checkedIn}/${families.length}`
          : mission.status;

  return (
    <section
      className={`absolute inset-x-0 top-0 z-30 border-b text-emerald-50 transition-colors duration-300 ${
        open
          ? 'bottom-0 flex flex-col overflow-hidden border-emerald-200/20 bg-gradient-to-b from-black/75 to-black/50 shadow-2xl shadow-black/60 backdrop-blur-xl'
          : 'border-emerald-500/15 bg-black/90 shadow-lg shadow-black/50 backdrop-blur-sm'
      }`}
    >
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[11px] font-mono uppercase tracking-[0.2em] hover:bg-emerald-500/5"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className={phase === 'decrypting' ? 'animate-pulse text-cyan-300' : 'text-amber-300'}>
            ◆
          </span>
          <span className="shrink-0 opacity-60">Mission {mission.number}</span>
          <span className="truncate font-semibold normal-case tracking-normal opacity-90">
            {mission.title}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={`tabular-nums ${
              phase === 'decrypting' ? 'animate-pulse text-cyan-200' : 'opacity-60'
            }`}
          >
            {compactStatus}
          </span>
          <span aria-hidden className="opacity-50">{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div className="min-h-0 flex-1 animate-missionSlide overflow-y-auto border-t border-white/5 px-4 pb-5 pt-3 text-sm">
          {error && <p className="py-2 text-xs text-amber-300">Mission records are out of reach right now.</p>}
          {!error && loading && !phase && (
            <p className="py-2 text-xs font-mono opacity-40">Synchronizing mission records...</p>
          )}
          {!error && phase === 'check_in' && (
            <CheckInMission families={families} summary={mission.summary} />
          )}
          {!error && phase === 'active' && <ActiveFieldMission summary={mission.summary} />}
          {!error && phase === 'decrypting' && <DecryptingMission summary={mission.summary} />}
        </div>
      )}
    </section>
  );
}

function CheckInMission({ families, summary }: { families: MissionFamily[]; summary: string }) {
  return (
    <div>
      <p className="mb-3 text-xs leading-relaxed opacity-60">{summary}</p>
      <ul className="space-y-2">
        {families.map((family) => (
          <li key={family.key} className="flex items-start gap-2">
            <span
              aria-hidden
              className={`mt-0.5 w-4 shrink-0 text-center ${
                family.onboarded ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              {family.onboarded ? '✓' : '○'}
            </span>
            <span className="min-w-0">
              <span
                className={
                  family.onboarded
                    ? 'line-through opacity-50'
                    : 'font-medium text-emerald-50'
                }
              >
                {family.name}
                {family.region && <span className="font-normal opacity-60"> · {family.region}</span>}
              </span>
              {!family.onboarded && (
                <span className="block text-xs leading-snug text-amber-200/80">
                  Reach out and invite them to check in with Athena.
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActiveFieldMission({ summary }: { summary: string }) {
  return (
    <div className="mx-auto max-w-sm py-4 text-center">
      <div className="relative mx-auto h-24 w-24">
        <span className="absolute inset-0 rounded-full border border-amber-300/20 motion-safe:animate-ping" />
        <span className="absolute inset-3 rounded-full border border-amber-300/30 motion-safe:animate-pulse" />
        <span className="absolute inset-7 grid place-items-center rounded-full border border-amber-200/70 bg-amber-300/10 text-xl text-amber-200 shadow-[0_0_32px_rgba(253,230,138,0.3)]">
          ◈
        </span>
      </div>
      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.35em] text-amber-200/70">
        Field mission active
      </p>
      <p className="mt-3 text-sm leading-relaxed text-emerald-50/80">{summary}</p>
      <p className="mt-4 border-t border-emerald-300/10 pt-3 text-xs text-emerald-200/55">
        Athena is monitoring this channel for discoveries.
      </p>
    </div>
  );
}

function DecryptingMission({ summary }: { summary: string }) {
  return (
    <div className="mx-auto max-w-sm py-3 text-center" aria-live="polite">
      <div className="relative mx-auto h-36 w-36 overflow-hidden rounded-full border border-cyan-300/15 bg-cyan-300/[0.03] shadow-[0_0_60px_rgba(103,232,249,0.12)]">
        <span className="absolute inset-3 rounded-full border border-dashed border-cyan-300/35 motion-safe:animate-[spin_9s_linear_infinite]" />
        <span className="absolute inset-7 rounded-full border border-cyan-200/20 motion-safe:animate-[spin_5s_linear_infinite_reverse]" />
        <span className="absolute left-1/2 top-1/2 h-px w-1/2 origin-left bg-gradient-to-r from-cyan-200/80 to-transparent motion-safe:animate-[spin_2.8s_linear_infinite]" />
        <span className="absolute inset-[3.2rem] grid place-items-center rounded-full bg-cyan-200/10 font-mono text-[10px] font-bold tracking-wider text-cyan-100 shadow-[0_0_20px_rgba(103,232,249,0.35)]">
          ATHENA
        </span>
      </div>

      <p className="mt-5 animate-pulse font-mono text-xs uppercase tracking-[0.38em] text-cyan-200">
        Decrypting
      </p>
      <div className="mx-auto mt-3 flex w-44 gap-1" aria-hidden>
        {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
          <span
            key={bar}
            className="h-1 flex-1 rounded-full bg-cyan-300/60 motion-safe:animate-pulse"
            style={{ animationDelay: `${bar * 130}ms` }}
          />
        ))}
      </div>
      <p className="mt-5 text-sm leading-relaxed text-emerald-50/80">{summary}</p>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200/45">
        Background process remains active
      </p>
    </div>
  );
}
