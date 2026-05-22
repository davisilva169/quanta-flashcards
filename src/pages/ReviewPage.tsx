import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X, CheckCircle2, Layers } from 'lucide-react';
import { db, uid } from '@/db/database';
import {
  getInteraction,
} from '@/types/flashcard';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import type { Rating } from '@/types/review';
import type { SchedulerConfig, Settings } from '@/types/stats';
import { ReviewButtons } from '@/components/ReviewButtons';
import { RewardModal } from '@/components/RewardModal';
import { InteractiveCardBody } from '@/components/InteractiveCardBody';
import { ImageLightbox } from '@/components/ImageLightbox';
import type { Attachment } from '@/types/attachment';
import {
  scheduleState,
  previewIntervals,
  DEFAULT_SCHEDULER_CONFIG,
} from '@/scheduler/scheduler';
import {
  enumerateItems,
  applyRatingResult,
  type ReviewItem,
} from '@/utils/reviewItems';
import { applyBonuses, xpFromRating } from '@/utils/xp';
import { rankForLevel } from '@/utils/ranks';
import { pickReward, type Reward, type RewardKind } from '@/utils/rewards';
import { bumpStreak } from '@/utils/streak';
import { reviewsTodayCount } from '@/utils/stats';
import {
  DEFAULT_SHORTCUTS,
  matchShortcut,
  resolveShortcuts,
  type ShortcutMap,
} from '@/utils/shortcuts';
import { now } from '@/utils/dates';
import { resolveColor, withAlpha } from '@/utils/folderColors';
import type { Route } from '@/components/Sidebar';

interface Props {
  deckId?: string;
  onNavigate: (r: Route) => void;
  /**
   * Hook opcional disparado depois que o usuário avalia um cartão.
   * Usado pela Sessão de foco para contar revisões em tempo real sem
   * precisar fazer polling no banco. `wasCorrect` é null para cartões
   * clássicos (onde acerto/erro não é determinado).
   *
   * Defaults to no-op. ReviewPage continua funcionando exatamente igual
   * quando essa prop é omitida (uso fora de sessão de foco).
   */
  onAfterReview?: (rating: number, wasCorrect: boolean | null) => void;
  /**
   * Sobrescreve o comportamento de "sair da revisão" (Esc, botão voltar,
   * fim natural da fila). Quando presente, a ReviewPage NÃO navega
   * sozinha; chama `onExit()` e quem está por cima decide.
   *
   * Para Sessão de foco: o overlay intercepta e mostra "Encerrar sessão?".
   * Defaults to undefined → comportamento histórico (navega via
   * `onNavigate({name:'home'})`).
   */
  onExit?: () => void;
  /**
   * Sinaliza ao wrapper que a fila de cartões esgotou *organicamente*
   * (o usuário terminou tudo, não pediu pra sair). A Sessão de foco usa
   * pra encerrar a sessão automaticamente sem precisar do botão "Voltar".
   *
   * Quando essa prop é passada:
   *   - dispara EXATAMENTE uma vez quando `sessionTotal > 0 && queue === 0`;
   *   - a tela "Sessão concluída" interna da Review NÃO renderiza, deixando
   *     o wrapper assumir o controle visual.
   *
   * Quando ausente (uso fora de sessão de foco), a tela "Sessão concluída"
   * renderiza como sempre.
   */
  onQueueEmpty?: () => void;
}

const NEW_PER_SESSION = 10;

interface PendingReward {
  kind: RewardKind;
  reward: Reward;
  level?: number;
  rankedUp?: boolean;
}

type Phase = 'pending' | 'graded';

