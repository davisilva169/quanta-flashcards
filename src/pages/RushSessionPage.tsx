import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Zap,
  Clock,
  Flame,
  Trophy,
  Check,
  X as XIcon,
  RotateCw,
  Home,
} from 'lucide-react';
import { db, uid } from '@/db/database';
import {
  getInteraction,
  isRushCompatible,
  type Flashcard,
} from '@/types/flashcard';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import { InteractiveCardBody } from '@/components/InteractiveCardBody';
import { RewardModal } from '@/components/RewardModal';
import { ImageLightbox } from '@/components/ImageLightbox';
import { useConfirm } from '@/components/ConfirmModal';
import type { Attachment } from '@/types/attachment';
import { bumpStreak } from '@/utils/streak';
import { parseClozeAll } from '@/utils/cloze';
import { applyBonuses } from '@/utils/xp';
import { reviewsTodayCount } from '@/utils/stats';
import {
  DEFAULT_SHORTCUTS,
  matchShortcut,
  resolveShortcuts,
  type ShortcutMap,
} from '@/utils/shortcuts';
import { rankForLevel } from '@/utils/ranks';
import { pickReward, type Reward, type RewardKind } from '@/utils/rewards';
import { resolveColor, withAlpha } from '@/utils/folderColors';
import { now } from '@/utils/dates';
import type { Route } from '@/components/Sidebar';

interface Props {
  deckId: string | null;
  /** Total seconds; null = unlimited (run until queue empty). */
  durationSec: number | null;
  onNavigate: (r: Route) => void;
}

// XP awarded per correct Rush answer. Smaller than regular SR review (10 XP)
// because Rush is auto-graded (lower learning value), but still meaningful
// so a good Rush session still moves the level bar.
const RUSH_XP_PER_CORRECT = 3;

interface PendingReward {
  kind: RewardKind;
  reward: Reward;
  level?: number;
  rankedUp?: boolean;
}

interface SessionResult {
  total: number;
  correct: number;
  bestStreak: number;
  durationMs: number;
  xpEarned: number;
}

type Phase = 'loading' | 'pending' | 'graded' | 'finished';

