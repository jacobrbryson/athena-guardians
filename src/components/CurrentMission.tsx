import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  reportTrailKey,
  type MissionFamily,
  type MissionPhase,
  type TrailPending,
  type TrailState,
} from '../api/mission';
import type { MissionState } from '../missions/useMission';
import { ClueDecrypt } from '../decode/ClueDecrypt';
import { IndexClueDecrypt } from '../decode/IndexClueDecrypt';

export function CurrentMission({
  state,
  autoOpen = true,
}: {
  state: MissionState;
  /** Suppress the once-per-phase auto-expand (e.g. during first contact). */
  autoOpen?: boolean;
}) {
  const { mission, phase, families, pending, trail, index, indexClue, loading, error } = state;
  const [open, setOpen] = useState(false);
  const previousPhase = useRef<MissionPhase | null>(null);

  useEffect(() => {
    if (!autoOpen) return;
    if (mission && phase && phase !== 'check_in' && previousPhase.current !== phase) {
      const seenKey = `guardian-mission-seen:${mission.id}:${phase}`;
      let seen = false;
      try {
        seen = window.localStorage.getItem(seenKey) === 'true';
      } catch {
        // Storage may be unavailable in privacy-restricted browsers. In that
        // case, preserve the existing once-per-page-load behavior.
      }

      if (!seen) {
        setOpen(true);
        try {
          window.localStorage.setItem(seenKey, 'true');
        } catch {
          // The mission remains usable even when persistence is unavailable.
        }
      }
    }
    previousPhase.current = phase;
  }, [mission, phase, autoOpen]);

  if (!mission) return null;

  const checkedIn = families.length - pending.length;
  const compactStatus =
    loading && !phase
      ? '...'
      : error
        ? '!'
        : phase === 'check_in'
          ? `${checkedIn}/${families.length}`
          : phase === 'key_hunt' && trail
            ? `${trail.keysUsed}/${trail.keysTotal}`
            : mission.status;

  // The collapsed bar blinks while a mission is live and wants attention —
  // Athena directs Guardians to "the blinking mission bar at the top of the
  // screen", so this is the visual she is talking about. Calm once opened.
  const attention =
    !open &&
    (phase === 'active' || (phase === 'key_hunt' && !!trail && !trail.complete));

  return (
    <section
      className={`absolute inset-x-0 top-0 z-30 border-b text-emerald-50 transition-colors duration-300 ${
        open
          ? 'bottom-0 flex flex-col overflow-hidden border-emerald-200/20 bg-gradient-to-b from-black/75 to-black/50 shadow-2xl shadow-black/60 backdrop-blur-xl'
          : attention
            ? 'border-amber-300/40 bg-black/90 shadow-lg shadow-amber-400/10 backdrop-blur-sm'
            : 'border-emerald-500/15 bg-black/90 shadow-lg shadow-black/50 backdrop-blur-sm'
      }`}
    >
      {attention && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-pulse bg-amber-400/10"
        />
      )}
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[11px] font-mono uppercase tracking-[0.2em] hover:bg-emerald-500/5"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={
              phase === 'decrypting'
                ? 'animate-pulse text-cyan-300'
                : attention
                  ? 'animate-pulse text-amber-300'
                  : 'text-amber-300'
            }
          >
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
          {!error && phase === 'active' && (
            <ActiveFieldMission
              summary={mission.summary}
              index={index}
              clue={indexClue}
              refresh={state.refresh}
            />
          )}
          {!error && phase === 'decrypting' && <DecryptingMission summary={mission.summary} />}
          {!error && phase === 'key_hunt' && trail && (
            <TrailMission trail={trail} summary={mission.summary} refresh={state.refresh} />
          )}
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

function ActiveFieldMission({
  summary,
  index,
  clue,
  refresh,
}: {
  summary: string;
  index: MissionState['index'];
  clue: MissionState['indexClue'];
  refresh: () => void;
}) {
  const [decoding, setDecoding] = useState(false);
  const finish = useCallback(() => {
    setDecoding(false);
    refresh();
  }, [refresh]);

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
      {index && (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-amber-200/70">
          {index.found}/{index.total} records recovered
        </p>
      )}
      {clue && (
        <button
          onClick={() => setDecoding(true)}
          className="mt-5 w-full rounded-full bg-cyan-500/85 px-5 py-3 text-sm font-semibold text-black transition active:scale-95"
        >
          🔐 Decode the next card location
        </button>
      )}
      {decoding && clue && (
        <IndexClueDecrypt
          challengeCount={clue.challenges}
          onClose={() => setDecoding(false)}
          onRevealed={finish}
        />
      )}
    </div>
  );
}

/** Kid-friendly copy for each way a key report can be refused. */
const TRAIL_ERRORS: Record<string, string> = {
  invalid: 'The Network does not recognize that key. Check the card and try again.',
  used: 'That key has already been used — every key works only once. Find another card!',
  pending_other: 'Finish the decryption that is already running first.',
  complete: 'Every key has been used — the trail is complete!',
  retry: 'The Network hiccuped. Try that key one more time.',
};

