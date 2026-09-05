/**
 * Saying what you are looking for.
 *
 * A six-year-old can say `лав` long before they can spell it, so the search box
 * has a microphone in front of it. This is the browser's own speech
 * recognition — no key, no upload of ours, nothing added to the image — behind
 * a hook small enough that the component using it does not have to know about
 * any of the vendor-prefixed history below.
 *
 * Two things worth being straight about:
 *
 * **It is not local.** In Chrome and Safari the audio goes to the browser
 * vendor's own transcription service. That is a real thing to have happen in a
 * children's app, so it never starts on its own: it starts on a press, it stops
 * the moment a sentence finishes, and the typed box beside it does the same job
 * for anyone who would rather not.
 *
 * **It is not everywhere.** Firefox has no implementation at all. So `supported`
 * is part of the interface rather than an afterthought, and the component keeps
 * the text field visible whatever the answer is — the microphone is the quick
 * way in, never the only one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '@album/shared';
import { speechLang } from '@album/shared';

/**
 * The slice of the Web Speech API this uses. Declared here because it is not in
 * every TypeScript DOM library, and because a smaller surface is easier to see
 * the whole of than the real one.
 */
interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechEvent {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechResult };
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionClass = new () => Recognition;

const recognitionClass = (): RecognitionClass | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export interface Voice {
  /** False in Firefox, and anywhere else without an implementation. */
  supported: boolean;
  listening: boolean;
  /** What is being heard right now, before the sentence is finished. */
  heard: string;
  /** One of `denied`, `nothing`, `failed` — the component picks the words. */
  error: string | null;
  start(): void;
  stop(): void;
}

/** `onHeard` fires once, with the finished sentence. */
export function useVoice(lang: Lang, onHeard: (text: string) => void): Voice {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);

  // Held in a ref so a fresh closure on every render does not mean tearing down
  // and rebuilding the recogniser mid-sentence.
  const handler = useRef(onHeard);
  handler.current = onHeard;

  const supported = recognitionClass() !== null;

  useEffect(() => {
    const Recogniser = recognitionClass();
    if (!Recogniser) return;

    const engine = new Recogniser();
    engine.lang = speechLang(lang);
    // One sentence, then stop: a child says `лав`, not a paragraph, and a
    // microphone that stays open in a room full of children is a bad idea.
    engine.continuous = false;
    engine.interimResults = true;
    engine.maxAlternatives = 1;

    engine.onresult = (event) => {
      let sentence = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        sentence += result[0].transcript;
        if (result.isFinal) {
          setHeard('');
          handler.current(sentence.trim());
          return;
        }
      }
      setHeard(sentence);
    };

    engine.onerror = (event) => {
      setError(event.error === 'not-allowed' ? 'denied' : event.error === 'no-speech' ? 'nothing' : 'failed');
      setListening(false);
    };

    engine.onend = () => {
      setListening(false);
      setHeard('');
    };

    recognition.current = engine;
    return () => {
      engine.onresult = null;
      engine.onerror = null;
      engine.onend = null;
      engine.abort();
      recognition.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!recognition.current) return;
    setError(null);
    setHeard('');
    try {
      recognition.current.start();
      setListening(true);
    } catch {
      // Already listening. Pressing the microphone twice is not an error worth
      // showing a child.
    }
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, heard, error, start, stop };
}