export function RushSessionPage({ deckId, durationSec, onNavigate }: Props) {
  // ── Queue & per-card state ────────────────────────────────────────────────
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [userAnswer, setUserAnswer] = useState('');

  const [decksById, setDecksById] = useState<Map<string, Deck>>(new Map());
  const [foldersById, setFoldersById] = useState<Map<string, Folder>>(new Map());

  // ── Score state ───────────────────────────────────────────────────────────
  // We keep BOTH React state (for re-render) and refs (for fresh reads inside
  // closures). Without the refs, `finishSession` and the timer callback would
  // capture stale snapshots of these values — that was the original off-by-one
  // bug ("answered 2, summary showed 1"): setState is async, and the
  // setTimeout-after-answer fired with a `correctCount` that hadn't been
  // committed yet. Refs are updated synchronously on the same tick as the
  // setState, so any code reading from the ref sees the up-to-date value.
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const correctCountRef = useRef(0);
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const xpEarnedRef = useRef(0);
  const wasCorrectRef = useRef<boolean | null>(null);
  const cursorRef = useRef(0);

  // ── Timer state ───────────────────────────────────────────────────────────
  const [secondsLeft, setSecondsLeft] = useState<number | null>(durationSec);
  const sessionStartRef = useRef<number>(now());
  const cardShownAtRef = useRef<number>(now());

  // Visual scale; read from Settings on mount. Same default as ReviewPage.
  const [fontScale, setFontScale] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg');
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(DEFAULT_SHORTCUTS);

  const confirm = useConfirm();

  // ── Final summary + reward modals ────────────────────────────────────────
  const [result, setResult] = useState<SessionResult | null>(null);
  const [pendingRewards, setPendingRewards] = useState<PendingReward[]>([]);
  const currentReward = pendingRewards[0] ?? null;

  // ── Setup: load + shuffle Rush-compatible cards ──────────────────────────
  useEffect(() => {
    (async () => {
      const allCards = await (deckId
        ? db.cards.where('deckId').equals(deckId).toArray()
        : db.cards.toArray());
      const compatible = allCards.filter(isRushCompatible);
      // Fisher-Yates shuffle for unbiased mixing
      for (let i = compatible.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [compatible[i], compatible[j]] = [compatible[j], compatible[i]];
      }
      setQueue(compatible);
      setDecksById(
        new Map((await db.decks.toArray()).map(d => [d.id, d])),
      );
      setFoldersById(
        new Map((await db.folders.toArray()).map(f => [f.id, f])),
      );
      const settings = await db.settings.get('singleton');
      if (settings?.reviewFontScale) setFontScale(settings.reviewFontScale);
      setShortcuts(resolveShortcuts(settings?.shortcuts));
      sessionStartRef.current = now();
      cardShownAtRef.current = now();
      setPhase(compatible.length === 0 ? 'finished' : 'pending');
    })();
  }, [deckId]);

  // ── Reset per-card state when the cursor moves to a new card ─────────────
  useEffect(() => {
    if (phase === 'pending' && queue[cursor]) {
      cardShownAtRef.current = now();
      wasCorrectRef.current = null;
      setWasCorrect(null);
      setUserAnswer('');
    }
  }, [cursor, phase]);

  // Attachments for the card at the cursor. Loaded fresh on every move; same
  // bounded-memory strategy as ReviewPage.
  const [currentAttachments, setCurrentAttachments] = useState<Attachment[]>([]);
  const [lightboxAtt, setLightboxAtt] = useState<Attachment | null>(null);
  useEffect(() => {
    let cancelled = false;
    const c = queue[cursor];
    if (!c) {
      setCurrentAttachments([]);
      return;
    }
    (async () => {
      const atts = await db.attachments.where('cardId').equals(c.id).toArray();
      if (!cancelled) setCurrentAttachments(atts);
    })();
    return () => {
      cancelled = true;
    };
  }, [cursor, queue]);

  const finishSession = useCallback(async () => {
    setPhase('finished');
    const elapsed = now() - sessionStartRef.current;

    // Read the latest stats so we can detect milestones crossed *during* the
    // session (we wrote XP/totalReviews incrementally, but bonus checks
    // only run here at the end to avoid interrupting the flow).
    const stats = await db.userStats.get('singleton');
    const settings = await db.settings.get('singleton');
    if (stats && settings) {
      const allLogs = await db.reviewLogs.toArray();
      const reviewsToday = reviewsTodayCount(allLogs);
      const bonusResult = applyBonuses(stats, reviewsToday, settings.dailyGoal);
      if (bonusResult.bonuses.length > 0) {
        // Persist any extra XP from bonuses (level rewards / daily goal)
        await db.userStats.put(bonusResult.stats);
      }

      // Queue reward modals (after the summary screen renders)
      const rewards: PendingReward[] = [];
      if (bonusResult.bonuses.some(b => b.includes('meta diária'))) {
        rewards.push({ kind: 'daily', reward: pickReward('daily') });
      }
      if (bonusResult.leveledUp) {
        rewards.push({
          kind: 'levelUp',
          reward: pickReward('levelUp'),
          level: bonusResult.newLevel,
          rankedUp: bonusResult.rankedUp,
        });
      }
      if (rewards.length > 0) {
        // Slight delay so the user reads the summary first.
        setTimeout(() => setPendingRewards(rewards), 600);
      }
    }

    // Read from refs (not state) so the summary reflects the actually-answered
    // count, not a stale closure snapshot. See note next to ref declarations.
    setResult({
      total:
        cursorRef.current + (wasCorrectRef.current !== null ? 1 : 0),
      correct: correctCountRef.current,
      bestStreak: bestStreakRef.current,
      durationMs: elapsed,
      xpEarned: xpEarnedRef.current,
    });
  }, []);

  // ── Timer tick ────────────────────────────────────────────────────────────
  // The countdown pauses while the card is graded — the user controls when to
  // move on (button "Próximo cartão"), and only the time spent reading the
  // question counts against the clock. That keeps the Rush honest: a hard
  // card with a long explanation shouldn't punish you on the next one.
  useEffect(() => {
    if (
      phase === 'finished' ||
      phase === 'graded' ||
      secondsLeft === null
    )
      return;
    if (secondsLeft <= 0) {
      finishSession();
      return;
    }
    const t = setTimeout(() => setSecondsLeft(s => (s ?? 0) - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft, finishSession]);

  // ── Per-card answer handler ───────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (correct: boolean, answerText: string) => {
      if (phase !== 'pending') return;
      const card = queue[cursor];
      if (!card) return;

      const ts = now();
      const rawDuration = ts - cardShownAtRef.current;
      const durationMs = Math.max(0, Math.min(rawDuration, 2 * 60 * 1000));

      // 1. Update visible score. Refs are updated SYNCHRONOUSLY alongside the
      //    setState calls so finishSession (which reads from refs) always sees
      //    the latest values — even if invoked immediately after this.
      wasCorrectRef.current = correct;
      setWasCorrect(correct);
      setUserAnswer(answerText);
      setPhase('graded');
      if (correct) {
        correctCountRef.current += 1;
        setCorrectCount(correctCountRef.current);
        streakRef.current += 1;
        setStreak(streakRef.current);
        if (streakRef.current > bestStreakRef.current) {
          bestStreakRef.current = streakRef.current;
          setBestStreak(bestStreakRef.current);
        }
        xpEarnedRef.current += RUSH_XP_PER_CORRECT;
        setXpEarned(xpEarnedRef.current);
      } else {
        streakRef.current = 0;
        setStreak(0);
      }

      // 2. Persist a ReviewLog. Note: Rush *intentionally* does NOT update
      //    SR fields on the card (due, scheduledDays, ease) — it's extra
      //    practice, not canonical scheduling. prevState === newState.
      await db.reviewLogs.add({
        id: uid(),
        cardId: card.id,
        deckId: card.deckId,
        rating: correct ? 3 : 1,
        reviewedAt: ts,
        intervalDays: 0,
        prevState: card.state,
        newState: card.state,
        durationMs,
      });

      // 3. Update userStats incrementally — XP + totalReviews + streak.
      //    Bonus modals are deferred to session-end so they don't break flow.
      const stats = await db.userStats.get('singleton');
      if (stats) {
        const xpGain = correct ? RUSH_XP_PER_CORRECT : 0;
        let newStats = bumpStreak({ ...stats, xp: stats.xp + xpGain });
        newStats = { ...newStats, totalReviews: newStats.totalReviews + 1 };
        await db.userStats.put(newStats);
      }

      // 4. NO auto-advance. The user is in control now — they click
      //    "Próximo cartão" (or press Enter) which calls advanceCard().
      //    The timer is also paused while phase === 'graded' (see useEffect),
      //    so reading the explanation doesn't eat session time.
    },
    [phase, cursor, queue],
  );

  /**
   * Advance to the next card or end the session if the queue is exhausted.
   * Called from the "Próximo cartão" button (and Enter key) after the user
   * has read the feedback.
   */
  const advanceCard = useCallback(() => {
    if (phase !== 'graded') return;
    if (cursorRef.current + 1 >= queue.length) {
      finishSession();
    } else {
      cursorRef.current += 1;
      setCursor(cursorRef.current);
      setPhase('pending');
    }
  }, [phase, queue.length, finishSession]);

  // Keyboard shortcuts for Rush. Two actions only: `advance` (Enter by
  // default, fires on graded feedback to move to the next card) and
  // `exit` (Escape by default, aborts the session). Both honor the
  // user's remapped keys from Settings.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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
        abort();
        return;
      }
      if (
        phase === 'graded' &&
        matchShortcut(e, shortcuts.advance) &&
        !e.repeat
      ) {
        e.preventDefault();
        advanceCard();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, advanceCard, shortcuts]);

  async function abort() {
    if (phase !== 'finished') {
      const ok = await confirm({
        title: 'Sair do Rush?',
        message:
          'Os cartões já respondidos ficam contabilizados.\n\nVocê pode começar uma nova sessão depois.',
        confirmLabel: 'Sair',
      });
      if (!ok) return;
    }
    onNavigate({ name: 'home' });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted">
        Preparando fila…
      </div>
    );
  }

  if (phase === 'finished' && result) {
    return (
      <RushSummary
        result={result}
        onRestart={() => onNavigate({ name: 'rush-setup' })}
        onHome={() => onNavigate({ name: 'home' })}
        currentReward={currentReward}
        onCloseReward={() => setPendingRewards(prev => prev.slice(1))}
      />
    );
  }

  const card = queue[cursor];
  if (!card) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted">
        Sem cartões compatíveis.
      </div>
    );
  }

  const total = queue.length;
  const accuracy = cursor === 0 ? 0 : correctCount / cursor;
  const ix = getInteraction(card);
  const deck = decksById.get(card.deckId);
  const folder = deck?.folderId ? foldersById.get(deck.folderId) : null;
  const cardColor = deck ? resolveColor(deck.colorKey) : null;

  // ── Multi-cloze no Rush: limitação declarada ──────────────────────────
  //
  // O Rush opera sobre Flashcards diretamente — não passa por
  // `enumerateItems`. Por isso, em cartões multi-cloze (`{{c1::...}}` +
  // `{{c2::...}}` no mesmo front), só a primeira chave é revisada
  // (default `'c1'` em `<InteractiveCardBody>`). As outras lacunas
  // aparecem em texto puro como contexto, e o agendamento de SR não as
  // afeta — só o estado raiz do cartão (que reflete c1 após a refatoração
  // do Bloco F) é atualizado.
  //
  // Refinar isso significaria virtualizar a fila do Rush em items, igual
  // à ReviewPage — trabalho considerável que dobraria o escopo do Bloco F.
  // Decisão: aceitar a limitação nesta fase, comunicar explicitamente ao
  // usuário via aviso visual abaixo, e tratar como pendência futura.
  const clozeKeysInCard =
    ix.kind === 'cloze' ? parseClozeAll(card.front).keys : [];
  const isMultiCloze = clozeKeysInCard.length > 1;

  return (
    <div className="min-h-[80vh] flex flex-col">
      <RushTopBar
        secondsLeft={secondsLeft}
        score={correctCount}
        attempted={cursor + (phase === 'graded' ? 1 : 0)}
        total={total}
        streak={streak}
        accuracy={accuracy}
        onAbort={abort}
      />

      <div className="flex-1 flex flex-col items-center justify-center gap-6 mt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={card.id + phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="w-full max-w-4xl rounded-2xl border border-subtle bg-gradient-to-br from-card to-surface shadow-soft p-8 min-h-[320px]"
          >
            {deck && cardColor && (
              <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted">
                <div
                  className="flex h-5 w-5 items-center justify-center rounded"
                  style={{ backgroundColor: withAlpha(cardColor.hex, 0.15) }}
                >
                  <Zap size={11} style={{ color: cardColor.hex }} />
                </div>
                {folder && (
                  <>
                    <span>{folder.name}</span>
                    <span className="text-faint">›</span>
                  </>
                )}
                <span className="text-secondary">{deck.name}</span>
                <span className="ml-auto text-faint">{ix.kind.replace('_', ' ')}</span>
              </div>
            )}

            {isMultiCloze && (
              <div className="mb-3 rounded-md border border-warning/25 bg-warning-soft px-2.5 py-1.5 text-[11px] leading-relaxed text-warning-fg">
                Este cartão tem {clozeKeysInCard.length} lacunas. No Rush,
                apenas a primeira (<code className="font-mono">c1</code>) é
                revisada — use a revisão normal para passar por todas.
              </div>
            )}

            <InteractiveCardBody
              card={card}
              phase={phase === 'graded' ? 'graded' : 'pending'}
              userAnswer={userAnswer}
              wasCorrect={wasCorrect ?? undefined}
              onSubmit={handleSubmit}
              disabled={phase === 'graded'}
              fontScale={fontScale}
              attachments={currentAttachments}
              onImageClick={setLightboxAtt}
            />

            {/*
              Manual advance. The timer pauses on `graded` (see Timer tick
              useEffect) so users can read the explanation without losing
              session time. They control the pace; Enter or click moves on.
            */}
            {phase === 'graded' && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <button
                  onClick={advanceCard}
                  autoFocus
                  className="px-6 py-2.5 rounded-lg bg-accent text-on-accent font-medium hover:bg-accent-400 shadow-soft transition-colors"
                >
                  {cursor + 1 >= queue.length
                    ? 'Concluir sessão'
                    : 'Próximo cartão →'}
                </button>
                <div className="text-[11px] text-faint">
                  Enter para avançar
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <ImageLightbox
        attachment={lightboxAtt}
        onClose={() => setLightboxAtt(null)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top bar: timer + score + streak (always visible during session)
// ─────────────────────────────────────────────────────────────────────────────
function RushTopBar({
  secondsLeft,
  score,
  attempted,
  total,
  streak,
  accuracy,
  onAbort,
}: {
  secondsLeft: number | null;
  score: number;
  attempted: number;
  total: number;
  streak: number;
  accuracy: number;
  onAbort: () => void;
}) {
  const lowTime = secondsLeft !== null && secondsLeft <= 10;

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-subtle bg-surface p-4 backdrop-blur-sm">
      <button
        onClick={onAbort}
        className="flex items-center gap-1 text-sm text-muted hover:text-primary"
      >
        <ArrowLeft size={14} /> Sair
      </button>

      <div className="flex items-center gap-5">
        {/* Timer */}
        <div className="flex items-center gap-1.5">
          <Clock
            size={14}
            className={lowTime ? 'text-danger' : 'text-info'}
          />
          <span
            className={`font-mono text-lg tabular-nums ${
              lowTime ? 'text-danger-fg' : 'text-primary'
            }`}
          >
            {secondsLeft === null
              ? '∞'
              : `${Math.floor(secondsLeft / 60)
                  .toString()
                  .padStart(1, '0')}:${(secondsLeft % 60)
                  .toString()
                  .padStart(2, '0')}`}
          </span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-mono tabular-nums text-success-fg">
            {score}
          </span>
          <span className="text-faint">/</span>
          <span className="font-mono tabular-nums text-secondary">
            {attempted}
          </span>
          <span className="text-faint">de</span>
          <span className="font-mono tabular-nums text-muted">{total}</span>
        </div>

        {/* Streak — flame appears when streak >= 1 */}
        {streak >= 1 && (
          <div className="flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning-fg">
            <Flame size={12} className="text-warning" />
            {streak}
          </div>
        )}

        {/* Accuracy mini */}
        <div className="hidden sm:block text-xs text-muted">
          {Math.round(accuracy * 100)}% acerto
        </div>
      </div>

      <div className="w-12" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary (shown when phase = 'finished')
// ─────────────────────────────────────────────────────────────────────────────
function RushSummary({
  result,
  onRestart,
  onHome,
  currentReward,
  onCloseReward,
}: {
  result: SessionResult;
  onRestart: () => void;
  onHome: () => void;
  currentReward: PendingReward | null;
  onCloseReward: () => void;
}) {
  const accuracy = result.total === 0 ? 0 : result.correct / result.total;
  const minutes = Math.floor(result.durationMs / 60000);
  const seconds = Math.floor((result.durationMs % 60000) / 1000);
  const timeStr =
    minutes > 0 ? `${minutes}min ${seconds}s` : `${seconds}s`;

  // Slight tone for the headline based on accuracy
  const headline = useMemo(() => {
    if (result.total === 0) return 'Sessão encerrada antes de começar.';
    if (accuracy >= 0.9) return 'Domínio absoluto.';
    if (accuracy >= 0.75) return 'Sessão muito boa.';
    if (accuracy >= 0.5) return 'Sólido. Próxima vai ser melhor.';
    if (accuracy >= 0.25) return 'Material novo aparecendo. É assim mesmo.';
    return 'Cada tentativa ensina alguma coisa.';
  }, [accuracy, result.total]);

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-white">
          <Zap size={12} /> Rush concluído
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">{headline}</h1>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ResultCard
            icon={<Trophy size={14} className="text-warning" />}
            label="Acerto"
            value={`${Math.round(accuracy * 100)}%`}
            sub={`${result.correct} de ${result.total}`}
          />
          <ResultCard
            icon={<Flame size={14} className="text-warning" />}
            label="Melhor sequência"
            value={`${result.bestStreak}`}
            sub={result.bestStreak >= 5 ? 'em forma' : 'pode subir'}
          />
          <ResultCard
            icon={<Clock size={14} className="text-info" />}
            label="Tempo"
            value={timeStr}
          />
          <ResultCard
            icon={<Zap size={14} className="text-success" />}
            label="XP ganho"
            value={`+${result.xpEarned}`}
            sub={`${result.correct === 0 ? '—' : '3 XP por acerto'}`}
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={onRestart}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 px-4 py-2 text-sm font-medium text-white hover:from-orange-400 hover:to-rose-400"
          >
            <RotateCw size={14} /> Nova rodada
          </button>
          <button
            onClick={onHome}
            className="flex items-center gap-2 rounded-lg border border-divider tint-1 px-4 py-2 text-sm text-primary hover:tint-3"
          >
            <Home size={14} /> Voltar ao início
          </button>
        </div>

        <p className="text-xs text-faint leading-relaxed pt-3 border-t border-subtle">
          Rush não altera o agendamento dos seus cartões — eles voltam pra
          revisão normal no horário programado pelo SR. Os logs entram nas
          estatísticas e contam pra meta diária.
        </p>
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
          onClose={onCloseReward}
        />
      )}
    </>
  );
}

function ResultCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-subtle bg-surface-2 p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-faint">{sub}</div>}
    </div>
  );
}
