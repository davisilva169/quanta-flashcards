import type { SpeechSettings } from './speech';
import type { ShortcutMap } from '@/utils/shortcuts';
import type { FocusSettings } from './focus';
import type { NotificationSettings } from './notifications';

export interface UserStats {
  id: 'singleton';
  xp: number;
  totalReviews: number;
  streakDays: number;
  longestStreak: number;
  lastStudyDate: string | null; // 'YYYY-MM-DD'
  bonusFlags: {
    completedToday: string | null;
    streakWeeklyAt: number;
  };
  /**
   * Last time this singleton was written. Optional for backward compat —
   * preparation for future cloud sync (so a sync engine can resolve
   * conflicts by recency). Not currently consumed at runtime.
   */
  updatedAt?: number;
}

export type ThemeMode = 'dark' | 'light' | 'system';

/**
 * Tunable parameters for the scheduler. Mirrors Anki's deck options at a
 * smaller surface — the values you actually feel in day-to-day study.
 *
 * "Day rollover" is the hour at which Anki considers the next study day to
 * begin. With rolloverHour = 4, a review session at 2 AM is still part of
 * the previous study day; a review at 5 AM is part of the new one. This is
 * the knob that fixes "I came back the next morning and nothing was due".
 */
export interface SchedulerConfig {
  /** Hour 0–23 at which the next study day begins. Default 4. */
  rolloverHour: number;
  /** Ease factor applied to a freshly-graduated card. Default 2.5. */
  startingEase: number;
  /** Days of interval when "Bom" graduates a new card. Default 1. */
  graduatingInterval: number;
  /** Days of interval when "Fácil" graduates a new card. Default 4. */
  easyInterval: number;
  /** Multiplier applied when "Difícil" is pressed on a review card. Default 1.2. */
  hardFactor: number;
  /** Bonus multiplier when "Fácil" is pressed on a review card. Default 1.3. */
  easyBonus: number;
  /** Minutes before a lapsed card is shown again (relearning). Default 10. */
  lapseMinutes: number;
  /** Maximum interval cap, in days. Default 365. */
  maxInterval: number;
}

/**
 * Font/LaTeX scale used during reviews. Affects both the classic flow and
 * Rush. Stored as a discrete preset (not a continuous slider) so the
 * mapping to concrete CSS values stays predictable across the app.
 */
export type ReviewFontScale = 'sm' | 'md' | 'lg' | 'xl';

export interface Settings {
  id: 'singleton';
  userName: string;
  theme: ThemeMode;
  motivationalEnabled: boolean;
  dailyGoal: number;
  scheduler: SchedulerConfig;
  /**
   * Optional. New in v0.3-prep — older settings rows backfill this to 'lg'
   * in `ensureInitialized`. Consumed by `InteractiveCardBody`.
   */
  reviewFontScale?: ReviewFontScale;
  /**
   * User-defined card categories. Appended to the preset list in the
   * editor. Stored as plain strings (the name *is* the value used on
   * `Flashcard.type`). Future enhancements (colors, ordering) can promote
   * this to objects — see ROADMAP.md.
   */
  customCategories?: string[];
  /**
   * Preset category keys that the user has hidden from the editor. Cards
   * already using these keys keep rendering with their original label
   * (preset labels live in CARD_TYPE_LABELS), but they don't appear as
   * options when creating/editing cards. The empty "Sem categoria"
   * sentinel can NEVER be hidden — that would break cards whose category
   * was deleted (and whose `type` is empty).
   */
  hiddenPresetCategories?: string[];
  /**
   * Global narration preferences (voice, rate, master kill-switch, etc).
   * Optional — backfilled to defaults by `ensureInitialized` so settings
   * rows that predate this feature keep working. Per-card narration text
   * lives on `Flashcard.speech`, not here.
   */
  speech?: SpeechSettings;
  /**
   * User-remappable keyboard shortcuts for review / rush. Optional —
   * `resolveShortcuts()` fills in defaults for any missing key, so
   * consumers always get a complete map. `ensureInitialized` backfills
   * the field for settings rows that predate this feature.
   */
  shortcuts?: ShortcutMap;
  /**
   * Sessão de foco (Pomodoro-like) — durações default, pool de recompensas
   * saudáveis personalizável, e o toggle de exibição de sugestão. Backfilled
   * pelo `ensureInitialized` com o pool padrão e durações clássicas.
   */
  focus?: FocusSettings;
  /**
   * Notificações no renderer (Chromium do Electron). Master switch,
   * lembrete de baralho pronto, frequência mínima, janela silenciosa.
   * Limitação: só dispara enquanto o app está aberto.
   */
  notifications?: NotificationSettings;
  /** See UserStats.updatedAt — same rationale, same caveat. */
  updatedAt?: number;
}
