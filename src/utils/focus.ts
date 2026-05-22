import type { FocusSettings } from '@/types/focus';

/**
 * Pool padrão de recompensas saudáveis sugeridas após uma sessão de foco.
 *
 * Critério de inclusão: ações curtas (≤ 5 minutos), sem custo, sem tela,
 * que ajudem o corpo ou a mente a sair do modo "leitura concentrada".
 * Tom: cinza-instrutivo, não jovial. O usuário cansado não precisa de
 * coach motivacional, precisa de uma ideia clara do que fazer.
 *
 * Esses defaults são gravados em `Settings.focus.rewards` no backfill.
 * A partir daí o usuário edita à vontade — adiciona, remove, reordena.
 * `resolveFocusSettings` NÃO injeta esses defaults em runtime; se o
 * usuário esvaziou a lista de propósito, queremos respeitar isso e
 * NÃO mostrar sugestão alguma no resumo.
 */
export const DEFAULT_FOCUS_REWARDS: readonly string[] = [
  'Beba um copo d\'água.',
  'Levante e alongue por um minuto.',
  'Olhe pela janela e foque em algo a seis metros de distância.',
  'Caminhe cinco minutos longe da tela.',
  'Respire fundo dez vezes, contando.',
  'Organize um pequeno canto da sua mesa.',
  'Prepare um café ou chá — e tome sem tela.',
  'Explique em voz alta um conceito que você acabou de revisar.',
  'Escreva uma fórmula bonita à mão numa folha solta.',
  'Mande uma mensagem para alguém contando algo que aprendeu.',
];

/** Default seconds for a "focus" interval: 25 minutos = Pomodoro clássico. */
export const DEFAULT_FOCUS_SECONDS = 25 * 60;
/** Default seconds for a "break" interval. */
export const DEFAULT_BREAK_SECONDS = 5 * 60;

/** Opções de duração apresentadas como botões de seleção rápida. */
export const FOCUS_PRESETS_SECONDS = [15 * 60, 25 * 60, 45 * 60, 60 * 60] as const;
export const BREAK_PRESETS_SECONDS = [5 * 60, 10 * 60, 15 * 60] as const;

/** Formato MM:SS pra o relógio do overlay. Aceita segundos negativos
 *  como "00:00" pra evitar piscar valores estranhos quando o timer
 *  passa do zero (não deveria, mas defensivo). */
export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Formato legível pra o resumo final ("25 min", "1 h 5 min"). */
export function formatDurationLong(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0 min';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} h`);
  if (m > 0) parts.push(`${m} min`);
  if (h === 0 && m === 0 && s > 0) parts.push(`${s} s`);
  return parts.join(' ');
}

/**
 * Escolhe uma recompensa "aleatória mas estável" para uma sessão.
 *
 * Usar `Math.random()` direto faria a sugestão pular a cada re-render
 * do componente de resumo (o React pode remontá-lo). Em vez disso,
 * usamos `seed` (geralmente `startedAt` da sessão) como índice
 * determinístico — a sugestão fica gravada visualmente no momento do
 * resumo e nunca muda enquanto o usuário olha pra ela.
 *
 * Retorna `null` quando o pool está vazio — quem chama deve decidir se
 * esconde a caixa de recompensa nesse caso.
 */
export function pickRewardForSession(
  pool: string[] | readonly string[],
  seed: number,
): string | null {
  if (!pool || pool.length === 0) return null;
  // Multiplicador arbitrário pra desconsiderar correlação entre seeds
  // próximos (sessões iniciadas em segundos consecutivos).
  const idx = Math.abs(Math.floor(seed * 9301 + 49297)) % pool.length;
  return pool[idx];
}

/**
 * Merge stored FocusSettings com defaults aplicáveis. Note que `rewards`
 * é tratado de forma especial: lista vazia explícita é preservada (sinal
 * de "usuário não quer sugestões"); apenas `undefined` é substituído por
 * default — e só na PRIMEIRA inicialização, via backfill no DB.
 *
 * Em runtime, NÃO chamamos esta função pra "encher" `rewards` ausente.
 * Se chegar undefined, deixamos undefined; a UI decide. Isso evita
 * mostrar a sugestão pra quem desativou.
 */
export function resolveFocusSettings(
  stored: FocusSettings | undefined,
): FocusSettings {
  return {
    lastFocusSeconds: stored?.lastFocusSeconds ?? DEFAULT_FOCUS_SECONDS,
    lastBreakSeconds: stored?.lastBreakSeconds ?? DEFAULT_BREAK_SECONDS,
    rewards: stored?.rewards, // preserved as-is, including empty array
    showRewards: stored?.showRewards ?? true,
  };
}
