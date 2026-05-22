/**
 * Cloze deletion utilities — suporte multi-key (Anki-style) com chaves
 * aninhadas na resposta e na dica.
 *
 * Sintaxe (subconjunto compatível com Anki):
 *
 *   {{c1::resposta}}
 *   {{c1::resposta::dica}}
 *   {{c2::outra}}    {{c3::...}}
 *
 * Cada chave (`c1`, `c2`, …) representa uma unidade independente de
 * revisão. Quando o usuário revisa `c1`, as outras chaves continuam
 * visíveis em texto puro como contexto.
 *
 * # Por que NÃO usar regex
 *
 * A versão anterior usava `/\{\{c(\d+)::([^:}]+?)(?:::([^}]+?))?\}\}/g`.
 * Funciona pra cartões simples, mas FALHA em casos comuns no nosso
 * domínio (física, matemática):
 *
 *   - `{{c1::e^{βμ}}}`           — `^{βμ}` tem `}` no meio
 *   - `{{c1::\frac{a}{b}}}`      — `\frac{a}{b}` tem dois `}` internos
 *   - `{{c1::\sum_{i=1}^n a_i}}` — `_{i=1}` tem `}` interno
 *
 * Em todos esses, a regex para no primeiro `}` interno e a tag inteira
 * é perdida.
 *
 * # State machine
 *
 * O parser caminha sobre o conteúdo contando profundidade de chaves
 * (`{` → +1, `}` → -1). O fim da tag (`}}` no nível 0) só é
 * reconhecido quando a profundidade está em 0. Mesma lógica pra `::`
 * separador da dica: só termina a resposta se estiver no nível 0.
 *
 * Tags incompletas (sem `}}` de fechamento) são descartadas
 * silenciosamente — o conteúdo cru aparece no preview e o usuário vê
 * o erro de sintaxe na hora de editar.
 *
 * # Três níveis de API (interface estável)
 *
 *   1. `parseCloze(content)` — wrapper compat. Mesmo shape do antigo,
 *      perspectiva `c1`. Cartões com 1 só chave: comportamento
 *      idêntico ao anterior. Cartões com chaves aninhadas: AGORA
 *      funcionam (antes falhavam silenciosamente).
 *
 *   2. `parseClozeAll(content)` — metadados completos: chaves únicas em
 *      ordem de aparição e matches com `position` + `length` pra que
 *      substituições controladas (`renderClozeForReview`, `filledText`)
 *      funcionem por slicing — não por regex replace.
 *
 *   3. `renderClozeForReview(content, activeKey, reveal)` — substitui
 *      apenas a chave ativa por placeholder/bold; demais chaves viram
 *      texto puro como contexto (Anki-style).
 *
 * # Regex auxiliar
 *
 * Continuamos usando regex para detectar o header `cN::` após `{{`. Isso
 * é seguro: o header não tem `}` interno por construção (\d e `::` são
 * caracteres simples).
 */

const HEADER_RE = /^c(\d+)::/;

export interface ClozeMatch {
  /** `c1`, `c2`, …  Derivado de `index`. */
  key: string;
  /** Valor numérico da chave. */
  index: number;
  /** Texto que vai ser escondido durante a revisão dessa chave. */
  answer: string;
  /** Dica opcional. Renderizada como `[ ___ (dica) ]` quando aplicável. */
  hint?: string;
  /** Offset onde o match começa no string original (inclusivo no `{{`). */
  position: number;
  /** Comprimento total do match, incluindo `{{` e `}}`. `position + length`
   *  é o offset logo após o `}}` final. */
  length: number;
}

export interface ClozeParsedAll {
  /** True se o conteúdo tem pelo menos uma chave válida. */
  hasCloze: boolean;
  /** Chaves únicas em ordem de primeira aparição. Use `sortClozeKeys`
   *  pra ordem numérica. */
  keys: string[];
  /** Matches em ordem de aparição. Não-sobrepostos. */
  matches: ClozeMatch[];
}

