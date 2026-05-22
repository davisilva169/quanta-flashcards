import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, Coffee, Target, Layers } from 'lucide-react';
import { db } from '@/db/database';
import type { Deck } from '@/types/deck';
import type { Folder } from '@/types/folder';
import type { Route } from '@/components/Sidebar';
import type { FocusGoal, FocusScope } from '@/types/focus';
import {
  BREAK_PRESETS_SECONDS,
  DEFAULT_BREAK_SECONDS,
  DEFAULT_FOCUS_SECONDS,
  FOCUS_PRESETS_SECONDS,
  formatDurationLong,
  resolveFocusSettings,
} from '@/utils/focus';

interface Props {
  onNavigate: (r: Route) => void;
}

/**
 * FocusSetupPage — primeira tela do fluxo "Sessão de foco".
 *
 * O usuário escolhe:
 *   - Tempo de foco (preset 15/25/45/60 OU custom em minutos)
 *   - Tempo de pausa (preset 5/10/15)
 *   - Meta da sessão (só tempo, ou N revisões)
 *   - Escopo (todos os baralhos, uma pasta, um baralho)
 *
 * Ao clicar "Iniciar", navega pra `focus-session` com tudo embutido no
 * Route (sem estado global; recarregar a página perde a sessão, o que é
 * intencional — não queremos sessões "fantasmas"). Os defaults vêm de
 * `Settings.focus.lastFocusSeconds` / `lastBreakSeconds` para que o
 * usuário não tenha que reconfigurar tudo a cada vez.
 */
