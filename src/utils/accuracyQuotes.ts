/**
 * Frase mostrada abaixo da Taxa de acerto, escolhida pelo regime atual.
 *
 * Quatro faixas:
 *   < 25%      → "low"      (muito material novo / frustração honesta)
 *   25–50%     → "building" (construindo o hábito, mais erros que acertos)
 *   50–75%     → "good"     (zona produtiva, mais acertos que erros)
 *   ≥ 75%      → "mastery"  (domínio sólido)
 *
 * Frase é estável dentro do mesmo dia (deterministic pelo dia atual) — assim
 * a frase não fica trocando a cada render e cria sensação de consistência.
 */

export type AccuracyRegime = 'low' | 'building' | 'good' | 'mastery';

const QUOTES: Record<AccuracyRegime, string[]> = {
  low: [
    'Muita matéria nova entrando. Cada acerto é uma vitória.',
    'O começo é desconfortável. É assim para todo mundo.',
    'Alta dificuldade aqui significa material novo de verdade.',
    'O cérebro está construindo trilhas. Dá tempo.',
    'Não confunda "difícil" com "caminho errado".',
    'Tropeço não é fracasso — é informação para o próximo passo.',
    'Pouca taxa de acerto agora, alta no longo prazo. Confie.',
    'Quem nunca erra está repetindo o que já sabe.',
    'O esforço aparece antes do resultado. Sempre.',
  ],
  building: [
    'O ritmo está se firmando.',
    'Mais cartões caindo no lugar agora.',
    'A intuição começa a aparecer aos poucos.',
    'Você está saindo do território estranho.',
    'Padrões emergem do esforço repetido.',
    'Devagar é mais rápido do que parece.',
    'O esforço de hoje vira fluência amanhã.',
    'Cada erro corrigido na hora vale por dois acertos sortudos.',
  ],
  good: [
    'Mais acertos que erros — território confortável.',
    'A maioria do material está conectada.',
    'Os erros agora ensinam mais do que punem.',
    'Você está virando referência pra si mesmo.',
    'Boa zona de aprendizado: difícil mas dominável.',
    'O conhecimento está consolidando.',
    'Quase tudo cai na rede. O que escapa, vira foco.',
    'A dificuldade ideal é exatamente essa: você sente, mas vence.',
  ],
  mastery: [
    'Domínio sólido. Mantenha o ritmo.',
    'O material parece quase trivial agora.',
    'Aqui é o platô do dever cumprido.',
    'Considere adicionar tópicos novos para puxar a barra.',
    'Muito bom. Não confunda com "pode parar".',
    'Quase reflexo: revisar virou automático.',
    'Conhecimento estabilizado. O próximo desafio te chama.',
    'Você passou de "estudar para saber" para "saber para usar".',
  ],
};

export function regimeFor(ratio: number): AccuracyRegime {
  if (ratio < 0.25) return 'low';
  if (ratio < 0.5) return 'building';
  if (ratio < 0.75) return 'good';
  return 'mastery';
}

/**
 * Returns a quote for the regime, stable within a single calendar day.
 * Uses day-of-epoch as the rotation index so the same quote shows for the
 * whole session but changes daily.
 */
export function getAccuracyQuote(ratio: number): string {
  const regime = regimeFor(ratio);
  const pool = QUOTES[regime];
  const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  return pool[dayIndex % pool.length];
}
