import { useState } from 'react';
import { COLOR_PRESETS, isValidHex } from '@/utils/folderColors';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  /** Optional class for outer wrapper. */
  className?: string;
}

/**
 * Dual-input color picker:
 *  - Eight preset swatches (one-tap shortcuts).
 *  - A native color input (`<input type="color">`) so the user can pick any
 *    hex from the system color dialog.
 *  - A free-text hex field for users who already know the color they want.
 *
 * Stores the value as a 6-digit hex string ("#rrggbb"). The browser native
 * color picker emits this format on `change`.
 */
export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  const [draft, setDraft] = useState(value);

  // Sync external changes back into the draft
  if (draft !== value && document.activeElement?.tagName !== 'INPUT') {
    setDraft(value);
  }

  function commitDraft(next: string) {
    setDraft(next);
    if (isValidHex(next)) onChange(next);
  }

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {COLOR_PRESETS.map(c => {
          const active = c.hex.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={c.hex}
              type="button"
              onClick={() => {
                onChange(c.hex);
                setDraft(c.hex);
              }}
              title={c.label}
              className={`h-7 w-7 rounded-full border-2 transition-transform ${
                active
                  ? 'border-strong scale-110'
                  : 'border-divider hover:border-strong'
              }`}
              style={{ background: c.hex }}
            />
          );
        })}

        <div className="flex items-center gap-1.5 pl-2 ml-2 border-l border-divider">
          <label
            className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border-2 border-divider bg-gradient-to-br from-pink-400 via-amber-300 to-emerald-300"
            title="Escolher cor personalizada"
          >
            <input
              type="color"
              value={value}
              onChange={e => {
                onChange(e.target.value);
                setDraft(e.target.value);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>

          <input
            type="text"
            value={draft}
            onChange={e => commitDraft(e.target.value.trim())}
            placeholder="#rrggbb"
            spellCheck={false}
            className="w-24 rounded-md border border-divider bg-input px-2 py-1 text-xs font-mono text-primary outline-none focus:border-accent/50"
          />
        </div>
      </div>
    </div>
  );
}
