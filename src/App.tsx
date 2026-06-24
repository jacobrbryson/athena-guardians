import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Splash } from './pages/Splash';
import { GuardianGate } from './pages/GuardianGate';
import { AthenaConsole } from './pages/AthenaConsole';
import { ComingSoon } from './pages/ComingSoon';

const ID_RE = /^\d{8}$/;

/** Phase 2 Guardian Network routes — registered now, fully built later. */
const PHASE2_ROUTES: { path: string; title: string }[] = [
  { path: '/missions', title: 'MISSIONS' },
  { path: '/archive', title: 'ARCHIVE' },
  { path: '/relics', title: 'RELICS' },
  { path: '/evidence', title: 'EVIDENCE' },
];

/** Gate that only renders its children for an authenticated Guardian. */
function Protected({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'anonymous') return <GuardianGate />;
  return <>{children}</>;
}

/** Home: Athena console when authenticated, otherwise the Guardian gate. */
function Home() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'authenticated') return <AthenaConsole />;
  return <GuardianGate />;
}

/** /:guardian_id — deep link that pre-fills the Guardian ID (skips step 1). */
function GuardianDeepLink() {
  const { status } = useAuth();
  const { guardianId } = useParams();

  if (status === 'loading') return <Splash />;
  // Authenticated users ignore the deep link and see Athena.
  if (status === 'authenticated') return <Navigate to="/" replace />;
  // Only valid 8-digit IDs skip step 1; anything else falls back to the gate.
  if (!guardianId || !ID_RE.test(guardianId)) return <Navigate to="/" replace />;
  return <GuardianGate prefilledId={guardianId} />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          {PHASE2_ROUTES.map((r) => (
            <Route
              key={r.path}
              path={r.path}
              element={
                <Protected>
                  <ComingSoon title={r.title} />
                </Protected>
              }
            />
          ))}
          {/* Keep the deep link last so it doesn't shadow named routes. */}
          <Route path="/:guardianId" element={<GuardianDeepLink />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
