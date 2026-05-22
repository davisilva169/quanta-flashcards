import { useEffect, useState, type FormEvent } from 'react';
import { Check, X, Volume2, Square } from 'lucide-react';
import { LatexMarkdown } from './LatexMarkdown';
import {
  getInteraction,
  type CardInteraction,
  type Flashcard,
} from '@/types/flashcard';
import type { ReviewFontScale, Settings } from '@/types/stats';
import type { Attachment } from '@/types/attachment';
import { cancelSpeech, useSpeech } from '@/utils/speech';
import {
  DEFAULT_SHORTCUTS,
  formatShortcut,
  matchShortcut,
} from '@/utils/shortcuts';
import {
  parseClozeAll,
  renderClozeForReview,
  checkClozeAnswer,
} from '@/utils/cloze';

/**
 * Renders the body of a card during review, including any interactive
 * widget for multiple-choice / cloze / V/F.
 *
 * Two phases:
 *   - `phase === 'pending'`: front is shown plus the interactive widget.
 *     User input triggers `onSubmit(correct, userAnswer)`. For classic
 *     cards there is no widget, so the parent must call `onSubmit(true)`
 *     externally (typically via a "Mostrar resposta" button).
 *   - `phase === 'graded'`: shows the user's answer, correctness, the
 *     correct answer, and the optional `back` explanation.
 *
 * The widget is intentionally self-contained — managing its own input
 * state — but reports up via `onSubmit` so the parent owns the global
 * flow (rating, queue advancement, scoring).
 *
 * The `fontScale` prop (defaults to `'lg'`) controls the visual size of
 * both prose and LaTeX inside the card. Mapped to CSS variables via the
 * `.review-scale-*` classes defined in `src/styles/index.css`.
 *
 * Theming: all surfaces and borders use semantic tokens; success/danger
 * tones for correctness use the `success-*` and `danger-*` token families
 * so the card looks right in both light and dark themes.
 *
 * Attachments: passed through to every nested LatexMarkdown so `![[att_id]]`
 * markers resolve consistently in front, back, cloze blanks, and graded
 * answer reveals. The `onImageClick` callback is forwarded so all images
 * in the card open the same lightbox.
 */

export type CardPhase = 'pending' | 'graded';

interface CardBodyProps {
  card: Flashcard;
  phase: CardPhase;
  /** What the user entered/picked. Set by the parent after onSubmit. */
  userAnswer?: string;
  wasCorrect?: boolean;
  /** Called when the user finishes the interaction. */
  onSubmit?: (correct: boolean, userAnswer: string) => void;
  /** Disables the widget (used during transitions). */
  disabled?: boolean;
  /** Visual scale for body text and LaTeX. Defaults to 'lg'. */
  fontScale?: ReviewFontScale;
  /** Attachments belonging to this card. Optional; cards without images work as before. */
  attachments?: Attachment[];
  /** Click handler for any image rendered in this card body. */
  onImageClick?: (att: Attachment) => void;
  /**
   * Global narration preferences. When omitted, no narration buttons are
   * shown regardless of the card's `speech` field. Passing the settings
   * here keeps the review screen's `useSpeech` hook and this component
   * sharing a single voice/rate/pitch context.
   */
  speechSettings?: Settings['speech'];
  /**
   * The remappable key used to play/stop the narration. Defaults to 'r'
   * (DEFAULT_SHORTCUTS.toggleNarration). The Review page passes the
   * user's configured value; other call sites can rely on the default.
   */
  narrationKey?: string;
  /**
   * Para cartões cloze multi-key: indica QUAL chave (`c1`, `c2`, …) está
   * sendo revisada nesta passagem. As outras chaves aparecem em texto
   * puro como contexto (Anki-style). Default `'c1'` mantém compat com
   * todos os call sites que não fazem ideia de cloze multi-key (Rush,
   * preview do editor, etc.) — cartões com apenas `c1` comportam-se
   * exatamente como antes.
   */
  activeClozeKey?: string;
}

