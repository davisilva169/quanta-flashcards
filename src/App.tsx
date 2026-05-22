import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import type { Route } from './components/Sidebar';
import { HomePage } from './pages/HomePage';
import { DecksPage } from './pages/DecksPage';
import { DeckPage } from './pages/DeckPage';
import { CreateDeckPage } from './pages/CreateDeckPage';
import { CreateFolderPage } from './pages/CreateFolderPage';
import { FolderPage } from './pages/FolderPage';
import { CreateCardPage } from './pages/CreateCardPage';
import { EditCardPage } from './pages/EditCardPage';
import { ReviewPage } from './pages/ReviewPage';
import { RushSetupPage } from './pages/RushSetupPage';
import { RushSessionPage } from './pages/RushSessionPage';
import { StatsPage } from './pages/StatsPage';
import { TitlesPage } from './pages/TitlesPage';
import { FlamePage } from './pages/FlamePage';
import { FocusSetupPage } from './pages/FocusSetupPage';
import { FocusSessionPage } from './pages/FocusSessionPage';
import { FocusSummaryPage } from './pages/FocusSummaryPage';
import { SettingsPage } from './pages/SettingsPage';
import { db, ensureInitialized } from './db/database';
import { initTheme } from './utils/theme';
import { ConfirmProvider } from './components/ConfirmModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useDeckReadyNotifier } from './hooks/useDeckReadyNotifier';

/**
 * State-based router. Cheap, no react-router dependency, and the Route
 * union (in components/Sidebar.tsx) gives us exhaustiveness checks for free.
 *
 * To migrate to deep links / Electron back-forward, swap setRoute for a
 * react-router setup — every page already navigates via the Route union, so
 * the change is mechanical.
 */
export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [ready, setReady] = useState(false);

  // Monta o notificador de baralho pronto. O hook em si decide se vai
  // disparar (settings, permissão, janela silenciosa). Quando o usuário
  // desativa em Configurações, o hook simplesmente vê o flag desligado
  // no próximo poll de 60s.
  useDeckReadyNotifier();

  useEffect(() => {
    let cleanupTheme = () => {};
    (async () => {
      await ensureInitialized();
      // Authoritative theme pass from the DB. The inline script in
      // index.html already painted the first frame from the localStorage
      // cache; this confirms it (no-op) or self-corrects. Default 'system'
      // — a fresh install follows the OS until the user picks otherwise.
      const settings = await db.settings.get('singleton');
      cleanupTheme = initTheme(settings?.theme ?? 'system');
      setReady(true);
    })();
    return () => cleanupTheme();
  }, []);

  if (!ready) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-app text-muted">
        <div className="animate-pulse text-sm tracking-widest uppercase">
          Carregando Quanta…
        </div>
      </div>
    );
  }

  return (
    <ConfirmProvider>
      <Layout current={route} onNavigate={setRoute}>
        {/*
          ErrorBoundary INSIDE Layout so Sidebar + chrome survive a crash
          in the routed page. `resetKey={route.name}` clears the error
          automatically when the user navigates somewhere else — a stuck
          error on one page doesn't trap the whole app.
        */}
        <ErrorBoundary resetKey={route.name}>
          {route.name === 'home' && <HomePage onNavigate={setRoute} />}
          {route.name === 'decks' && <DecksPage onNavigate={setRoute} />}
          {route.name === 'deck' && (
            <DeckPage deckId={route.deckId} onNavigate={setRoute} />
          )}
          {route.name === 'create-deck' && (
            <CreateDeckPage folderId={route.folderId} onNavigate={setRoute} />
          )}
          {route.name === 'folder' && (
            <FolderPage folderId={route.folderId} onNavigate={setRoute} />
          )}
          {route.name === 'create-folder' && (
            <CreateFolderPage onNavigate={setRoute} />
          )}
          {route.name === 'create-card' && (
            <CreateCardPage deckId={route.deckId} onNavigate={setRoute} />
          )}
          {route.name === 'edit-card' && (
            <EditCardPage cardId={route.cardId} onNavigate={setRoute} />
          )}
          {route.name === 'review' && (
            <ReviewPage deckId={route.deckId} onNavigate={setRoute} />
          )}
          {route.name === 'rush-setup' && <RushSetupPage onNavigate={setRoute} />}
          {route.name === 'rush-session' && (
            <RushSessionPage
              deckId={route.deckId}
              durationSec={route.durationSec}
              onNavigate={setRoute}
            />
          )}
          {route.name === 'stats' && <StatsPage />}
          {route.name === 'titles' && <TitlesPage />}
          {route.name === 'flame' && <FlamePage />}
          {route.name === 'focus-setup' && (
            <FocusSetupPage onNavigate={setRoute} />
          )}
          {route.name === 'focus-session' && (
            <FocusSessionPage
              focusSeconds={route.focusSeconds}
              breakSeconds={route.breakSeconds}
              scope={route.scope}
              goal={route.goal}
              onNavigate={setRoute}
            />
          )}
          {route.name === 'focus-summary' && (
            <FocusSummaryPage
              logId={route.logId}
              breakSeconds={route.breakSeconds}
              onNavigate={setRoute}
            />
          )}
          {route.name === 'settings' && <SettingsPage />}
        </ErrorBoundary>
      </Layout>
    </ConfirmProvider>
  );
}
