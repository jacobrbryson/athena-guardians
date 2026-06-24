import { Link } from 'react-router-dom';

/**
 * Placeholder for Phase 2 Guardian Network routes (/missions, /archive,
 * /relics, /evidence). These are registered as protected routes now so the
 * shell can grow into the full network without re-architecting routing/auth.
 */
export function ComingSoon({ title }: { title: string }) {
  return (
    <main className="gd-scanlines min-h-[100dvh] grid place-items-center font-mono text-center px-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.5em] opacity-40">guardian network</p>
        <h1 className="mt-2 text-2xl tracking-[0.3em] gd-glitch" data-text={title}>
          {title}
        </h1>
        <p className="mt-4 text-xs opacity-50">// transmission pending</p>
        <Link
          to="/"
          className="mt-8 inline-block text-[11px] uppercase tracking-[0.3em] opacity-60 hover:opacity-100"
        >
          ← return to Athena
        </Link>
      </div>
    </main>
  );
}
