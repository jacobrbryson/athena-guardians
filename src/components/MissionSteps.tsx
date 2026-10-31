import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';

interface Step {
  uuid: string;
  instruction: string;
  place: string | null;
  proof: string;
  dueAt: string | null;
  mission: string;
  premise?: string | null;
  safety?: { where: string; supervision: string; offLimits: string } | null;
}

interface Reveal { uuid: string; title: string; reveal: string }

const REVEALS_READ = 'guardians.revealsRead';

const readReveals = (): string[] => {
  try {
    return JSON.parse(window.localStorage.getItem(REVEALS_READ) || '[]');
  } catch {
    return [];
  }
};

const markRevealRead = (uuid: string) => {
  try {
    window.localStorage.setItem(REVEALS_READ, JSON.stringify([...readReveals(), uuid]));
  } catch {
    // It just shows again next time.
  }
};

const BASE = '/api/v1/guardian-missions/my-steps';
const GO = '/api/v1/guardian-missions/my-go';
const REFRESH_MS = 30_000;

interface Mine { steps: Step[]; ready?: { uuid: string; title: string }[]; reveals?: Reveal[] }

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('That photo could not be read.'));
  reader.readAsDataURL(file);
});

/** What Athena has asked of this Guardian, on a live mission. Nothing shows when there's nothing to do. */
export function MissionSteps() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [ready, setReady] = useState<{ uuid: string; title: string }[]>([]);
  const [reveals, setReveals] = useState<Reveal[]>([]);
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api.get<Mine>(BASE).then((r) => { setSteps(r.steps); setReady(r.ready || []); setReveals(r.reveals || []); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const step = steps[0];

  const start = async (uuid: string) => {
    setBusy(true);
    setNote(null);
    try {
      const out = await api.post<Mine>(`${GO}/${uuid}`, {});
      setSteps(out.steps);
      setReady(out.ready || []);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const reveal = reveals.find((r) => !readReveals().includes(r.uuid));

  if (!step) {
    if (!ready.length && reveal) {
      return (
        <aside className="fixed bottom-10 right-2 z-40 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-cyan-500/30 bg-slate-900/95 p-4 text-sm text-slate-100" aria-label="Behind the quest">
          <p className="text-xs text-cyan-200">Behind the quest: {reveal.title}</p>
          <p className="mt-1">{reveal.reveal}</p>
          <button type="button" className="mt-3 rounded bg-cyan-500 px-3 py-1 font-semibold text-slate-950" onClick={() => { markRevealRead(reveal.uuid); refresh(); }}>Got it</button>
        </aside>
      );
    }
    if (!ready.length) return null;
    return (
      <aside className="fixed bottom-10 right-2 z-40 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-cyan-500/30 bg-slate-900/95 p-4 text-sm text-slate-100" aria-label="Ready to start">
        <p className="text-xs text-cyan-200">Ready to start. Your parents will be told.</p>
        {ready.map((m) => <button key={m.uuid} type="button" disabled={busy} className="mt-2 block w-full rounded bg-cyan-500 px-3 py-1 font-semibold text-slate-950 disabled:opacity-50" onClick={() => void start(m.uuid)}>Go: {m.title}</button>)}
        {note && <p className="mt-2 text-xs" role="status">{note}</p>}
      </aside>
    );
  }

  const sendPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setNote(null);
    try {
      const out = await api.post<{ correct: boolean; why?: string; steps: Step[] }>(`${BASE}/${step.uuid}/photo`, { image: await toBase64(file), contentType: file.type });
      setSteps(out.steps);
      setNote(out.correct ? 'Got it!' : out.why || 'That photo did not show it. Try again.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

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
      {step.premise && <p className="mt-1 text-xs italic text-slate-300">{step.premise}</p>}
      <p className="mt-1">{step.instruction}</p>
      {step.place && <p className="mt-1 text-xs text-slate-300">{step.place}</p>}
      {step.safety && (
        <div className="mt-2 border-t border-slate-700 pt-2 text-xs text-slate-300">
          <p className="font-semibold text-slate-100">Real-world rules</p>
          <p>Where: {step.safety.where}</p>
          <p>Your adult: {step.safety.supervision}</p>
          <p>Off limits: {step.safety.offLimits}</p>
        </div>
      )}
      {step.proof === 'code' ? (
        <form className="mt-3 flex gap-2" onSubmit={(e) => void submit(e)}>
          <input aria-label="Secret code" className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          <button type="submit" disabled={busy || !code.trim()} className="rounded bg-cyan-500 px-3 py-1 font-semibold text-slate-950 disabled:opacity-50">Enter</button>
        </form>
      ) : step.proof === 'photo' ? (
        <label className="mt-3 block rounded bg-cyan-500 px-3 py-1 text-center font-semibold text-slate-950">
          Send a photo
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => void sendPhoto(e.target.files?.[0])} />
        </label>
      ) : step.proof === 'none' || step.proof === 'kid_confirm' ? (
        <button type="button" disabled={busy} className="mt-3 rounded bg-cyan-500 px-3 py-1 font-semibold text-slate-950 disabled:opacity-50" onClick={() => void done()}>Done</button>
      ) : null}
      {note && <p className="mt-2 text-xs" role="status">{note}</p>}
    </aside>
  );
}
