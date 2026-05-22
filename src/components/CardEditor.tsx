import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import {
  Plus,
  Trash2,
  AlignJustify,
  ListChecks,
  BoxSelect,
  ToggleLeft,
  Lightbulb,
  X,
  Image as ImageIcon,
  Music,
  AlertTriangle,
  Play,
  Square,
} from 'lucide-react';
import { LatexMarkdown } from './LatexMarkdown';
import { LatexShortcutBar } from './LatexShortcutBar';
import {
  CARD_TYPE_LABELS,
  isPresetCategory,
  NO_CATEGORY,
  type CardCategory,
  type CardType,
  type CardInteraction,
} from '@/types/flashcard';
import type { Attachment, AttachmentKind } from '@/types/attachment';
import {
  ACCEPTED_AUDIO_ACCEPT,
  ACCEPTED_IMAGE_ACCEPT,
} from '@/types/attachment';
import {
  insertShortcut as buildInsertion,
  type LatexShortcut,
} from '@/utils/latexShortcuts';
import {
  buildAttMarker,
  fileToAttachment,
  setAttachmentWidth,
  stripAttachmentMarker,
  useObjectUrl,
  validateAudioFile,
  validateImageFile,
  type ValidationResult,
} from '@/utils/attachments';
import {
  isSpeechAvailable,
  loadVoices,
  resolveVoice,
  speak as speakOnce,
  cancelSpeech,
} from '@/utils/speech';
import {
  parseClozeAll,
  renderClozeForReview,
  sortClozeKeys,
} from '@/utils/cloze';
import { MAX_SPEECH_CHARS, type CardSpeech } from '@/types/speech';
import type { Settings } from '@/types/stats';
import { Collapsible } from './Collapsible';
import { db, attUid } from '@/db/database';
import { useConfirm } from './ConfirmModal';

interface CardEditorProps {
  initialFront?: string;
  initialBack?: string;
  initialType?: CardCategory;
  initialInteraction?: CardInteraction;
  /**
   * Attachments already saved on the card (edit flow). For "create" flow this
   * is empty / omitted.
   */
  initialAttachments?: Attachment[];
  /**
   * Existing per-card narration. Optional — omitted for new cards. The
   * editor manages its own draft state from this initial value.
   */
  initialSpeech?: CardSpeech;
  /**
   * Called when the user clicks Save. The editor packages everything the
   * caller needs to persist atomically:
   *   - `attachments`: the FULL set that should exist on the card after save
   *     (includes both pre-existing kept ones and newly added ones).
   *   - `removedIds`: ids that were on the card before but the user removed.
   *     The caller is responsible for deleting these rows from the DB.
   *   - `speech`: `undefined` if the user has no narration configured (both
   *     toggles off or texts empty), otherwise the CardSpeech record.
   *
   * The diff (new vs kept) is implicit from `attachments` — the caller can
   * cross-reference with `initialAttachments` if it cares, but most callers
   * just `bulkPut` the full set and `bulkDelete` the removedIds.
   */
  onSave: (data: {
    front: string;
    back: string;
    type: CardCategory;
    interaction: CardInteraction;
    attachments: Attachment[];
    removedIds: string[];
    speech: CardSpeech | undefined;
  }) => void;
  onCancel: () => void;
  saveLabel?: string;
}

type InteractionKind = CardInteraction['kind'];

const INTERACTION_OPTIONS: Array<{
  kind: InteractionKind;
  label: string;
  description: string;
  Icon: typeof AlignJustify;
}> = [
  {
    kind: 'classic',
    label: 'Clássico',
    description: 'Pergunta + resposta. Você se autoavalia.',
    Icon: AlignJustify,
  },
  {
    kind: 'multiple_choice',
    label: 'Múltipla escolha',
    description: 'Várias alternativas, uma correta. Auto-corrigido.',
    Icon: ListChecks,
  },
  {
    kind: 'cloze',
    label: 'Ocultar Resposta',
    description: 'Esconda partes do texto com {{c1::...}} para preencher.',
    Icon: BoxSelect,
  },
  {
    kind: 'true_false',
    label: 'V/F',
    description: 'Afirmação verdadeira ou falsa. Auto-corrigido.',
    Icon: ToggleLeft,
  },
];

/** Build a fresh interaction object of the given kind, preserving compatible fields. */
function migrateInteraction(
  current: CardInteraction,
  newKind: InteractionKind,
): CardInteraction {
  if (current.kind === newKind) return current;
  switch (newKind) {
    case 'classic':
      return { kind: 'classic' };
    case 'multiple_choice':
      return { kind: 'multiple_choice', options: ['', '', '', ''], correctIndex: 0 };
    case 'cloze':
      return { kind: 'cloze' };
    case 'true_false':
      return { kind: 'true_false', correct: true };
  }
}

