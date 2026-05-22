/**
 * ReviewItem — a unidade de revisão.
 *
 * A motivação: cartões multi-cloze precisam ser revisados como N
 * unidades separadas (uma por chave), cada uma com seu próprio
 * agendamento. Em vez de refatorar todo o modelo de scheduling em torno
 * desse caso, "virtualizamos" no caminho da revisão:
 *
 *   - Cartões clássicos e cartões cloze com 1 só chave → 1 ReviewItem.
 *     `clozeKey` é `undefined`, `state` é o state raiz do cartão.
 *
 *   - Cartões multi-cloze → N ReviewItems, um por chave detectada.
 *     `clozeKey` é `c1`, `c2`, …, e `state` vem de `card.clozeStates[key]`
 *     (com fallback lazy para o state raiz quando a chave ainda não foi
 *     migrada).
 *
 * O scheduler genérico (`scheduleState`) opera sobre o `SchedulingState`
 * do item. `applyRatingResult` reaplica o novo state no cartão, no lugar
 * certo (raiz para non-cloze, `clozeStates[key]` para cloze) e recalcula
 * o `due` raiz como mínimo das chaves para que queries em `card.due`
 * (HomePage, Stats) continuem funcionando.
 *
 * # Limitações conhecidas (declaradas)
 *
 * - HomePage e Stats hoje contam cartões pelo Flashcard, não por
 *   ReviewItem. Um cartão multi-cloze com 3 chaves vencidas conta como
 *   1 na "contagem de vencidos" mas aparece como 3 itens na fila de
 *   revisão. Refinar isso é trabalho de outra fase. Documentado.
 *
 * - O Rush ainda não passa por `enumerateItems`. Para cartões multi-cloze
 *   ele continua usando o front com `c1` como chave padrão (default do
 *   ClozeFront). Pendência declarada — anotado em RushSessionPage e
 *   visível como aviso discreto para o usuário (a ser adicionado em F.5).
 */

import { getInteraction, type Flashcard, type SchedulingState } from '@/types/flashcard';
import { parseClozeAll } from './cloze';

export interface ReviewItem {
  /** Cartão original. Sempre completo — `ClozeFront` precisa do front
   *  inteiro pra renderizar outras chaves como contexto. */
  card: Flashcard;
  /** `c1`, `c2`, … para cartões multi-cloze; `undefined` para non-cloze
   *  e para cartões cloze antigos que ainda não foram migrados (a primeira
   *  revisão dispara a migração). */
  clozeKey?: string;
  /** Estado de SR efetivo deste item. Apontado por `applyRatingResult`
   *  pro lugar certo no cartão quando o usuário avalia. */
  state: SchedulingState;
}

/** Extrai os 10 campos de SR do Flashcard como um SchedulingState. */
export function extractRootState(card: Flashcard): SchedulingState {
  return {
    state: card.state,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.lastReview,
    ease: card.ease,
  };
}

/**
 * Para um cartão cloze: devolve o `SchedulingState` da chave informada.
 *
 *  - Se `card.clozeStates[key]` existe, devolve ele.
 *  - Senão, devolve o state raiz como fallback (migração lazy).
 *    A persistência da migração só acontece quando o usuário avaliar
 *    a chave (via `applyRatingResult`) — aí é gravado em
 *    `clozeStates[key]`. Cartões cloze antigos continuam funcionando
 *    exatamente como antes até a primeira revisão.
 */
export function stateForKey(
  card: Flashcard,
  key: string,
): SchedulingState {
  return card.clozeStates?.[key] ?? extractRootState(card);
}

/**
 * Gera a lista de ReviewItems para um conjunto de cartões.
 *
 *   - Cartão non-cloze: 1 item, clozeKey undefined, state = raiz.
 *   - Cartão cloze sem chaves no conteúdo (texto vazio, edição inválida):
 *     1 item, tratado como classic (clozeKey undefined). Defensivo.
 *   - Cartão cloze com chaves: 1 item por chave detectada. Ordem
 *     preservada conforme aparição no `front`.
 *
 * Esta função NÃO aplica filtro de "vencido". Quem chama (ReviewPage)
 * é que decide quais items entram na fila pelo `state.due` e `state.reps`.
 */
export function enumerateItems(cards: Flashcard[]): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (const card of cards) {
    const ix = getInteraction(card);
    if (ix.kind === 'cloze') {
      const { keys } = parseClozeAll(card.front);
      if (keys.length === 0) {
        // Cartão cloze sem chaves no conteúdo — provavelmente edição
        // inválida ou em progresso. Trata como classic pra não quebrar
        // a revisão.
        out.push({ card, state: extractRootState(card) });
        continue;
      }
      for (const key of keys) {
        out.push({
          card,
          clozeKey: key,
          state: stateForKey(card, key),
        });
      }
    } else {
      out.push({ card, state: extractRootState(card) });
    }
  }
  return out;
}

