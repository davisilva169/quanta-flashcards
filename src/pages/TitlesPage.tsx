import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Crown, Sparkles } from 'lucide-react';
import { db } from '@/db/database';
import type { UserStats } from '@/types/stats';
import { progressToNextLevel } from '@/utils/xp';
import { RANKS, rankForLevel, nextRank, type Rank } from '@/utils/ranks';

/**
 * TitlesPage — galeria completa de postos.
 *
 * Reusa o sistema de ranks existente em `utils/ranks.ts` (mesma fonte
 * usada pela HomePage e pela StatsPage para banner de posto atual). O
 * objetivo dessa página é dar uma visão panorâmica:
 *
 *   - O posto atual no topo (mesma estética do banner da StatsPage para
 *     consistência visual).
 *   - Quanto falta pro próximo nível e pro próximo posto.
 *   - Lista de todos os 10 postos em grid 1/2/3 colunas (responsivo),
 *     cada cartão mostrando: faixa de níveis, título, flavor text. Estado
 *     desbloqueado = visual cheio com a cor do posto; bloqueado = grayscale
 *     + cadeado. O posto atual ganha uma borda accent + label "ATUAL".
 *
 * A página é puramente de leitura: não toca em XP, não persiste nada.
 * Se o `UserStats` não existir ainda (primeira execução), mostramos
 * placeholder em vez de quebrar.
 */
export function TitlesPage() {
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await db.userStats.get('singleton');
      setStats(s ?? null);
    })();
  }, []);

  // Mostra esqueleto enquanto o stats não chega. Não é um loading "pesado":
  // são duas leituras de UserStats. Mas evitar piscar `lvl undefined` é
  // bom para a primeira tela.
  if (!stats) {
    return (
      <div className="space-y-6 animate-fade-in">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Títulos</h1>
          <p className="text-sm text-muted mt-1">Carregando…</p>
        </header>
      </div>
    );
  }

  const lvl = progressToNextLevel(stats.xp);
  const currentRank = lvl.rank;
  const upcomingRank = nextRank(lvl.level);

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Títulos</h1>
        <p className="text-sm text-muted mt-1">
          Postos que você atravessa conforme o nível avança. Não é
          competição — é uma trilha. Cada faixa marca uma mudança qualitativa
          no jeito de estudar.
        </p>
      </header>

      {/* ── Posto atual (banner) ──────────────────────────────────────── */}
      <section
        className={`overflow-hidden rounded-2xl border border-subtle bg-gradient-to-r ${currentRank.gradient}`}
      >
        <div className="flex flex-col gap-3 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl tint-3 backdrop-blur-sm">
              <Crown size={22} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-white/70">
                Posto atual · Nível {lvl.level}
              </div>
              <div className="text-xl font-semibold">{currentRank.title}</div>
              <div className="text-[12px] text-white/80 italic">
                {currentRank.flavor}
              </div>
            </div>
          </div>
          <div className="text-right text-sm">
            <div>{stats.xp.toLocaleString('pt-BR')} XP</div>
            <div className="text-[11px] text-white/80">
              {lvl.current.toLocaleString('pt-BR')} /{' '}
              {lvl.needed.toLocaleString('pt-BR')} para o próximo nível
            </div>
            {upcomingRank && (
              <div className="text-[11px] text-white/80 mt-1">
                Próximo posto: {upcomingRank.title} (nível {upcomingRank.minLevel})
              </div>
            )}
          </div>
        </div>
        {/* Barra de progresso até o próximo nível. */}
        <div className="h-1.5 w-full bg-black/20">
          <div
            className="h-full bg-white/70"
            style={{ width: `${Math.min(100, lvl.ratio * 100)}%` }}
          />
        </div>
      </section>

      {/* ── Trilha completa ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-secondary uppercase tracking-widest">
            Todos os postos
          </h2>
          <div className="text-[11px] text-faint">
            {RANKS.filter(r => lvl.level >= r.minLevel).length} de{' '}
            {RANKS.length} desbloqueados
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RANKS.map((rank, idx) => (
            <RankCard
              key={`${rank.minLevel}-${rank.title}`}
              rank={rank}
              index={idx}
              currentLevel={lvl.level}
              isCurrent={rank.title === currentRank.title}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/** Single card in the rank grid. */
function RankCard({
  rank,
  index,
  currentLevel,
  isCurrent,
}: {
  rank: Rank;
  index: number;
  currentLevel: number;
  isCurrent: boolean;
}) {
  const unlocked = currentLevel >= rank.minLevel;
  // "Range" label: '50–74' for capped, '100+' for the top tier.
  const range =
    rank.maxLevel === Infinity
      ? `${rank.minLevel}+`
      : `${rank.minLevel}–${rank.maxLevel}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className={`relative overflow-hidden rounded-xl border p-4 ${
        isCurrent
          ? 'border-accent/40 bg-card shadow-[0_0_0_1px_rgba(0,0,0,0.04)]'
          : unlocked
          ? 'border-subtle bg-card'
          : 'border-subtle bg-surface-2'
      }`}
    >
      {/* Faint gradient swatch on the left edge for unlocked ranks. Locked
          ranks render the gradient in grayscale via the wrapper opacity. */}
      <div
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${rank.gradient} ${
          unlocked ? 'opacity-100' : 'opacity-30 grayscale'
        }`}
      />

      <div className={unlocked ? '' : 'opacity-60 grayscale'}>
        <div className="flex items-start justify-between gap-2">
          <div className="text-[10px] uppercase tracking-widest text-muted">
            Níveis {range}
          </div>
          {isCurrent ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[9px] uppercase tracking-widest text-accent-fg">
              <Sparkles size={9} />
              Atual
            </span>
          ) : !unlocked ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-divider bg-surface px-2 py-0.5 text-[9px] uppercase tracking-widest text-faint">
              <Lock size={9} />
              Bloqueado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-[9px] uppercase tracking-widest text-success-fg">
              Desbloqueado
            </span>
          )}
        </div>

        <div className="mt-2 text-base font-semibold text-primary leading-tight">
          {rank.title}
        </div>
        <div className="mt-1 text-[12px] italic text-muted leading-snug">
          {rank.flavor}
        </div>
      </div>
    </motion.div>
  );
}
