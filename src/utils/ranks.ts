/**
 * Rank table for the leveling system.
 *
 * Each rank covers a range of levels and carries a title + color identity.
 * The colors are *not* the FOLDER_COLORS palette — these are gradient pairs
 * for header/badge use, kept inline so the rank UI is fully self-contained.
 */

export interface Rank {
  /** Inclusive lower bound of the level range. */
  minLevel: number;
  /** Inclusive upper bound of the level range. Use Infinity for the top tier. */
  maxLevel: number;
  /** Display title — Portuguese, evocative, technical. */
  title: string;
  /** Short subtitle / flavor text. */
  flavor: string;
  /** Tailwind gradient classes (from / to) for badges and headers. */
  gradient: string;
  /** Tailwind text color for the title. */
  text: string;
  /** Hex used in inline SVG / canvas (avoid Tailwind purge issues). */
  hex: string;
}

export const RANKS: Rank[] = [
  {
    minLevel: 1, maxLevel: 4,
    title: 'Aprendiz de Notação',
    flavor: 'Aprendendo a ler o que escreveu',
    gradient: 'from-slate-500 to-slate-400',
    text: 'text-slate-200',
    hex: '#cbd5e1',
  },
  {
    minLevel: 5, maxLevel: 9,
    title: 'Manipulador de Símbolos',
    flavor: 'Os parênteses começam a obedecer',
    gradient: 'from-sky-500 to-blue-400',
    text: 'text-sky-200',
    hex: '#7dd3fc',
  },
  {
    minLevel: 10, maxLevel: 14,
    title: 'Construtor de Conceitos',
    flavor: 'Entendendo o porquê, não só o como',
    gradient: 'from-blue-500 to-indigo-500',
    text: 'text-blue-200',
    hex: '#93c5fd',
  },
  {
    minLevel: 15, maxLevel: 19,
    title: 'Explorador de Teoremas',
    flavor: 'Mapeando provas como territórios',
    gradient: 'from-indigo-500 to-violet-500',
    text: 'text-indigo-200',
    hex: '#a5b4fc',
  },
  {
    minLevel: 20, maxLevel: 29,
    title: 'Arquiteto de Derivações',
    flavor: 'Cada passo serve a uma estrutura',
    gradient: 'from-violet-500 to-purple-500',
    text: 'text-violet-200',
    hex: '#c4b5fd',
  },
  {
    minLevel: 30, maxLevel: 39,
    title: 'Guardião das Fórmulas',
    flavor: 'A memória virou biblioteca',
    gradient: 'from-purple-500 to-fuchsia-500',
    text: 'text-purple-200',
    hex: '#d8b4fe',
  },
  {
    minLevel: 40, maxLevel: 49,
    title: 'Mestre das Cascatas',
    flavor: 'Conexões que outros não veem',
    gradient: 'from-fuchsia-500 to-pink-500',
    text: 'text-fuchsia-200',
    hex: '#f0abfc',
  },
  {
    minLevel: 50, maxLevel: 74,
    title: 'Cartógrafo do Conhecimento',
    flavor: 'Você desenha as próprias fronteiras',
    gradient: 'from-pink-500 to-rose-500',
    text: 'text-pink-200',
    hex: '#fbcfe8',
  },
  {
    minLevel: 75, maxLevel: 99,
    title: 'Alquimista da Memória',
    flavor: 'Transmuta esforço em intuição',
    gradient: 'from-amber-400 to-orange-500',
    text: 'text-amber-200',
    hex: '#fcd34d',
  },
  {
    minLevel: 100, maxLevel: Infinity,
    title: 'Entidade Assintótica',
    flavor: 'Sempre se aproximando, nunca chegando',
    gradient: 'from-emerald-400 to-cyan-400',
    text: 'text-emerald-200',
    hex: '#6ee7b7',
  },
];

/** Returns the Rank object that contains the given level. */
export function rankForLevel(level: number): Rank {
  return (
    RANKS.find(r => level >= r.minLevel && level <= r.maxLevel) ??
    RANKS[RANKS.length - 1]
  );
}

/** Returns the *next* rank, or null if already at the top tier. */
export function nextRank(level: number): Rank | null {
  const current = rankForLevel(level);
  const idx = RANKS.indexOf(current);
  return idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
}
