import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Text-to-speech for Athena's replies via browser SpeechSynthesis.
 *
 * Requirements:
 *   - ON by default.
 *   - Toggleable with one control; preference persisted to localStorage.
 *   - If SpeechSynthesis is unavailable, isSupported === false (caller hides
 *     the control). speak() is a no-op so chat is never blocked by TTS.
 */

const STORAGE_KEY = 'guardian_tts_enabled';

function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// Known female voice names across platforms (Windows / macOS / Chrome / Android).
// Athena reads as female, so we prefer these, then any voice flagged "female",
// then any English voice, then the system default.
const FEMALE_VOICE_NAMES = [
  'samantha',
  'victoria',
  'karen',
  'moira',
  'tessa',
  'fiona',
  'serena',
  'allison',
  'ava',
  'susan',
  'zira', // Microsoft Zira
  'aria', // Microsoft Aria
  'jenny', // Microsoft Jenny
  'michelle',
  'google us english', // Chrome default en-US reads female
  'google uk english female',
];

/** Choose the best available female English voice. */
function pickFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const byName = (v: SpeechSynthesisVoice) => v.name.toLowerCase();

  const named = voices.find((v) =>
    FEMALE_VOICE_NAMES.some((n) => byName(v).includes(n))
  );
  if (named) return named;

  const flaggedFemale = voices.find((v) => byName(v).includes('female'));
  if (flaggedFemale) return flaggedFemale;

  const english = voices.find((v) => v.lang?.toLowerCase().startsWith('en'));
  return english ?? null;
}

export interface Speech {
  isSupported: boolean;
  enabled: boolean;
  toggle: () => void;
  speak: (text: string) => void;
  cancel: () => void;
}

export function useSpeech(): Speech {
  const [isSupported] = useState(ttsSupported);
  const [enabled, setEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true'; // default ON
  });
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Athena's voice. Voices populate asynchronously, so resolve on mount and
  // again whenever the list changes.
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (!isSupported) return;
    const resolve = () => {
      voiceRef.current = pickFemaleVoice(window.speechSynthesis.getVoices());
    };
    resolve();
    window.speechSynthesis.addEventListener('voiceschanged', resolve);
    return () =>
      window.speechSynthesis.removeEventListener('voiceschanged', resolve);
  }, [isSupported]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    if (!enabled && isSupported) window.speechSynthesis.cancel();
  }, [enabled, isSupported]);

  const cancel = useCallback(() => {
    if (isSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
  }, [isSupported]);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !enabledRef.current || !text?.trim()) return;
      try {
        const synth = window.speechSynthesis;
        synth.cancel(); // interrupt any in-progress utterance
        const utter = new SpeechSynthesisUtterance(text);
        if (voiceRef.current) {
          utter.voice = voiceRef.current;
          utter.lang = voiceRef.current.lang;
        }
        utter.rate = 1;
        utter.pitch = 1.05; // a touch brighter
        synth.speak(utter);
      } catch (err) {
        // Never let TTS failures break the chat flow.
        console.warn('useSpeech: speak failed', err);
      }
    },
    [isSupported]
  );

  const toggle = useCallback(() => setEnabled((v) => !v), []);

  return { isSupported, enabled, toggle, speak, cancel };
}
