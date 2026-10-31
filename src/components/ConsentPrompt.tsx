import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface MyConsent {
  enrolled: boolean;
  status?: string;
  needsYou?: boolean;
  waitingOnParent?: boolean;
  terms?: { id: number; version: number; title: string; body: string } | null;
}

const BASE = '/api/v1/guardian-missions/my-consent';

/**
 * A Guardian's own choice, shown when they sign in. Saying no is as easy as
 * saying yes, and once they've said yes the same place lets them stop.
 */
export function ConsentPrompt() {
  const [mine, setMine] = useState<MyConsent | null>(null);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<MyConsent>(BASE).then(setMine).catch(() => undefined);
  }, []);

  const send = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      setMine(await api.post<MyConsent>(`${BASE}${path}`, body));
      setClosed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const terms = mine?.terms;
  if (!mine?.enrolled || !terms) return null;

  if (closed || !mine.needsYou) {
    return (
      <button
        type="button"
        disabled={busy}
        className="fixed bottom-2 right-2 z-40 rounded bg-black/70 px-2 py-1 text-xs text-cyan-200 underline"
        onClick={() => {
          if (window.confirm('Stop helping train Athena? You can stop any time and nobody will be upset.')) void send('/withdraw');
        }}
      >
        Stop helping train Athena
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-cyan-500/30 bg-slate-900 p-5 text-slate-100">
        <h2 id="consent-title" className="text-lg font-semibold">{terms.title}</h2>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto whitespace-pre-line text-sm leading-relaxed">{terms.body}</div>
        {mine.waitingOnParent && <p className="mt-3 text-sm text-cyan-200">A parent has to say yes too. We&apos;re still waiting for them.</p>}
        {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-200 hover:bg-slate-800" onClick={() => setClosed(true)}>Not now</button>
          <button type="button" disabled={busy} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50" onClick={() => void send('/agree', { termsId: terms.id })}>Yes, I want to help</button>
        </div>
      </div>
    </div>
  );
}
