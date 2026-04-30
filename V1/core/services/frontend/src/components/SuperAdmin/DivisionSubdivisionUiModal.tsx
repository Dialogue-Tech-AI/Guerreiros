import React, { useEffect, useState } from 'react';
import type { DivisionSubdivisionUiEntry } from '../../services/ai-config.service';

interface DivisionSubdivisionUiModalProps {
  open: boolean;
  uiKey: string | null;
  defaultLabel: string;
  initial: DivisionSubdivisionUiEntry | undefined;
  onClose: () => void;
  onSave: (uiKey: string, entry: DivisionSubdivisionUiEntry | null) => Promise<void>;
}

export const DivisionSubdivisionUiModal: React.FC<DivisionSubdivisionUiModalProps> = ({
  open,
  uiKey,
  defaultLabel,
  initial,
  onClose,
  onSave,
}) => {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !uiKey) return;
    setLabel(initial?.label ?? '');
    setColor(initial?.color ?? '');
    setAccentColor(initial?.accentColor ?? '');
  }, [open, uiKey, initial]);

  if (!open || !uiKey) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmed = label.trim();
      const c = color.trim();
      const a = accentColor.trim();
      const entry: DivisionSubdivisionUiEntry = {};
      if (trimmed) entry.label = trimmed.slice(0, 80);
      if (c) entry.color = c;
      if (a) entry.accentColor = a;
      const empty = !entry.label && !entry.color && !entry.accentColor;
      await onSave(uiKey, empty ? null : entry);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-700 overflow-hidden"
        style={{ backgroundColor: '#fff' }}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Personalizar divisão</h3>
            <p className="text-xs text-slate-500 mt-0.5">Chave: {uiKey}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            aria-label="Fechar"
          >
            <span className="material-icons-round text-xl">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-slate-500">
            Nome por defeito: <strong className="text-slate-700">{defaultLabel}</strong>. Deixe cores vazias para usar o tema.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nome exibido</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={defaultLabel}
              maxLength={80}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-orange-400"
              style={{ backgroundColor: '#FFFFFF', color: '#0F172A' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Cor principal (#hex)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={color.match(/^#[0-9A-Fa-f]{6}$/) ? color : '#003070'}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 rounded border border-slate-200 cursor-pointer p-0.5 bg-white"
                  title="Escolher cor"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#003070"
                  className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-slate-200 text-xs font-mono"
                  style={{ backgroundColor: '#FFFFFF', color: '#0F172A' }}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Cor destaque (#hex)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={accentColor.match(/^#[0-9A-Fa-f]{6}$/) ? accentColor : '#0ea5e9'}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-12 rounded border border-slate-200 cursor-pointer p-0.5 bg-white"
                  title="Escolher cor"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#0ea5e9"
                  className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-slate-200 text-xs font-mono"
                  style={{ backgroundColor: '#FFFFFF', color: '#0F172A' }}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#F07000' }}
            >
              {saving ? 'A guardar…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