/**
 * Constrói o Flashcard atualizado depois que o usuário avaliou um item.
 *
 *   - Item non-cloze (clozeKey undefined): aplica `newState` no estado
 *     raiz do cartão. Equivalente ao comportamento anterior de
 *     `schedule(card, rating, ...)`.
 *
 *   - Item cloze (clozeKey definido): grava `newState` em
 *     `card.clozeStates[key]`. Recalcula `card.due` raiz como o MENOR
 *     `due` entre todas as chaves de `clozeStates`. Outros campos de SR
 *     raiz (`state`, `reps`, etc.) são atualizados para refletirem a
 *     chave que foi acabada de avaliar — escolha pragmática para que
 *     queries do tipo "quantos cartões em estado 'learning'?" da Stats
 *     não fiquem totalmente desincronizadas (não é perfeito, mas é
 *     melhor que congelar nos valores antigos).
 *
 * Não persiste nada no banco — quem chama (`ReviewPage.onRate`) é que
 * faz o `db.cards.put`.
 */
export function applyRatingResult(
  card: Flashcard,
  item: ReviewItem,
  newState: SchedulingState,
  nowMs: number,
): Flashcard {
  if (!item.clozeKey) {
    // Caminho non-cloze: idêntico ao schedule(card, ...) anterior.
    return {
      ...card,
      ...newState,
      updatedAt: nowMs,
    };
  }

  // ── Populate defensivo ───────────────────────────────────────────────
  //
  // Antes de gravar o newState na chave avaliada, garantimos que TODAS
  // as chaves do cartão tenham um snapshot persistido em `clozeStates`.
  // O snapshot usa o estado RAIZ ATUAL do cartão.
  //
  // Por que isso é necessário: imagine um cartão com `c1` e `c2`, ambos
  // sem clozeStates ainda. O usuário revisa c1 e fecha o app. Na próxima
  // sessão, ao enumerar items:
  //   - c1: lê clozeStates.c1 (gravado agora). OK.
  //   - c2: clozeStates.c2 NÃO existe → fallback pro raiz. Mas o raiz
  //     foi alterado pela revisão de c1! c2 herda erradamente o histórico
  //     de c1 (reps, state, ease).
  //
  // O populate defensivo captura o raiz ATUAL (que ainda reflete o estado
  // pré-c1) em clozeStates.c2 antes de modificar c1, deixando o c2 com o
  // estado original. A próxima enumeração lerá o snapshot correto.
  //
  // Custo: 1 parseClozeAll por avaliação (O(n) sobre o front). Negligível.
  const { keys } = parseClozeAll(card.front);
  const rootSnapshot = extractRootState(card);
  const populated: Record<string, SchedulingState> = {
    ...(card.clozeStates ?? {}),
  };
  for (const k of keys) {
    if (!populated[k]) {
      populated[k] = { ...rootSnapshot };
    }
  }

  // Aplica newState na chave que acabou de ser avaliada.
  populated[item.clozeKey] = newState;

  // `card.due` raiz vira o menor `due` entre todas as chaves — preserva
  // queries `where('due').belowOrEqual(now)` funcionando como antes.
  const minDue = recomputeRootDue({ ...card, clozeStates: populated }, card.due);

  return {
    ...card,
    clozeStates: populated,
    // Mantém o estado raiz "sincronizado" com a chave que acabou de
    // ser avaliada. Não é semanticamente perfeito (que estado é o
    // "principal" de um cartão multi-cloze?), mas evita que Stats e
    // queries vejam um cartão multi-cloze como "preso no estado de
    // quando foi criado".
    state: newState.state,
    due: minDue,
    stability: newState.stability,
    difficulty: newState.difficulty,
    elapsedDays: newState.elapsedDays,
    scheduledDays: newState.scheduledDays,
    reps: newState.reps,
    lapses: newState.lapses,
    lastReview: newState.lastReview,
    ease: newState.ease,
    updatedAt: nowMs,
  };
}

/**
 * Calcula o `due` raiz canônico de um cartão.
 *
 *   - Cartões non-cloze (sem `clozeStates`): retorna `fallback` (geralmente
 *     o `card.due` raiz original — sem mudança).
 *
 *   - Cartões com `clozeStates`: retorna o MENOR `due` entre todas as
 *     chaves. Garante que queries `where('due').belowOrEqual(now)` peguem
 *     o cartão se QUALQUER chave estiver vencida.
 *
 * Exposto publicamente para reuso por ferramentas de manutenção / debug
 * e por validações futuras (ex: rotina de "consertar dues" se algum dia
 * for necessário rodar uma normalização em massa).
 */
export function recomputeRootDue(card: Flashcard, fallback: number): number {
  const states = card.clozeStates;
  if (!states) return fallback;
  const dues = Object.values(states).map(s => s.due);
  if (dues.length === 0) return fallback;
  return Math.min(...dues);
}
