/** Minimal boot splash shown while the session cookie is being checked. */
export function Splash() {
  return (
    <main className="gd-scanlines min-h-[100dvh] grid place-items-center font-mono">
      <p
        className="text-sm uppercase tracking-[0.5em] opacity-60 animate-flicker gd-glitch"
        data-text="· · ·"
      >
        · · ·
      </p>
    </main>
  );
}
