import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, Square, Clock, Check, AlertCircle } from 'lucide-react';
import { db, uid } from '@/db/database';
import type { Route } from '@/components/Sidebar';
import type {
  FocusGoal,
  FocusScope,
  SessionEndReason,
  StudySessionLog,
} from '@/types/focus';
import { ReviewPage } from './ReviewPage';
import { formatClock, formatDurationLong } from '@/utils/focus';

interface Props {
  focusSeconds: number;
  breakSeconds: number;
  scope: FocusScope;
  goal: FocusGoal;
  onNavigate: (r: Route) => void;
}

/**
 * FocusSessionPage — orquestra uma sessão de foco em cima da ReviewPage.
 *
 * # Arquitetura
 *
 * Esta página NÃO duplica nada da revisão. Ela:
 *
 *   1. Monta `<ReviewPage>` com `deckId` derivado do escopo (`undefined`
 *      para "todos", deckId específico para "deck").
 *   2. Captura cada revisão via `onAfterReview` (callback opcional
 *      adicionado à ReviewPage nesta fase, no-op fora de sessão).
 *   3. Renderiza o `FocusOverlay` no topo — timer, contadores, pausar,
 *      encerrar.
 *   4. Intercepta a saída via `onExit` (Esc / botão voltar dentro da
 *      Review). Em vez de navegar pra Home, abre modal "Encerrar sessão?".
 *   5. Quando o timer expira OU a meta é atingida OU o usuário encerra,
 *      grava `StudySessionLog` no banco e navega pra `focus-summary`.
 *
 * # Pausa / retomada
 *
 * O timer trabalha com `now() - startedAt - pausedTotalMs`. Quando
 * pausado, acumulamos o intervalo paused em `pausedTotalMs`. A duração
 * efetiva gravada no log é exatamente esse mesmo cálculo — o tempo
 * que o relógio "viu" passar. Pausar não bloqueia a UI da Review (o
 * usuário pode continuar lendo o cartão); apenas para o relógio.
 *
 * # Por que não usar useEffect com setInterval pra atualizar `elapsed`
 *
 * Usamos um `setInterval(250ms)` pra forçar re-render do overlay, mas
 * o ESTADO real do tempo é sempre derivado de `Date.now()` no momento
 * do render. Isso evita drift acumulado (típico bug de timers em JS)
 * e funciona bem mesmo se a aba fica em background e o setInterval
 * é throttled — quando volta, recalcula corretamente.
 */