export function ReviewPage({
  deckId,
  onNavigate,
  onAfterReview,
  onExit,
  onQueueEmpty,
}: Props) {
  /**
   * Fila de revisão como itens virtuais (ReviewItem), não cartões.
   *
   * Cada item representa uma unidade de revisão:
   *   - 1 item para cartões não-cloze (state = raiz do cartão).
   *   - N items para cartões multi-cloze (1 por chave detectada;
   *     state = `card.clozeStates[key]` com fallback lazy pro state
   *     raiz se ainda não migrado).
   *
   * Cartões cloze com 1 só chave continuam aparecendo como 1 item;
   * cartões cloze antigos sem `clozeStates` populado também aparecem
   * com 1 item cujo state é o raiz (migração lazy na primeira rating).
   */
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [phase, setPhase] = useState<Phase>('pending');
  // Captured when user submits an interactive answer; null for classic
  // (rating is purely user-driven). Drives the suggested rating button.
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [userAnswer, setUserAnswer] = useState<string>('');

  const [done, setDone] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [bonusToast, setBonusToast] = useState<string | null>(null);

  const [decksById, setDecksById] = useState<Map<string, Deck>>(new Map());
  const [foldersById, setFoldersById] = useState<Map<string, Folder>>(new Map());

  const [schedConfig, setSchedConfig] = useState<SchedulerConfig>(
    DEFAULT_SCHEDULER_CONFIG,
  );
  // Visual scale for the card body. Persisted in Settings; defaults to 'lg'
  // when absent (older settings rows are backfilled in ensureInitialized).
  const [fontScale, setFontScale] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg');
  /**
   * Global narration preferences. Optional — undefined means "no narration
   * for the whole app". Passed down to InteractiveCardBody, which only
   * renders narration controls when this is enabled AND the current card
   * has speech configured on the matching side.
   */
  const [speechSettings, setSpeechSettings] = useState<
    Settings['speech']
  >(undefined);
  /**
   * User-remappable shortcuts. Resolved at use-site against
   * DEFAULT_SHORTCUTS so legacy / partial maps still work.
   */
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(DEFAULT_SHORTCUTS);

  const [pendingRewards, setPendingRewards] = useState<PendingReward[]>([]);
  const currentReward = pendingRewards[0] ?? null;

  const cardShownAtRef = useRef<number>(now());

  useEffect(() => {
    (async () => {
      const cards = await (deckId
        ? db.cards.where('deckId').equals(deckId).toArray()
        : db.cards.toArray());

      // Enumera em items virtuais. Cartões clássicos viram 1 item;
      // cartões multi-cloze viram N items (1 por chave). Cartões cloze
      // antigos (sem clozeStates) viram 1 item cujo state é o raiz do
      // cartão — comportamento idêntico ao anterior até a primeira
      // rating, que migra para `clozeStates.c1`.
      const allItems = enumerateItems(cards);

      // Filtra "vencidos" e "novos" usando o STATE do item (não do
      // cartão). Pra cartões non-cloze é equivalente ao filtro antigo
      // (state.due === card.due, state.reps === card.reps).
      const due = allItems.filter(
        i => i.state.due <= now() && i.state.reps > 0,
      );
      const news = allItems
        .filter(i => i.state.reps === 0)
        .slice(0, NEW_PER_SESSION);

      due.sort((a, b) => a.state.due - b.state.due);
      const all = [...due, ...news];
      setQueue(all);
      setSessionTotal(all.length);

      const allDecks = await db.decks.toArray();
      const allFolders = await db.folders.toArray();
      setDecksById(new Map(allDecks.map(d => [d.id, d])));
      setFoldersById(new Map(allFolders.map(f => [f.id, f])));

      const settings = await db.settings.get('singleton');
      if (settings?.scheduler) setSchedConfig(settings.scheduler);
      if (settings?.reviewFontScale) setFontScale(settings.reviewFontScale);
      setSpeechSettings(settings?.speech);
      setShortcuts(resolveShortcuts(settings?.shortcuts));
    })();
  }, [deckId]);

  const current = queue[0];

  /**
   * Identificador único da unidade de revisão atual. Para cartões
   * non-cloze é só o `card.id`. Para cartões multi-cloze, o mesmo
   * cartão pode aparecer várias vezes na fila (uma por chave), então
   * compomos `cardId:clozeKey` para que os effects de attachments /
   * reset disparem corretamente quando o usuário PASSA de uma chave
   * pra outra do MESMO cartão.
   */
  const currentItemKey = current
    ? `${current.card.id}:${current.clozeKey ?? '_'}`
    : null;

  const intervals = useMemo(
    () => (current ? previewIntervals(current.state, now(), schedConfig) : null),
    [current, schedConfig],
  );

  // Attachments for the currently-shown card. Loaded fresh whenever the
  // front-of-queue card changes — keeps memory use bounded to one card at a
  // time, which is the right tradeoff for an app that may have decks with
  // hundreds of images.
  const [currentAttachments, setCurrentAttachments] = useState<Attachment[]>([]);
  const [lightboxAtt, setLightboxAtt] = useState<Attachment | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!current) {
      setCurrentAttachments([]);
      return;
    }
    (async () => {
      const atts = await db.attachments
        .where('cardId')
        .equals(current.card.id)
        .toArray();
      if (!cancelled) setCurrentAttachments(atts);
    })();
    return () => {
      cancelled = true;
    };
    // currentItemKey muda entre items DIFERENTES, mesmo quando o cartão
    // é o mesmo (clozeKey muda). Garante que as anexos são re-carregadas
    // se necessário (na prática são as mesmas, mas o reset é barato).
  }, [currentItemKey]);

  // Reset per-card state whenever the front-of-queue item changes.
  useEffect(() => {
    if (current) {
      cardShownAtRef.current = now();
      setPhase('pending');
      setWasCorrect(null);
      setUserAnswer('');
      setLightboxAtt(null); // close lightbox if the user moves on with it open
    }
  }, [currentItemKey]);

  const currentContext = useMemo(() => {
    if (!current) return null;
    const deck = decksById.get(current.card.deckId);
    if (!deck) return null;
    const folder = deck.folderId ? foldersById.get(deck.folderId) ?? null : null;
    return { deck, folder };
  }, [current, decksById, foldersById]);

  const finish = useCallback(() => {
    // Quando a Sessão de foco está embrulhando essa página, é ela quem
    // decide o que fazer: pode mostrar "Encerrar sessão?", pode ir pro
    // resumo, pode continuar. Quando não há onExit, mantemos o caminho
    // histórico (volta pra Home).
    if (onExit) {
      onExit();
      return;
    }
    onNavigate({ name: 'home' });
  }, [onNavigate, onExit]);

  // For classic cards: clicking "Mostrar resposta" just transitions the phase.
  function reveal() {
    if (phase !== 'pending') return;
    setPhase('graded');
  }

  // For interactive cards: when the widget reports a result.
  function handleInteractionSubmit(correct: boolean, answer: string) {
    setWasCorrect(correct);
    setUserAnswer(answer);
    setPhase('graded');
  }

  const onRate = useCallback(
    async (rating: Rating) => {
      if (!current) return;

      const ts = now();

      // ── Agendamento e persistência do item ──────────────────────────
      //
      // Multi-cloze: cada chave tem seu próprio SchedulingState. O
      // `scheduleState` opera no state do item; `applyRatingResult` o
      // grava no lugar certo do cartão (raiz ou clozeStates[key]) e
      // recalcula o `due` raiz como o MENOR `due` entre todas as chaves.
      //
      // Cartões non-cloze (clozeKey undefined) caem no caminho idêntico
      // ao anterior — applyRatingResult faz `...card, ...newState`.
      const { state: newState, intervalDays } = scheduleState(
        current.state,
        rating,
        ts,
        schedConfig,
      );
      const updatedCard = applyRatingResult(current.card, current, newState, ts);

      const stats = await db.userStats.get('singleton');
      const settings = await db.settings.get('singleton');
      if (!stats || !settings) return;

      const xpGain = xpFromRating(rating);
      let newStats = bumpStreak({ ...stats, xp: stats.xp + xpGain });
      newStats = { ...newStats, totalReviews: newStats.totalReviews + 1 };

      await db.cards.put(updatedCard);
      const rawDuration = ts - cardShownAtRef.current;
      const durationMs = Math.max(0, Math.min(rawDuration, 2 * 60 * 1000));
      await db.reviewLogs.add({
        id: uid(),
        cardId: current.card.id,
        deckId: current.card.deckId,
        rating,
        reviewedAt: ts,
        intervalDays,
        prevState: current.state.state,
        newState: newState.state,
        durationMs,
        // Identifica QUAL chave foi revisada para cards multi-cloze;
        // undefined para non-cloze (preserva logs antigos compatíveis).
        clozeKey: current.clozeKey,
      });

      const allLogs = await db.reviewLogs.toArray();
      const reviewsToday = reviewsTodayCount(allLogs);
      const result = applyBonuses(newStats, reviewsToday, settings.dailyGoal);
      newStats = result.stats;
      await db.userStats.put(newStats);

      if (result.bonuses.length > 0) {
        setBonusToast(result.bonuses.join(' '));
        setTimeout(() => setBonusToast(null), 3500);
      }

      const newRewards: PendingReward[] = [];
      const dailyJustHit = result.bonuses.some(b => b.includes('meta diária'));
      if (dailyJustHit) {
        newRewards.push({ kind: 'daily', reward: pickReward('daily') });
      }
      if (result.leveledUp) {
        newRewards.push({
          kind: 'levelUp',
          reward: pickReward('levelUp'),
          level: result.newLevel,
          rankedUp: result.rankedUp,
        });
      }
      if (newRewards.length > 0) {
        setPendingRewards(prev => [...prev, ...newRewards]);
      }

      setQueue(q => {
        const rest = q.slice(1);
        if (rating === 1) {
          // Re-queue: mesmo item virtual (mesmo cartão, mesma chave),
          // com state atualizado. O updatedCard contém o novo state
          // tanto no raiz quanto em clozeStates[key] — manter ambos
          // sincronizados é o que applyRatingResult já garantiu.
          const requeued: ReviewItem = {
            ...current,
            card: updatedCard,
            state: newState,
          };
          return [...rest, requeued];
        }
        return rest;
      });
      setDone(d => d + (rating === 1 ? 0 : 1));

      // ── Reset per-card state explicitly ───────────────────────────────
      //
      // We can't rely on the `[currentItemKey]` effect alone: when the
      // user hits "Errei" on the LAST item in the queue, we re-queue the
      // same item at position 0 (same cardId + same clozeKey), so the
      // composite key doesn't change, the effect doesn't fire, and
      // `phase` would stay 'graded' — the user sees "Resultado: Errei"
      // and the only way out is to click Errei AGAIN (which silently
      // re-runs onRate, banking another XP tick without advancing).
      //
      // Resetting here covers every case uniformly. React 18 batches
      // these with the setQueue above, so there's no extra render.
      setPhase('pending');
      setWasCorrect(null);
      setUserAnswer('');
      cardShownAtRef.current = now();

      // Hook para Sessão de foco. Conta acerto/erro pelo rating final
      // (em FocusSessionPage). `wasCorrect` continua sendo passado pra
      // compat — ainda pode ser útil pra outras telas no futuro.
      onAfterReview?.(rating, wasCorrect);
    },
    [current, schedConfig, onAfterReview, wasCorrect],
  );

  // Suggested rating: green check on Bom if interactive correct,
  // red X-equivalent on Errei if interactive wrong, no suggestion for classic.
  const suggestedRating: Rating | null =
    wasCorrect === true ? 3 : wasCorrect === false ? 1 : null;

  // Keyboard shortcuts — all keys resolved from `shortcuts`, which the user
  // can remap in Settings. `matchShortcut` also rejects Ctrl/Cmd/Alt
  // combinations so the user's browser shortcuts keep working.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (currentReward) return;
      // Don't intercept while the user is typing (cloze answer field, etc).
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (matchShortcut(e, shortcuts.exit)) {
        e.preventDefault();
        finish();
        return;
      }
      if (!current) return;
      const ix = getInteraction(current.card);
      // Reveal works only for classic cards in pending phase. For
      // interactive variants the user must complete the widget first.
      if (
        phase === 'pending' &&
        ix.kind === 'classic' &&
        matchShortcut(e, shortcuts.reveal)
      ) {
        e.preventDefault();
        reveal();
        return;
      }
      if (phase === 'graded') {
        if (matchShortcut(e, shortcuts.rateAgain)) {
          e.preventDefault();
          onRate(1);
        } else if (matchShortcut(e, shortcuts.rateHard)) {
          e.preventDefault();
          onRate(2);
        } else if (matchShortcut(e, shortcuts.rateGood)) {
          e.preventDefault();
          onRate(3);
        } else if (matchShortcut(e, shortcuts.rateEasy)) {
          e.preventDefault();
          onRate(4);
        }
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, current, onRate, finish, currentReward, shortcuts]);

  // ── Esgotamento orgânico da fila → sinaliza ao wrapper ───────────────
  //
  // Sessão de foco quer reagir a "o usuário terminou tudo" SEM exigir
  // que ele clique em "Voltar". Disparamos `onQueueEmpty` exatamente uma
  // vez via ref de proteção. Se o wrapper estiver navegando pra outra
  // tela (summary), o segundo dispatch nunca acontece — mas o ref
  // protege também contra re-renders.
  const queueEmptyFiredRef = useRef(false);
  useEffect(() => {
    if (!onQueueEmpty) return;
    if (queueEmptyFiredRef.current) return;
    if (sessionTotal > 0 && queue.length === 0) {
      queueEmptyFiredRef.current = true;
      onQueueEmpty();
    }
  }, [sessionTotal, queue.length, onQueueEmpty]);

  // Quando estamos dentro de uma sessão de foco (wrapper passou
  // `onQueueEmpty`), NÃO renderizamos a tela "Sessão concluída" interna —
  // o wrapper já está finalizando a sessão e indo pro summary. Em uso
  // normal (sem wrapper), a tela continua aparecendo igualzinho.
  if (sessionTotal > 0 && queue.length === 0 && !onQueueEmpty) {
    return (
      <>
        <div className="min-h-[70vh] flex flex-col items-center justify-center text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-success-soft border border-success/30 flex items-center justify-center text-success-fg mb-4">
            <CheckCircle2 size={28} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Sessão concluída.
          </h2>
          <p className="text-muted mt-2 max-w-md">
            {done} cartões revisados. O ritmo é seu maior multiplicador.
          </p>
          <button
            onClick={finish}
            className="mt-6 px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-400 text-on-accent font-medium"
          >
            Voltar
          </button>
        </div>
        {currentReward && (
          <RewardModal
            open={true}
            kind={currentReward.kind}
            initialReward={currentReward.reward}
            rank={
              currentReward.kind === 'levelUp' && currentReward.level
                ? rankForLevel(currentReward.level)
                : undefined
            }
            headline={
              currentReward.kind === 'levelUp'
                ? currentReward.rankedUp
                  ? `Novo posto: ${rankForLevel(currentReward.level!).title}`
                  : `Nível ${currentReward.level} desbloqueado`
                : undefined
            }
            onClose={() => setPendingRewards(prev => prev.slice(1))}
          />
        )}
      </>
    );
  }

  if (sessionTotal === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
        <p className="text-muted">Nada pra revisar agora.</p>
        <button
          onClick={finish}
          className="mt-4 px-4 py-2 rounded-lg hover:tint-1 text-sm"
        >
          Voltar
        </button>
      </div>
    );
  }

  const progressRatio = sessionTotal === 0 ? 0 : done / sessionTotal;
  const cardColor = currentContext
    ? resolveColor(currentContext.deck.colorKey)
    : null;
  const cardInteractionKind = current ? getInteraction(current.card).kind : 'classic';

  return (
    <div className="min-h-[80vh] flex flex-col">
      <header className="flex items-center justify-between mb-6">
        <button
          onClick={finish}
          className="flex items-center gap-1 text-sm text-muted hover:text-primary"
        >
          <ArrowLeft size={14} /> Sair
        </button>
        <div className="text-sm text-muted">
          {done} / {sessionTotal}
        </div>
        <button
          onClick={finish}
          className="p-1.5 rounded-md hover:tint-1 text-muted"
        >
          <X size={16} />
        </button>
      </header>

      <div className="h-1 w-full rounded-full tint-1 overflow-hidden mb-8">
        <motion.div
          className="h-full bg-gradient-to-r from-accent-400 to-accent-600"
          animate={{ width: `${progressRatio * 100}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <AnimatePresence mode="wait">
          {current && (
            <motion.div
              key={currentItemKey + ':' + phase}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-4xl rounded-2xl border border-subtle bg-gradient-to-br from-card to-surface shadow-soft p-10 min-h-[320px] flex flex-col justify-center"
            >
              {currentContext && cardColor && (
                <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted">
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded"
                    style={{ backgroundColor: withAlpha(cardColor.hex, 0.15) }}
                  >
                    <Layers size={11} style={{ color: cardColor.hex }} />
                  </div>
                  {currentContext.folder && (
                    <>
                      <span>{currentContext.folder.name}</span>
                      <span className="text-faint">›</span>
                    </>
                  )}
                  <span className="text-secondary">{currentContext.deck.name}</span>
                </div>
              )}

              <InteractiveCardBody
                card={current.card}
                activeClozeKey={current.clozeKey}
                phase={phase}
                userAnswer={userAnswer}
                wasCorrect={wasCorrect ?? undefined}
                onSubmit={handleInteractionSubmit}
                fontScale={fontScale}
                attachments={currentAttachments}
                onImageClick={setLightboxAtt}
                speechSettings={speechSettings}
                narrationKey={shortcuts.toggleNarration}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full max-w-3xl flex flex-col items-center gap-4">
          {phase === 'pending' && cardInteractionKind === 'classic' ? (
            <button
              onClick={reveal}
              className="px-8 py-3 rounded-xl bg-accent hover:bg-accent-400 text-on-accent font-medium shadow-glow"
            >
              Mostrar resposta{' '}
              <span className="ml-2 text-xs opacity-70">(espaço)</span>
            </button>
          ) : phase === 'graded' && intervals ? (
            <ReviewButtons
              intervals={intervals}
              onRate={onRate}
              suggested={suggestedRating}
            />
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {bonusToast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-6 right-6 px-4 py-3 rounded-xl bg-accent-soft border border-accent/40 text-accent-fg text-sm shadow-glow"
          >
            {bonusToast}
          </motion.div>
        )}
      </AnimatePresence>

      {currentReward && (
        <RewardModal
          open={true}
          kind={currentReward.kind}
          initialReward={currentReward.reward}
          rank={
            currentReward.kind === 'levelUp' && currentReward.level
              ? rankForLevel(currentReward.level)
              : undefined
          }
          headline={
            currentReward.kind === 'levelUp'
              ? currentReward.rankedUp
                ? `Novo posto: ${rankForLevel(currentReward.level!).title}`
                : `Nível ${currentReward.level} desbloqueado`
              : undefined
          }
          onClose={() => setPendingRewards(prev => prev.slice(1))}
        />
      )}

      <ImageLightbox
        attachment={lightboxAtt}
        onClose={() => setLightboxAtt(null)}
      />
    </div>
  );
}
