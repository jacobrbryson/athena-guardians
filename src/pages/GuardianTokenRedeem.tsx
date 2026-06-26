import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Splash } from './Splash';
import { GuardianGate } from './GuardianGate';
import { SequenceOverlay } from '../components/SequenceOverlay';
import { VERIFY_MESSAGES } from '../athena/sequences';

/**
 * /q/:token — single-use QR login link.
 *
 * The token is a high-entropy, server-issued one-time code (NOT the Guardian's
 * permanent secret, which never travels in a URL). We redeem it on arrival and,
 * on success, the proxy sets the same session cookie a password login would —
 * so from here on the Guardian is authenticated normally.
 *
 * The "contacting Athena" sequence is held up through navigation so the hand-off
 * into Athena's arrival feels continuous. A spent, expired, or unknown token
 * drops the Guardian to the gate to authenticate manually.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{20,}$/;
const VERIFY_MIN_MS = 1700; // minimum length of the "contacting Athena" sequence
const TOKEN_ERROR = 'That link has expired or already been used.';

type State = 'idle' | 'redeeming' | 'failed';

interface GateRedirectError extends Error {
  redirectGuardianId?: string;
}

export function GuardianTokenRedeem() {
  const { status, loginWithToken } = useAuth();
  const { token } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState<State>('idle');
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    // Already authenticated *on arrival* (before we start a redeem): skip to
    // Athena. Once a redeem is in flight we ignore the status flip it causes and
    // let the async path below own navigation, so the overlay isn't cut short.
    if (status === 'authenticated' && !startedRef.current) {
      navigate('/', { replace: true });
      return;
    }
    if (status !== 'anonymous' || startedRef.current) return;

    // A malformed token never hits the server — straight to the manual gate.
    if (!token || !TOKEN_RE.test(token)) {
      setState('failed');
      return;
    }

    startedRef.current = true;
    setState('redeeming');
    (async () => {
      const minDelay = new Promise((r) => window.setTimeout(r, VERIFY_MIN_MS));
      const [result] = await Promise.allSettled([loginWithToken(token)]);
      await minDelay;
      if (!mountedRef.current) return;
      if (result.status === 'fulfilled') {
        // Keep the overlay up; navigation reveals Athena's arrival next.
        navigate('/', { replace: true });
      } else {
        const err = result.reason as GateRedirectError;
        if (err?.redirectGuardianId) {
          // QR already used on another device — send to the manual gate with
          // the Guardian ID pre-filled so they only need to enter their secret.
          navigate(`/${err.redirectGuardianId}`, { replace: true });
        } else {
          setState('failed');
        }
      }
    })();
  }, [status, token, loginWithToken, navigate]);

  if (status === 'loading') return <Splash />;
  if (state === 'failed') return <GuardianGate initialError={TOKEN_ERROR} />;
  if (state === 'redeeming') {
    return (
      <main className="relative gd-scanlines gd-sweep min-h-[100dvh]">
        <SequenceOverlay messages={VERIFY_MESSAGES} tone="terminal" />
      </main>
    );
  }
  // 'idle': the effect is handling an already-authenticated arrival. Briefly
  // show the boot splash until its navigate lands.
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Splash />;
}
