import { useEffect, useMemo, useState } from 'react';
import {
  Flame,
  Trophy,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  HelpCircle,
} from 'lucide-react';
import { db } from '@/db/database';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import type { Flashcard } from '@/types/flashcard';
import type { ReviewLog } from '@/types/review';
import type { UserStats } from '@/types/stats';
import { StatCard } from '@/components/StatCard';
import { ProgressRing } from '@/components/ProgressRing';
import { Collapsible } from '@/components/Collapsible';
import { StatsBarChart, type StatsBarChartDatum } from '@/components/StatsBarChart';
import {
  categorize,
  isOverdue,
  reviewsByDay,
  reviewsTodayCount,
  deckProgress,
} from '@/utils/stats';
import { progressToNextLevel } from '@/utils/xp';
import { resolveColor, withAlpha } from '@/utils/folderColors';
import { getAccuracyQuote } from '@/utils/accuracyQuotes';
import { toDayKey } from '@/utils/dates';

// Phase 3 — floating drill-down panels. Each StatCard above the fold opens
// one of these. Filters (scope + period) live inside each panel and persist
// for the session only — never written to the DB.
import { RevisionsPanel } from '@/components/stats-panels/RevisionsPanel';
import { StreakPanel } from '@/components/stats-panels/StreakPanel';
import { StudyTimePanel } from '@/components/stats-panels/StudyTimePanel';
import { AccuracyPanel } from '@/components/stats-panels/AccuracyPanel';
import type {
  StatsScope,
  StatsPeriod,
} from '@/utils/statsAnalysis';

type PanelKind = 'revisions' | 'streak' | 'time' | 'accuracy' | null;

const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function dowLabelFromIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return DOW_LABELS[dt.getDay()];
}

/**
 * Format milliseconds as "Xh Ymin", "Xmin", or "Xs". Tuned for the daily
 * total range (seconds → tens of minutes for normal use).
 */