export function InteractiveCardBody({
  card,
  phase,
  userAnswer,
  wasCorrect,
  onSubmit,
  disabled,
  fontScale = 'lg',
  attachments,
  onImageClick,
  speechSettings,
  narrationKey = DEFAULT_SHORTCUTS.toggleNarration,
  activeClozeKey = 'c1',
}: CardBodyProps) {
  const interaction = getInteraction(card);
  const speechCtl = useSpeech(speechSettings);

  // Cancel any in-flight narration when the visible card changes. The body
  // stays mounted across cards in ReviewPage (only the `card` prop swaps),
  // so the hook's own unmount-cleanup doesn't fire on advance. Without
  // this, the front narration of card N would keep playing while card N+1
  // is on screen.
  useEffect(() => {
    cancelSpeech();
    // We intentionally don't depend on `speechCtl.stop` here — that
    // callback rebinds every render and would re-trigger the cancel.
    // Using the raw `cancelSpeech` keeps the dependency to `card.id`.
  }, [card.id]);

  // Per-side narration availability: requires the global kill-switch ON,
  // the API present, the card-level toggle ON, and a non-empty text. Any
  // missing condition = no button. This is the single source of truth —
  // changes to the rule live here.
  const narrationEnabledGlobally =
    (speechSettings?.enabled ?? true) && speechCtl.available;
  const frontNarrationReady =
    narrationEnabledGlobally &&
    !!card.speech?.frontEnabled &&
    !!card.speech?.frontText &&
    card.speech.frontText.trim().length > 0;
  const backNarrationReady =
    narrationEnabledGlobally &&
    !!card.speech?.backEnabled &&
    !!card.speech?.backText &&
    card.speech.backText.trim().length > 0;

  /**
   * Keyboard shortcut: `R` toggles narration on the current side.
   *
   * Logic:
   *   - If something is already being spoken, R stops it.
   *   - Otherwise, in `pending` phase R speaks the front (if configured).
   *   - In `graded` phase R speaks the back (if configured).
   *   - If the relevant side isn't configured, R is a no-op (no surprise
   *     fallback playback).
   *
   * Skipped when the focus is in a textarea / input — typing `r` in the
   * cloze answer field shouldn't trigger narration. Also skipped when any
   * modifier is held, to avoid stomping on browser shortcuts.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!matchShortcut(e, narrationKey)) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (speechCtl.isSpeaking) {
        e.preventDefault();
        speechCtl.stop();
        return;
      }
      if (phase === 'pending' && frontNarrationReady) {
        e.preventDefault();
        speechCtl.speak(card.speech!.frontText!, 'front');
      } else if (phase === 'graded' && backNarrationReady) {
        e.preventDefault();
        speechCtl.speak(card.speech!.backText!, 'back');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    phase,
    frontNarrationReady,
    backNarrationReady,
    speechCtl,
    card.speech,
    narrationKey,
  ]);

  // Front is rendered differently for cloze: the markers become blanks
  // while pending, and the original text fills back in once graded.
  const frontNode =
    interaction.kind === 'cloze' ? (
      <ClozeFront
        content={card.front}
        phase={phase}
        attachments={attachments}
        onImageClick={onImageClick}
        activeClozeKey={activeClozeKey}
      />
    ) : (
      <LatexMarkdown
        content={card.front}
        attachments={attachments}
        onImageClick={onImageClick}
      />
    );

  return (
    <div className={`review-scaled review-scale-${fontScale} space-y-5`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-widest text-muted">
          {phase === 'pending'
            ? interaction.kind === 'cloze'
              ? 'Preencha a lacuna'
              : interaction.kind === 'true_false'
              ? 'Afirmação'
              : interaction.kind === 'multiple_choice'
              ? 'Pergunta'
              : 'Pergunta'
            : 'Resultado'}
        </div>

        {/* "Ouvir frente" — opt-in narration, visible only when this card
            has frontEnabled+frontText AND the global kill-switch is on AND
            speechSynthesis is available. The button is a toggle: click
            again (or click anywhere else that calls `speechCtl.stop`)
            cancels the playback. We pass a `target` so multiple speech
            buttons on the same screen can highlight independently. */}
        {frontNarrationReady && (
          <NarrationButton
            label="Ouvir frente"
            keyHint={formatShortcut(narrationKey)}
            isSpeaking={
              speechCtl.isSpeaking && speechCtl.speakingTarget === 'front'
            }
            onClick={() =>
              speechCtl.speak(card.speech!.frontText!, 'front')
            }
          />
        )}
      </div>

      <div className="leading-relaxed">{frontNode}</div>

      {phase === 'pending' && (
        <InteractionWidget
          interaction={interaction}
          card={card}
          disabled={disabled}
          onSubmit={onSubmit}
          attachments={attachments}
          onImageClick={onImageClick}
          activeClozeKey={activeClozeKey}
        />
      )}

      {phase === 'graded' && (
        <GradedView
          card={card}
          interaction={interaction}
          userAnswer={userAnswer}
          wasCorrect={wasCorrect}
          attachments={attachments}
          onImageClick={onImageClick}
          activeClozeKey={activeClozeKey}
          backNarration={
            backNarrationReady
              ? {
                  text: card.speech!.backText!,
                  keyHint: formatShortcut(narrationKey),
                  isSpeaking:
                    speechCtl.isSpeaking &&
                    speechCtl.speakingTarget === 'back',
                  onClick: () =>
                    speechCtl.speak(card.speech!.backText!, 'back'),
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NarrationButton — visual control shared by front-side header and the
// graded-view back section. Discreet by design: small chip, no shadow, no
// loud color; the play/stop icon and label flip when speaking.
// ─────────────────────────────────────────────────────────────────────────────

function NarrationButton({
  label,
  isSpeaking,
  onClick,
  keyHint,
}: {
  label: string;
  isSpeaking: boolean;
  onClick: () => void;
  keyHint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        isSpeaking
          ? `Parar narração (tecla ${keyHint})`
          : `Ouvir narração (tecla ${keyHint})`
      }
      aria-label={isSpeaking ? 'Parar narração' : label}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors ${
        isSpeaking
          ? 'bg-accent-soft text-accent-fg'
          : 'text-muted hover:tint-1 hover:text-accent-fg'
      }`}
    >
      {isSpeaking ? <Square size={11} /> : <Volume2 size={11} />}
      {isSpeaking ? 'Parar' : label}
      <kbd className="ml-0.5 rounded border border-divider bg-surface-2 px-1 text-[9px] text-faint">
        {keyHint}
      </kbd>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloze front
// ─────────────────────────────────────────────────────────────────────────────
//
// Quando o cartão tem múltiplas chaves (`c1`, `c2`, …), apenas a chave
// ativa fica oculta como `[ ___ ]`. As outras chaves aparecem em texto
// puro (sem brackets, sem bold), oferecendo contexto sem entregar a
// resposta da chave atual — comportamento Anki-padrão. Quando o usuário
// revela, a chave ativa vira **bold**; o resto continua em texto puro.
//
// Para cartões cloze antigos (1 só `c1`), `activeClozeKey` default `'c1'`
// produz exatamente o mesmo render de antes: marcador único oculto/bold.
function ClozeFront({
  content,
  phase,
  attachments,
  onImageClick,
  activeClozeKey,
}: {
  content: string;
  phase: CardPhase;
  attachments?: Attachment[];
  onImageClick?: (att: Attachment) => void;
  activeClozeKey: string;
}) {
  const all = parseClozeAll(content);
  if (!all.hasCloze) {
    // Fallback: card was authored without proper markers — just render plain.
    return (
      <LatexMarkdown
        content={content}
        attachments={attachments}
        onImageClick={onImageClick}
      />
    );
  }
  const { questionText } = renderClozeForReview(
    content,
    activeClozeKey,
    phase === 'graded',
  );
  return (
    <LatexMarkdown
      content={questionText}
      attachments={attachments}
      onImageClick={onImageClick}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget dispatcher
// ─────────────────────────────────────────────────────────────────────────────
function InteractionWidget({
  interaction,
  card,
  disabled,
  onSubmit,
  attachments,
  onImageClick,
  activeClozeKey,
}: {
  interaction: CardInteraction;
  card: Flashcard;
  disabled?: boolean;
  onSubmit?: (correct: boolean, userAnswer: string) => void;
  attachments?: Attachment[];
  onImageClick?: (att: Attachment) => void;
  activeClozeKey: string;
}) {
  if (interaction.kind === 'classic') return null;
  if (!onSubmit) return null;

  if (interaction.kind === 'multiple_choice') {
    return (
      <MultipleChoiceWidget
        options={interaction.options}
        correctIndex={interaction.correctIndex}
        disabled={disabled}
        onSubmit={onSubmit}
        attachments={attachments}
        onImageClick={onImageClick}
      />
    );
  }
  if (interaction.kind === 'cloze') {
    return (
      <ClozeWidget
        content={card.front}
        activeClozeKey={activeClozeKey}
        disabled={disabled}
        onSubmit={onSubmit}
      />
    );
  }
  if (interaction.kind === 'true_false') {
    return (
      <TrueFalseWidget
        correct={interaction.correct}
        disabled={disabled}
        onSubmit={onSubmit}
      />
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Widgets
// ─────────────────────────────────────────────────────────────────────────────

function MultipleChoiceWidget({
  options,
  correctIndex,
  disabled,
  onSubmit,
  attachments,
  onImageClick,
}: {
  options: string[];
  correctIndex: number;
  disabled?: boolean;
  onSubmit: (correct: boolean, answer: string) => void;
  attachments?: Attachment[];
  onImageClick?: (att: Attachment) => void;
}) {
  return (
    <div className="grid gap-2">
      {options.map((opt, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onSubmit(i === correctIndex, opt)}
          className="group flex items-start gap-3 rounded-lg border border-divider bg-surface-2 p-3 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft disabled:opacity-50"
        >
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-strong text-[11px] font-semibold text-muted group-hover:border-accent group-hover:text-accent-fg">
            {String.fromCharCode(65 + i)}
          </span>
          <div className="flex-1 text-sm">
            <LatexMarkdown
              content={opt}
              attachments={attachments}
              onImageClick={onImageClick}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

function ClozeWidget({
  content,
  activeClozeKey,
  disabled,
  onSubmit,
}: {
  content: string;
  activeClozeKey: string;
  disabled?: boolean;
  onSubmit: (correct: boolean, answer: string) => void;
}) {
  const [value, setValue] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (value.trim().length === 0) return;
    // Compara apenas com a resposta da CHAVE ATIVA. Para o cartão classic
    // com apenas c1 (caso pré-existente), comportamento idêntico ao
    // anterior (a chave default é 'c1').
    const correct = checkClozeAnswer(content, value, activeClozeKey);
    onSubmit(correct, value);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        disabled={disabled}
        autoFocus
        placeholder="Sua resposta..."
        className="flex-1 rounded-lg border border-divider bg-input px-3 py-2.5 text-sm text-primary outline-none focus:border-accent/50"
      />
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        className="rounded-lg bg-accent px-4 py-2 font-medium text-on-accent hover:bg-accent-400 disabled:opacity-50"
      >
        Verificar
      </button>
    </form>
  );
}

function TrueFalseWidget({
  correct,
  disabled,
  onSubmit,
}: {
  correct: boolean;
  disabled?: boolean;
  onSubmit: (correct: boolean, answer: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSubmit(correct === true, 'Verdadeiro')}
        className="rounded-lg border border-divider bg-surface-2 px-4 py-3 text-sm font-medium text-primary hover:border-success/40 hover:bg-success-soft hover:text-success-fg disabled:opacity-50"
      >
        Verdadeiro
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSubmit(correct === false, 'Falso')}
        className="rounded-lg border border-divider bg-surface-2 px-4 py-3 text-sm font-medium text-primary hover:border-danger/40 hover:bg-danger-soft hover:text-danger-fg disabled:opacity-50"
      >
        Falso
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Graded view (post-submit)
// ─────────────────────────────────────────────────────────────────────────────
function GradedView({
  card,
  interaction,
  userAnswer,
  wasCorrect,
  attachments,
  onImageClick,
  activeClozeKey,
  backNarration,
}: {
  card: Flashcard;
  interaction: CardInteraction;
  userAnswer?: string;
  wasCorrect?: boolean;
  attachments?: Attachment[];
  onImageClick?: (att: Attachment) => void;
  /** Chave ativa para cartões cloze multi-key. Para non-cloze e cartões
   *  cloze com 1 só chave (legado), o valor é 'c1' e o comportamento é
   *  idêntico ao anterior. */
  activeClozeKey: string;
  /** When present, a "Ouvir resposta" button renders above the back-side
   *  prose. The parent computes whether to pass it based on the same
   *  rules used for the front-side button. */
  backNarration?: {
    text: string;
    isSpeaking: boolean;
    onClick: () => void;
    keyHint: string;
  };
}) {
  return (
    <div className="space-y-4">
      {wasCorrect !== undefined && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
            wasCorrect
              ? 'border-success/30 bg-success-soft text-success-fg'
              : 'border-danger/30 bg-danger-soft text-danger-fg'
          }`}
        >
          {wasCorrect ? (
            <>
              <Check size={14} /> Correto
            </>
          ) : (
            <>
              <X size={14} /> Errei
            </>
          )}
        </div>
      )}

      {/* Per-kind reveal of the correct answer */}
      {interaction.kind === 'multiple_choice' && (
        <CorrectAnswerBlock
          label="Resposta correta"
          content={interaction.options[interaction.correctIndex]}
          attachments={attachments}
          onImageClick={onImageClick}
        />
      )}
      {interaction.kind === 'cloze' && (
        <CorrectAnswerBlock
          label="Resposta esperada"
          content={
            // Resposta da chave ATIVA (não joined com outras chaves).
            // Para cartões legados com c1 apenas, idêntico a antes:
            // parseClozeAll devolve só c1, filter pega tudo, join unifica.
            parseClozeAll(card.front)
              .matches.filter(m => m.key === activeClozeKey)
              .map(m => m.answer)
              .join(' / ')
          }
          attachments={attachments}
          onImageClick={onImageClick}
        />
      )}
      {interaction.kind === 'true_false' && (
        <CorrectAnswerBlock
          label="Resposta correta"
          content={interaction.correct ? 'Verdadeiro' : 'Falso'}
        />
      )}

      {/* User's submission echoed back when wrong, for self-comparison.
          We DON'T pass attachments here — the user's typed answer can't
          reference attachments, so the markdown is plain. */}
      {wasCorrect === false && userAnswer && (
        <div className="rounded-lg border border-danger/20 bg-danger-soft p-3">
          <div className="text-[10px] uppercase tracking-widest text-danger-fg">
            Sua resposta
          </div>
          <div className="mt-1 text-sm text-primary">
            <LatexMarkdown content={userAnswer} />
          </div>
        </div>
      )}

      {card.back.trim().length > 0 && (
        <>
          <div className="my-2 h-px bg-divider" />
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-widest text-muted">
                {interaction.kind === 'classic' ? 'Resposta' : 'Explicação'}
              </div>
              {backNarration && (
                <NarrationButton
                  label="Ouvir resposta"
                  keyHint={backNarration.keyHint}
                  isSpeaking={backNarration.isSpeaking}
                  onClick={backNarration.onClick}
                />
              )}
            </div>
            <div className="mt-2 text-sm text-primary">
              <LatexMarkdown
                content={card.back}
                attachments={attachments}
                onImageClick={onImageClick}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CorrectAnswerBlock({
  label,
  content,
  attachments,
  onImageClick,
}: {
  label: string;
  content: string;
  attachments?: Attachment[];
  onImageClick?: (att: Attachment) => void;
}) {
  return (
    <div className="rounded-lg border border-success/20 bg-success-soft p-3">
      <div className="text-[10px] uppercase tracking-widest text-success-fg">
        {label}
      </div>
      <div className="mt-1 text-sm text-primary">
        <LatexMarkdown
          content={content}
          attachments={attachments}
          onImageClick={onImageClick}
        />
      </div>
    </div>
  );
}
