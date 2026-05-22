/**
 * NARRATION / TTS — TYPES
 * ============================================================================
 *
 * The "narration" feature is opt-in per card. The same way `interaction?` is
 * optional inline on the Flashcard, `speech?` is too. A card with no
 * configured narration has `speech === undefined` — the renderer treats
 * that as "show nothing", and the DB stays uncluttered.
 *
 * This file holds two record shapes:
 *
 *   CardSpeech       — what each card carries (text + per-side toggles).
 *   SpeechSettings   — global preferences kept on the Settings singleton
 *                      (voice, rate, pitch, volume, master kill-switch).
 *
 * Plus their defaults, used both by the DB initializer and by the UI when
 * a card or settings row predates the feature.
 *
 * Forward-compatibility note: a future "Generate audio" feature will reuse
 * `CardSpeech.frontText` / `backText` as the source string and produce an
 * Attachment alongside the card. That's why the text is plain (no Markdown)
 * — keeps the same string usable as the input to whatever provider we plug
 * in later, without re-parsing or stripping. No code is written for that
 * here.
 * ============================================================================
 */

/** Per-card narration record. Every field is optional so partial states
 *  (toggle on, text not yet typed) are representable. */
export interface CardSpeech {
  /** When true AND `frontText` is non-empty, the review shows a "Ouvir
   *  frente" button. False/undefined means no button on the front. */
  frontEnabled?: boolean;
  backEnabled?: boolean;
  /** Plain text. The user writes the pronounced form of any equation /
   *  abbreviation, NOT the Markdown/LaTeX source. */
  frontText?: string;
  backText?: string;
}

/** Hard limit per side. 2000 chars is more than enough for a flashcard
 *  narration; well under the practical Chromium speechSynthesis budget. */
export const MAX_SPEECH_CHARS = 2000;

/** Global preferences stored on the Settings singleton. */
export interface SpeechSettings {
  /** Master kill-switch. When false, NO narration button appears anywhere
   *  in the app, even on cards with `speech` configured. Default true. */
  enabled?: boolean;
  /** The user's chosen voice, identified by its `SpeechSynthesisVoice.voiceURI`.
   *  This is stable across sessions on the same machine. If the saved URI
   *  doesn't match any installed voice (e.g. after restoring a backup on a
   *  different OS), the runtime falls back to the system default voice. */
  voiceURI?: string;
  /** Playback speed. Web Speech API range is 0.1..10 but practical range
   *  is 0.5..2.0 (faster than 2 is unintelligible, slower than 0.5 is
   *  comical). Default 1.0. */
  rate?: number;
  /** 0.0..1.0. Default 1.0. */
  volume?: number;
  /** 0.0..2.0. Default 1.0. */
  pitch?: number;
  /** Optional BCP-47 tag like 'pt-BR' or 'en-US'. Used in the Settings UI
   *  to filter the voice dropdown to a relevant subset; doesn't constrain
   *  the saved voice itself. Default undefined (show all voices). */
  preferredLang?: string;
}

/** Defaults applied when no `speech` is on Settings, OR when individual
 *  fields are missing (`settings.speech.rate ?? DEFAULT_SPEECH_SETTINGS.rate`). */
export const DEFAULT_SPEECH_SETTINGS: Required<
  Omit<SpeechSettings, 'voiceURI' | 'preferredLang'>
> &
  Pick<SpeechSettings, 'voiceURI' | 'preferredLang'> = {
  enabled: true,
  rate: 1.0,
  volume: 1.0,
  pitch: 1.0,
  voiceURI: undefined,
  preferredLang: undefined,
};

/** Slider bounds used by the Settings UI. Keep these here so the editor
 *  and validation share the same source of truth. */
export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 2.0;
export const SPEECH_VOLUME_MIN = 0.0;
export const SPEECH_VOLUME_MAX = 1.0;
export const SPEECH_PITCH_MIN = 0.0;
export const SPEECH_PITCH_MAX = 2.0;

/** Sample sentence the Settings UI speaks when the user clicks "Testar voz". */
export const SPEECH_SAMPLE_TEXT =
  'Olá, sou a voz selecionada para narração dos cartões.';
