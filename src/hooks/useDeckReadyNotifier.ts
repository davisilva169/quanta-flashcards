import { useEffect, useRef } from 'react';
import { db } from '@/db/database';
import {
  isInQuietHours,
  isNotificationSupported,
  showNotification,
} from '@/utils/notifications';

/**
 * useDeckReadyNotifier — polling em background pra avisar quando um
 * baralho tem cartões vencidos.
 *
 * # Arquitetura
 *
 * - Um setInterval fixo de 60s que verifica se é hora de notificar.
 *   NÃO uso o `checkIntervalMinutes` da Settings como interval real
 *   porque mudaria a frequência exigiria desmontar/remontar o effect
 *   sempre que o usuário ajustasse — feio. Em vez disso, o interval é
 *   curto e dentro decidimos se "vale a pena" notificar baseado em:
 *     1. Master switch ligado? Se não, return.
 *     2. Lembrete de deck-ready ligado? Se não, return.
 *     3. Permissão concedida? Se não, return.
 *     4. Estamos em janela silenciosa? Se sim, return.
 *     5. Para cada deck: passou >= checkIntervalMinutes desde a última
 *        notificação para este deck? Só notifica se sim.
 *
 * - O dedup por deck vive num `useRef<Map<deckId, lastNotifiedAt>>`. Em
 *   memória, perde-se ao recarregar — o que é OK e até desejável (após
 *   um restart, faz sentido reavisar uma vez).
 *
 * - Usa `tag` na notificação pra que múltiplas chamadas pro mesmo deck
 *   se sobrescrevam visualmente (o navegador já cuida disso).
 *
 * # Por que não fazer "live query" via Dexie
 *
 * Seria possível assinar mudanças em `db.cards` via `liveQuery`, mas:
 *   1. Adiciona complexidade.
 *   2. Notificações reativas a CADA card vencendo seria spammy.
 *   3. Polling de 1 min é barato (uma query por minuto, contra TODOS os
 *      cards é trivial em IndexedDB).
 *
 * Polling vence em simplicidade aqui.
 */
export function useDeckReadyNotifier() {
  // deckId → timestamp da última notificação enviada para ele.
  const lastNotifiedRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!isNotificationSupported()) return;
    let cancelled = false;

    async function check() {
      if (cancelled) return;
      try {
        const settings = await db.settings.get('singleton');
        const notif = settings?.notifications;
        if (!notif?.enabled || !notif.deckReady) return;
        if (
          typeof Notification !== 'undefined' &&
          Notification.permission !== 'granted'
        ) {
          return;
        }
        if (
          notif.quietHoursEnabled &&
          isInQuietHours(notif.quietHoursStart, notif.quietHoursEnd)
        ) {
          return;
        }

        const intervalMs = Math.max(1, notif.checkIntervalMinutes) * 60 * 1000;
        const now = Date.now();

        // Quantos cartões estão vencidos por deck?
        const dueCards = await db.cards
          .where('due')
          .belowOrEqual(now)
          .toArray();
        if (dueCards.length === 0) return;

        // Conta cartões com pelo menos 1 revisão prévia OU novos —
        // mantemos o comportamento simples por enquanto: todo card com
        // `due <= now` é "pronto", independente do estado.
        const counts = new Map<string, number>();
        for (const c of dueCards) {
          counts.set(c.deckId, (counts.get(c.deckId) ?? 0) + 1);
        }

        // Pega só decks com pelo menos 1 card vencido e que não foram
        // notificados recentemente.
        const decks = await db.decks.toArray();
        const decksById = new Map(decks.map(d => [d.id, d]));

        for (const [deckId, count] of counts) {
          const deck = decksById.get(deckId);
          if (!deck) continue;
          const last = lastNotifiedRef.current.get(deckId) ?? 0;
          if (now - last < intervalMs) continue;

          showNotification('Baralho pronto para revisar', {
            body: `Você tem ${count} ${
              count === 1 ? 'cartão' : 'cartões'
            } para revisar em "${deck.name}".`,
            tag: `deck-ready-${deckId}`,
            silent: false,
          });
          lastNotifiedRef.current.set(deckId, now);
        }
      } catch {
        // Polling silencioso: qualquer erro não pode interromper a UI.
      }
    }

    // Primeira execução: aguarde alguns segundos antes da primeira checagem
    // pra não atropelar o boot (`ensureInitialized` ainda pode estar
    // rodando os backfills).
    const firstTimeout = window.setTimeout(check, 5000);
    const interval = window.setInterval(check, 60_000);
    return () => {
      cancelled = true;
      window.clearTimeout(firstTimeout);
      window.clearInterval(interval);
    };
  }, []);
}
