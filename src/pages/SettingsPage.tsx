import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Upload,
  RotateCcw,
  Save,
  RotateCw,
  Cloud,
  Keyboard,
  Sliders,
  Palette,
  User,
  Database,
  Info,
  Volume2,
  Play,
  Square,
  Timer,
  Plus,
  X as XIcon,
  Bell,
  AlertTriangle,
} from 'lucide-react';
import { db, importData, resetAll } from '@/db/database';
import type {
  Settings,
  SchedulerConfig,
  ThemeMode,
  ReviewFontScale,
} from '@/types/stats';
import {
  DEFAULT_SPEECH_SETTINGS,
  SPEECH_PITCH_MAX,
  SPEECH_PITCH_MIN,
  SPEECH_RATE_MAX,
  SPEECH_RATE_MIN,
  SPEECH_SAMPLE_TEXT,
  SPEECH_VOLUME_MAX,
  SPEECH_VOLUME_MIN,
  type SpeechSettings,
} from '@/types/speech';
import {
  cancelSpeech,
  isSpeechAvailable,
  loadVoices,
  resolveVoice,
  speak,
} from '@/utils/speech';
import {
  ACTION_HINTS,
  ACTION_LABELS,
  DEFAULT_SHORTCUTS,
  captureKey,
  findConflict,
  formatShortcut,
  type ShortcutAction,
  type ShortcutMap,
} from '@/utils/shortcuts';
import type { FocusSettings } from '@/types/focus';
import { DEFAULT_FOCUS_REWARDS } from '@/utils/focus';
import type { NotificationSettings } from '@/types/notifications';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getPermission,
  isNotificationSupported,
  requestPermission,
  showNotification,
} from '@/utils/notifications';
import { DEFAULT_SCHEDULER_CONFIG } from '@/scheduler/scheduler';
import { Collapsible } from '@/components/Collapsible';
import { ImportDeckModal } from '@/components/ImportDeckModal';
import { useConfirm } from '@/components/ConfirmModal';
import { applyTheme } from '@/utils/theme';
import {
  buildExport,
  downloadJson,
  readJsonFile,
  type AttachmentExport,
} from '@/utils/importExport';
import type { Attachment } from '@/types/attachment';
import { blobToDataUrl, dataUrlToBlob } from '@/utils/attachments';

/**
 * Settings page, organized in collapsible sections so it can grow without
 * becoming a wall of fields. Sections follow the structure agreed for
 * Phase 1:
 *
 *   Geral · Aparência · Revisão · Atalhos
 *   Dados e backup · Sincronização (placeholder) · Sobre
 *
 * The single "Salvar configurações" button at the bottom persists every
 * field at once — same as before. Each section keeps its local controls,
 * but no section auto-saves.
 */

