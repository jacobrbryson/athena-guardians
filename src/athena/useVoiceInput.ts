import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Click-on / click-off speech-to-text via the Web Speech API.
 *
 * Differs from the marketing app's hold-to-talk: here `toggle()` starts
 * listening on the first click and stops on the next. Unsupported browsers are
 * handled gracefully (isSupported === false, controls hidden by the caller).
 */

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface VoiceInput {
  isSupported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  /** Toggle listening on/off. Final transcripts are delivered to `onResult`. */
  toggle: () => void;
  stop: () => void;
}

export function useVoiceInput(onResult: (text: string) => void): VoiceInput {
  const [isSupported] = useState(() => getCtor() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setError('Voice input is not supported in this browser.');
      return;
    }
    setError(null);
    setInterim('');

    const recognition = new Ctor();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interimText = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        onResultRef.current(finalText.trim());
        setInterim('');
      }
    };

    recognition.onerror = (event: any) => {
      const map: Record<string, string> = {
        'not-allowed': 'Microphone access was blocked.',
        'no-speech': "I didn't catch that — try again.",
        'audio-capture': 'No microphone was found.',
        network: 'Network error during voice recognition.',
      };
      setError(map[event.error] || 'Voice input error.');
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch (err) {
      console.error('useVoiceInput: start failed', err);
      setError('Could not start voice input.');
      setListening(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Clean up on unmount.
  useEffect(() => () => stop(), [stop]);

  return { isSupported, listening, interim, error, toggle, stop };
}