function formatDuration(ms: number): string {
  if (ms <= 0) return '0min';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min`;
  return `${seconds}s`;
}

export function StatsPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [logs, setLogs] = useState<ReviewLog[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);

  // ── Drill-down panel state ─────────────────────────────────────────────────
  // `openPanel` is the currently visible panel (null = none). Switching cards
  // closes the previous one automatically.
  //
  // Filters live HERE (not inside the panels) so they're remembered across
  // open/close within the same session — open Revisões with "30 days, deck X",
  // close it, reopen it: the filter is still there. They reset to defaults
  // when the app reloads (no DB write).
  const [openPanel, setOpenPanel] = useState<PanelKind>(null);
  const [scope, setScope] = useState<StatsScope>({ kind: 'all' });
  const [period, setPeriod] = useState<StatsPeriod>(30);

  useEffect(() => {
    (async () => {
      setDecks(await db.decks.toArray());
      setFolders(await db.folders.toArray());
      setCards(await db.cards.toArray());
      setLogs(await db.reviewLogs.toArray());
      setStats((await db.userStats.get('singleton')) || null);
    })();
  }, []);

  const buckets = useMemo(() => reviewsByDay(logs, 7), [logs]);
  const reviewsToday = useMemo(() => reviewsTodayCount(logs), [logs]);

  const chartData: StatsBarChartDatum[] = useMemo(
    () =>
      buckets.map(b => ({
        label: dowLabelFromIso(b.date),
        total: b.total,
        iso: b.date,
      })),
    [buckets],
  );

  const cats = useMemo(() => {
    let novo = 0,
      jovem = 0,
      maduro = 0,
      problematico = 0,
      atrasado = 0;
    for (const c of cards) {
      const cat = categorize(c);
      if (cat === 'novo') novo++;
      else if (cat === 'jovem') jovem++;
      else if (cat === 'maduro') maduro++;
      else if (cat === 'problematico') problematico++;
      if (isOverdue(c)) atrasado++;
    }
    return { novo, jovem, maduro, problematico, atrasado };
  }, [cards]);

  const overallAcerto = useMemo(() => {
    if (logs.length === 0) return 0;
    const correct = logs.filter(l => l.rating > 1).length;
    return correct / logs.length;
  }, [logs]);

  // Real time today — sum of durationMs from logs reviewed today.
  // Old logs without durationMs simply contribute zero; nothing falls back
  // to estimation. The number you see is the time you actually spent.
  const timeTodayMs = useMemo(() => {
    const today = toDayKey(Date.now());
    return logs
      .filter(l => toDayKey(l.reviewedAt) === today)
      .reduce((sum, l) => sum + (l.durationMs ?? 0), 0);
  }, [logs]);

  const topLapses = useMemo(
    () =>
      cards
        .filter(c => c.lapses > 0)
        .sort((a, b) => b.lapses - a.lapses)
        .slice(0, 10),
    [cards],
  );

  // Stable quote within a session/day, regenerated only when ratio crosses
  // a regime boundary.
  const accuracyQuote = useMemo(
    () => getAccuracyQuote(overallAcerto),
    [overallAcerto],
  );

  if (!stats) return null;

  const lvl = progressToNextLevel(stats.xp);
  const decksById = new Map(decks.map(d => [d.id, d]));
  const hasFlame = stats.streakDays >= 1;

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Estatísticas</h1>
        <p className="text-sm text-muted mt-1">
          Olhar honesto sobre o seu ritmo, sua taxa de acerto e a saúde do seu
          conhecimento.
        </p>
      </header>

      {/* Rank banner */}
      <section
        className={`overflow-hidden rounded-2xl border border-subtle bg-gradient-to-r ${lvl.rank.gradient}`}
      >
        <div className="flex flex-col gap-3 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl tint-3 backdrop-blur-sm">
              <span className="text-lg font-bold">{lvl.level}</span>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-white/70">
                Posto atual
              </div>
              <div className="text-lg font-semibold">{lvl.rank.title}</div>
              <div className="text-[11px] text-white/80 italic">
                {lvl.rank.flavor}
              </div>
            </div>
          </div>
          <div className="text-right text-sm">
            <div>{stats.xp.toLocaleString('pt-BR')} XP</div>
            <div className="text-[11px] text-white/80">
              {lvl.current.toLocaleString('pt-BR')} /{' '}
              {lvl.needed.toLocaleString('pt-BR')} para o próximo
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Trophy size={12} className="text-warning" />}
          label="Total de revisões"
          value={stats.totalReviews}
          hint={`${reviewsToday} hoje`}
          onClick={() => setOpenPanel('revisions')}
        />
        <StatCard
          // Flame só aparece se streak >= 1; quando zera, sai do card.
          icon={
            hasFlame ? (
              <Flame size={12} className="text-warning" />
            ) : undefined
          }
          label="Sequência"
          value={`${stats.streakDays}d`}
          hint={`Maior: ${stats.longestStreak}d`}
          onClick={() => setOpenPanel('streak')}
        />
        <StatCard
          icon={<Clock size={12} className="text-info" />}
          label="Tempo de estudo hoje"
          value={formatDuration(timeTodayMs)}
          hint="tempo medido em revisão"
          onClick={() => setOpenPanel('time')}
        />
        <StatCard
          icon={<Sparkles size={12} className="text-success" />}
          label="Taxa de acerto"
          value={`${Math.round(overallAcerto * 100)}%`}
          onClick={() => setOpenPanel('accuracy')}
        />
      </section>

      <section className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm uppercase tracking-widest text-muted">
              Últimos 7 dias
            </h3>
            <span className="text-[11px] text-faint">
              Constância — quantas revisões por dia
            </span>
          </div>
          <StatsBarChart data={chartData} />
        </div>

        <div className="rounded-xl border border-subtle bg-gradient-to-br from-card to-surface p-5 flex flex-col items-center justify-center text-center">
          <ProgressRing
            ratio={overallAcerto}
            label={`${Math.round(overallAcerto * 100)}%`}
            sub="acerto geral"
            size={120}
          />
          <p className="text-xs text-muted mt-4 leading-relaxed italic">
            "{accuracyQuote}"
          </p>
        </div>
      </section>

      <section>
        <h3 className="text-sm uppercase tracking-widest text-muted mb-3">
          Cartões por categoria
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard
            label="Novos"
            value={cats.novo}
            icon={<Sparkles size={12} className="text-accent" />}
          />
          <StatCard label="Jovens" value={cats.jovem} />
          <StatCard
            label="Maduros"
            value={cats.maduro}
            icon={<CheckCircle2 size={12} className="text-success" />}
          />
          <StatCard
            label="Problemáticos"
            value={cats.problematico}
            accent={cats.problematico > 0}
          />
          <StatCard
            label="Atrasados"
            value={cats.atrasado}
            icon={<AlertCircle size={12} className="text-warning" />}
            accent={cats.atrasado > 0}
          />
        </div>
      </section>

      {topLapses.length > 0 && (
        <section>
          <Collapsible
            title="Cartões com mais tropeços"
            badge={`${topLapses.length}`}
            preview={`${topLapses.length} cartão${topLapses.length === 1 ? '' : 'ões'} com lapsos. Acertando, eles saem da lista.`}
            stacked
          >
            <div className="-mx-4 mb-1 mt-1 flex items-start gap-1.5 px-4 pb-2 text-[11px] text-faint">
              <HelpCircle size={11} className="mt-0.5 shrink-0" />
              <span>
                Cada "Errei" durante revisão soma um tropeço. "Bom" remove um;
                "Fácil" remove dois. Quando chegar a zero, o cartão sai daqui.
              </span>
            </div>
            <div className="-mx-4 divide-y divide-subtle border-y border-subtle">
              {topLapses.map(card => {
                const deck = decksById.get(card.deckId);
                return (
                  <div key={card.id} className="flex items-start gap-4 px-4 py-3">
                    <span className="rounded-md bg-danger-soft px-2 py-1 text-xs font-medium text-danger-fg shrink-0">
                      {card.lapses}{' '}
                      {card.lapses === 1 ? 'tropeço' : 'tropeços'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 font-mono text-[12px] leading-relaxed text-primary">
                        {card.front}
                      </div>
                      {deck && (
                        <div className="text-[11px] text-faint mt-1">
                          {deck.name}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Collapsible>
        </section>
      )}

      <section>
        <Collapsible
          title="Por baralho"
          badge={decks.length === 0 ? undefined : `${decks.length}`}
          preview={
            decks.length === 0
              ? 'Nenhum baralho ainda.'
              : `Progresso e taxa de acerto por baralho.`
          }
          stacked
        >
          {decks.length === 0 ? (
            <p className="text-sm text-muted py-2">Nenhum baralho ainda.</p>
          ) : (
            <div className="-mx-4 divide-y divide-subtle border-y border-subtle">
              {decks.map(deck => {
                const dCards = cards.filter(c => c.deckId === deck.id);
                const dLogs = logs.filter(l => l.deckId === deck.id);
                const prog = deckProgress(dCards, dLogs);
                // Bar shows accuracy (correct / total reviews) — that's what
                // "% acerto" in the line below claims to be. Previously this
                // displayed `maduros / total cards`, which read 0% on any deck
                // without mature cards even when the user was getting things
                // right.
                const ratio = prog.taxaAcerto;
                const folder = deck.folderId
                  ? folders.find(f => f.id === deck.folderId)
                  : null;
                const color = resolveColor(deck.colorKey);
                return (
                  <div key={deck.id} className="px-4 py-3 flex items-center gap-4">
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center"
                      style={{ backgroundColor: withAlpha(color.hex, 0.12) }}
                    >
                      <Layers size={14} style={{ color: color.hex }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium truncate">
                          {deck.name}
                        </div>
                        {folder && (
                          <span className="rounded-md tint-1 px-1.5 py-0.5 text-[10px] text-faint">
                            {folder.name}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {prog.total} cartões · {prog.vencidos} vencidos ·{' '}
                        {Math.round(prog.taxaAcerto * 100)}% acerto
                      </div>
                    </div>
                    <div className="w-32 h-1.5 rounded-full tint-2 overflow-hidden hidden sm:block">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                    <div className="w-12 text-right text-xs text-muted font-mono">
                      {Math.round(ratio * 100)}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Collapsible>
      </section>

      {/* ── Drill-down panels (Phase 3) ──
          Floating, draggable. Only one renders at a time. Shared filter
          state (scope, period) keeps the user's selection consistent when
          they switch between metrics in the same sitting. */}
      <RevisionsPanel
        open={openPanel === 'revisions'}
        onClose={() => setOpenPanel(null)}
        cards={cards}
        logs={logs}
        decks={decks}
        folders={folders}
        scope={scope}
        period={period}
        onScopeChange={setScope}
        onPeriodChange={setPeriod}
      />
      <StreakPanel
        open={openPanel === 'streak'}
        onClose={() => setOpenPanel(null)}
        logs={logs}
        decks={decks}
        folders={folders}
        scope={scope}
        period={period}
        onScopeChange={setScope}
        onPeriodChange={setPeriod}
        globalStreak={stats.streakDays}
        globalLongest={stats.longestStreak}
      />
      <StudyTimePanel
        open={openPanel === 'time'}
        onClose={() => setOpenPanel(null)}
        logs={logs}
        decks={decks}
        folders={folders}
        scope={scope}
        period={period}
        onScopeChange={setScope}
        onPeriodChange={setPeriod}
      />
      <AccuracyPanel
        open={openPanel === 'accuracy'}
        onClose={() => setOpenPanel(null)}
        cards={cards}
        logs={logs}
        decks={decks}
        folders={folders}
        scope={scope}
        period={period}
        onScopeChange={setScope}
        onPeriodChange={setPeriod}
      />
    </div>
  );
}
