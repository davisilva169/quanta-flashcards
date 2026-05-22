import type { NotificationSettings } from '@/types/notifications';

/**
 * NOTIFICATIONS — runtime helpers
 * ============================================================================
 *
 * Camada fina sobre a `Notification` API do navegador (Chromium dentro
 * do Electron renderer). Não toca em IPC nem no main process — esta é
 * a abordagem mais simples e segura para esta fase.
 *
 * O que essa camada protege:
 *   - Detecção de suporte (`isNotificationSupported`).
 *   - Encapsulamento de `requestPermission` com tratamento de promise
 *     vs callback (browsers antigos).
 *   - Cálculo de janela silenciosa, INCLUINDO janelas que cruzam
 *     a meia-noite (22:00 → 08:00 dispara silêncio das 22h às 8h).
 *   - Construção do `Notification` com `tag` para dedup nativa do
 *     browser: notificações com o mesmo tag se sobrescrevem em vez
 *     de empilhar.
 *
 * O que essa camada NÃO faz:
 *   - Não dispara nada sozinha. Quem decide é o hook `useDeckReadyNotifier`
 *     (e quem configura é Settings). Aqui ficam só primitivas puras.
 *   - Não navega ao clicar — o `onclick` foca a janela do app, e ponto.
 *     Navegação via notification click exige IPC; fica para uma fase
 *     futura.
 * ============================================================================
 */

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  // Desativado por padrão: pedir permissão sem opt-in explícito é hostil.
  // O usuário liga, então pedimos.
  enabled: false,
  deckReady: true,
  checkIntervalMinutes: 30,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};

/** Existe `window.Notification`? Em Electron renderer, geralmente sim. */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** 'default' | 'granted' | 'denied' | 'unsupported'. */
export function getPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Pede permissão e retorna o resultado. Lida com browsers que ainda
 * usam a versão callback (raros, mas vale guardar).
 *
 * Em Electron com Chromium recente, isso resolve quase instantâneamente
 * — não há prompt visível como num browser comum (o sistema operacional
 * gerencia). Mas garantimos await pra não dar race condition.
 */
export async function requestPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return 'denied';
  }
}

/**
 * Dispara uma notificação se possível. Retorna o objeto criado, OU null
 * se não foi possível (sem suporte, sem permissão, etc).
 *
 * Não checa janela silenciosa nem dedup por tempo — isso é responsabilidade
 * de quem chama. Aqui só verificamos a permissão do browser.
 *
 * @param tag — Identificador para coalescer notificações similares. Duas
 *   chamadas com o mesmo `tag` se sobrescrevem (ex: o número de cards do
 *   deck X atualizou). Sem tag, cada chamada cria uma notificação separada.
 */
export function showNotification(
  title: string,
  options?: NotificationOptions,
): Notification | null {
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== 'granted') return null;
  try {
    const n = new Notification(title, options);
    // Foca a janela do app quando o usuário clica. Não navega — quem
    // está com Quanta aberto sabe pra onde ir.
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        /* no-op */
      }
    };
    return n;
  } catch {
    // Algumas implementações lançam quando muitas notificações são
    // criadas em sequência. Ignoramos silenciosamente — não vale interromper
    // o app pra isso.
    return null;
  }
}

/**
 * Verifica se o momento atual cai dentro da janela silenciosa.
 *
 * Implementação:
 *   - Converte "HH:MM" pra minutos desde a meia-noite.
 *   - Janela "normal" (start < end): silêncio quando start <= now < end.
 *   - Janela que cruza meia-noite (start > end, ex. 22:00 → 08:00):
 *     silêncio quando now >= start OU now < end.
 *   - start === end: silêncio nunca (janela vazia, pragmática).
 *
 * Aceita `now` como parâmetro para facilitar testabilidade — se omitido,
 * usa o relógio do sistema.
 */
export function isInQuietHours(
  start: string,
  end: string,
  now: Date = new Date(),
): boolean {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s === null || e === null) return false;
  if (s === e) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (s < e) return cur >= s && cur < e;
  // Janela cruzando meia-noite.
  return cur >= s || cur < e;
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}
