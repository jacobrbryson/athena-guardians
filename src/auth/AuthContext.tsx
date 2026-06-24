import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchMe, guardianLogin, guardianLogout, type Guardian } from '../api/auth';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

/**
 * A one-shot "first contact" signal, set only by a fresh login() and consumed
 * once by the console to drive Athena's arrival experience. It is intentionally
 * not derived from /auth/me, so a page reload does NOT replay first contact.
 */
interface Arrival {
  isFirstLogin: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  guardian: Guardian | null;
  /** Pending arrival experience, or null. Cleared via consumeArrival(). */
  arrival: Arrival | null;
  consumeArrival: () => void;
  /** Validate credentials; resolves the guardian on success. Throws otherwise. */
  login: (guardianId: string, secret: string) => Promise<Guardian>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [guardian, setGuardian] = useState<Guardian | null>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);

  // On boot, ask the proxy who we are (validates the httpOnly session cookie).
  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((res) => {
        if (cancelled) return;
        setGuardian(res.guardian);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setGuardian(null);
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (guardianId: string, secret: string) => {
    const res = await guardianLogin(guardianId, secret);
    setGuardian(res.guardian);
    setArrival({ isFirstLogin: !!res.is_first_login });
    setStatus('authenticated');
    return res.guardian;
  }, []);

  const consumeArrival = useCallback(() => setArrival(null), []);

  const logout = useCallback(async () => {
    try {
      await guardianLogout();
    } finally {
      setGuardian(null);
      setArrival(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo(
    () => ({ status, guardian, arrival, consumeArrival, login, logout }),
    [status, guardian, arrival, consumeArrival, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
