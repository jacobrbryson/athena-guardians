import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';

interface Step {
  uuid: string;
  instruction: string;
  place: string | null;
  proof: string;
  dueAt: string | null;
  mission: string;
}

const BASE = '/api/v1/guardian-missions/my-steps';
const REFRESH_MS = 30_000;

/** What Athena has asked of this Guardian, on a live mission. Nothing shows when there's nothing to do. */
export function MissionSteps() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api.get<{ steps: Step[] }>(BASE).then((r) => setSteps(r.steps)).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const step = steps[0];
  if (!step) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const out = await api.post<{ correct: boolean; steps: Step[] }>(`${BASE}/${step.uuid}/code`, { code });
      setSteps(out.steps);
      setCode('');
      setNote(out.correct ? "That's it!" : 'Not quite. Try again.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const done = async () => {
    setBusy(true);
    try {
      setSteps((await api.post<{ steps: Step[] }>(`${BASE}/${step.uuid}/done`)).steps);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="fixed bottom-10 right-2 z-40 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-cyan-500/30 bg-slate-900/95 p-4 text-sm text-slate-100" aria-label="Your mission step">
      <p className="text-xs text-cyan-200">{step.mission}</p>
      <p className="mt-1">{step.instruction}</p>
      {step.place && <p className="mt-1 text-xs text-slate-300">{step.place}</p>}
      {step.proof === 'code' ? (
        <form className="mt-3 flex gap-2" onSubmit={(e) => void submit(e)}>
          <input aria-label="Secret code" className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          <button type="submit" disabled={busy || !code.trim()} className="rounded bg-cyan-500 px-3 py-1 font-semibold text-slate-950 disabled:opacity-50">Enter</button>
        </form>
      ) : step.proof === 'none' || step.proof === 'kid_confirm' ? (
        <button type="button" disabled={busy} className="mt-3 rounded bg-cyan-500 px-3 py-1 font-semibold text-slate-950 disabled:opacity-50" onClick={() => void done()}>Done</button>
      ) : null}
      {note && <p className="mt-2 text-xs" role="status">{note}</p>}
    </aside>
  );
}
