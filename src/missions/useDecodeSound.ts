import { useCallback, useEffect, useRef } from 'react';

/**
 * Sound effects for the decryption console, synthesized with the Web Audio
 * API rather than shipped as asset files — the "decoding" beat is a stream
 * of blips, easiest to generate on the fly and cheap to keep in sync with
 * the glitch-text redraw interval.
 *
 * A no-op if AudioContext is unavailable, so the console never breaks for
 * lack of sound.
 */
export interface DecodeSound {
  /** Start the looping "decoding" chatter; returns a stop function. */
  startDecodingLoop: () => () => void;
  /** Short rising chime when a fragment resolves / challenge is solved. */
  playSolved: () => void;
  /** Bigger resolving chord once the whole message decrypts. */
  playComplete: () => void;
}

export function useDecodeSound(): DecodeSound {
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(
    () => () => {
      ctxRef.current?.close().catch(() => undefined);
    },
    []
  );

  const getCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctxRef.current) ctxRef.current = new Ctor();
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume().catch(() => undefined);
    return ctxRef.current;
  }, []);

  // A single short blip at the given frequency/duration.
  const blip = useCallback(
    (freq: number, duration: number, type: OscillatorType, gainPeak: number, when = 0) => {
      const ctx = getCtx();
      if (!ctx) return;
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    },
    [getCtx]
  );

  const playSolved = useCallback(() => {
    blip(520, 0.09, 'triangle', 0.08);
    blip(880, 0.12, 'triangle', 0.07, 0.07);
  }, [blip]);

  const playComplete = useCallback(() => {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      blip(freq, 0.35, 'sine', 0.06, i * 0.09)
    );
  }, [blip]);

  const startDecodingLoop = useCallback((): (() => void) => {
    const ctx = getCtx();
    if (!ctx) return () => undefined;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const freq = 300 + Math.random() * 900;
      blip(freq, 0.045, 'square', 0.025);
    };
    const interval = window.setInterval(tick, 55); // matches the glitch-text redraw rate
    tick();
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [blip, getCtx]);

  return { startDecodingLoop, playSolved, playComplete };
}
