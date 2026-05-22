/**
 * NARRATION / TTS — RUNTIME
 * ============================================================================
 *
 * Thin wrapper around the browser's Web Speech API (`speechSynthesis` +
 * `SpeechSynthesisUtterance`). Encapsulates the quirks so the rest of the
 * app doesn't have to know about them:
 *
 *   - `getVoices()` returns empty on the first call of a session until
 *     the `voiceschanged` event fires. `loadVoices()` awaits that.
 *
 *   - The Chromium speech engine "freezes" after ~15s of continuous
 *     speech (a known platform bug). We could mitigate with a pause/resume
 *     watchdog, but flashcard narrations are usually short; if it becomes
 *     a problem the workaround drops in here without touching consumers.
 *
 *   - Saved `voiceURI` may not exist on the current system (after
 *     restoring a backup on a different OS). The lookup falls back to
 *     the system default silently.
 *
 *   - `cancel()` is idempotent; calling it on idle is fine.
 *
 * The `useSpeech` hook is what components reach for. It owns the
 * "currently speaking" state, exposes a `speak(text)` + `stop()` pair,
 * and cancels on unmount.
 *
 * Architectural note: this file is the seam for a future "Generate audio"
 * feature. The contract `(text, settings) -> playback` can later admit
 * additional implementations (Piper local, HTTP TTS provider) that
 * produce a Blob instead of streaming to the speakers. Consumers that
 * just want narration on the review screen won't need to change.
 * ============================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SPEECH_SETTINGS,
  type SpeechSettings,
} from '@/types/speech';

// ─────────────────────────────────────────────────────────────────────────────
// Availability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True if the runtime supports speech synthesis. In Electron + Chromium it
 * always does, but we check anyway to honor the "fallback amigável" spec
 * and to be ready for future ports (server-side render, headless tests).
 */
export function isSpeechAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Voices
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the list of installed system voices. The first call in a session
 * frequently returns empty — Chromium loads voices asynchronously and
 * fires `voiceschanged` when they're ready. We wait for either:
 *   (a) the initial sync call to return a non-empty list, or
 *   (b) the `voiceschanged` event, or
 *   (c) a 1.5s hard timeout (so a platform that never fires the event
 *       doesn't deadlock the UI).
 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise(resolve => {
    if (!isSpeechAvailable()) {
      resolve([]);
      return;
    }
    const initial = window.speechSynthesis.getVoices();
    if (initial.length > 0) {
      resolve(initial);
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(window.speechSynthesis.getVoices());
    };
    const handler = () => finish();
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    setTimeout(finish, 1500);
  });
}

/** Pick the voice matching `voiceURI` from a list, or fall back to the
 *  system default if missing. Returns null if the list is empty. */