export function CardEditor({
  initialFront = '',
  initialBack = '',
  initialType = 'conceito',
  initialInteraction,
  initialAttachments,
  initialSpeech,
  onSave,
  onCancel,
  saveLabel = 'Salvar',
}: CardEditorProps) {
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState(initialBack);
  const [type, setType] = useState<CardCategory>(initialType);
  const [interaction, setInteraction] = useState<CardInteraction>(
    initialInteraction ?? { kind: 'classic' },
  );
  const [activeField, setActiveField] = useState<'front' | 'back'>('front');
  const confirm = useConfirm();

  // ── Narration / TTS ────────────────────────────────────────────────────
  // Local draft of the per-card narration state. Stored as a fully-populated
  // shape (always 4 fields) for easier UI binding; on save we collapse it
  // back to `undefined` when nothing is configured. Voice preferences come
  // from the Settings singleton, loaded once on mount — they apply to the
  // editor's "Testar" preview the same way they apply on the review screen.
  const [speech, setSpeech] = useState({
    frontEnabled: initialSpeech?.frontEnabled ?? false,
    backEnabled: initialSpeech?.backEnabled ?? false,
    frontText: initialSpeech?.frontText ?? '',
    backText: initialSpeech?.backText ?? '',
  });
  const [voiceSettings, setVoiceSettings] = useState<Settings['speech']>(undefined);
  // Which side is currently being previewed by the "Testar" button.
  // null = nothing playing. Drives the play/stop icon swap.
  const [testingSide, setTestingSide] = useState<'front' | 'back' | null>(null);
  const speechAvailable = isSpeechAvailable();

  useEffect(() => {
    let cancelled = false;
    db.settings.get('singleton').then(s => {
      if (!cancelled) setVoiceSettings(s?.speech);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cancel any in-flight test playback when the editor unmounts (user
  // navigates away mid-preview). Without this, the voice keeps reading
  // after the component is gone.
  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  // ── Attachments ────────────────────────────────────────────────────────
  // Local state only — NOTHING touches the DB until the user clicks Save.
  // That's the contract that prevents orphans on cancel: a Card that never
  // existed can't have orphan attachments.
  //
  // `attachments` holds the full current set (existing + newly added). We
  // track `initialIdsRef` so on save we can compute `removedIds` (anything
  // that used to be there but isn't anymore).
  const [attachments, setAttachments] = useState<Attachment[]>(
    () => initialAttachments ?? [],
  );
  const initialIdsRef = useRef<Set<string>>(
    new Set((initialAttachments ?? []).map(a => a.id)),
  );
  const [attError, setAttError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Insert text at the cursor of the currently focused textarea (front or
   * back). Used by the attachment marker injection.
   *
   * NOTE: we INTENTIONALLY do NOT reuse `insertShortcut` from latexShortcuts
   * here — that function wraps inserts in `$...$` / `$$...$$` math
   * delimiters, which is the LAST thing we want around an attachment
   * marker. A previous version of this file made that mistake; the
   * resulting `setFront(undefined)` cascaded into `front.trim()` crashing
   * the renderer, which blanked the whole app.
   */
  const insertIntoActive = (text: string) => {
    const ta = activeField === 'front' ? frontRef.current : backRef.current;
    const currentValue = activeField === 'front' ? front : back;
    const setter = activeField === 'front' ? setFront : setBack;

    if (!ta) {
      // Editor not mounted yet — append to current content as a safe fallback.
      setter(currentValue + text);
      return;
    }

    const start = ta.selectionStart ?? currentValue.length;
    const end = ta.selectionEnd ?? currentValue.length;
    const nextValue =
      currentValue.slice(0, start) + text + currentValue.slice(end);
    const nextCursor = start + text.length;

    setter(nextValue);
    // Restore focus + place cursor after the inserted text on the next tick.
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(nextCursor, nextCursor);
    });
  };

  /**
   * Pipeline for accepting one or more File objects from any source (file
   * picker, drag/drop, paste). Validates each, accepts the valid ones, and
   * surfaces the FIRST validation error (rare to have several at once).
   *
   * On accept: create the Attachment in memory, append to local state,
   * inject `![[id]]` at the cursor of whichever textarea is currently
   * active. The DB is not touched.
   */
  const processFiles = (
    files: FileList | File[] | null | undefined,
    kind: AttachmentKind,
    validator: (f: File) => ValidationResult,
  ) => {
    if (!files || files.length === 0) return;
    setAttError(null);
    const list = Array.from(files);
    const accepted: Attachment[] = [];
    let firstError: string | null = null;

    for (const file of list) {
      const v = validator(file);
      if (!v.ok) {
        if (!firstError) firstError = v.reason;
        continue;
      }
      const att = fileToAttachment(file, {
        id: attUid(),
        cardId: '',
        kind,
      });
      accepted.push(att);
    }

    if (accepted.length > 0) {
      setAttachments(prev => [...prev, ...accepted]);
      // Insert markers in document order, each on its own line, so the
      // preview reflows naturally.
      for (const att of accepted) {
        insertIntoActive(`\n\n${buildAttMarker(att.id)}\n\n`);
      }
    }
    if (firstError) setAttError(firstError);
  };

  const handleImageFiles = (files: FileList | File[] | null | undefined) =>
    processFiles(files, 'image', validateImageFile);
  const handleAudioFiles = (files: FileList | File[] | null | undefined) =>
    processFiles(files, 'audio', validateAudioFile);

  /** Remove an attachment from local state and scrub its marker from front+back. */
  const handleRemoveAttachment = async (id: string) => {
    // Tailor the prompt to the attachment kind, so "remove image" doesn't
    // pop up when the user clicked the trash on an audio player.
    const att = attachments.find(a => a.id === id);
    const isAudio = att?.type === 'audio';
    const ok = await confirm({
      title: isAudio ? 'Remover áudio do cartão?' : 'Remover imagem do cartão?',
      message: isAudio
        ? 'O áudio será desanexado deste cartão. Outros anexos não são afetados.'
        : 'A imagem será desanexada deste cartão. Outros anexos não são afetados.',
      confirmLabel: 'Remover',
    });
    if (!ok) return;
    setAttachments(prev => prev.filter(a => a.id !== id));
    setFront(f => stripAttachmentMarker(f, id));
    setBack(b => stripAttachmentMarker(b, id));
    setAttError(null);
  };

  /**
   * Update the rendered width of every marker referencing this attachment
   * in both front and back. Pass null/0 to remove the width segment
   * entirely (return to natural sizing). Doesn't touch the attachment row
   * itself — width lives in the card's content, not in the attachment.
   *
   * Width is image-only; audio attachments never trigger this from the
   * UI (no resize handle), but if someone calls it for an audio id the
   * marker mutation is harmless (audio renderer ignores `|N`).
   */
  const handleChangeAttachmentWidth = (id: string, width: number | null) => {
    setFront(f => setAttachmentWidth(f, id, width));
    setBack(b => setAttachmentWidth(b, id, width));
  };

  /**
   * Paste handler — extracts image OR audio files from the clipboard and
   * routes them to the right validator. Other MIME types are ignored
   * (the textarea's default paste behavior takes over).
   */
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    const images: File[] = [];
    const audios: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind !== 'file') continue;
      if (it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) images.push(f);
      } else if (it.type.startsWith('audio/')) {
        const f = it.getAsFile();
        if (f) audios.push(f);
      }
    }
    if (images.length > 0 || audios.length > 0) {
      e.preventDefault(); // Don't paste the file path as text.
      if (images.length > 0) handleImageFiles(images);
      if (audios.length > 0) handleAudioFiles(audios);
    }
  };

  /**
   * Drag/drop on a textarea — files split by MIME prefix between image and
   * audio handlers. Files without an audio/image MIME (e.g. .docx, .pdf)
   * fall through to the textarea's native drop behavior.
   */
  const handleDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    if (!e.dataTransfer?.files?.length) return;
    const all = Array.from(e.dataTransfer.files);
    const images = all.filter(f => f.type.startsWith('image/'));
    // Audio MIME might be empty on Windows — fall back to extension sniff
    // for the routing decision (the validator does the same).
    const audios = all.filter(f => {
      if (f.type.startsWith('audio/')) return true;
      if (!f.type) {
        const name = f.name.toLowerCase();
        return /\.(mp3|wav|ogg|m4a|webm)$/.test(name);
      }
      return false;
    });
    if (images.length === 0 && audios.length === 0) return;
    e.preventDefault();
    if (images.length > 0) handleImageFiles(images);
    if (audios.length > 0) handleAudioFiles(audios);
  };
  const handleDragOver = (e: DragEvent<HTMLTextAreaElement>) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  };

  // ── Narration handlers ────────────────────────────────────────────────
  //
  // `handleTestNarration` previews one side using the user's global voice
  // settings. Acts as a toggle: clicking while the same side is playing
  // stops it (matches the review-screen play/pause behavior).
  //
  // The voice list is fetched on demand. We don't pre-fetch on mount to
  // keep the editor lightweight for users who never open the narration
  // section.

  const handleTestNarration = async (side: 'front' | 'back') => {
    if (!speechAvailable) return;
    // Toggle: same side already playing → stop and bail.
    if (testingSide === side) {
      cancelSpeech();
      setTestingSide(null);
      return;
    }
    const text = (side === 'front' ? speech.frontText : speech.backText).trim();
    if (!text) return;
    const voices = await loadVoices();
    const voice = resolveVoice(voices, voiceSettings?.voiceURI);
    speakOnce(text, {
      voice,
      rate: voiceSettings?.rate ?? 1.0,
      volume: voiceSettings?.volume ?? 1.0,
      pitch: voiceSettings?.pitch ?? 1.0,
      onEnd: () => setTestingSide(null),
      onError: () => setTestingSide(null),
    });
    setTestingSide(side);
  };

  /**
   * Build the `speech` payload for `onSave`. Returns `undefined` when no
   * side has both `enabled` AND non-empty text — that keeps cards without
   * narration from carrying an empty record around. Otherwise preserves
   * the user's enabled+text state for each side (a side with enabled but
   * empty text is allowed mid-edit, but on save we drop it).
   */
  const collectSpeechForSave = (): CardSpeech | undefined => {
    const ft = speech.frontText.trim();
    const bt = speech.backText.trim();
    const frontActive = speech.frontEnabled && ft.length > 0;
    const backActive = speech.backEnabled && bt.length > 0;
    if (!frontActive && !backActive) return undefined;
    const out: CardSpeech = {};
    if (frontActive) {
      out.frontEnabled = true;
      out.frontText = ft;
    }
    if (backActive) {
      out.backEnabled = true;
      out.backText = bt;
    }
    return out;
  };

  // ── Custom categories ──────────────────────────────────────────────────
  // Loaded from Settings on mount, persisted back on every add/remove. The
  // editor owns this state because the UX (add/select in the same gesture)
  // makes more sense than asking the parent to route DB calls.
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  // Preset keys the user chose to hide. Cards already typed with these keys
  // keep their original label (CARD_TYPE_LABELS still resolves them) — we
  // just don't offer them as options anymore.
  const [hiddenPresets, setHiddenPresets] = useState<string[]>([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const settings = await db.settings.get('singleton');
      setCustomCategories(settings?.customCategories ?? []);
      setHiddenPresets(settings?.hiddenPresetCategories ?? []);
    })();
  }, []);

  async function persistCategories(next: {
    customCategories?: string[];
    hiddenPresetCategories?: string[];
  }) {
    const settings = await db.settings.get('singleton');
    if (!settings) return;
    await db.settings.put({
      ...settings,
      ...(next.customCategories !== undefined && {
        customCategories: next.customCategories,
      }),
      ...(next.hiddenPresetCategories !== undefined && {
        hiddenPresetCategories: next.hiddenPresetCategories,
      }),
      updatedAt: Date.now(),
    });
  }

  // Back-compat shim — keeps the rest of the file readable.
  async function persistCustomCategories(next: string[]) {
    return persistCategories({ customCategories: next });
  }

  async function addCustomCategory() {
    const trimmed = newCategoryName.trim();
    setCategoryError(null);

    if (!trimmed) {
      setCategoryError('O nome não pode ficar vazio.');
      return;
    }
    if (trimmed.length > 40) {
      setCategoryError('Nome muito longo (máx. 40 caracteres).');
      return;
    }
    // Preset key collision (the predefined chips have stable string keys —
    // names that match a preset key would be ambiguous on render).
    if (isPresetCategory(trimmed)) {
      setCategoryError('Esse nome já existe entre as categorias padrão.');
      return;
    }
    // Display-label collision with presets (case-insensitive).
    const presetLabels = Object.values(CARD_TYPE_LABELS).map(l => l.toLowerCase());
    if (presetLabels.includes(trimmed.toLowerCase())) {
      setCategoryError('Esse nome conflita com uma categoria padrão.');
      return;
    }
    // Collision with the "no category" sentinel label.
    if (trimmed.toLowerCase() === 'sem categoria') {
      setCategoryError('Esse nome é reservado.');
      return;
    }
    // Custom duplicate (case-insensitive).
    if (customCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setCategoryError('Você já criou essa categoria.');
      return;
    }

    const next = [...customCategories, trimmed];
    setCustomCategories(next);
    await persistCustomCategories(next);
    setType(trimmed); // auto-select the newly added category
    setAddingCustom(false);
    setNewCategoryName('');
  }

  /**
   * Delete a custom category. Cards that reference it are migrated to
   * `NO_CATEGORY` ("Sem categoria") in a single batch update — never left
   * pointing at a name that no longer exists. The confirmation tells the
   * user exactly how many cards will be moved.
   *
   * Works for BOTH custom and preset categories. Presets are hidden via
   * `Settings.hiddenPresetCategories` (label still resolves so existing
   * cards keep rendering correctly); customs are removed from
   * `Settings.customCategories`. Either way, cards still using the
   * category are migrated to NO_CATEGORY first.
   *
   * "Sem categoria" (NO_CATEGORY) is never removable — passing it here
   * would no-op via the guard in the UI.
   */
  async function removeCategory(name: string, isPreset: boolean) {
    // Count affected cards up front so the confirm message is honest.
    const affected = await db.cards.where('type').equals(name).count();

    const displayLabel = isPreset
      ? CARD_TYPE_LABELS[name as CardType] || name
      : name;
    const message =
      affected > 0
        ? `Excluir categoria "${displayLabel}"?\n\n` +
          `${affected} cartão(ões) que usam esta categoria serão movidos ` +
          `para "Sem categoria".`
        : `Excluir categoria "${displayLabel}"?\n\n` +
          `Nenhum cartão usa esta categoria no momento.`;

    const ok = await confirm({
      title: 'Excluir categoria',
      message,
      tone: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;

    // Migrate affected cards before dropping the name from the list, so
    // there's never a window where a card points at a vanished category.
    if (affected > 0) {
      await db.cards.where('type').equals(name).modify({ type: NO_CATEGORY });
    }

    if (isPreset) {
      const nextHidden = [...hiddenPresets, name];
      setHiddenPresets(nextHidden);
      await persistCategories({ hiddenPresetCategories: nextHidden });
    } else {
      const next = customCategories.filter(c => c !== name);
      setCustomCategories(next);
      await persistCustomCategories(next);
    }

    // If the editor currently has the deleted category selected, fall back
    // to "Sem categoria" — consistent with how existing cards were migrated.
    if (type === name) setType(NO_CATEGORY);
  }

  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);

  function handleInsert(s: LatexShortcut) {
    const ref = activeField === 'front' ? frontRef.current : backRef.current;
    if (!ref) return;

    const value = activeField === 'front' ? front : back;
    const start = ref.selectionStart ?? value.length;
    const end = ref.selectionEnd ?? value.length;

    const result = buildInsertion(value, start, end, s);

    if (activeField === 'front') setFront(result.text);
    else setBack(result.text);

    requestAnimationFrame(() => {
      ref.focus();
      ref.setSelectionRange(result.cursor, result.cursor);
    });
  }

  function changeKind(newKind: InteractionKind) {
    setInteraction(migrateInteraction(interaction, newKind));
  }

  // Validation: each kind has its own definition of "ready to save".
  const canSave = (() => {
    if (front.trim().length === 0) return false;
    switch (interaction.kind) {
      case 'classic':
        return back.trim().length > 0;
      case 'multiple_choice':
        return (
          interaction.options.length >= 2 &&
          interaction.options.every(o => o.trim().length > 0) &&
          interaction.correctIndex < interaction.options.length
        );
      case 'cloze':
        // The front must contain at least one cloze marker.
        return /\{\{c1::[^}]+\}\}/.test(front);
      case 'true_false':
        return true;
    }
  })();

  const frontPlaceholder =
    interaction.kind === 'cloze'
      ? 'Texto com lacunas. Marque o que esconder com {{c1::resposta}} ou {{c1::resposta::dica}}.\n\nEx.: A função de partição grande canônica é dada por {{c1::\\mathcal{Z} = \\sum_N z^N Z_N}}.'
      : interaction.kind === 'true_false'
      ? 'Afirmação. O usuário marca como verdadeira ou falsa.\n\nEx.: A função de partição canônica depende do potencial químico.'
      : 'Pergunta. Suporta Markdown e LaTeX.\n\nEx.: O que é a função de partição grande canônica?';

  const backPlaceholder =
    interaction.kind === 'classic'
      ? 'Resposta. Use $$...$$ para fórmulas em bloco.'
      : 'Explicação opcional, mostrada após a auto-correção.';

  const backLabel =
    interaction.kind === 'classic' ? 'Verso' : 'Explicação (opcional)';

  return (
    <div className="space-y-5">
      {/* Tipo categorial — predefinidos visíveis + personalizados + botão "+" */}
      <div>
        <label className="text-[11px] uppercase tracking-widest text-muted">
          Categoria
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {/* "Sem categoria" — sentinela imutável. NUNCA deletável, pois
              cartões cujas categorias foram removidas caem aqui. */}
          <button
            type="button"
            onClick={() => setType(NO_CATEGORY)}
            className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
              type === NO_CATEGORY
                ? 'border-accent/40 bg-accent-soft text-accent-fg'
                : 'border-dashed border-divider text-faint hover:border-strong hover:text-secondary'
            }`}
          >
            Sem categoria
          </button>
          {/* Predefinidas — × só aparece em hover do chip (group-hover) pra
              não poluir visualmente quando o usuário não quer remover. */}
          {(Object.keys(CARD_TYPE_LABELS) as CardType[])
            .filter(t => !hiddenPresets.includes(t))
            .map(t => {
              const active = type === t;
              return (
                <span
                  key={t}
                  className={`group inline-flex items-stretch overflow-hidden rounded-md border text-xs transition-colors ${
                    active
                      ? 'border-accent/40 bg-accent-soft text-accent-fg'
                      : 'border-subtle tint-1 text-secondary hover:border-divider'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setType(t)}
                    className="px-3 py-1.5"
                    title={`Selecionar categoria "${CARD_TYPE_LABELS[t]}"`}
                  >
                    {CARD_TYPE_LABELS[t]}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCategory(t, true)}
                    className="w-0 overflow-hidden border-subtle text-faint opacity-0 transition-all group-hover:w-6 group-hover:border-l group-hover:opacity-100 hover:bg-danger-soft hover:text-danger-fg flex items-center justify-center"
                    title={`Esconder categoria "${CARD_TYPE_LABELS[t]}"`}
                    aria-label={`Esconder categoria ${CARD_TYPE_LABELS[t]}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              );
            })}
          {/* Personalizadas — mesma estrutura: × só em hover. */}
          {customCategories.map(name => {
            const active = type === name;
            return (
              <span
                key={name}
                className={`group inline-flex items-stretch overflow-hidden rounded-md border text-xs transition-colors ${
                  active
                    ? 'border-accent/40 bg-accent-soft text-accent-fg'
                    : 'border-subtle tint-1 text-secondary hover:border-divider'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setType(name)}
                  className="px-3 py-1.5"
                  title={`Selecionar categoria "${name}"`}
                >
                  {name}
                </button>
                <button
                  type="button"
                  onClick={() => removeCategory(name, false)}
                  className="w-0 overflow-hidden border-subtle text-faint opacity-0 transition-all group-hover:w-6 group-hover:border-l group-hover:opacity-100 hover:bg-danger-soft hover:text-danger-fg flex items-center justify-center"
                  title="Remover esta categoria personalizada"
                  aria-label={`Remover categoria ${name}`}
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
          {/* Botão "+" ou input inline de criação */}
          {addingCustom ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent-soft px-1.5 py-0.5">
              <input
                autoFocus
                value={newCategoryName}
                onChange={e => {
                  setNewCategoryName(e.target.value);
                  if (categoryError) setCategoryError(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomCategory();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setAddingCustom(false);
                    setNewCategoryName('');
                    setCategoryError(null);
                  }
                }}
                placeholder="Nome da categoria"
                maxLength={40}
                className="w-44 bg-transparent px-1.5 py-1 text-xs text-primary outline-none placeholder:text-faint"
              />
              <button
                type="button"
                onClick={addCustomCategory}
                className="rounded bg-accent px-2 py-0.5 text-[10px] font-medium text-on-accent hover:bg-accent-400"
              >
                Criar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingCustom(false);
                  setNewCategoryName('');
                  setCategoryError(null);
                }}
                className="px-1 text-faint hover:text-primary"
                title="Cancelar"
                aria-label="Cancelar criação de categoria"
              >
                <X size={11} />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCustom(true)}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-strong tint-1 px-2.5 py-1.5 text-xs text-muted hover:border-strong hover:text-primary"
              title="Criar categoria personalizada"
            >
              <Plus size={11} />
              Nova
            </button>
          )}
        </div>
        {categoryError && (
          <p className="mt-1.5 text-[11px] text-danger-fg">{categoryError}</p>
        )}
      </div>

      {/* Tipo de interação */}
      <div>
        <label className="text-[11px] uppercase tracking-widest text-muted">
          Tipo de interação
        </label>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {INTERACTION_OPTIONS.map(opt => {
            const active = interaction.kind === opt.kind;
            const Icon = opt.Icon;
            return (
              <button
                key={opt.kind}
                type="button"
                onClick={() => changeKind(opt.kind)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? 'border-accent/40 bg-accent-soft'
                    : 'border-subtle tint-1 hover:border-strong'
                }`}
              >
                <Icon size={14} className={active ? 'text-accent-fg' : 'text-muted'} />
                <span className={`text-sm font-medium ${active ? 'text-accent-fg' : 'text-primary'}`}>
                  {opt.label}
                </span>
                <span className="text-[11px] leading-snug text-faint">
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <LatexShortcutBar onPick={handleInsert} />

      {/*
        Two hidden file inputs — one for images, one for audio. Each is
        triggered by its own per-textarea button, which also sets
        `activeField` so the inserted marker lands on the correct side.
        Reset value after change so picking the SAME file twice still
        fires `onChange`.
      */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_ACCEPT}
        multiple
        hidden
        onChange={e => {
          handleImageFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={audioFileInputRef}
        type="file"
        accept={ACCEPTED_AUDIO_ACCEPT}
        multiple
        hidden
        onChange={e => {
          handleAudioFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Inline validation error (size / mime). Disappears on next successful add. */}
      {attError && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger-fg">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{attError}</span>
        </div>
      )}

      {/* Front + back textareas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          {/* Header row for the front pane: label on the left, "Inserir
              imagem" button on the right. The button explicitly sets
              activeField BEFORE opening the file picker, so the inserted
              marker always lands on this side regardless of what was last
              focused. */}
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] uppercase tracking-widest text-muted">
              {interaction.kind === 'cloze'
                ? 'Texto com lacunas'
                : interaction.kind === 'true_false'
                ? 'Afirmação'
                : 'Frente'}
              {activeField === 'front' && (
                <span className="ml-1 text-accent-fg">●</span>
              )}
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setActiveField('front');
                  fileInputRef.current?.click();
                }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:tint-1 hover:text-accent-fg"
                title="Inserir imagem na frente"
              >
                <ImageIcon size={12} />
                Inserir imagem
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveField('front');
                  audioFileInputRef.current?.click();
                }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:tint-1 hover:text-accent-fg"
                title="Inserir áudio na frente"
              >
                <Music size={12} />
                Inserir áudio
              </button>
            </div>
          </div>
          <textarea
            ref={frontRef}
            value={front}
            onChange={e => setFront(e.target.value)}
            onFocus={() => setActiveField('front')}
            onClick={() => setActiveField('front')}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            placeholder={frontPlaceholder}
            rows={interaction.kind === 'cloze' ? 6 : 8}
            className="mt-1 w-full resize-none rounded-lg border border-divider bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent/50"
          />
          {interaction.kind === 'cloze' && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft p-2.5 text-[11px] leading-relaxed text-warning-fg">
              <Lightbulb size={12} className="mt-0.5 shrink-0 text-warning-fg" />
              <span>
                Marque o que esconder com{' '}
                <code className="text-warning-fg">{'{{c1::resposta}}'}</code>. Para
                dar uma dica:{' '}
                <code className="text-warning-fg">{'{{c1::resposta::dica}}'}</code>.
              </span>
            </div>
          )}
          <div className="mt-2 min-h-[100px] rounded-lg border border-subtle bg-surface-2 p-4">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-muted">
              Preview
            </div>
            <LatexMarkdown
              content={front}
              attachments={attachments}
              editableAttachments={{
                onResize: handleChangeAttachmentWidth,
                onDelete: handleRemoveAttachment,
              }}
            />
          </div>
          {/* Para cartões cloze: lista cada chave detectada e mostra como
              o cartão vai aparecer ao revisar AQUELA chave (com os outros
              marcadores em texto puro como contexto, Anki-style). */}
          {interaction.kind === 'cloze' && (
            <ClozeKeysPreview content={front} attachments={attachments} />
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] uppercase tracking-widest text-muted">
              {backLabel}
              {activeField === 'back' && (
                <span className="ml-1 text-accent-fg">●</span>
              )}
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setActiveField('back');
                  fileInputRef.current?.click();
                }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:tint-1 hover:text-accent-fg"
                title="Inserir imagem no verso"
              >
                <ImageIcon size={12} />
                Inserir imagem
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveField('back');
                  audioFileInputRef.current?.click();
                }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:tint-1 hover:text-accent-fg"
                title="Inserir áudio no verso"
              >
                <Music size={12} />
                Inserir áudio
              </button>
            </div>
          </div>
          <textarea
            ref={backRef}
            value={back}
            onChange={e => setBack(e.target.value)}
            onFocus={() => setActiveField('back')}
            onClick={() => setActiveField('back')}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            placeholder={backPlaceholder}
            rows={8}
            className="mt-1 w-full resize-none rounded-lg border border-divider bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent/50"
          />
          <div className="mt-2 min-h-[100px] rounded-lg border border-subtle bg-surface-2 p-4">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-muted">
              Preview
            </div>
            <LatexMarkdown
              content={back}
              attachments={attachments}
              editableAttachments={{
                onResize: handleChangeAttachmentWidth,
                onDelete: handleRemoveAttachment,
              }}
            />
          </div>
        </div>
      </div>

      {/* Attachments panel — shows below the textareas. Rendered only when
          there's at least one, so cards without images don't see anything.
          With the inline edit affordances (drag-to-resize, trash) now
          embedded in the preview images themselves, the panel acts as a
          backup: a list of every image that belongs to this card, with
          a "Reinserir" action for the case where the user deleted the
          `![[id]]` marker from the textarea but wants the reference back
          without re-uploading. */}
      {attachments.length > 0 && (
        <AttachmentsPanel
          attachments={attachments}
          onInsertMarker={id => insertIntoActive(buildAttMarker(id))}
        />
      )}

      {/* Per-kind extra fields */}
      {interaction.kind === 'multiple_choice' && (
        <MultipleChoiceFields
          value={interaction}
          onChange={setInteraction}
        />
      )}
      {interaction.kind === 'true_false' && (
        <TrueFalseFields value={interaction} onChange={setInteraction} />
      )}

      {/* Narration / TTS — optional per-card section.
          Closed by default for cards that don't have it. Opens
          automatically when editing a card that already had narration
          configured (`initialSpeech` provided). The persisted speech state
          is built on save by `collectSpeechForSave()`. */}
      <Collapsible
        title="Narração do cartão"
        badge="opcional"
        preview={
          speech.frontEnabled || speech.backEnabled
            ? 'Configurada — toque em "Testar" para ouvir.'
            : 'Texto opcional lido em voz alta na revisão.'
        }
        defaultOpen={
          !!initialSpeech &&
          (!!initialSpeech.frontEnabled || !!initialSpeech.backEnabled)
        }
      >
        {!speechAvailable && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft p-2.5 text-[11px] leading-relaxed text-warning-fg">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>
              Leitura em voz alta não disponível neste sistema. Você ainda
              pode escrever o texto; ele será lido quando rodar o app em um
              ambiente compatível.
            </span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <NarrationSide
            sideLabel="Frente"
            enabled={speech.frontEnabled}
            text={speech.frontText}
            onToggle={v => setSpeech(s => ({ ...s, frontEnabled: v }))}
            onTextChange={v => setSpeech(s => ({ ...s, frontText: v }))}
            onTest={() => handleTestNarration('front')}
            isTesting={testingSide === 'front'}
            testDisabled={!speechAvailable}
          />
          <NarrationSide
            sideLabel="Verso"
            enabled={speech.backEnabled}
            text={speech.backText}
            onToggle={v => setSpeech(s => ({ ...s, backEnabled: v }))}
            onTextChange={v => setSpeech(s => ({ ...s, backText: v }))}
            onTest={() => handleTestNarration('back')}
            isTesting={testingSide === 'back'}
            testDisabled={!speechAvailable}
          />
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          Use texto puro (sem Markdown / LaTeX). Para fórmulas, escreva a
          forma falada — por exemplo "ômega é igual a menos k bê tê
          vezes o logaritmo da função de partição grande canônica".
        </p>
      </Collapsible>

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => {
            // Compute which previously-known attachments the user removed.
            // Anything new the user added has `cardId === ''` here — the page
            // wrapper assigns the real cardId at insertion time.
            const currentIds = new Set(attachments.map(a => a.id));
            const removedIds: string[] = [];
            for (const id of initialIdsRef.current) {
              if (!currentIds.has(id)) removedIds.push(id);
            }
            onSave({
              front: front.trim(),
              back: back.trim(),
              type,
              interaction,
              attachments,
              removedIds,
              speech: collectSpeechForSave(),
            });
          }}
          disabled={!canSave}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-on-accent hover:bg-accent-400 disabled:opacity-50"
        >
          {saveLabel}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-muted hover:tint-2"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-kind editors
// ─────────────────────────────────────────────────────────────────────────────

function MultipleChoiceFields({
  value,
  onChange,
}: {
  value: Extract<CardInteraction, { kind: 'multiple_choice' }>;
  onChange: (v: CardInteraction) => void;
}) {
  function setOption(i: number, text: string) {
    const opts = [...value.options];
    opts[i] = text;
    onChange({ ...value, options: opts });
  }
  function addOption() {
    if (value.options.length >= 6) return;
    onChange({ ...value, options: [...value.options, ''] });
  }
  function removeOption(i: number) {
    if (value.options.length <= 2) return;
    const opts = value.options.filter((_, idx) => idx !== i);
    let correctIndex = value.correctIndex;
    if (correctIndex === i) correctIndex = 0;
    else if (correctIndex > i) correctIndex -= 1;
    onChange({ ...value, options: opts, correctIndex });
  }

  return (
    <div>
      <label className="text-[11px] uppercase tracking-widest text-muted">
        Alternativas{' '}
        <span className="text-faint">
          (clique no círculo da correta)
        </span>
      </label>
      <div className="mt-2 space-y-2">
        {value.options.map((opt, i) => {
          const isCorrect = i === value.correctIndex;
          return (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-lg border p-2 ${
                isCorrect
                  ? 'border-success/40 bg-success-soft'
                  : 'border-divider bg-surface-2'
              }`}
            >
              <button
                type="button"
                onClick={() => onChange({ ...value, correctIndex: i })}
                className="mt-1.5 shrink-0"
                title={isCorrect ? 'Resposta correta' : 'Marcar como correta'}
              >
                <span
                  className={`block h-4 w-4 rounded-full border-2 transition-colors ${
                    isCorrect
                      ? 'border-success bg-success'
                      : 'border-strong hover:border-strong'
                  }`}
                />
              </button>
              <input
                type="text"
                value={opt}
                onChange={e => setOption(i, e.target.value)}
                placeholder={`Alternativa ${String.fromCharCode(65 + i)} — Markdown e LaTeX permitidos`}
                className="flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-faint"
              />
              <button
                type="button"
                onClick={() => removeOption(i)}
                disabled={value.options.length <= 2}
                className="shrink-0 rounded p-1 text-faint hover:tint-2 hover:text-danger-fg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-faint"
                title="Remover alternativa"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
        {value.options.length < 6 && (
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-divider px-3 py-1.5 text-xs text-muted hover:border-strong hover:tint-1"
          >
            <Plus size={12} /> Adicionar alternativa
          </button>
        )}
      </div>
    </div>
  );
}

function TrueFalseFields({
  value,
  onChange,
}: {
  value: Extract<CardInteraction, { kind: 'true_false' }>;
  onChange: (v: CardInteraction) => void;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-widest text-muted">
        Resposta correta
      </label>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...value, correct: true })}
          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
            value.correct
              ? 'border-success/40 bg-success-soft text-success-fg'
              : 'border-divider tint-1 text-secondary hover:border-strong'
          }`}
        >
          Verdadeiro
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, correct: false })}
          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
            !value.correct
              ? 'border-danger/40 bg-danger-soft text-danger-fg'
              : 'border-divider tint-1 text-secondary hover:border-strong'
          }`}
        >
          Falso
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AttachmentsPanel — thumbnails + actions for every attached image
// ─────────────────────────────────────────────────────────────────────────────
//
// Lives below the front/back textareas. Each thumb shows the image, its
// filename, size, and two actions:
//   - "Reinserir marcador" — when the user accidentally deleted the
//     `![[id]]` from the text and wants it back without re-uploading.
//   - "Remover" — drops the attachment from local state and scrubs all
//     markers from front+back (with a confirm prompt).
//
// All visual treatment uses semantic tokens; the danger button uses the
// soft danger tint so the panel doesn't scream at the user.

