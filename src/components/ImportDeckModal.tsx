import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';
import {
  readDeckExportFile,
  importDeckExport,
  DeckImportError,
  type DeckImportResult,
} from '@/utils/deckExport';
import { Portal } from './Portal';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional callback fired after a successful import (e.g., refresh list). */
  onImported?: (result: DeckImportResult) => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'importing' }
  | { kind: 'success'; result: DeckImportResult }
  | { kind: 'error'; message: string; hint?: string };

/**
 * Modal for importing a single-deck JSON file.
 *
 * Lives apart from the global "import everything" flow in SettingsPage.
 * This one is strictly additive — existing data is never touched. It can
 * be opened from anywhere; both DecksPage and SettingsPage mount one.
 */
export function ImportDeckModal({ open, onClose, onImported }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPhase({ kind: 'idle' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhase({ kind: 'reading' });
    try {
      const payload = await readDeckExportFile(file);
      setPhase({ kind: 'importing' });
      const result = await importDeckExport(payload);
      setPhase({ kind: 'success', result });
      onImported?.(result);
    } catch (err) {
      // DeckImportError carries a `kind` we can use to tailor the hint.
      // Generic errors (DB issues etc.) get a generic message.
      if (err instanceof DeckImportError) {
        let hint: string | undefined;
        if (err.kind === 'wrong_global_format') {
          hint =
            'Backup completo: vá em Configurações → Dados e backup → "Importar tudo".';
        } else if (err.kind === 'unsupported_version') {
          hint =
            'Atualize o Quanta ou peça ao remetente para exportar de novo na versão atual.';
        } else if (err.kind === 'wrong_export_type') {
          hint = 'Verifique se o arquivo é mesmo um baralho exportado do Quanta.';
        }
        setPhase({ kind: 'error', message: err.message, hint });
      } else {
        setPhase({
          kind: 'error',
          message:
            err instanceof Error ? err.message : 'Falha ao importar o arquivo.',
        });
      }
    } finally {
      // Allow re-selecting the SAME file after an error (browsers don't
      // re-fire change for an unchanged value).
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-divider bg-elevated shadow-elevated"
          >
            <div className="flex items-center justify-between border-b border-divider p-4">
              <div className="flex items-center gap-2">
                <Upload size={16} className="text-accent-fg" />
                <div className="font-medium text-primary">Importar baralho</div>
              </div>
              <button
                onClick={handleClose}
                className="rounded-full p-1.5 text-muted hover:bg-card-hover hover:text-primary transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {phase.kind === 'idle' && (
                <>
                  <p className="text-sm text-secondary leading-relaxed">
                    Importa um baralho exportado de outro Quanta. Os cartões
                    chegam como novos, sem histórico de revisão. Nenhum dado
                    existente é apagado.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFile}
                    className="block w-full text-sm text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-on-accent file:hover:bg-accent-400 file:cursor-pointer cursor-pointer"
                  />
                  <p className="text-[11px] text-faint leading-relaxed">
                    Para restaurar um <span className="font-medium">backup completo</span>,
                    use Configurações → Dados e backup → "Importar tudo".
                  </p>
                </>
              )}

              {(phase.kind === 'reading' || phase.kind === 'importing') && (
                <div className="flex items-center gap-3 py-3 text-sm text-secondary">
                  <Loader2 size={16} className="animate-spin text-accent-fg" />
                  {phase.kind === 'reading'
                    ? 'Lendo arquivo…'
                    : 'Importando cartões…'}
                </div>
              )}

              {phase.kind === 'success' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-soft p-3">
                    <CheckCircle2
                      size={16}
                      className="mt-0.5 shrink-0 text-success-fg"
                    />
                    <div className="text-sm text-success-fg">
                      <div className="font-medium">
                        "{phase.result.insertedDeckName}" importado com sucesso.
                      </div>
                      <div className="mt-0.5 text-[12px]">
                        {phase.result.cardCount}{' '}
                        {phase.result.cardCount === 1 ? 'cartão' : 'cartões'} adicionado
                        {phase.result.cardCount === 1 ? '' : 's'} como novo
                        {phase.result.cardCount === 1 ? '' : 's'}
                        {phase.result.attachmentCount > 0 && (
                          <>
                            {' '}· {phase.result.attachmentCount}{' '}
                            {phase.result.attachmentCount === 1 ? 'anexo' : 'anexos'}
                          </>
                        )}.
                      </div>
                    </div>
                  </div>
                  {phase.result.warnings.length > 0 && (
                    <ul className="space-y-1.5">
                      {phase.result.warnings.map((w, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft p-2 text-[12px] text-warning-fg"
                        >
                          <AlertCircle size={12} className="mt-0.5 shrink-0" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleClose}
                      className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-on-accent hover:bg-accent-400 transition-colors"
                    >
                      Concluído
                    </button>
                    <button
                      onClick={reset}
                      className="rounded-lg border border-divider px-3 py-2 text-sm text-secondary hover:bg-card-hover hover:border-strong transition-colors"
                    >
                      Importar outro
                    </button>
                  </div>
                </div>
              )}

              {phase.kind === 'error' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3">
                    <AlertCircle
                      size={16}
                      className="mt-0.5 shrink-0 text-danger-fg"
                    />
                    <div className="text-sm text-danger-fg">
                      <div className="font-medium">{phase.message}</div>
                      {phase.hint && (
                        <div className="mt-1 text-[12px] opacity-90">
                          {phase.hint}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={reset}
                      className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-on-accent hover:bg-accent-400 transition-colors"
                    >
                      Tentar outro arquivo
                    </button>
                    <button
                      onClick={handleClose}
                      className="rounded-lg border border-divider px-3 py-2 text-sm text-secondary hover:bg-card-hover hover:border-strong transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