/** Shape antigo, preservado para `parseCloze` (compatibilidade). */
export interface ClozeParsed {
  questionText: string;
  answer: string;
  hasCloze: boolean;
  filledText: string;
}

/**
 * Avança pela string a partir de `start`, contando profundidade de
 * chaves até encontrar:
 *
 *   - `}}` no nível 0 → fim da seção (retorna `{ end, terminator: 'close' }`).
 *   - `::` no nível 0 → separador (retorna `{ end, terminator: 'sep' }`).
 *   - fim da string → não fechou (retorna `null`).
 *   - `}` extra (depth < 0) → tag mal-formada (retorna `null`).
 */
function scanUntilCloseOrSep(
  content: string,
  start: number,
  allowSep: boolean,
): { end: number; terminator: 'close' | 'sep' } | null {
  let depth = 0;
  let i = start;
  while (i < content.length) {
    if (depth === 0) {
      // Verifica terminadores no nível 0 antes de processar o char.
      if (content[i] === '}' && content[i + 1] === '}') {
        return { end: i, terminator: 'close' };
      }
      if (allowSep && content[i] === ':' && content[i + 1] === ':') {
        return { end: i, terminator: 'sep' };
      }
    }
    if (content[i] === '{') {
      depth++;
    } else if (content[i] === '}') {
      if (depth === 0) {
        // `}` solto fora de chave aberta = tag mal-formada
        return null;
      }
      depth--;
    }
    i++;
  }
  // Fim da string sem fechar a tag.
  return null;
}

/**
 * Parser completo via state machine. O(n) sobre o conteúdo.
 *
 * Tags incompletas (sem `}}` de fechamento, com `:` solto, etc) são
 * silenciosamente descartadas — o cursor avança 1 char e continua.
 * Isso preserva o resto do conteúdo intacto e dá ao usuário a chance
 * de ver o erro no preview.
 */
export function parseClozeAll(content: string): ClozeParsedAll {
  const matches: ClozeMatch[] = [];
  const seen = new Set<string>();
  const keys: string[] = [];

  let i = 0;
  while (i < content.length) {
    // Tenta encontrar um início `{{cN::`.
    if (
      content[i] === '{' &&
      content[i + 1] === '{' &&
      i + 2 < content.length
    ) {
      const headerMatch = HEADER_RE.exec(content.slice(i + 2));
      if (headerMatch) {
        const startPos = i;
        const index = Number(headerMatch[1]);
        const headerLen = headerMatch[0].length;
        const answerStart = i + 2 + headerLen;

        // Escaneia a resposta. Pode terminar em `}}` (sem dica) ou `::`
        // (com dica a seguir).
        const ansScan = scanUntilCloseOrSep(content, answerStart, true);
        if (!ansScan) {
          // Tag incompleta — avança 1 char e tenta de novo a partir daí.
          i++;
          continue;
        }

        const answer = content.slice(answerStart, ansScan.end);
        let hint: string | undefined = undefined;
        let totalEnd: number;

        if (ansScan.terminator === 'sep') {
          // Tem dica. Escaneia até `}}`. Aqui NÃO aceitamos novo `::`
          // como separador (a dica é o último campo).
          const hintStart = ansScan.end + 2;
          const hintScan = scanUntilCloseOrSep(content, hintStart, false);
          if (!hintScan) {
            // Sintaxe inválida (dica sem `}}`). Descarta a tag inteira.
            i++;
            continue;
          }
          hint = content.slice(hintStart, hintScan.end);
          totalEnd = hintScan.end + 2; // skip `}}`
        } else {
          totalEnd = ansScan.end + 2; // skip `}}`
        }

        const key = `c${index}`;
        matches.push({
          key,
          index,
          answer,
          hint,
          position: startPos,
          length: totalEnd - startPos,
        });
        if (!seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
        i = totalEnd;
        continue;
      }
    }
    i++;
  }

  return {
    hasCloze: matches.length > 0,
    keys,
    matches,
  };
}

/**
 * Ordena chaves de cloze numericamente (`c1 < c2 < c10`).
 */
export function sortClozeKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ai = Number(a.slice(1));
    const bi = Number(b.slice(1));
    return ai - bi;
  });
}

