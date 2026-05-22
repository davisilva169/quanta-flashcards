/**
 * STUDY SESSION (Sessão de foco) — types
 * ============================================================================
 *
 * Os dois grupos de tipos aqui são:
 *
 *   1. **Configuração da sessão** — `FocusSessionConfig`. Capturada na tela
 *      `FocusSetupPage` (duração, escopo, meta) e passada via Route pra
 *      `FocusSessionPage`. Não persistida; recriada a cada início.
 *
 *   2. **Log persistido** — `StudySessionLog`. Gravado em `db.studySessionLogs`
 *      ao fim da sessão. Inclui `createdAt`/`updatedAt` para sync futuro.
 *
 * O `StudySessionLog` é deliberadamente liso: não duplica os `ReviewLog`s
 * (cada revisão dentro da sessão continua sendo gravada normalmente na
 * tabela `reviewLogs`). Aqui ficam só agregados — duração efetiva,
 * contagens, escopo. Se um dia quisermos "ver detalhes da sessão",
 * cruzamos `startedAt..endedAt` com `reviewLogs.reviewedAt`.
 *
 * O `scope` discriminado evita um campo `scopeId?: string | null` solto:
 * `kind: 'all'` não carrega id, `kind: 'deck'` carrega `deckId`, etc.
 * ============================================================================
 */

/** Escopo da sessão: que cartões entram na fila. */
export type FocusScope =
  | { kind: 'all' }
  | { kind: 'deck'; deckId: string }
  | { kind: 'folder'; folderId: string };

/** Meta da sessão: termina quando o usuário cumprir, OU quando o timer
 *  zerar, OU quando ele encerrar manualmente — o que vier primeiro. */
export type FocusGoal =
  | { kind: 'time' } // só tempo importa
  | { kind: 'reviews'; target: number }; // termina ao atingir N revisões

/** Tudo o que precisamos pra iniciar uma sessão. Passado via Route. */
export interface FocusSessionConfig {
  /** Tempo de foco, em segundos. */
  focusSeconds: number;
  /** Tempo de pausa sugerido (não imposto), em segundos. Mostrado no
   *  resumo final. 0 = não exibir sugestão de pausa. */
  breakSeconds: number;
  /** Escopo dos cartões. */
  scope: FocusScope;
  /** Meta. */
  goal: FocusGoal;
}

/** Como a sessão terminou. Usado pra mostrar texto e cores adequados
 *  no resumo. Logs antigos (que ainda tinham `completedByTimer`) caem
 *  como fallback no consumidor. */
export type SessionEndReason =
  | 'timer' // o tempo zerou
  | 'goal' // a meta de N revisões foi atingida
  | 'queue-empty' // não havia mais cartões pra revisar
  | 'user'; // o usuário encerrou antes

/**
 * Log persistido ao fim de uma sessão. Gravado em `db.studySessionLogs`.
 *
 * `id`, `createdAt`, `updatedAt` seguem o padrão dos outros logs/registros
 * do projeto — preparam o terreno para sync futuro.
 */
export interface StudySessionLog {
  id: string;
  startedAt: number;
  endedAt: number;
  /** Duração efetiva (do início ao fim, sem desconto de pausas — pause/
   *  resume é tratado como "o relógio para"; o que persiste é o tempo
   *  que o relógio acumulou de fato). */
  durationSeconds: number;
  reviews: number;
  correct: number;
  wrong: number;
  /** Escopo "achatado" no formato { kind, id? } pra leitura simples. */
  scopeKind: 'all' | 'deck' | 'folder';
  scopeId: string | null;
  /**
   * Como a sessão terminou. Novo no Bloco D (rev). Opcional pra
   * compatibilidade com logs gravados antes desse refino — quem lê o
   * log faz fallback via `completedByTimer` quando este campo está
   * ausente.
   */
  endReason?: SessionEndReason;
  /** @deprecated Use `endReason`. Mantido pra logs gravados antes do
   *  Bloco E (compatibilidade). Quando ambos estão presentes,
   *  `endReason` é a verdade. */
  completedByTimer: boolean;
  /** Tempo configurado originalmente — pra distinguir "sessão de 25 min
   *  encerrada aos 18 min" vs "sessão de 25 min concluída". */
  configuredFocusSeconds: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Catálogo de recompensas saudáveis sugeridas após a sessão.
 *
 * Ficam em `Settings.focus.rewards` como `string[]` simples. O usuário
 * pode adicionar / remover / reordenar pela UI. Os defaults vivem em
 * `DEFAULT_FOCUS_REWARDS` (utils/focus.ts) e são gravados em settings
 * via backfill. Não criamos um tipo dedicado porque um array de strings
 * é a representação mais leve possível — a UI da seção de Settings é
 * que dá a estrutura.
 *
 * Ao mostrar a sugestão no resumo, escolhemos uma entrada aleatória —
 * a única regra é "se a lista estiver vazia, não mostra nada".
 */

/**
 * Settings sub-objeto da Sessão de foco. Tudo opcional, com defaults via
 * `resolveFocusSettings`.
 */
export interface FocusSettings {
  /** Última duração de foco usada (segundos). Padrão na próxima abertura. */
  lastFocusSeconds?: number;
  /** Última duração de pausa usada (segundos). */
  lastBreakSeconds?: number;
  /**
   * Pool de recompensas saudáveis (texto curto). O usuário customiza
   * aqui — adicionar/remover/editar. Quando ausente OU vazio, o sistema
   * usa `DEFAULT_FOCUS_REWARDS` somente para EXIBIÇÃO; o array vazio
   * persistido continua vazio (signifies "não quero sugestões").
   */
  rewards?: string[];
  /** Se queremos exibir a sugestão de recompensa ao fim da sessão. */
  showRewards?: boolean;
}
