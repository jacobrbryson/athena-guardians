import { useState } from 'react';
import type { MissionState } from '../missions/useMission';
import type { MissionFamily, MissionStateResponse } from '../api/mission';
import { DecryptionConsole } from './DecryptionConsole';
import { getSolvedCount } from '../missions/decryptionProgress';
import { CHALLENGE_COUNT } from '../missions/challenges';
import { TEST_GUARDIAN_ID } from '../config';

/**
 * "Current Mission" panel — a collapsible disclosure under the console header
 * that keeps Guardians on track. It adapts to the active mission's objective:
 *  - family_onboarding (Mission 1): a checklist of families, those who've made
 *    contact struck through, the rest carrying a reach-out note.
 *  - convergence (Mission 2): the piece this family holds, who's reported in,
 *    and — once every family is in — the revealed gathering point.
 *
 * Collapsed by default so it never crowds Athena; the summary line shows live
 * progress so the Guardian can see at a glance how the mission is going.
 */
export function CurrentMission({
  state,
  guardianId,
}: {
  state: MissionState;
  guardianId: string;
}) {
  const { mission, loading, error, complete } = state;
  const [open, setOpen] = useState(false);

  // Nothing to show until there's an active mission.
  if (!mission) return null;

  // Progress counter for the collapsed header, per objective.
  let done = 0;
  let total = 0;
  if (mission.objective === 'family_onboarding') {
    total = state.families.length;
    done = total - state.pending.length;
  } else if (mission.objective === 'convergence') {
    total = state.convergence?.progress.total ?? 0;
    done = state.convergence?.progress.reported ?? 0;
  }
  const progress =
    loading && total === 0 ? '…' : error ? '!' : `${done}/${total}`;

  return (
    <section className="border-b border-emerald-500/15 bg-black/95 text-emerald-50">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[11px] font-mono uppercase tracking-[0.2em] hover:bg-emerald-500/5"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="text-amber-300">
            ◆
          </span>
          <span className="opacity-70">Current Mission</span>
          <span className="truncate opacity-90 normal-case tracking-normal font-semibold">
            {mission.title}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={`tabular-nums ${complete ? 'text-emerald-300' : 'opacity-60'}`}>
            {progress}
          </span>
          <span aria-hidden className="opacity-50">
            {open ? '▲' : '▼'}
          </span>
        </span>
      </button>

      {open && (
        <div className="px-4 pb-3 pt-1 text-sm">
          <p className="mb-3 text-xs leading-relaxed opacity-60">{mission.summary}</p>

          {error && (
            <p className="py-2 text-xs text-amber-300">
              Mission records are out of reach right now.
            </p>
          )}

          {!error && loading && total === 0 && (
            <p className="py-2 text-xs font-mono opacity-40">
              Synchronizing mission records…
            </p>
          )}

          {!error && mission.objective === 'family_onboarding' && (
            <FamilyChecklist
              families={state.families}
              incompleteNote={mission.incompleteNote}
            />
          )}

          {!error && mission.objective === 'convergence' && state.convergence && (
            <ConvergenceBody
              data={state.convergence}
              guardianId={guardianId}
              onContribute={state.contribute}
            />
          )}

          {complete && (
            <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-200">
              {mission.completeMessage}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Mission 1: families struck through when onboarded, reach-out note otherwise. */
function FamilyChecklist({
  families,
  incompleteNote,
}: {
  families: MissionFamily[];
  incompleteNote: string;
}) {
  if (families.length === 0) return null;
  return (
    <ul className="space-y-2">
      {families.map((f) => (
        <li key={f.key} className="flex items-start gap-2">
          <span
            aria-hidden
            className={`mt-0.5 w-4 shrink-0 text-center ${
              f.onboarded ? 'text-emerald-400' : 'text-amber-300'
            }`}
          >
            {f.onboarded ? '✓' : '○'}
          </span>
          <span className="min-w-0">
            <span
              className={f.onboarded ? 'line-through opacity-50' : 'font-medium text-emerald-50'}
            >
              {f.name}
              {f.region && <span className="font-normal opacity-60"> · {f.region}</span>}
            </span>
            {!f.onboarded && (
              <span className="block text-xs leading-snug text-amber-200/80">
                {incompleteNote}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Surname-only label, e.g. "The Wallace Family" -> "Wallace". */
function shortFamily(name: string): string {
  return name.replace(/^The\s+/i, '').replace(/\s+Family.*$/i, '');
}

/**
 * One quarter of the torn map. Shows the family's corner image once they've
 * uncovered it (reported); otherwise a locked/encrypting placeholder so the
 * shape of the map — and who's still missing — is always legible.
 */
function MapCornerCell({
  family,
}: {
  family: { key: string; name: string; reported: boolean; corner: string | null };
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const label = shortFamily(family.name);
  const revealed = family.reported && !!family.corner;

  if (revealed && !imgFailed) {
    return (
      <div className="relative aspect-square overflow-hidden rounded-md border border-emerald-400/60">
        <img
          src={`/map/${family.corner}.png`}
          alt={`${family.name} corner`}
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-center text-[9px] font-mono text-emerald-200">
          {label} ✓
        </span>
      </div>
    );
  }

  // Recovered but art not in yet → still show it as "in", just without the image.
  return (
    <div
      className={`grid aspect-square place-items-center rounded-md border text-center ${
        family.reported
          ? 'border-emerald-400/60 bg-emerald-500/10'
          : 'border-dashed border-emerald-500/25 bg-emerald-500/[0.03]'
      }`}
    >
      <div className="px-1">
        <div className="text-lg opacity-40">{family.reported ? '🗺️' : '🔒'}</div>
        <div
          className={`truncate text-[9px] font-mono uppercase tracking-wide ${
            family.reported ? 'text-emerald-200' : 'text-amber-300/70'
          }`}
        >
          {label}
          {family.reported ? ' ✓' : ''}
        </div>
      </div>
    </div>
  );
}

/** Dev-only: the real families' corners, for previewing the finished map. */
const DEV_PREVIEW_CORNERS: Record<string, string> = {
  wallace: 'nw',
  bryson: 'ne',
  morgan: 'sw',
  abassi: 'se',
};

/** The payoff: the single assembled map, shown once every corner is recovered. */
function CompletedMapReveal() {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div className="rounded-lg bg-emerald-500/10 px-3 py-3 text-center">
      <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-emerald-300">
        The map is whole
      </p>
      {!imgFailed ? (
        <img
          src="/map/final.png"
          alt="The completed Guardian map"
          className="mx-auto mt-2 w-full max-w-xs rounded-lg border border-emerald-400/40 object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <p className="mt-2 font-mono text-xs opacity-50">map: /map/final.png</p>
      )}
      <p className="mt-2 text-xs leading-snug text-emerald-200/80">
        Every corner recovered — the path ahead is clear.
      </p>
    </div>
  );
}

/**
 * Decryption mission: your family earns its map corner by passing Athena's
 * "bot check" challenges. Every family's corner is revealed to everyone the
 * moment they uncover it, so the shared map fills in piece by piece; the payoff
 * is the completed four-corner map.
 */
function ConvergenceBody({
  data,
  guardianId,
  onContribute,
}: {
  data: MissionStateResponse;
  guardianId: string;
  onContribute: () => Promise<void>;
}) {
  const [consoleOpen, setConsoleOpen] = useState(false);
  const isTestUser = guardianId === TEST_GUARDIAN_ID;
  const [devPreview, setDevPreview] = useState(false);

  const { family, progress } = data;
  const solved = getSolvedCount(guardianId);
  const inProgress = solved > 0 && solved < CHALLENGE_COUNT;

  // The shared map fills in from each family's reported status. The dev preview
  // (test account only) shows every corner in so the finished map can be checked
  // without all four families logging in — purely presentational.
  const families = devPreview
    ? progress.families.map((f) => ({
        ...f,
        reported: true,
        corner: f.corner ?? DEV_PREVIEW_CORNERS[f.key] ?? 'test',
      }))
    : progress.families;
  const recovered = families.filter((f) => f.reported).length;
  const complete = families.length > 0 && recovered === families.length;

  return (
    <div className="space-y-3">
      {/* Your corner — earned by decrypting */}
      {family.is_participant ? (
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] opacity-50">
            Your corner of the map
          </p>
          {family.reported ? (
            <div className="mt-1 flex items-center gap-2">
              <span aria-hidden className="text-emerald-300">
                ✓
              </span>
              <span className="text-xs text-emerald-300">
                Decrypted — your corner is recovered.
              </span>
            </div>
          ) : (
            <button
              onClick={() => setConsoleOpen(true)}
              className="mt-2 rounded-full bg-emerald-500/80 px-4 py-1.5 text-xs font-semibold text-black active:scale-95"
            >
              {inProgress
                ? `Resume decryption (${solved}/${CHALLENGE_COUNT})`
                : 'Begin decryption'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs leading-relaxed opacity-70">
          You're watching over this one — rally the families to decrypt their pieces.
        </p>
      )}

      {/* The torn map fills in as each family reports; the assembled map is the payoff. */}
      {complete ? (
        <CompletedMapReveal />
      ) : (
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] opacity-50">
            The map, torn in four · {recovered}/{families.length}
          </p>
          <div className="mx-auto mt-2 grid w-44 grid-cols-2 gap-1">
            {families.map((f) => (
              <MapCornerCell key={f.key} family={f} />
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-snug text-emerald-200/70">
            <span aria-hidden>💬</span>
            <span>
              Rally the other families — the map completes once every corner is
              recovered.
            </span>
          </p>
        </div>
      )}

      {isTestUser && (
        <button
          onClick={() => setDevPreview((v) => !v)}
          title="Test account only — preview the finished map without all families reporting"
          className="text-[10px] font-mono uppercase tracking-wide text-emerald-400/60 underline decoration-dotted"
        >
          🧪 {devPreview ? 'Hide' : 'Preview'} completed map
        </button>
      )}

      {consoleOpen && (
        <DecryptionConsole
          guardianId={guardianId}
          corner={family.corner}
          onClose={() => setConsoleOpen(false)}
          onComplete={onContribute}
        />
      )}
    </div>
  );
}