function AttachmentsPanel({
  attachments,
  onInsertMarker,
}: {
  attachments: Attachment[];
  onInsertMarker: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-muted">
          Anexos ({attachments.length})
        </div>
        <div className="text-[10px] text-faint">
          Imagens: arraste o canto no preview para redimensionar
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {attachments.map(att => (
          <AttachmentThumb
            key={att.id}
            attachment={att}
            onInsertMarker={() => onInsertMarker(att.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AttachmentThumb({
  attachment,
  onInsertMarker,
}: {
  attachment: Attachment;
  onInsertMarker: () => void;
}) {
  const url = useObjectUrl(attachment.data);
  const sizeKb = Math.round(attachment.size / 1024);
  const sizeLabel = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

  const isAudio = attachment.type === 'audio';
  // Strip both image/ and audio/ prefixes so the label reads cleanly
  // ("MPEG · 1.2 MB" instead of "AUDIO/MPEG · 1.2 MB").
  const kindLabel = attachment.mimeType
    .replace(/^image\//, '')
    .replace(/^audio\//, '')
    .toUpperCase();

  return (
    <div className="flex items-start gap-3 rounded-lg border border-subtle bg-card p-2">
      {/* Thumbnail: image preview for images, music icon tile for audio. */}
      <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md border border-divider bg-surface">
        {isAudio ? (
          <Music size={22} className="text-accent-fg" />
        ) : url ? (
          <img
            src={url}
            alt={attachment.filename}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon size={20} className="text-faint" />
        )}
      </div>
      {/* Meta + actions */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-primary" title={attachment.filename}>
          {attachment.filename}
        </div>
        <div className="text-[10px] text-faint">
          {kindLabel || (isAudio ? 'ÁUDIO' : 'IMAGEM')} · {sizeLabel}
        </div>
        <div className="mt-1.5">
          <button
            type="button"
            onClick={onInsertMarker}
            className="rounded-md px-2 py-0.5 text-[11px] text-muted hover:tint-1 hover:text-primary"
            title="Inserir referência no texto onde o cursor está"
          >
            Reinserir no texto
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// (No additional helpers here right now — readMarkerWidths was removed
// when the per-thumbnail width input was retired in favor of inline
// drag-to-resize handles on the preview images.)

// ─────────────────────────────────────────────────────────────────────────────
// NarrationSide — one half of the "Narração do cartão" Collapsible (front or
// back). Self-contained UI block; the parent owns the actual state.
// ─────────────────────────────────────────────────────────────────────────────
//
// The validation message ("limite atingido") shows inline only when the
// text exceeds MAX_SPEECH_CHARS. We don't hard-block typing past the
// limit — letting the user see how much they overflowed and decide what
// to trim feels less hostile than a soft cap. Save is still gated by
// `canSave` in the parent for normal validity; speech text length isn't
// part of `canSave` because narration is optional.
function NarrationSide({
  sideLabel,
  enabled,
  text,
  onToggle,
  onTextChange,
  onTest,
  isTesting,
  testDisabled,
}: {
  sideLabel: string;
  enabled: boolean;
  text: string;
  onToggle: (v: boolean) => void;
  onTextChange: (v: string) => void;
  onTest: () => void;
  isTesting: boolean;
  testDisabled: boolean;
}) {
  const overLimit = text.length > MAX_SPEECH_CHARS;
  const canTest = enabled && text.trim().length > 0 && !testDisabled;

  return (
    <div className="rounded-lg border border-subtle bg-surface-2 p-3">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-primary">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => onToggle(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-divider accent-accent"
        />
        <span>Adicionar narração ao {sideLabel.toLowerCase()}</span>
      </label>

      <textarea
        value={text}
        onChange={e => onTextChange(e.target.value)}
        disabled={!enabled}
        placeholder={
          enabled
            ? 'Escreva a versão falada do conteúdo. Sem Markdown nem LaTeX.'
            : 'Ative a narração acima para escrever o texto.'
        }
        rows={4}
        className="mt-2 w-full resize-none rounded-md border border-divider bg-surface px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent/50 disabled:opacity-50"
      />

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span
          className={`text-[10px] ${overLimit ? 'text-danger-fg' : 'text-faint'}`}
        >
          {text.length} / {MAX_SPEECH_CHARS}
          {overLimit && ' — limite excedido'}
        </span>
        <button
          type="button"
          onClick={onTest}
          disabled={!canTest}
          title={
            testDisabled
              ? 'Leitura em voz alta indisponível neste sistema'
              : !enabled
              ? 'Ative a narração para testar'
              : !text.trim()
              ? 'Escreva o texto para testar'
              : isTesting
              ? 'Parar leitura'
              : 'Testar leitura'
          }
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted hover:tint-1 hover:text-accent-fg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:tint-0"
        >
          {isTesting ? <Square size={11} /> : <Play size={11} />}
          {isTesting ? 'Parar' : 'Testar'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ClozeKeysPreview — variantes de revisão para cartões cloze
// ─────────────────────────────────────────────────────────────────────────────
//
// Mostra, embaixo do Preview principal, como o cartão vai aparecer na
// revisão de CADA chave detectada (c1, c2, c3...). Cada variante:
//
//   - Renderiza o front via `renderClozeForReview(content, key, false)`,
//     ou seja, com a chave ativa virando `[ ___ ]` e as demais chaves
//     viradas em texto puro como contexto. Mesmo comportamento da
//     ReviewPage, então o autor vê EXATAMENTE o que o aluno verá.
//
//   - Mostra o índice ("Variante c1", "Variante c2") como header pequeno.
//
// Avisos:
//
//   - Nenhuma lacuna detectada → texto sutil dizendo como criar uma.
//
//   - Chave `c0` presente → erro: o Anki padroniza `c1` como o menor
//     índice válido. Mostramos erro destacado em vermelho.
//
//   - Gap na numeração (ex: c1, c3 sem c2) → aviso amarelo. Funciona,
//     mas geralmente é um erro de digitação que vai virar bug semântico.
function ClozeKeysPreview({
  content,
  attachments,
}: {
  content: string;
  attachments?: Attachment[];
}) {
  const all = parseClozeAll(content);

  // ── Detecção de tags mal-formadas ──────────────────────────────────────
  //
  // O parser stateful descarta silenciosamente tags incompletas (`{{c1::a}`
  // com `}` simples, `{{c1::a` sem fechar, etc) — o conteúdo cru permanece
  // visível no preview, mas o usuário pode não entender por que a chave
  // "sumiu" da lista. Detectamos comparando o número de inícios de tag
  // (`{{cN::`) com o número de matches válidos.
  //
  // Falso-positivos possíveis: alguém escrever `{{c1::` literal num texto
  // (raro, e o aviso é só amarelo — não bloqueia).
  const startsCount = (content.match(/\{\{c\d+::/g) || []).length;
  const malformedCount = startsCount - all.matches.length;

  // Sem NENHUMA lacuna válida. Pode ser conteúdo sem cloze de verdade
  // OU tudo está mal-formado.
  if (!all.hasCloze) {
    if (malformedCount > 0) {
      return (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-danger/25 bg-danger-soft p-2.5 text-[11px] leading-relaxed text-danger-fg">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            {malformedCount === 1
              ? 'Uma tag de lacuna está mal-formada.'
              : `${malformedCount} tags de lacuna estão mal-formadas.`}{' '}
            Toda lacuna precisa terminar com{' '}
            <code className="font-mono">{'}}'}</code> (duas chaves). Cheque se
            você não escreveu <code className="font-mono">{'}'}</code> sozinho
            no fim de alguma.
          </span>
        </div>
      );
    }
    return (
      <div className="mt-2 rounded-lg border border-subtle bg-surface-2 p-3 text-[11px] leading-relaxed text-faint">
        Nenhuma lacuna detectada. Use{' '}
        <code className="font-mono text-muted">{'{{c1::resposta}}'}</code> para
        criar uma — cada chave (<code className="font-mono text-muted">c1</code>,{' '}
        <code className="font-mono text-muted">c2</code>, …) vira uma revisão
        independente.
      </div>
    );
  }

  const orderedKeys = sortClozeKeys(all.keys);
  const indices = orderedKeys.map(k => Number(k.slice(1)));
  const hasZero = indices.includes(0);
  const maxIdx = Math.max(...indices);
  // Gaps: índices esperados de 1 até maxIdx que não aparecem.
  const missing: number[] = [];
  for (let i = 1; i <= maxIdx; i++) {
    if (!indices.includes(i)) missing.push(i);
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-muted">
        {orderedKeys.length === 1
          ? '1 lacuna detectada'
          : `${orderedKeys.length} lacunas detectadas`}
        :{' '}
        <span className="font-mono normal-case text-faint">
          {orderedKeys.join(', ')}
        </span>
      </div>

      {malformedCount > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger-soft p-2.5 text-[11px] leading-relaxed text-danger-fg">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            {malformedCount === 1
              ? 'Há 1 tag mal-formada que foi ignorada — provavelmente um '
              : `Há ${malformedCount} tags mal-formadas que foram ignoradas — provavelmente `}
            <code className="font-mono">{'}'}</code> simples no lugar de{' '}
            <code className="font-mono">{'}}'}</code>.
          </span>
        </div>
      )}

      {hasZero && (
        <div className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger-soft p-2.5 text-[11px] leading-relaxed text-danger-fg">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            A chave <code className="font-mono">c0</code> não é válida — use{' '}
            <code className="font-mono">c1</code>,{' '}
            <code className="font-mono">c2</code>, etc.
          </span>
        </div>
      )}

      {missing.length > 0 && !hasZero && (
        <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft p-2.5 text-[11px] leading-relaxed text-warning-fg">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            Numeração com gap: faltam{' '}
            {missing.map(n => `c${n}`).join(', ')}. Funciona, mas geralmente é
            erro de digitação.
          </span>
        </div>
      )}

      {orderedKeys
        .filter(k => Number(k.slice(1)) > 0) // não renderiza preview de c0 (erro)
        .map(key => {
          const { questionText } = renderClozeForReview(content, key, false);
          return (
            <div
              key={key}
              className="rounded-lg border border-divider bg-surface p-3"
            >
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-accent-fg">
                <Lightbulb size={10} />
                <span>Revisão de</span>
                <code className="font-mono text-accent-fg">{key}</code>
              </div>
              <LatexMarkdown content={questionText} attachments={attachments} />
            </div>
          );
        })}
    </div>
  );
}
