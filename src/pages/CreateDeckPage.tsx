import { useEffect, useState } from 'react';
import { ArrowLeft, Folder as FolderIcon } from 'lucide-react';
import { db, uid } from '@/db/database';
import type { Folder } from '@/types/folder';
import { DEFAULT_COLOR, resolveColor, withAlpha } from '@/utils/folderColors';
import { ColorPicker } from '@/components/ColorPicker';
import type { Route } from '@/components/Sidebar';

interface Props {
  /** When set, the new deck will be created inside this folder. */
  folderId?: string | null;
  onNavigate: (r: Route) => void;
}

export function CreateDeckPage({ folderId, onNavigate }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [parentFolder, setParentFolder] = useState<Folder | null>(null);
  const [saving, setSaving] = useState(false);

  // If creating inside a folder, default the deck color to match the folder.
  useEffect(() => {
    if (!folderId) return;
    db.folders.get(folderId).then(f => {
      if (!f) return;
      setParentFolder(f);
      setColor(resolveColor(f.colorKey).hex);
    });
  }, [folderId]);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const id = uid();
    const ts = Date.now();
    await db.decks.add({
      id,
      folderId: folderId ?? null,
      name: name.trim(),
      description: description.trim(),
      colorKey: color,
      createdAt: ts,
      updatedAt: ts,
    });
    onNavigate({ name: 'deck', deckId: id });
  }

  const back: Route = parentFolder
    ? { name: 'folder', folderId: parentFolder.id }
    : { name: 'decks' };

  const parentColor = parentFolder ? resolveColor(parentFolder.colorKey) : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <button
        onClick={() => onNavigate(back)}
        className="flex items-center gap-1 text-sm text-muted hover:text-primary"
      >
        <ArrowLeft size={14} /> Voltar
      </button>

      <h1 className="text-2xl font-semibold tracking-tight">Novo baralho</h1>

      {parentFolder && parentColor && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-secondary"
          style={{
            borderStyle: 'solid',
            borderWidth: 1,
            borderColor: withAlpha(parentColor.hex, 0.4),
            backgroundColor: withAlpha(parentColor.hex, 0.06),
          }}
        >
          <FolderIcon size={14} style={{ color: parentColor.hex }} />
          <span>
            Será criado dentro de{' '}
            <span className="font-medium text-primary">{parentFolder.name}</span>
          </span>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-widest text-muted">
            Nome
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex.: Mecânica Quântica"
            autoFocus
            className="mt-1 w-full px-4 py-3 rounded-lg bg-input border border-divider focus:border-accent/50 outline-none"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-widest text-muted">
            Descrição
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="Tópicos cobertos, livro de referência, escopo do baralho..."
            className="mt-1 w-full px-4 py-3 rounded-lg bg-input border border-divider focus:border-accent/50 outline-none resize-none"
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest text-muted">
            Cor (opcional)
          </label>
          <div className="mt-2">
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            disabled={!name.trim() || saving}
            onClick={save}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-400 disabled:opacity-50 text-on-accent font-medium"
          >
            Criar
          </button>
          <button
            onClick={() => onNavigate(back)}
            className="px-4 py-2 rounded-lg hover:tint-1 text-muted"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
