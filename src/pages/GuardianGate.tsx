import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { SequenceOverlay } from '../components/SequenceOverlay';
import { LOCATE_MESSAGES, VERIFY_MESSAGES } from '../athena/sequences';

/**
 * The unauthenticated gate — connecting to the Guardian Network, not logging
 * into a website. Minimal, mysterious, mission-control. Steps:
 *
 *   1. Guardian ID  — exactly 8 numeric digits
 *   2. (locating)   — short animated "record located" sequence (~1.5s)
 *   3. Guardian Secret — exactly 6 alpha-numeric characters
 *   4. (verifying)  — animated "contacting Athena" sequence while auth runs
 *
 * On success we keep the verifying overlay up through navigation so the hand-off
 * into Athena's arrival experience feels continuous (no abrupt page swap).
 *
 * When `prefilledId` is set (the /:guardian_id deep link) we skip straight to
 * the secret step with the ID already captured.
 */

const GENERIC_ERROR = 'Guardian credentials not recognized.';
const ID_RE = /^\d{8}$/;
const SECRET_RE = /^[A-Za-z0-9]{6}$/;

const LOCATE_MS = 1500; // length of the "record located" sequence
const VERIFY_MIN_MS = 1700; // minimum length of the "contacting Athena" sequence

type Step = 'id' | 'locating' | 'secret' | 'verifying';

interface Props {
  prefilledId?: string;
}

export function GuardianGate({ prefilledId }: Props) {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [guardianId, setGuardianId] = useState(prefilledId ?? '');
  const [secret, setSecret] = useState('');
  const [step, setStep] = useState<Step>(prefilledId ? 'secret' : 'id');
  const [error, setError] = useState<string | null>(null);

  const idInputRef = useRef<HTMLInputElement | null>(null);
  const secretInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Focus the active step's input.
  useEffect(() => {
    if (step === 'id') idInputRef.current?.focus();
    else if (step === 'secret') secretInputRef.current?.focus();
  }, [step]);

  function submitId(e: FormEvent) {
    e.preventDefault();
    if (!ID_RE.test(guardianId)) {
      setError('Guardian ID must be 8 digits.');
      return;
    }
    setError(null);
    setStep('locating');
    window.setTimeout(() => {
      if (mountedRef.current) setStep('secret');
    }, LOCATE_MS);
  }

  async function submitSecret(e: FormEvent) {
    e.preventDefault();
    if (!SECRET_RE.test(secret)) {
      setError('Guardian Secret must be 6 characters.');
      return;
    }
    setError(null);
    setStep('verifying');

    // Hold the verify sequence on screen for a minimum, even on a fast failure,
    // so it reads as a deliberate "contacting Athena" beat — not a flicker.
    const minDelay = new Promise((r) => window.setTimeout(r, VERIFY_MIN_MS));
    const [result] = await Promise.allSettled([login(guardianId, secret)]);
    await minDelay;

    if (result.status === 'fulfilled') {
      // Keep the overlay up; navigation reveals Athena's arrival next.
      navigate('/', { replace: true });
      return;
    }
    if (!mountedRef.current) return;
    const err = result.reason as { status?: number };
    setError(err?.status === 429 ? 'Too many attempts. Wait, then retry.' : GENERIC_ERROR);
    setSecret('');
    setStep('secret');
  }

  function resetToId() {
    setSecret('');
    setError(null);
    if (!prefilledId) setStep('id');
  }

  // Connection / verification sequences take over the whole screen.
  if (step === 'locating' || step === 'verifying') {
    return (
      <main className="relative gd-scanlines gd-sweep min-h-[100dvh]">
        <SequenceOverlay
          messages={step === 'locating' ? LOCATE_MESSAGES : VERIFY_MESSAGES}
          tone="terminal"
        />
      </main>
    );
  }

  return (
    <main className="gd-scanlines gd-sweep min-h-[100dvh] grid place-items-center px-6 py-10 select-none">
      <div className="w-full max-w-sm font-mono">
        {/* Masthead */}
        <div className="mb-10 text-center">
          <p className="text-[10px] uppercase tracking-[0.5em] opacity-40 animate-flicker">
            guardian network
          </p>
          <h1 className="mt-2 text-xl tracking-[0.3em] gd-glitch" data-text="// ACCESS POINT">
            // ACCESS POINT
          </h1>
        </div>

        {step === 'id' ? (
          <form onSubmit={submitId} className="space-y-6" aria-label="Guardian ID">
            <label className="block text-center text-xs uppercase tracking-[0.3em] opacity-50">
              Identify yourself
            </label>
            <div className="flex items-center justify-center gap-2 border-b border-current/30 pb-2">
              <span aria-hidden className="opacity-40">
                &gt;
              </span>
              <input
                ref={idInputRef}
                className="gd-input w-full text-center text-2xl"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={8}
                placeholder="00000000"
                value={guardianId}
                onChange={(e) => setGuardianId(e.target.value.replace(/\D/g, '').slice(0, 8))}
              />
              <span aria-hidden className="opacity-70 animate-caret">
                _
              </span>
            </div>
            <button
              type="submit"
              className="w-full rounded-sm border border-current/40 py-3 text-sm uppercase tracking-[0.3em] transition active:scale-[0.98] hover:bg-current/5 disabled:opacity-30"
              disabled={!ID_RE.test(guardianId)}
            >
              Proceed
            </button>
          </form>
        ) : (
          <form onSubmit={submitSecret} className="space-y-6" aria-label="Guardian Secret">
            <p className="text-center text-xs uppercase tracking-[0.3em] opacity-50">
              Guardian{' '}
              <span className="opacity-90 gd-glitch" data-text={guardianId}>
                {guardianId}
              </span>
            </p>
            <label className="block text-center text-xs uppercase tracking-[0.3em] opacity-50">
              Enter secret
            </label>
            <div className="flex items-center justify-center gap-2 border-b border-current/30 pb-2">
              <span aria-hidden className="opacity-40">
                &gt;
              </span>
              <input
                ref={secretInputRef}
                className="gd-input w-full text-center text-2xl uppercase"
                autoComplete="off"
                spellCheck={false}
                maxLength={6}
                placeholder="••••••"
                value={secret}
                onChange={(e) =>
                  setSecret(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6))
                }
              />
              <span aria-hidden className="opacity-70 animate-caret">
                _
              </span>
            </div>
            <button
              type="submit"
              className="w-full rounded-sm border border-current/40 py-3 text-sm uppercase tracking-[0.3em] transition active:scale-[0.98] hover:bg-current/5 disabled:opacity-30"
              disabled={!SECRET_RE.test(secret)}
            >
              Authenticate
            </button>
            {!prefilledId && (
              <button
                type="button"
                onClick={resetToId}
                className="block mx-auto text-[10px] uppercase tracking-[0.3em] opacity-40 hover:opacity-70"
              >
                ← change ID
              </button>
            )}
          </form>
        )}

        {/* Status line */}
        <div className="mt-8 h-5 text-center" aria-live="polite">
          {error && (
            <p className="text-xs tracking-widest" style={{ color: 'var(--gd-error)' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
