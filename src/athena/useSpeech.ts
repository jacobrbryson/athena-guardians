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
  'emma',
  'susan',
  'zira', // Microsoft Zira
  'aria', // Microsoft Aria
  'jenny', // Microsoft Jenny
  'michelle',
  'google us english', // Chrome default en-US reads female
  'google uk english female',
];

// Markers that identify high-quality neural voices, which sound far less
// robotic than the legacy built-ins. On Windows the modern female voices are
// named e.g. "Microsoft Aria Online (Natural) - English (United States)".
const NATURAL_MARKERS = ['natural', 'online', 'neural'];

/** Choose the best available female English voice, preferring neural voices. */
function pickFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const byName = (v: SpeechSynthesisVoice) => v.name.toLowerCase();
  const isFemaleNamed = (v: SpeechSynthesisVoice) =>
    FEMALE_VOICE_NAMES.some((n) => byName(v).includes(n));
  const isNatural = (v: SpeechSynthesisVoice) =>
    NATURAL_MARKERS.some((m) => byName(v).includes(m));

  // 1. A known female voice that is also a neural/"Natural" voice — best of both.
  const naturalFemale = voices.find((v) => isFemaleNamed(v) && isNatural(v));
  if (naturalFemale) return naturalFemale;

  // 2. Any neural/"Natural" English voice (may be male, but sounds human).
  const naturalEnglish = voices.find(
    (v) => isNatural(v) && v.lang?.toLowerCase().startsWith('en')
  );
  if (naturalEnglish) return naturalEnglish;

  // 3. A known female voice name.
  const named = voices.find(isFemaleNamed);
  if (named) return named;

  // 4. Any voice flagged female, then any English voice.
  const flaggedFemale = voices.find((v) => byName(v).includes('female'));
  if (flaggedFemale) return flaggedFemale;

  const english = voices.find((v) => v.lang?.toLowerCase().startsWith('en'));
  return english ?? null;
}

export interface Speech {
  isSupported: boolean;
  enabled: boolean;
  toggle: () => void;
  /**
   * Speak `text`. The optional `onEnd` callback fires when the utterance
   * finishes — and also immediately when TTS is unsupported/disabled or the
   * text is empty — so callers can sequence follow-up steps (e.g. asking a
   * question after a greeting) regardless of whether voice is actually on.
   */
  speak: (text: string, onEnd?: () => void) => void;
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
    (text: string, onEnd?: () => void) => {
      // Fire onEnd at most once, even if both onend and onerror arrive.
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try {
          onEnd?.();
        } catch (err) {
          console.warn('useSpeech: onEnd failed', err);
        }
      };

      if (!isSupported || !enabledRef.current || !text?.trim()) {
        finish();
        return;
      }
      try {
        const synth = window.speechSynthesis;
        synth.cancel(); // interrupt any in-progress utterance
        const utter = new SpeechSynthesisUtterance(text);
        if (voiceRef.current) {
          utter.voice = voiceRef.current;
          utter.lang = voiceRef.current.lang;
        }
        utter.rate = 1.35; // noticeably faster than default for a more natural pace
        utter.pitch = 1.05; // a touch brighter
        // Chrome fires onend before the audio buffer finishes draining.
        // Poll speaking until truly silent so the next speak() call's
        // synth.cancel() doesn't cut off the tail of this utterance.
        utter.onend = () => {
          const waitForSilence = () => {
            if (window.speechSynthesis.speaking) {
              window.setTimeout(waitForSilence, 50);
            } else {
              finish();
            }
          };
          waitForSilence();
        };
        utter.onerror = finish;
        synth.speak(utter);
      } catch (err) {
        // Never let TTS failures break the chat flow.
        console.warn('useSpeech: speak failed', err);
        finish();
      }
    },
    [isSupported]
  );

  const toggle = useCallback(() => setEnabled((v) => !v), []);

  return { isSupported, enabled, toggle, speak, cancel };
}