/**
 * Rescue Ratatouille Mission 1: the key hunt. Shows the trail legs unlocked so
 * far (always in order), takes the next decryption key from a found clue card,
 * and runs the ClueDecrypt challenges before the clue is revealed. A key
 * reported in chat shows up here as a resumable pending decryption.
 */
function TrailMission({
  trail,
  summary,
  refresh,
}: {
  trail: TrailState;
  summary: string;
  refresh: () => void;
}) {
  const [key, setKey] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The decryption run currently on screen (from key entry or a chat report).
  const [active, setActive] = useState<TrailPending | null>(null);

  const submitKey = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const code = key.trim().toUpperCase();
      if (code.length !== 4 || busy) return;
      setBusy(true);
      setFailure(null);
      try {
        const res = await reportTrailKey(code);
        if (res?.success && res.clue && typeof res.clueIndex === 'number') {
          setKey('');
          setActive({
            keyCode: code,
            clueIndex: res.clueIndex,
            clue: res.clue,
            challenges: res.challenges || 3,
          });
        } else {
          setFailure(TRAIL_ERRORS[res?.reason || ''] || TRAIL_ERRORS.retry);
        }
      } catch {
        setFailure(TRAIL_ERRORS.retry);
      } finally {
        setBusy(false);
      }
    },
    [key, busy]
  );

  const closeDecrypt = useCallback(() => {
    setActive(null);
    setFailure(null);
    refresh();
  }, [refresh]);

  return (
    <div>
      <p className="mb-3 text-xs leading-relaxed opacity-60">{summary}</p>

      {/* Key progress pips */}
      <div className="mb-4 flex items-center gap-2">
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: trail.keysTotal }, (_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full ${
                i < trail.keysUsed
                  ? 'bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.6)]'
                  : i === trail.keysUsed && trail.pending
                    ? 'animate-pulse bg-cyan-300'
                    : 'bg-white/15'
              }`}
            />
          ))}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-50">
          {trail.keysUsed}/{trail.keysTotal} keys
        </span>
      </div>

      {/* Unlocked trail legs, strictly in order */}
      {trail.clues.length > 0 ? (
        <ol className="space-y-1.5">
          {trail.clues.map((clue) => (
            <li
              key={clue.index}
              className="flex items-baseline gap-2 rounded-lg border border-emerald-300/10 bg-emerald-400/[0.04] px-3 py-1.5 font-mono text-xs"
            >
              <span className="w-5 shrink-0 text-right tabular-nums text-amber-300/80">
                {clue.index === 0 ? '⚑' : clue.index}
              </span>
              <span className="min-w-0 text-emerald-100/90">
                {clue.index === 0 ? (
                  <>START — {clue.description}</>
                ) : (
                  <>
                    <span className="tabular-nums">{clue.distance} m</span>
                    <span className="opacity-50"> @ </span>
                    <span className="tabular-nums">{clue.bearing}°</span>
                    <span className="opacity-50"> — </span>
                    {clue.description}
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-center text-xs opacity-50">
          No clues decrypted yet. Find a card marked with the Guardians logo!
        </p>
      )}

      {/* Next action: celebrate, resume a pending decryption, or take a key. */}
      {trail.complete ? (
        <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-amber-200">
            🏆 Trail complete
          </p>
          <p className="mt-2 text-xs leading-relaxed text-emerald-50/80">
            Follow every leg in order from the very start — distances and
            bearings, one at a time. Ratatouille is waiting at the end!
          </p>
        </div>
      ) : trail.pending && !active ? (
        <button
          onClick={() => setActive(trail.pending)}
          className="mt-4 w-full rounded-full bg-cyan-500/80 px-4 py-2.5 text-sm font-semibold text-black transition active:scale-95"
        >
          🔐 Continue decrypting clue {trail.pending.clueIndex + 1}
        </button>
      ) : !active ? (
        <form onSubmit={submitKey} className="mt-4">
          <label
            htmlFor="trail-key"
            className="block text-[10px] font-mono uppercase tracking-[0.25em] opacity-50"
          >
            Report a decryption key
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="trail-key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));
                setFailure(null);
              }}
              placeholder="····"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-28 rounded-lg border border-amber-300/25 bg-black/40 px-3 py-2 text-center font-mono text-lg uppercase tracking-[0.4em] text-amber-100 outline-none placeholder:opacity-30 focus:border-amber-300/60"
            />
            <button
              type="submit"
              disabled={key.length !== 4 || busy}
              className="flex-1 rounded-lg bg-amber-400/90 px-4 py-2 text-sm font-semibold text-black transition disabled:opacity-30 active:scale-95"
            >
              {busy ? 'Reporting…' : 'Report key'}
            </button>
          </div>
          {failure && <p className="mt-2 text-xs text-amber-300">{failure}</p>}
        </form>
      ) : null}

      {active && (
        <ClueDecrypt
          keyCode={active.keyCode}
          clue={active.clue}
          challengeCount={active.challenges}
          keysTotal={trail.keysTotal}
          onUnlocked={closeDecrypt}
          onClose={closeDecrypt}
        />
      )}
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