const FONT_SCALE_OPTIONS: Array<{ value: ReviewFontScale; label: string; hint: string }> = [
  { value: 'sm', label: 'Pequeno',      hint: 'Mais cartões visíveis, fórmulas compactas.' },
  { value: 'md', label: 'Médio',        hint: 'Tamanho similar ao restante do app.' },
  { value: 'lg', label: 'Grande',       hint: 'Padrão recomendado — confortável para LaTeX.' },
  { value: 'xl', label: 'Muito grande', hint: 'Fórmulas grandes, leitura à distância.' },
];

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'dark',   label: 'Escuro' },
  { value: 'light',  label: 'Claro' },
  { value: 'system', label: 'Sistema' },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importDeckOpen, setImportDeckOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  // Tracks the theme as it stands in the DB *right now*. Used to revert the
  // visual preview if the user navigates away from Settings without saving.
  // Updated when the page mounts (from DB) and again whenever the user hits
  // "Salvar". Never updated by `updateTheme` — that's what makes the preview
  // disposable.
  const persistedThemeRef = useRef<ThemeMode | null>(null);
  const hasUnsavedThemeRef = useRef(false);

  useEffect(() => {
    (async () => {
      const s = (await db.settings.get('singleton')) || null;
      setSettings(s);
      persistedThemeRef.current = s?.theme ?? 'system';
    })();

    // Cleanup: if the user leaves Settings with an unsaved theme preview,
    // restore whatever theme is actually persisted. Otherwise navigating
    // away would silently "commit" the preview, which the user told us
    // should NOT happen — settings only persist via the Salvar button.
    return () => {
      if (hasUnsavedThemeRef.current && persistedThemeRef.current) {
        applyTheme(persistedThemeRef.current);
      }
    };
  }, []);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  }

  /**
   * Theme is special: clicking a theme button gives an INSTANT preview so
   * the user sees what they're picking. The preview is NOT persisted —
   * neither to localStorage nor to the DB — until they click "Salvar".
   *
   * If they leave Settings without saving, the cleanup in the mount effect
   * reverts to whichever theme is actually stored. So the rule "no setting
   * sticks without Salvar" holds for theme too.
   */
  function updateTheme(value: ThemeMode) {
    if (!settings) return;
    setSettings({ ...settings, theme: value });
    applyTheme(value);
    hasUnsavedThemeRef.current = value !== persistedThemeRef.current;
  }

  function updateScheduler<K extends keyof SchedulerConfig>(
    key: K,
    value: SchedulerConfig[K],
  ) {
    if (!settings) return;
    setSettings({
      ...settings,
      scheduler: { ...settings.scheduler, [key]: value },
    });
  }

  function resetScheduler() {
    if (!settings) return;
    setSettings({
      ...settings,
      scheduler: { ...DEFAULT_SCHEDULER_CONFIG },
    });
  }

  async function save() {
    if (!settings) return;
    // Stamp updatedAt — light prep for future cloud sync (recency-based
    // conflict resolution). Doesn't change current behavior.
    await db.settings.put({ ...settings, updatedAt: Date.now() });
    // Persist the theme cache for the next launch's anti-flash inline
    // script. Done HERE (not in updateTheme) so an unsaved preview doesn't
    // leak into the next session.
    try {
      localStorage.setItem('quanta:theme', settings.theme);
    } catch {
      // Storage unavailable — non-fatal.
    }
    // The persisted theme is now the current state. Subsequent navigation
    // without changes won't trigger the revert in the cleanup effect.
    persistedThemeRef.current = settings.theme;
    hasUnsavedThemeRef.current = false;
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  async function exportData() {
    const [decks, folders, cards, reviewLogs, userStats, st, attachments] =
      await Promise.all([
        db.decks.toArray(),
        db.folders.toArray(),
        db.cards.toArray(),
        db.reviewLogs.toArray(),
        db.userStats.get('singleton'),
        db.settings.get('singleton'),
        db.attachments.toArray(),
      ]);

    // Serialize each attachment's Blob into a base64 data URL. Done in
    // parallel — `FileReader` is single-threaded per instance but multiple
    // reads run independently.
    const exportedAttachments: AttachmentExport[] = await Promise.all(
      attachments.map(async a => ({
        id: a.id,
        cardId: a.cardId,
        type: a.type,
        mimeType: a.mimeType,
        filename: a.filename,
        size: a.size,
        data: await blobToDataUrl(a.data),
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    );

    const payload = buildExport({
      decks,
      folders,
      cards,
      reviewLogs,
      userStats: userStats!,
      settings: st!,
      attachments: exportedAttachments,
    });
    const filename = `quanta-export-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    downloadJson(payload, filename);
  }

  async function handleImport(file: File) {
    try {
      const parsed = await readJsonFile(file);
      const attCount = parsed.attachments?.length ?? 0;
      const ok = await confirm({
        title: 'Substituir todos os dados?',
        message:
          `Importar este arquivo irá substituir TODOS os dados atuais ` +
          `(${parsed.decks.length} baralhos, ${parsed.cards.length} cartões, ` +
          `${parsed.folders?.length ?? 0} pastas` +
          (attCount > 0 ? `, ${attCount} anexos` : '') +
          `).\n\n` +
          `Esta ação não pode ser desfeita.`,
        tone: 'danger',
        confirmLabel: 'Substituir tudo',
      });
      if (!ok) return;

      // Convert each attachment's base64 data URL back to Blob before
      // handing the list to importData(). This is async per item; if any
      // single attachment fails to decode we abort the whole import — we
      // never want a partial state where some images come back and others
      // don't, silently.
      let attachments: Attachment[] | undefined;
      if (parsed.attachments && parsed.attachments.length > 0) {
        attachments = await Promise.all(
          parsed.attachments.map(async a => ({
            id: a.id,
            cardId: a.cardId,
            type: a.type,
            mimeType: a.mimeType,
            filename: a.filename,
            size: a.size,
            data: await dataUrlToBlob(a.data),
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          })),
        );
      }

      await importData({
        decks: parsed.decks,
        folders: parsed.folders ?? [],
        cards: parsed.cards,
        reviewLogs: parsed.reviewLogs,
        userStats: parsed.userStats,
        settings: parsed.settings,
        attachments,
      });
      setImportMessage('Importação concluída. Recarregando...');
      setTimeout(() => location.reload(), 800);
    } catch (err: any) {
      setImportMessage(`Falha ao importar: ${err.message ?? err}`);
    }
  }

  async function handleReset() {
    const ok = await confirm({
      title: 'Resetar TODOS os dados?',
      message:
        'Baralhos, pastas, cartões, progresso e configurações serão apagados.\n\n' +
        'Esta ação não pode ser desfeita.',
      tone: 'danger',
      confirmLabel: 'Resetar tudo',
    });
    if (!ok) return;
    await resetAll();
    setSettings((await db.settings.get('singleton')) || null);
    location.reload();
  }

  if (!settings) return null;

  const sched = settings.scheduler;
  const scale: ReviewFontScale = settings.reviewFontScale ?? 'lg';

  return (
    <div className="max-w-2xl space-y-4 animate-fade-in">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted mt-1">
          Tudo é salvo localmente no seu computador.
        </p>
      </header>

      {/* ─── Geral ──────────────────────────────────────────────────────── */}
      <Collapsible
        title="Geral"
        preview="Nome, mensagens motivacionais."
        defaultOpen
      >
        <SectionIcon icon={<User size={12} />} />
        <Field label="Nome de exibição">
          <input
            value={settings.userName}
            onChange={e => update('userName', e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-accent/50 outline-none"
          />
        </Field>
        <div className="mt-3">
          <Toggle
            label="Mensagens motivacionais"
            description="Mostrar uma frase no topo da tela inicial."
            checked={settings.motivationalEnabled}
            onChange={v => update('motivationalEnabled', v)}
          />
        </div>
      </Collapsible>

      {/* ─── Aparência ──────────────────────────────────────────────────── */}
      <Collapsible
        title="Aparência"
        preview="Tema e tamanho do cartão de revisão."
      >
        <SectionIcon icon={<Palette size={12} />} />
        <Field label="Tema">
          <div className="flex gap-2 flex-wrap">
            {THEME_OPTIONS.map(t => (
              <button
                key={t.value}
                onClick={() => updateTheme(t.value)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  settings.theme === t.value
                    ? 'bg-accent-soft text-accent-fg border border-accent/30'
                    : 'tint-1 text-secondary border border-subtle'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-faint mt-2 leading-relaxed">
            Pré-visualização imediata. Clique em "Salvar configurações" para
            manter — caso contrário, ao sair de Configurações ou reabrir o
            app, o tema volta ao que estava salvo.
          </p>
        </Field>

        <div className="mt-5">
          <Field label="Tamanho do cartão de revisão">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FONT_SCALE_OPTIONS.map(opt => {
                const active = scale === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => update('reviewFontScale', opt.value)}
                    className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? 'border-accent/40 bg-accent-soft'
                        : 'border-divider tint-1 hover:border-strong'
                    }`}
                  >
                    <span
                      className={`text-sm font-medium ${
                        active ? 'text-accent-fg' : 'text-primary'
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="text-[11px] leading-tight text-faint">
                      {opt.hint}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-faint mt-2 leading-relaxed">
              Afeta a fonte do texto e o tamanho das fórmulas LaTeX na sessão
              de revisão e no modo Rush.
            </p>
          </Field>
        </div>
      </Collapsible>

      {/* ─── Revisão ────────────────────────────────────────────────────── */}
      <Collapsible
        title="Revisão"
        preview="Meta diária e parâmetros do agendador."
      >
        <SectionIcon icon={<Sliders size={12} />} />
        <Field label="Meta diária de revisões">
          <input
            type="number"
            min={1}
            max={500}
            value={settings.dailyGoal}
            onChange={e =>
              update('dailyGoal', Math.max(1, parseInt(e.target.value) || 1))
            }
            className="w-32 px-3 py-2 rounded-lg bg-surface border border-divider focus:border-accent/50 outline-none"
          />
        </Field>

        <div className="mt-5">
          <Collapsible
            title="Parâmetros do agendador"
            badge="8"
            preview="Hora de virada, ease, fatores e intervalos. Inspirado no Anki."
            stacked
            headerAction={
              <button
                type="button"
                onClick={resetScheduler}
                className="flex items-center gap-1.5 rounded-md border border-divider tint-1 px-2.5 py-1 text-xs text-secondary hover:tint-3"
                title="Voltar aos valores padrão"
              >
                <RotateCw size={12} />
                Padrões
              </button>
            }
          >
            <p className="text-xs text-faint leading-relaxed pb-3">
              Mexa com cuidado — esses valores afetam quando seus cartões
              voltam pra revisão.
            </p>
            <div className="space-y-4">
              <NumField
                label="Hora de virada do dia"
                description='Hora em que o "novo dia" de estudo começa. Padrão Anki: 4 (4h da manhã). Reviews antes dessa hora ainda contam como o dia anterior.'
                unit="h"
                min={0}
                max={23}
                step={1}
                value={sched.rolloverHour}
                onChange={v => updateScheduler('rolloverHour', clamp(v, 0, 23))}
              />
              <NumField
                label="Intervalo de graduação"
                description='Dias até a próxima revisão quando você aperta "Bom" em um cartão novo.'
                unit="dia(s)"
                min={1}
                max={14}
                step={1}
                value={sched.graduatingInterval}
                onChange={v =>
                  updateScheduler('graduatingInterval', clamp(v, 1, 14))
                }
              />
              <NumField
                label="Intervalo de fácil"
                description='Dias até a próxima revisão quando você aperta "Fácil" em um cartão novo.'
                unit="dia(s)"
                min={1}
                max={30}
                step={1}
                value={sched.easyInterval}
                onChange={v => updateScheduler('easyInterval', clamp(v, 1, 30))}
              />
              <NumField
                label="Ease inicial"
                description="Multiplicador de intervalo aplicado quando um cartão se gradua. SM-2 padrão: 2,5."
                unit="×"
                min={1.3}
                max={3.5}
                step={0.05}
                value={sched.startingEase}
                onChange={v =>
                  updateScheduler('startingEase', clamp(v, 1.3, 3.5))
                }
              />
              <NumField
                label="Fator de difícil"
                description='Multiplicador aplicado ao intervalo quando você aperta "Difícil" em um cartão maduro. Padrão: 1,2.'
                unit="×"
                min={1.0}
                max={2.0}
                step={0.05}
                value={sched.hardFactor}
                onChange={v => updateScheduler('hardFactor', clamp(v, 1.0, 2.0))}
              />
              <NumField
                label="Bônus de fácil"
                description='Multiplicador extra aplicado quando você aperta "Fácil" em um cartão maduro. Padrão: 1,3.'
                unit="×"
                min={1.0}
                max={2.0}
                step={0.05}
                value={sched.easyBonus}
                onChange={v => updateScheduler('easyBonus', clamp(v, 1.0, 2.0))}
              />
              <NumField
                label="Tempo de relearning"
                description='Minutos até o cartão voltar quando você aperta "Errei". Padrão: 10.'
                unit="min"
                min={1}
                max={1440}
                step={1}
                value={sched.lapseMinutes}
                onChange={v =>
                  updateScheduler('lapseMinutes', clamp(v, 1, 1440))
                }
              />
              <NumField
                label="Intervalo máximo"
                description="Limite superior do intervalo, em dias. Padrão: 365."
                unit="dia(s)"
                min={30}
                max={36500}
                step={1}
                value={sched.maxInterval}
                onChange={v =>
                  updateScheduler('maxInterval', clamp(v, 30, 36500))
                }
              />
            </div>
          </Collapsible>
        </div>
      </Collapsible>

      {/* ─── Narração / Leitura em voz alta ─────────────────────────────── */}
      <Collapsible
        title="Narração / Leitura em voz alta"
        preview="Configura voz e velocidade da narração opcional dos cartões."
      >
        <SectionIcon icon={<Volume2 size={12} />} />
        <SpeechSection
          value={settings.speech ?? DEFAULT_SPEECH_SETTINGS}
          onChange={next => update('speech', next)}
        />
      </Collapsible>

      {/* ─── Atalhos ────────────────────────────────────────────────────── */}
      <Collapsible
        title="Atalhos"
        preview="Atalhos de teclado da revisão e do Rush."
      >
        <SectionIcon icon={<Keyboard size={12} />} />
        <ShortcutsSection
          value={settings.shortcuts ?? DEFAULT_SHORTCUTS}
          onChange={next => update('shortcuts', next)}
        />
      </Collapsible>

      {/* ─── Sessão de foco ─────────────────────────────────────────────── */}
      <Collapsible
        title="Sessão de foco"
        preview="Recompensas saudáveis sugeridas após cada sessão."
      >
        <SectionIcon icon={<Timer size={12} />} />
        <FocusSection
          value={settings.focus}
          onChange={next => update('focus', next)}
        />
      </Collapsible>

      {/* ─── Notificações ────────────────────────────────────────────── */}
      <Collapsible
        title="Notificações"
        preview="Lembretes de baralho pronto e janela silenciosa."
      >
        <SectionIcon icon={<Bell size={12} />} />
        <NotificationsSection
          value={settings.notifications}
          onChange={next => update('notifications', next)}
        />
      </Collapsible>

      {/* ─── Dados e backup ─────────────────────────────────────────────── */}
      <Collapsible
        title="Dados e backup"
        preview="Backup completo · Baralho individual · Resetar."
      >
        <SectionIcon icon={<Database size={12} />} />

        {/* Grupo 1 — Backup COMPLETO (snapshot, destrutivo no import).
            Este é o caminho histórico em importExport.ts / database.ts.
            Deixo deliberadamente no topo e com texto explícito sobre o que
            "Importar tudo" faz, porque já houve confusão entre os dois
            caminhos. */}
        <div className="rounded-lg border border-subtle bg-card p-3">
          <div className="text-[11px] uppercase tracking-widest text-muted mb-2">
            Backup completo
          </div>
          <p className="text-xs text-faint leading-relaxed mb-3">
            Salva ou restaura <span className="text-secondary">tudo</span> —
            baralhos, pastas, cartões, revisões, XP, configurações. Importar
            um backup completo <span className="text-danger-fg font-medium">substitui</span>{' '}
            os dados atuais.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportData}
              className="flex items-center gap-2 px-3 py-2 rounded-lg tint-1 hover:tint-3 border border-subtle text-sm"
            >
              <Download size={14} /> Exportar tudo
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg tint-1 hover:tint-3 border border-subtle text-sm"
            >
              <Upload size={14} /> Importar tudo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = '';
              }}
              className="hidden"
            />
          </div>
          {importMessage && (
            <p className="mt-3 text-sm text-secondary">{importMessage}</p>
          )}
        </div>

        {/* Grupo 2 — Baralho INDIVIDUAL (aditivo, não-destrutivo).
            Caminho da Fase 4. Mesmo modal e mesma lógica que a DecksPage
            usa, para o usuário ter o ponto de descoberta sistemático aqui
            também. */}
        <div className="mt-3 rounded-lg border border-subtle bg-card p-3">
          <div className="text-[11px] uppercase tracking-widest text-muted mb-2">
            Baralho individual
          </div>
          <p className="text-xs text-faint leading-relaxed mb-3">
            Importa um baralho exportado de outro Quanta. Os cartões chegam
            como novos, sem histórico de revisão.{' '}
            <span className="text-secondary font-medium">
              Nenhum dado existente é apagado.
            </span>{' '}
            Para exportar um baralho, abra-o e use o botão de download.
          </p>
          <button
            onClick={() => setImportDeckOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg tint-1 hover:tint-3 border border-subtle text-sm"
          >
            <Upload size={14} /> Importar baralho
          </button>
        </div>

        {/* Grupo 3 — Zona destrutiva. Visualmente separada. */}
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger-soft/50 p-3">
          <div className="text-[11px] uppercase tracking-widest text-danger-fg mb-2">
            Zona destrutiva
          </div>
          <p className="text-xs text-danger-fg/80 leading-relaxed mb-3">
            Apaga todos os baralhos, pastas, cartões, revisões e progresso.
            Não há como desfazer.
          </p>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-danger-soft hover:bg-danger-soft/70 border border-danger/30 text-danger-fg text-sm"
          >
            <RotateCcw size={14} /> Resetar todos os dados
          </button>
        </div>

        <ImportDeckModal
          open={importDeckOpen}
          onClose={() => setImportDeckOpen(false)}
        />
      </Collapsible>

      {/* ─── Sincronização (placeholder) ────────────────────────────────── */}
      <Collapsible
        title="Sincronização"
        preview="Em breve — backup em nuvem e múltiplos dispositivos."
      >
        <SectionIcon icon={<Cloud size={12} />} />
        <div className="rounded-lg border border-dashed border-divider tint-1 p-4">
          <p className="text-sm text-secondary">
            Sincronização em nuvem ainda não está disponível.
          </p>
          <p className="text-xs text-faint mt-2 leading-relaxed">
            O Quanta vai continuar local-first. A ideia é oferecer uma conta
            opcional para sincronizar baralhos entre desktop e (futuramente)
            mobile. Por enquanto, use{' '}
            <span className="text-secondary">Exportar JSON</span> para fazer
            backups manuais.
          </p>
        </div>
      </Collapsible>

      {/* Save bar — sits above "Sobre", outside the collapsibles so it's
          always visible regardless of which sections are open. */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-400 text-on-accent text-sm font-medium"
        >
          <Save size={14} /> Salvar configurações
        </button>
        {savedFlash && (
          <span className="text-xs text-success-fg">Salvo.</span>
        )}
      </div>

      {/* ─── Sobre ──────────────────────────────────────────────────────── */}
      <section className="space-y-3 pt-4">
        <div className="flex items-center gap-2">
          <Info size={12} className="text-faint" />
          <h2 className="text-[11px] uppercase tracking-widest text-muted">
            Sobre
          </h2>
        </div>
        <p className="text-sm text-muted leading-relaxed">
          Quanta é um app local-first. Seus dados nunca saem do seu computador
          — exceto quando você exporta um JSON manualmente. Para fazer backup,
          exporte regularmente.
        </p>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (kept local — same as the previous version of this file).
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

/**
 * A tiny chip shown at the top of every section body. The Collapsible
 * component doesn't carry an icon slot in its header (the chevron lives
 * there), so we drop a small chip inside the body instead — keeps the
 * section identifiable when several are open at once.
 */
function SectionIcon({ icon }: { icon: React.ReactNode }) {
  return (
    <div className="-mt-1 mb-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-faint">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded tint-1">
        {icon}
      </span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-secondary mb-2">{label}</label>
      {children}
    </div>
  );
}

function NumField({
  label,
  description,
  unit,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-4">
      <div>
        <div className="text-sm text-secondary">{label}</div>
        {description && (
          <p className="text-xs text-faint mt-1 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 self-center">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="w-24 rounded-md border border-divider bg-surface px-2.5 py-1.5 text-right text-sm tabular-nums outline-none focus:border-accent/50"
        />
        {unit && (
          <span className="min-w-[3ch] text-xs text-faint">{unit}</span>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full text-left p-3 rounded-lg border border-subtle hover:border-divider transition-colors"
    >
      <div>
        <div className="text-sm">{label}</div>
        {description && (
          <div className="text-xs text-muted mt-0.5">{description}</div>
        )}
      </div>
      <div
        className={`w-10 h-6 rounded-full p-0.5 transition-colors ${
          checked ? 'bg-accent-500' : 'tint-3'
        }`}
      >
        <div
          className="w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
          style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ShortcutsSection — list of remappable actions with inline key capture
// ─────────────────────────────────────────────────────────────────────────────
//
// Each row shows the action label + a chip with the current key + a button
// "Alterar". Clicking "Alterar" puts that row into capture mode: the very
// next valid keydown is recorded as the new binding. We validate against
// every other action's binding and either commit or show the conflict
// inline so the user knows what they'd be overwriting.
//
// Same persistence model as the rest of Settings: nothing is saved to the
// DB until the user clicks "Salvar configurações" at the bottom of the
// page. The local state here is the editable draft, lifted into the
// parent via `onChange`.

function ShortcutsSection({
  value,
  onChange,
}: {
  value: ShortcutMap;
  onChange: (next: ShortcutMap) => void;
}) {
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  // When in capture mode, install a global keydown listener that swallows
  // the next valid keystroke. Cancel with Esc or by clicking outside.
  // Keep the listener tightly scoped: it's only mounted while `capturing`
  // is non-null, and uninstalled the moment a key is captured or canceled.
  useEffect(() => {
    if (!capturing) return;
    // Capturar numa variável local: o TypeScript não consegue narrow
    // `capturing` (state) dentro do closure de `onKey` — ele só vê o
    // tipo nominal `ShortcutAction | null`. Atribuir a um const após
    // o guard resolve o narrowing.
    const action = capturing;
    function onKey(e: KeyboardEvent) {
      // Always intercept — we're explicitly waiting for ANY key.
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels the capture without committing.
      if (e.key === 'Escape') {
        setCapturing(null);
        setError(null);
        return;
      }

      const result = captureKey(e);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      const conflict = findConflict(value, action, result.key);
      if (conflict) {
        setError(
          `Esta tecla já está em uso por "${ACTION_LABELS[conflict]}". ` +
            'Altere o outro atalho primeiro ou escolha outra tecla.',
        );
        return;
      }
      onChange({ ...value, [action]: result.key });
      setCapturing(null);
      setError(null);
    }
    // Capture phase so we run before any review-page listener.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, value, onChange]);

  function resetAll() {
    onChange({ ...DEFAULT_SHORTCUTS });
    setCapturing(null);
    setError(null);
  }

  const actions: ShortcutAction[] = [
    'reveal',
    'rateAgain',
    'rateHard',
    'rateGood',
    'rateEasy',
    'toggleNarration',
    'advance',
    'exit',
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-faint leading-relaxed">
        Clique em <strong>Alterar</strong> e pressione a tecla desejada.
        Atalhos com Ctrl/Cmd/Alt não são suportados nesta versão.
      </p>

      <div className="space-y-1.5">
        {actions.map(action => {
          const isCapturing = capturing === action;
          const isDefault = value[action] === DEFAULT_SHORTCUTS[action];
          return (
            <div
              key={action}
              className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                isCapturing
                  ? 'border-accent/50 bg-accent-soft'
                  : 'border-subtle bg-card'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-primary">
                  {ACTION_LABELS[action]}
                </div>
                <div className="text-[10px] text-faint leading-relaxed">
                  {ACTION_HINTS[action]}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <kbd
                  className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                    isCapturing
                      ? 'border-accent/40 bg-card text-accent-fg'
                      : 'border-divider bg-surface text-secondary'
                  }`}
                >
                  {isCapturing ? 'Pressione uma tecla…' : formatShortcut(value[action])}
                </kbd>
                {!isDefault && !isCapturing && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ ...value, [action]: DEFAULT_SHORTCUTS[action] })
                    }
                    title="Restaurar padrão deste atalho"
                    className="rounded p-1 text-faint hover:text-muted"
                  >
                    <RotateCcw size={11} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCapturing(isCapturing ? null : action);
                    setError(null);
                  }}
                  className={`rounded-md border px-2 py-0.5 text-[11px] ${
                    isCapturing
                      ? 'border-divider bg-surface-2 text-muted'
                      : 'border-divider bg-surface-2 text-primary hover:tint-1'
                  }`}
                >
                  {isCapturing ? 'Cancelar' : 'Alterar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft p-2.5 text-[11px] leading-relaxed text-warning-fg">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="pt-1">
        <button
          type="button"
          onClick={resetAll}
          className="inline-flex items-center gap-1.5 rounded-md border border-divider bg-surface-2 px-3 py-1.5 text-xs text-primary hover:tint-1"
        >
          <RotateCw size={12} />
          Restaurar todos os padrões
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SpeechSection — narration preferences UI inside Settings
// ─────────────────────────────────────────────────────────────────────────────
//
// Self-contained: owns the voice list and the "Testar voz" playback state.
// The values it edits are bubbled up to the parent's `settings.speech` via
// `onChange` — same persistence flow as every other Settings control (no
// auto-save; only the bottom "Salvar configurações" button writes the DB).
//
// Notable concerns:
//   - Voices may take a moment to load on first open (Chromium fires
//     `voiceschanged` async). Until they're available, the dropdown shows
//     "Carregando vozes...".
//   - If `isSpeechAvailable() === false`, the section renders a warning
//     and disables every control. The user can still see their saved
//     values (useful if they later run the app on a system with TTS).
//   - The "Testar voz" button uses the IN-PROGRESS values (not the saved
//     ones), so the user can iterate without saving first.

function SpeechSection({
  value,
  onChange,
}: {
  value: SpeechSettings;
  onChange: (next: SpeechSettings) => void;
}) {
  const available = isSpeechAvailable();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Load voices once on mount. Errors/empty results are non-fatal — the
  // dropdown just shows "(sem vozes disponíveis)" and the dropdown is
  // disabled. Saved voiceURI is preserved either way.
  useEffect(() => {
    if (!available) {
      setVoicesLoaded(true);
      return;
    }
    let cancelled = false;
    loadVoices().then(list => {
      if (!cancelled) {
        setVoices(list);
        setVoicesLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [available]);

  // Cancel any in-flight test playback when the section unmounts.
  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  // Optionally filter the dropdown by preferred language. Empty string =
  // "all languages". Implemented as a startsWith match so 'pt' covers
  // both 'pt-BR' and 'pt-PT'.
  const filteredVoices = value.preferredLang
    ? voices.filter(v =>
        v.lang.toLowerCase().startsWith(value.preferredLang!.toLowerCase()),
      )
    : voices;

  // Derive distinct lang codes for the language dropdown. Use the part
  // before the dash as the key so 'pt-BR' and 'pt-PT' don't both appear
  // unless the user has both.
  const availableLangs = Array.from(new Set(voices.map(v => v.lang))).sort();

  function handleTest() {
    if (!available) return;
    if (isPlaying) {
      cancelSpeech();
      setIsPlaying(false);
      return;
    }
    const voice = resolveVoice(voices, value.voiceURI);
    speak(SPEECH_SAMPLE_TEXT, {
      voice,
      rate: value.rate ?? DEFAULT_SPEECH_SETTINGS.rate,
      volume: value.volume ?? DEFAULT_SPEECH_SETTINGS.volume,
      pitch: value.pitch ?? DEFAULT_SPEECH_SETTINGS.pitch,
      onEnd: () => setIsPlaying(false),
      onError: () => setIsPlaying(false),
    });
    setIsPlaying(true);
  }

  function patch(partial: Partial<SpeechSettings>) {
    onChange({ ...value, ...partial });
  }

  function resetField(key: keyof SpeechSettings, defaultValue: unknown) {
    patch({ [key]: defaultValue } as Partial<SpeechSettings>);
  }

  const enabled = value.enabled ?? DEFAULT_SPEECH_SETTINGS.enabled;
  const controlsDisabled = !available || !enabled;

  return (
    <div className="space-y-4">
      {!available && (
        <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft p-2.5 text-[11px] leading-relaxed text-warning-fg">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            Leitura em voz alta não disponível neste sistema. Os campos
            de narração nos cartões continuam funcionando — eles serão
            lidos quando o app rodar em um ambiente compatível.
          </span>
        </div>
      )}

      {/* Master kill switch */}
      <label className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-2 px-3 py-2 cursor-pointer">
        <div>
          <div className="text-xs font-medium text-primary">
            Habilitar leitura em voz alta
          </div>
          <div className="text-[10px] text-faint leading-relaxed">
            Quando desligado, nenhum botão de narração aparece na revisão,
            mesmo em cartões que tenham narração configurada.
          </div>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => patch({ enabled: e.target.checked })}
          disabled={!available}
          className="h-4 w-4 accent-accent"
        />
      </label>

      {/* Language filter */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted">
            Idioma preferido
          </label>
          <select
            value={value.preferredLang ?? ''}
            onChange={e =>
              patch({
                preferredLang: e.target.value ? e.target.value : undefined,
              })
            }
            disabled={controlsDisabled || availableLangs.length === 0}
            className="mt-1 w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-xs text-primary outline-none focus:border-accent/50 disabled:opacity-50"
          >
            <option value="">Todos os idiomas</option>
            {availableLangs.map(lang => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted">
            Voz
          </label>
          <select
            value={value.voiceURI ?? ''}
            onChange={e =>
              patch({ voiceURI: e.target.value ? e.target.value : undefined })
            }
            disabled={controlsDisabled || filteredVoices.length === 0}
            className="mt-1 w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-xs text-primary outline-none focus:border-accent/50 disabled:opacity-50"
          >
            <option value="">
              {!voicesLoaded
                ? 'Carregando vozes...'
                : filteredVoices.length === 0
                ? '(sem vozes disponíveis)'
                : 'Padrão do sistema'}
            </option>
            {filteredVoices.map(v => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
                {v.default ? ' — padrão' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sliders: rate / volume / pitch */}
      <SpeechSlider
        label="Velocidade"
        value={value.rate ?? DEFAULT_SPEECH_SETTINGS.rate}
        min={SPEECH_RATE_MIN}
        max={SPEECH_RATE_MAX}
        step={0.1}
        disabled={controlsDisabled}
        onChange={n => patch({ rate: n })}
        onReset={() => resetField('rate', DEFAULT_SPEECH_SETTINGS.rate)}
      />
      <SpeechSlider
        label="Volume"
        value={value.volume ?? DEFAULT_SPEECH_SETTINGS.volume}
        min={SPEECH_VOLUME_MIN}
        max={SPEECH_VOLUME_MAX}
        step={0.05}
        disabled={controlsDisabled}
        onChange={n => patch({ volume: n })}
        onReset={() => resetField('volume', DEFAULT_SPEECH_SETTINGS.volume)}
      />
      <SpeechSlider
        label="Tom"
        value={value.pitch ?? DEFAULT_SPEECH_SETTINGS.pitch}
        min={SPEECH_PITCH_MIN}
        max={SPEECH_PITCH_MAX}
        step={0.1}
        disabled={controlsDisabled}
        onChange={n => patch({ pitch: n })}
        onReset={() => resetField('pitch', DEFAULT_SPEECH_SETTINGS.pitch)}
      />

      {/* Test button */}
      <div className="pt-1">
        <button
          type="button"
          onClick={handleTest}
          disabled={controlsDisabled}
          className="inline-flex items-center gap-1.5 rounded-md border border-divider bg-surface-2 px-3 py-1.5 text-xs text-primary hover:tint-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPlaying ? <Square size={12} /> : <Play size={12} />}
          {isPlaying ? 'Parar' : 'Testar voz'}
        </button>
        <span className="ml-2 text-[10px] text-faint">
          Usa os valores atuais (sem precisar salvar).
        </span>
      </div>
    </div>
  );
}

// Small labeled slider with a numeric display and a reset chevron.
// Inlined here (not extracted to a shared component) because Settings
// already has bespoke control patterns and a third-party slider lib would
// be overkill for three sliders.
function SpeechSlider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (n: number) => void;
  onReset: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] uppercase tracking-widest text-muted">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-secondary">
            {value.toFixed(2)}
          </span>
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            title="Resetar"
            className="rounded p-0.5 text-faint hover:text-muted disabled:opacity-50"
          >
            <RotateCcw size={10} />
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-accent disabled:opacity-50"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FocusSection — preferências da Sessão de foco em Settings
// ─────────────────────────────────────────────────────────────────────────────
//
// O que o usuário controla aqui:
//   - Toggle "Mostrar sugestão saudável ao fim da sessão".
//   - Lista de recompensas (texto curto, livre). Pode adicionar, remover,
//     restaurar padrões. Lista vazia explícita = "não quero sugestões",
//     respeitado pela summary page.
//
// Persistência segue o mesmo modelo das outras sections: as alterações
// ficam no draft local; só o "Salvar configurações" no rodapé da página
// grava no DB.

function FocusSection({
  value,
  onChange,
}: {
  value: FocusSettings | undefined;
  onChange: (next: FocusSettings) => void;
}) {
  // Trabalhamos com um "shadow value" pra simplificar — campos undefined
  // recebem valores razoáveis no edit, mas só sobrescrevemos no parent
  // o que mudou de fato.
  const showRewards = value?.showRewards ?? true;
  const rewards = value?.rewards ?? [];

  const [newReward, setNewReward] = useState('');

  function patch(partial: Partial<FocusSettings>) {
    onChange({ ...(value ?? {}), ...partial });
  }

  function addReward() {
    const t = newReward.trim();
    if (!t) return;
    if (rewards.some(r => r.trim().toLowerCase() === t.toLowerCase())) {
      // Evita duplicata. Mantém o input com o texto pra o usuário ver.
      return;
    }
    patch({ rewards: [...rewards, t] });
    setNewReward('');
  }

  function removeReward(idx: number) {
    const next = rewards.slice();
    next.splice(idx, 1);
    patch({ rewards: next });
  }

  function restoreDefaults() {
    patch({ rewards: [...DEFAULT_FOCUS_REWARDS] });
  }

  function clearAll() {
    patch({ rewards: [] });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-faint leading-relaxed">
        Ao final de cada sessão de foco, o Quanta pode sugerir uma ação
        saudável de poucos minutos. Você define a lista.
      </p>

      {/* Toggle master */}
      <label className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-2 px-3 py-2 cursor-pointer">
        <div>
          <div className="text-xs font-medium text-primary">
            Mostrar sugestão ao fim da sessão
          </div>
          <div className="text-[10px] text-faint leading-relaxed">
            Quando desligado, o resumo da sessão não exibe a sugestão de
            recompensa.
          </div>
        </div>
        <input
          type="checkbox"
          checked={showRewards}
          onChange={e => patch({ showRewards: e.target.checked })}
          className="h-4 w-4 accent-accent"
        />
      </label>

      {/* Lista atual */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest text-muted">
            Pool de recompensas ({rewards.length})
          </div>
          <div className="flex items-center gap-2">
            {rewards.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] uppercase tracking-widest text-faint hover:text-danger-fg"
              >
                Limpar
              </button>
            )}
            <button
              type="button"
              onClick={restoreDefaults}
              className="text-[10px] uppercase tracking-widest text-faint hover:text-muted"
            >
              Restaurar padrões
            </button>
          </div>
        </div>

        {rewards.length === 0 ? (
          <div className="rounded-md border border-dashed border-divider bg-surface-2 p-3 text-[11px] text-faint italic">
            Lista vazia. Nenhuma sugestão será mostrada no resumo da
            sessão. Use "Restaurar padrões" para começar do conjunto base.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {rewards.map((r, i) => (
              <li
                key={`${i}-${r}`}
                className="flex items-center gap-2 rounded-md border border-subtle bg-card px-3 py-1.5"
              >
                <span className="flex-1 text-xs text-secondary">{r}</span>
                <button
                  type="button"
                  onClick={() => removeReward(i)}
                  title="Remover"
                  className="rounded p-0.5 text-faint hover:text-danger-fg"
                >
                  <XIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Adicionar nova */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newReward}
          onChange={e => setNewReward(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addReward();
            }
          }}
          placeholder="Ex: 'pegar uma fruta'…"
          className="flex-1 rounded-md border border-divider bg-surface px-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50"
        />
        <button
          type="button"
          onClick={addReward}
          disabled={!newReward.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-on-accent hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={11} /> Adicionar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NotificationsSection — Notification API renderer-side
// ─────────────────────────────────────────────────────────────────────────────
//
// O que o usuário controla aqui:
//   - Master switch. Ao LIGAR pela primeira vez, pedimos permissão do
//     sistema (browser/OS). Se negar, master fica visualmente ligado
//     mas avisamos que o sistema bloqueou.
//   - Lembrete de baralho pronto (toggle separado).
//   - Frequência mínima entre notificações pro mesmo deck.
//   - Janela silenciosa (toggle + start/end "HH:MM").
//   - Botão "Testar notificação".
//
// Disclaimer fixo: "As notificações funcionam enquanto o Quanta estiver
// aberto." Sem promessas falsas.

const FREQUENCY_OPTIONS = [
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
];

function NotificationsSection({
  value,
  onChange,
}: {
  value: NotificationSettings | undefined;
  onChange: (next: NotificationSettings) => void;
}) {
  const supported = isNotificationSupported();
  const v: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...value };

  // Estado da permissão. Lê 1x no mount, e reflete o último request.
  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getPermission());

  // Estado pra mostrar "Notificação enviada" como confirmação visual
  // do botão de teste.
  const [testFeedback, setTestFeedback] = useState<string | null>(null);
  useEffect(() => {
    if (!testFeedback) return;
    const t = window.setTimeout(() => setTestFeedback(null), 2500);
    return () => window.clearTimeout(t);
  }, [testFeedback]);

  // Quando o usuário liga o master switch e ainda não há permissão,
  // pedimos. Quem responde "Allow" vê a UI normalmente; quem nega vê
  // o aviso de bloqueio do sistema.
  async function setEnabled(next: boolean) {
    if (next && supported && Notification.permission === 'default') {
      const result = await requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        // Mantemos `enabled` no valor que o usuário escolheu (true).
        // O hook não dispara nada enquanto a permissão estiver negada;
        // se o usuário for nas Configurações do SO e liberar, passa a
        // funcionar sem mais cliques.
      }
    }
    onChange({ ...v, enabled: next });
  }

  function testNow() {
    if (!supported) return;
    if (Notification.permission !== 'granted') {
      setTestFeedback('Permissão não concedida — verifique no SO.');
      return;
    }
    const n = showNotification('Quanta — teste de notificação', {
      body: 'Se você está vendo isto, as notificações estão funcionando.',
      tag: 'quanta-test',
    });
    setTestFeedback(
      n ? 'Notificação enviada.' : 'Não foi possível enviar (verifique permissão).',
    );
  }

  function patch(partial: Partial<NotificationSettings>) {
    onChange({ ...v, ...partial });
  }

  const blocked = supported && permission === 'denied';

  return (
    <div className="space-y-4">
      {/* Disclaimer fixo */}
      <div className="rounded-md border border-divider bg-surface-2 p-2.5 text-[11px] leading-relaxed text-faint">
        As notificações funcionam <strong className="text-muted">enquanto
        o Quanta estiver aberto</strong>. Auto-start e background ficam
        para uma próxima atualização.
      </div>

      {!supported && (
        <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft p-2.5 text-[11px] leading-relaxed text-warning-fg">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            Este ambiente não suporta a API de Notification. Os controles
            abaixo continuam visíveis para que suas preferências fiquem
            salvas, mas nada será disparado.
          </span>
        </div>
      )}

      {blocked && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft p-2.5 text-[11px] leading-relaxed text-danger-fg">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            Permissão negada pelo sistema. Libere as notificações para o
            Quanta nas configurações do seu sistema operacional para que
            esta seção volte a funcionar.
          </span>
        </div>
      )}

      {/* Master switch */}
      <label className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-2 px-3 py-2 cursor-pointer">
        <div>
          <div className="text-xs font-medium text-primary">
            Habilitar notificações
          </div>
          <div className="text-[10px] text-faint leading-relaxed">
            Quando desligado, nenhuma notificação é disparada,
            independentemente dos outros ajustes.
          </div>
        </div>
        <input
          type="checkbox"
          checked={v.enabled}
          onChange={e => setEnabled(e.target.checked)}
          disabled={!supported}
          className="h-4 w-4 accent-accent"
        />
      </label>

      {/* Toggle: lembrete de baralho pronto */}
      <label className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-card px-3 py-2 cursor-pointer">
        <div>
          <div className="text-xs font-medium text-primary">
            Lembrete de baralho pronto
          </div>
          <div className="text-[10px] text-faint leading-relaxed">
            Avisa quando um baralho tem cartões vencidos.
          </div>
        </div>
        <input
          type="checkbox"
          checked={v.deckReady}
          onChange={e => patch({ deckReady: e.target.checked })}
          disabled={!supported || !v.enabled}
          className="h-4 w-4 accent-accent"
        />
      </label>

      {/* Frequência */}
      <div>
        <label className="text-[10px] uppercase tracking-widest text-muted">
          Frequência mínima por baralho
        </label>
        <div className="mt-1 text-[10px] text-faint leading-relaxed mb-1.5">
          O mesmo baralho não notifica de novo antes desse intervalo.
        </div>
        <select
          value={v.checkIntervalMinutes}
          onChange={e => patch({ checkIntervalMinutes: Number(e.target.value) })}
          disabled={!supported || !v.enabled}
          className="w-full sm:w-auto rounded-md border border-divider bg-surface px-2 py-1.5 text-xs text-primary outline-none focus:border-accent/50 disabled:opacity-50"
        >
          {FREQUENCY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Janela silenciosa */}
      <div className="rounded-lg border border-subtle bg-card p-3 space-y-3">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <div className="text-xs font-medium text-primary">
              Janela silenciosa
            </div>
            <div className="text-[10px] text-faint leading-relaxed">
              Nenhuma notificação durante esse período. Aceita janelas que
              cruzam a meia-noite (ex: 22:00 → 08:00).
            </div>
          </div>
          <input
            type="checkbox"
            checked={v.quietHoursEnabled}
            onChange={e => patch({ quietHoursEnabled: e.target.checked })}
            disabled={!supported || !v.enabled}
            className="h-4 w-4 accent-accent"
          />
        </label>
        {v.quietHoursEnabled && (
          <div className="flex items-center gap-2 text-xs text-secondary">
            <span>Das</span>
            <input
              type="time"
              value={v.quietHoursStart}
              onChange={e => patch({ quietHoursStart: e.target.value })}
              disabled={!supported || !v.enabled}
              className="rounded-md border border-divider bg-surface px-2 py-1 text-xs text-primary outline-none focus:border-accent/50"
            />
            <span>às</span>
            <input
              type="time"
              value={v.quietHoursEnd}
              onChange={e => patch({ quietHoursEnd: e.target.value })}
              disabled={!supported || !v.enabled}
              className="rounded-md border border-divider bg-surface px-2 py-1 text-xs text-primary outline-none focus:border-accent/50"
            />
          </div>
        )}
      </div>

      {/* Teste */}
      <div className="pt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={testNow}
          disabled={!supported}
          className="inline-flex items-center gap-1.5 rounded-md border border-divider bg-surface-2 px-3 py-1.5 text-xs text-primary hover:tint-1 disabled:opacity-50"
        >
          <Bell size={12} />
          Testar notificação
        </button>
        {testFeedback && (
          <span className="text-[11px] text-muted">{testFeedback}</span>
        )}
      </div>
    </div>
  );
}