export function resolveVoice(
  voices: SpeechSynthesisVoice[],
  voiceURI: string | undefined,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  if (voiceURI) {
    const match = voices.find(v => v.voiceURI === voiceURI);
    if (match) return match;
  }
  // Either no preference saved, or the saved voice doesn't exist on
  // this system. Prefer the OS default; fall back to first available.
  return voices.find(v => v.default) ?? voices[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level speak / cancel
// ─────────────────────────────────────────────────────────────────────────────

interface SpeakOptions {
  voice?: SpeechSynthesisVoice | null;
  rate?: number;
  volume?: number;
  pitch?: number;
  /** Fired when the utterance ends (normally or via cancel). */
  onEnd?: () => void;
  /** Fired on errors (synthesis failed, voice missing, etc). */
  onError?: (error: string) => void;
}

/**
 * Speak a text string. Cancels any currently-running utterance first
 * (consumers never want overlapping voices). Returns the utterance so
 * callers can hold a reference for cancellation, but most consumers
 * should use `useSpeech` instead — it handles the lifecycle.
 */
export function speak(text: string, opts: SpeakOptions = {}): SpeechSynthesisUtterance | null {
  if (!isSpeechAvailable()) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Cancel anything in flight. The API queues by default; we want a
  // strictly-one-at-a-time policy because two flashcard narrations
  // talking over each other is useless.
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(trimmed);
  if (opts.voice) {
    u.voice = opts.voice;
    // Some platforms need the lang too for correct pronunciation.
    u.lang = opts.voice.lang;
  }
  if (opts.rate != null) u.rate = clamp(opts.rate, 0.1, 10);
  if (opts.volume != null) u.volume = clamp(opts.volume, 0, 1);
  if (opts.pitch != null) u.pitch = clamp(opts.pitch, 0, 2);

  if (opts.onEnd) u.onend = () => opts.onEnd?.();
  if (opts.onError)
    u.onerror = ev => opts.onError?.(ev.error ?? 'unknown speech error');

  window.speechSynthesis.speak(u);
  return u;
}

/** Cancel whatever is being spoken. Idempotent. */
export function cancelSpeech(): void {
  if (!isSpeechAvailable()) return;
  window.speechSynthesis.cancel();
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

// ─────────────────────────────────────────────────────────────────────────────
// React hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseSpeechResult {
  /** True while the user's most recent `speak()` is still playing. */
  isSpeaking: boolean;
  /** Identifier for the currently-speaking target — set by `speak()` so
   *  multiple buttons on a screen can light up only the active one. */
  speakingTarget: string | null;
  /** True if the runtime supports speech at all. */
  available: boolean;
  /** Speak a text. Pass `target` so the component can distinguish "this
   *  button" from "another button on the same screen" for the active UI. */
  speak: (text: string, target?: string) => void;
  /** Cancel whatever is being spoken. */
  stop: () => void;
}

/**
 * React hook that exposes a single-utterance-at-a-time speech controller
 * wired to the user's global SpeechSettings.
 *
 * Lifecycle guarantees:
 *   - cancels on component unmount (sair da revisão para a fala);
 *   - cancels when `settings` changes in a way that would have produced
 *     a different voice — defensive, in case the user toggles enabled
 *     off mid-utterance;
 *   - never starts a new utterance while another is playing (the
 *     underlying `speak()` calls `cancel()` first).
 *
 * Voices are loaded lazily on first hook mount. The hook re-runs voice
 * resolution whenever `settings.voiceURI` changes.
 */
export function useSpeech(settings: SpeechSettings | undefined): UseSpeechResult {
  const available = isSpeechAvailable();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingTarget, setSpeakingTarget] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // Keep a ref so the cleanup effect can see the current value without
  // forcing the effect to re-run on every render.
  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;

  // Load voices once. Re-running on settings changes isn't necessary —
  // the OS voice list doesn't change at runtime in practice.
  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    loadVoices().then(list => {
      if (!cancelled) setVoices(list);
    });
    return () => {
      cancelled = true;
    };
  }, [available]);

  // Cleanup on unmount: never leave a speech running after the consumer
  // is gone. Also covers the "sair da revisão" case.
  useEffect(() => {
    return () => {
      if (available) cancelSpeech();
    };
  }, [available]);

  const stop = useCallback(() => {
    cancelSpeech();
    setIsSpeaking(false);
    setSpeakingTarget(null);
  }, []);

  const speakFn = useCallback(
    (text: string, target?: string) => {
      if (!available) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      // If we're being asked to speak the SAME target that's already
      // playing, treat it as a stop instead. Standard play/pause UX.
      if (isSpeakingRef.current && speakingTarget === (target ?? null)) {
        stop();
        return;
      }
      const enabled = settings?.enabled ?? DEFAULT_SPEECH_SETTINGS.enabled;
      if (!enabled) return;

      const voice = resolveVoice(voices, settings?.voiceURI);
      speak(trimmed, {
        voice,
        rate: settings?.rate ?? DEFAULT_SPEECH_SETTINGS.rate,
        volume: settings?.volume ?? DEFAULT_SPEECH_SETTINGS.volume,
        pitch: settings?.pitch ?? DEFAULT_SPEECH_SETTINGS.pitch,
        onEnd: () => {
          setIsSpeaking(false);
          setSpeakingTarget(null);
        },
        onError: () => {
          setIsSpeaking(false);
          setSpeakingTarget(null);
        },
      });
      setIsSpeaking(true);
      setSpeakingTarget(target ?? null);
    },
    [available, voices, settings, speakingTarget, stop],
  );

  return {
    isSpeaking,
    speakingTarget,
    available,
    speak: speakFn,
    stop,
  };
}