/**
 * Renderiza o conteúdo do front para a revisão de UMA chave ativa.
 *
 *   - Marcadores da `activeKey`: viram `[ ___ ]` (ou `[ ___ (dica) ]` se
 *     a dica existir) quando `!reveal`; viram `**resposta**` quando
 *     `reveal === true`.
 *   - Marcadores de OUTRAS chaves: viram a própria resposta em texto
 *     puro (sem bold, sem brackets).
 *
 * A substituição é feita por slicing nas posições dos matches — não
 * por regex replace — então funciona com qualquer conteúdo aninhado.
 */
export function renderClozeForReview(
  content: string,
  activeKey: string,
  reveal: boolean,
): { questionText: string; answer: string } {
  const all = parseClozeAll(content);
  if (!all.hasCloze) {
    return { questionText: content, answer: '' };
  }
  const answersOfActive: string[] = [];
  let out = '';
  let cursor = 0;
  for (const m of all.matches) {
    // Append entre o cursor e o início desse match (texto fora de tag).
    out += content.slice(cursor, m.position);
    if (m.key === activeKey) {
      answersOfActive.push(m.answer);
      if (reveal) {
        out += `**${m.answer}**`;
      } else {
        out += m.hint ? `[ ___ (${m.hint}) ]` : '[ ___ ]';
      }
    } else {
      // Outras chaves: texto puro como contexto.
      out += m.answer;
    }
    cursor = m.position + m.length;
  }
  out += content.slice(cursor);
  return {
    questionText: out,
    answer: answersOfActive.join(' / '),
  };
}

/**
 * Wrapper de compatibilidade. Para cartões com apenas `c1`, o resultado
 * é idêntico ao `parseCloze` anterior — para os casos válidos. Cartões
 * com chaves aninhadas que ANTES eram silenciosamente ignorados, AGORA
 * são reconhecidos corretamente.
 */
export function parseCloze(content: string): ClozeParsed {
  const all = parseClozeAll(content);
  if (!all.hasCloze) {
    return {
      questionText: content,
      answer: '',
      hasCloze: false,
      filledText: content,
    };
  }
  const c1View = renderClozeForReview(content, 'c1', false);

  // filledText: revela TODAS as chaves em **bold**. Construído por
  // slicing, mesmo método do renderClozeForReview.
  let filledText = '';
  let cursor = 0;
  for (const m of all.matches) {
    filledText += content.slice(cursor, m.position);
    filledText += `**${m.answer}**`;
    cursor = m.position + m.length;
  }
  filledText += content.slice(cursor);

  return {
    questionText: c1View.questionText,
    answer: c1View.answer,
    hasCloze: true,
    filledText,
  };
}

/** Loose match para respostas — case-insensitive, espaços colapsados,
 *  pontuação de borda removida. Exportado para reuso (cloze widget). */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[.,;:!?'"`]+|[.,;:!?'"`]+$/g, '');
}

/**
 * Compara a resposta do usuário com a resposta esperada de UMA chave.
 * Default `c1` mantém compatibilidade com chamadas existentes.
 *
 * Quando a chave tem múltiplas ocorrências no cartão (ex.: `{{c1::a}}`
 * e `{{c1::b}}` no mesmo front), a resposta esperada é o join por
 * ` / ` — o usuário precisa digitar `a / b` para acertar.
 */
export function checkClozeAnswer(
  content: string,
  userAnswer: string,
  key: string = 'c1',
): boolean {
  const all = parseClozeAll(content);
  if (!all.hasCloze) return false;
  const ofKey = all.matches.filter(m => m.key === key);
  if (ofKey.length === 0) return false;
  const expected = ofKey.map(m => m.answer).join(' / ');
  return normalize(userAnswer) === normalize(expected);
}
