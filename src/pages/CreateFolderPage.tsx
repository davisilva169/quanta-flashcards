import { useState } from 'react';
import { ArrowLeft, Folder as FolderIcon } from 'lucide-react';
import { createFolder } from '@/db/database';
import { DEFAULT_COLOR, resolveColor, withAlpha } from '@/utils/folderColors';
import { ColorPicker } from '@/components/ColorPicker';
import type { Route } from '@/components/Sidebar';

interface Props {
  onNavigate: (r: Route) => void;
}

export function CreateFolderPage({ onNavigate }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const folder = await createFolder({
      name: name.trim(),
      description: description.trim() || undefined,
      colorKey: color,
    });
    onNavigate({ name: 'folder', folderId: folder.id });
  }

  const resolved = resolveColor(color);

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <button
        onClick={() => onNavigate({ name: 'decks' })}
        className="flex items-center gap-1 text-sm text-muted hover:text-primary"
      >
        <ArrowLeft size={14} /> Baralhos
      </button>

      <h1 className="text-2xl font-semibold tracking-tight">Nova pasta</h1>
      <p className="text-sm text-muted -mt-3">
        Pastas agrupam baralhos relacionados — por curso, livro, ou tópico
        amplo.
      </p>

      <div className="space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-widest text-muted">
            Nome
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex.: Mecânica Estatística"
            autoFocus
            className="mt-1 w-full px-4 py-3 rounded-lg bg-input border border-divider focus:border-accent/50 outline-none"
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest text-muted">
            Descrição (opcional)
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Ensembles, função de partição, gases ideais..."
            className="mt-1 w-full px-4 py-3 rounded-lg bg-input border border-divider focus:border-accent/50 outline-none resize-none"
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest text-muted">
            Cor
          </label>
          <div className="mt-2">
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>

        {/* Live preview that mirrors the FolderCard styling exactly */}
        <div
          className="rounded-xl bg-surface-2 p-4"
          style={{
            borderStyle: 'solid',
            borderWidth: 1,
            borderColor: withAlpha(resolved.hex, 0.4),
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="rounded-lg p-2"
              style={{ backgroundColor: withAlpha(resolved.hex, 0.12) }}
            >
              <FolderIcon className="h-5 w-5" style={{ color: resolved.hex }} />
            </div>
            <div>
              <div className="text-base font-semibold text-primary">
                {name.trim() || 'Nome da pasta'}
              </div>
              {description && (
                <div className="mt-0.5 text-xs text-muted">{description}</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            disabled={!name.trim() || saving}
            onClick={save}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-400 disabled:opacity-50 text-on-accent font-medium"
          >
            Criar pasta
          </button>
          <button
            onClick={() => onNavigate({ name: 'decks' })}
            className="px-4 py-2 rounded-lg hover:tint-1 text-muted"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
