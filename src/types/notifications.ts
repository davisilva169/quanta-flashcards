/**
 * NOTIFICATIONS — types
 * ============================================================================
 *
 * Configurações persistidas em `Settings.notifications`. Estritamente
 * renderer-side: usamos a `Notification` API do Chromium dentro do
 * Electron renderer. Sem IPC, sem mexer no main process.
 *
 * Limitação aceita nesta fase: notificações só disparam enquanto o app
 * está aberto. A UI deixa isso claro pro usuário.
 *
 * Frequências:
 *   - `checkIntervalMinutes`: quanto tempo entre uma notificação e outra
 *     PARA O MESMO DECK. Não é o intervalo de polling do banco (esse é
 *     fixo em 1 min, leve). Pense neste valor como "não me atormente
 *     antes de X minutos terem passado".
 *
 * Janela silenciosa:
 *   - `quietHoursStart`/`quietHoursEnd` no formato 'HH:MM' (24h). Quando
 *     `quietHoursEnabled === true`, nenhuma notificação dispara nesse
 *     intervalo. Suporta janelas que cruzam meia-noite (start > end).
 * ============================================================================
 */

export interface NotificationSettings {
  /** Master switch. Quando desligado, NADA é disparado. */
  enabled: boolean;
  /** Toggle específico para a notificação "baralho pronto pra revisar". */
  deckReady: boolean;
  /**
   * Tempo mínimo (em minutos) entre duas notificações para o MESMO
   * deck. Defaults: 15, 30, 60. Tipo `number` (não enum) pra deixar
   * o futuro abrir mais opções sem mudar o tipo persistido.
   */
  checkIntervalMinutes: number;
  /** Quando true, respeita a janela silenciosa abaixo. */
  quietHoursEnabled: boolean;
  /** "HH:MM" no formato 24h. Início da janela silenciosa. */
  quietHoursStart: string;
  /** "HH:MM". Fim da janela. Se end < start, a janela cruza a meia-noite. */
  quietHoursEnd: string;
}