export function FocusSessionPage({
  focusSeconds,
  breakSeconds,
  scope,
  goal,
  onNavigate,
}: Props) {
  // ─── State da sessão ─────────────────────────────────────────────────
  const startedAtRef = useRef(Date.now());
  const pausedTotalMsRef = useRef(0);
  const pauseStartedAtRef = useRef<number | null>(null);
  const [, forceTick] = useState(0); // só pra re-render

  const [paused, setPaused] = useState(false);
  const [reviews, setReviews] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);

  /** Quando a sessão acabou (timer / meta / fila / usuário), guardamos o motivo.
   *  A finalize só pode rodar uma vez — usamos `endedRef` pra travar e
   *  evitar dupla gravação se múltiplos triggers disparam juntos. */
  const endedRef = useRef(false);
  const [endReason, setEndReason] = useState<SessionEndReason | null>(null);
  /** Confirmação intermediária quando o usuário clica em encerrar/sair.
   *  Mostra o modal "Encerrar sessão?". Difere de `endReason` porque
   *  o usuário ainda pode cancelar. */
  const [askingExit, setAskingExit] = useState(false);

  // ─── Re-render do overlay a cada 250ms para o timer correr ───────────
  useEffect(() => {
    const i = window.setInterval(() => forceTick(t => t + 1), 250);
    return () => window.clearInterval(i);
  }, []);

  // ─── Cálculo derivado do tempo ───────────────────────────────────────
  const now = Date.now();
  let pausedMs = pausedTotalMsRef.current;
  if (paused && pauseStartedAtRef.current !== null) {
    pausedMs += now - pauseStartedAtRef.current;
  }
  const elapsedSec = Math.max(
    0,
    Math.floor((now - startedAtRef.current - pausedMs) / 1000),
  );
  const remainingSec = Math.max(0, focusSeconds - elapsedSec);

  // ─── Detecta término por timer (em cada render — barato) ─────────────
  useEffect(() => {
    if (endedRef.current) return;
    if (remainingSec <= 0 && !paused) {
      endedRef.current = true;
      setEndReason('timer');
    }
  }, [remainingSec, paused]);

  // ─── Pausar / retomar ────────────────────────────────────────────────
  function togglePause() {
    if (paused) {
      // Retomar: acumula o intervalo pausado.
      if (pauseStartedAtRef.current !== null) {
        pausedTotalMsRef.current += Date.now() - pauseStartedAtRef.current;
        pauseStartedAtRef.current = null;
      }
      setPaused(false);
    } else {
      pauseStartedAtRef.current = Date.now();
      setPaused(true);
    }
  }

  // ─── Hook que conta cada revisão dentro da ReviewPage ────────────────
  //
  // Contamos acerto/erro pelo `rating` final, não pelo `wasCorrect`:
  //
  //   - Cartões clássicos NÃO têm wasCorrect (sempre null) — não existe
  //     widget interativo determinando se a resposta foi certa. Se eu
  //     usasse `wasCorrect`, todos os classicos virariam "neutros" e o
  //     painel mostraria 0/0 mesmo após várias revisões.
  //
  //   - Cartões interativos têm wasCorrect, MAS o usuário pode sobrescrever
  //     o rating sugerido (ex: errou no widget mas marcou "Difícil" porque
  //     achou que a resposta foi quase certa). O rating é o sinal final
  //     e consciente.
  //
  // Por isso: rating === 1 conta como erro; rating ≥ 2 conta como acerto.
  // Mesma regra dos dois tipos de cartão. Simples e justa.
  const handleAfterReview = useCallback(
    (rating: number, _wasCorrect: boolean | null) => {
      setReviews(r => {
        const next = r + 1;
        // Verifica meta de revisões.
        if (goal.kind === 'reviews' && next >= goal.target) {
          if (!endedRef.current) {
            endedRef.current = true;
            setEndReason('goal');
          }
        }
        return next;
      });
      if (rating === 1) setWrong(w => w + 1);
      else setCorrect(c => c + 1);
    },
    [goal],
  );

  // ─── Saída interceptada (Esc, botão voltar) ──────────────────────────
  const handleExit = useCallback(() => {
    if (endedRef.current) {
      // Sessão já encerrou — sair direto.
      onNavigate({ name: 'home' });
      return;
    }
    setAskingExit(true);
  }, [onNavigate]);

  // ─── Fila esgotada organicamente ─────────────────────────────────────
  // O usuário revisou tudo que estava disponível. Encerra a sessão na
  // hora — não faz sentido manter cronômetro rodando se não há o que
  // fazer.
  const handleQueueEmpty = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setEndReason('queue-empty');
  }, []);

  function confirmExit() {
    if (endedRef.current) return;
    endedRef.current = true;
    setEndReason('user');
    setAskingExit(false);
  }

  function cancelExit() {
    setAskingExit(false);
  }

  // ─── Finalização: grava log e navega ─────────────────────────────────
  // Roda quando endReason vira não-nulo. Faz UMA gravação e vai pro resumo.
  useEffect(() => {
    if (!endReason) return;
    void (async () => {
      const startedAt = startedAtRef.current;
      const endedAt = Date.now();
      const durationSeconds = Math.max(
        0,
        Math.floor((endedAt - startedAt - pausedTotalMsRef.current) / 1000),
      );

      const log: StudySessionLog = {
        id: uid(),
        startedAt,
        endedAt,
        durationSeconds,
        reviews,
        correct,
        wrong,
        scopeKind: scope.kind,
        scopeId:
          scope.kind === 'deck'
            ? scope.deckId
            : scope.kind === 'folder'
            ? scope.folderId
            : null,
        endReason,
        // Mantido por compatibilidade com logs gravados antes do
        // refinamento do endReason. `endReason === 'timer'` é a verdade
        // canônica agora.
        completedByTimer: endReason === 'timer',
        configuredFocusSeconds: focusSeconds,
        createdAt: endedAt,
        updatedAt: endedAt,
      };
      await db.studySessionLogs.add(log);
      onNavigate({ name: 'focus-summary', logId: log.id, breakSeconds });
    })();
    // Roda só uma vez por endReason — não readicionamos deps que mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endReason]);

  // ─── deckId para a ReviewPage ────────────────────────────────────────
  const reviewDeckId = scope.kind === 'deck' ? scope.deckId : undefined;

  // ─── Estado de progresso "X / meta" ──────────────────────────────────
  const goalText =
    goal.kind === 'reviews' ? `${reviews}/${goal.target} cartões` : null;

  return (
    <div className="relative">
      {/* ─── Overlay flutuante com timer / stats / controles ─────────── */}
      <FocusOverlay
        remainingSec={remainingSec}
        elapsedSec={elapsedSec}
        focusSeconds={focusSeconds}
        reviews={reviews}
        correct={correct}
        wrong={wrong}
        paused={paused}
        onTogglePause={togglePause}
        onRequestExit={() => setAskingExit(true)}
        goalText={goalText}
      />

      {/* Espaço para o overlay sticky não cobrir o conteúdo. */}
      <div className="pt-2">
        <ReviewPage
          deckId={reviewDeckId}
          onNavigate={onNavigate}
          onAfterReview={handleAfterReview}
          onExit={handleExit}
          onQueueEmpty={handleQueueEmpty}
        />
      </div>

      {/* ─── Modal "Encerrar sessão?" ────────────────────────────────── */}
      <AnimatePresence>
        {askingExit && !endedRef.current && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={cancelExit}
          >
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 10, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-subtle bg-card p-5 shadow-xl"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-warning-soft p-2 text-warning-fg">
                  <AlertCircle size={18} />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-primary">
                    Encerrar sessão?
                  </h3>
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    As revisões já feitas continuam registradas no histórico.
                    Você verá o resumo da sessão antes de voltar.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={cancelExit}
                  className="rounded-md border border-divider bg-surface-2 px-3 py-1.5 text-xs text-primary hover:tint-1"
                >
                  Continuar revisando
                </button>
                <button
                  type="button"
                  onClick={confirmExit}
                  className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-on-accent hover:opacity-90"
                >
                  Encerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FocusOverlay — barra sticky no topo com timer / counters / controles
// ─────────────────────────────────────────────────────────────────────────────

function FocusOverlay({
  remainingSec,
  elapsedSec,
  focusSeconds,
  reviews,
  correct,
  wrong,
  paused,
  onTogglePause,
  onRequestExit,
  goalText,
}: {
  remainingSec: number;
  elapsedSec: number;
  focusSeconds: number;
  reviews: number;
  correct: number;
  wrong: number;
  paused: boolean;
  onTogglePause: () => void;
  onRequestExit: () => void;
  goalText: string | null;
}) {
  // Progresso 0..1. Quando pausado, ainda mostra o quanto já passou.
  const ratio = focusSeconds > 0 ? elapsedSec / focusSeconds : 0;
  const lowTime = remainingSec <= 30 && remainingSec > 0;

  return (
    <div className="sticky top-0 z-50 -mx-6 px-6 py-2 bg-surface/95 backdrop-blur-sm border-b border-divider">
      <div className="flex items-center gap-3">
        {/* Clock */}
        <div
          className={`flex items-center gap-1.5 font-mono text-base font-semibold tabular-nums ${
            paused
              ? 'text-muted'
              : lowTime
              ? 'text-warning-fg animate-pulse'
              : 'text-primary'
          }`}
          aria-label="Tempo restante"
        >
          <Clock size={14} />
          {formatClock(remainingSec)}
          {paused && (
            <span className="text-[10px] uppercase tracking-widest text-faint ml-1">
              (pausado)
            </span>
          )}
        </div>

        {/* Counters */}
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted">
          <span>
            <strong className="text-primary">{reviews}</strong> rev
          </span>
          <span className="text-success-fg">
            <Check size={11} className="inline -mt-0.5" /> {correct}
          </span>
          <span className="text-danger-fg">
            <span className="inline-block w-2.5 h-2.5">×</span> {wrong}
          </span>
          {goalText && (
            <span className="text-faint">
              · meta: <span className="text-secondary">{goalText}</span>
            </span>
          )}
        </div>

        {/* Spacer push controls right */}
        <div className="flex-1" />

        {/* Controls */}
        <button
          type="button"
          onClick={onTogglePause}
          title={paused ? 'Retomar' : 'Pausar'}
          aria-label={paused ? 'Retomar' : 'Pausar'}
          className="rounded-md border border-divider bg-surface-2 p-1.5 text-secondary hover:tint-1"
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
        <button
          type="button"
          onClick={onRequestExit}
          title="Encerrar sessão"
          aria-label="Encerrar sessão"
          className="rounded-md border border-divider bg-surface-2 p-1.5 text-danger-fg hover:bg-danger-soft"
        >
          <Square size={13} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-1.5 h-0.5 w-full bg-surface-2 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${
            paused
              ? 'bg-muted'
              : lowTime
              ? 'bg-gradient-to-r from-amber-500 to-orange-500'
              : 'bg-gradient-to-r from-emerald-500 to-teal-500'
          }`}
          animate={{ width: `${Math.min(100, ratio * 100)}%` }}
          transition={{ duration: 0.2 }}
        />
      </div>
    </div>
  );
}

/** Helper opcional para formatar duração no overlay (caso queira mostrar
 *  "decorrido X de Y" em alguma versão futura). Não usado por enquanto
 *  no overlay enxuto. */
export function formatElapsedHint(
  elapsedSec: number,
  focusSeconds: number,
): string {
  return `${formatDurationLong(elapsedSec)} de ${formatDurationLong(focusSeconds)}`;
}