export function FocusSetupPage({ onNavigate }: Props) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);

  const [focusSeconds, setFocusSeconds] = useState(DEFAULT_FOCUS_SECONDS);
  const [breakSeconds, setBreakSeconds] = useState(DEFAULT_BREAK_SECONDS);
  const [customFocusMin, setCustomFocusMin] = useState<string>('');
  const [customMode, setCustomMode] = useState(false);

  const [goal, setGoal] = useState<FocusGoal>({ kind: 'time' });
  const [scope, setScope] = useState<FocusScope>({ kind: 'all' });

  useEffect(() => {
    void (async () => {
      const [allDecks, allFolders, settings] = await Promise.all([
        db.decks.toArray(),
        db.folders.toArray(),
        db.settings.get('singleton'),
      ]);
      setDecks(allDecks);
      setFolders(allFolders);
      const resolved = resolveFocusSettings(settings?.focus);
      setFocusSeconds(resolved.lastFocusSeconds!);
      setBreakSeconds(resolved.lastBreakSeconds!);
    })();
  }, []);

  const customFocusSecondsValid = useMemo(() => {
    const n = Number(customFocusMin);
    if (!Number.isFinite(n) || n <= 0 || n > 240) return null;
    return Math.round(n * 60);
  }, [customFocusMin]);

  function start() {
    // Se o usuário tem custom mode ativo, comita o valor antes de partir.
    let chosenFocus = focusSeconds;
    if (customMode && customFocusSecondsValid !== null) {
      chosenFocus = customFocusSecondsValid;
    }

    // Persiste como "última usada" para a próxima vez. Não bloqueante.
    void (async () => {
      const settings = await db.settings.get('singleton');
      if (!settings) return;
      await db.settings.put({
        ...settings,
        focus: {
          ...(settings.focus ?? {}),
          lastFocusSeconds: chosenFocus,
          lastBreakSeconds: breakSeconds,
        },
        updatedAt: Date.now(),
      });
    })();

    onNavigate({
      name: 'focus-session',
      focusSeconds: chosenFocus,
      breakSeconds,
      scope,
      goal,
    });
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <button
          onClick={() => onNavigate({ name: 'home' })}
          className="flex items-center gap-2 text-sm text-muted hover:text-primary mb-4"
        >
          <ArrowLeft size={16} /> Voltar
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sessão de foco
        </h1>
        <p className="text-sm text-muted mt-1">
          Defina um tempo, escolha um escopo, e revise sem interrupções.
          O cronômetro fica visível no canto durante toda a sessão.
        </p>
      </header>

      {/* ── Tempo de foco ─────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={<Clock size={14} />} title="Tempo de foco" />
        <div className="flex flex-wrap gap-2">
          {FOCUS_PRESETS_SECONDS.map(s => (
            <PresetButton
              key={s}
              active={!customMode && focusSeconds === s}
              onClick={() => {
                setFocusSeconds(s);
                setCustomMode(false);
              }}
            >
              {formatDurationLong(s)}
            </PresetButton>
          ))}
          <PresetButton
            active={customMode}
            onClick={() => setCustomMode(true)}
          >
            Personalizado
          </PresetButton>
        </div>
        {customMode && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="240"
              value={customFocusMin}
              onChange={e => setCustomFocusMin(e.target.value)}
              placeholder="minutos"
              className="w-32 rounded-md border border-divider bg-surface px-3 py-1.5 text-sm text-primary outline-none focus:border-accent/50"
            />
            <span className="text-xs text-muted">minutos (1–240)</span>
            {customFocusSecondsValid === null && customFocusMin && (
              <span className="text-[11px] text-warning-fg">
                Valor inválido
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Tempo de pausa ────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          icon={<Coffee size={14} />}
          title="Pausa sugerida"
          hint="Mostrada no resumo final. A pausa é uma sugestão, não é cronometrada."
        />
        <div className="flex flex-wrap gap-2">
          {BREAK_PRESETS_SECONDS.map(s => (
            <PresetButton
              key={s}
              active={breakSeconds === s}
              onClick={() => setBreakSeconds(s)}
            >
              {formatDurationLong(s)}
            </PresetButton>
          ))}
        </div>
      </section>

      {/* ── Meta da sessão ────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={<Target size={14} />} title="Meta da sessão" />
        <div className="space-y-2">
          <label className="flex items-start gap-3 rounded-lg border border-subtle bg-card p-3 cursor-pointer">
            <input
              type="radio"
              checked={goal.kind === 'time'}
              onChange={() => setGoal({ kind: 'time' })}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <div>
              <div className="text-sm font-medium text-primary">
                Apenas tempo
              </div>
              <div className="text-[11px] text-muted">
                A sessão termina quando o cronômetro zera (ou quando você
                encerrar manualmente).
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-subtle bg-card p-3 cursor-pointer">
            <input
              type="radio"
              checked={goal.kind === 'reviews'}
              onChange={() => setGoal({ kind: 'reviews', target: 30 })}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-primary">
                Atingir uma quantidade de revisões
              </div>
              <div className="text-[11px] text-muted">
                A sessão termina quando o número for atingido OU quando o
                tempo zerar — o que vier primeiro.
              </div>
              {goal.kind === 'reviews' && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={goal.target}
                    onChange={e => {
                      const n = Math.max(1, Number(e.target.value) || 1);
                      setGoal({ kind: 'reviews', target: n });
                    }}
                    className="w-24 rounded-md border border-divider bg-surface px-3 py-1 text-sm text-primary outline-none focus:border-accent/50"
                  />
                  <span className="text-xs text-muted">revisões</span>
                </div>
              )}
            </div>
          </label>
        </div>
      </section>

      {/* ── Escopo ────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={<Layers size={14} />} title="Escopo" />
        <div className="space-y-2">
          <label className="flex items-start gap-3 rounded-lg border border-subtle bg-card p-3 cursor-pointer">
            <input
              type="radio"
              checked={scope.kind === 'all'}
              onChange={() => setScope({ kind: 'all' })}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <div>
              <div className="text-sm font-medium text-primary">
                Todos os baralhos
              </div>
              <div className="text-[11px] text-muted">
                Revisão tira de qualquer baralho que tenha cartões vencidos.
              </div>
            </div>
          </label>

          {folders.length > 0 && (
            <div className="rounded-lg border border-dashed border-divider bg-surface-2 p-3">
              <div className="text-[11px] text-faint italic">
                Escopo por pasta chega em uma próxima atualização. Por
                enquanto, escolha "Todos os baralhos" ou um baralho
                específico.
              </div>
            </div>
          )}

          {decks.length > 0 && (
            <label className="flex items-start gap-3 rounded-lg border border-subtle bg-card p-3 cursor-pointer">
              <input
                type="radio"
                checked={scope.kind === 'deck'}
                onChange={() => {
                  const firstDeck = decks[0];
                  if (firstDeck) setScope({ kind: 'deck', deckId: firstDeck.id });
                }}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-primary">
                  Um baralho específico
                </div>
                {scope.kind === 'deck' && (
                  <select
                    value={scope.deckId}
                    onChange={e =>
                      setScope({ kind: 'deck', deckId: e.target.value })
                    }
                    className="mt-2 w-full rounded-md border border-divider bg-surface px-3 py-1.5 text-sm text-primary outline-none focus:border-accent/50"
                  >
                    {decks.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>
          )}
        </div>
      </section>

      {/* ── Iniciar ───────────────────────────────────────────────────── */}
      <div className="pt-2">
        <button
          onClick={start}
          disabled={
            customMode &&
            (customFocusSecondsValid === null || !customFocusMin)
          }
          className="w-full sm:w-auto rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-on-accent hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Iniciar sessão
        </button>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted">
        {icon} {title}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-faint leading-relaxed">
          {hint}
        </div>
      )}
    </div>
  );
}

function PresetButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-accent/40 bg-accent-soft text-accent-fg'
          : 'border-divider bg-surface-2 text-secondary hover:tint-1'
      }`}
    >
      {children}
    </button>
  );
}
