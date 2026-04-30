import React, { useCallback, useEffect, useState } from 'react';
import { aiConfigService, DivisionSubdivisionUiEntry } from '../../services/ai-config.service';
import { DIVISION_UI_DEFINITIONS } from '../../constants/divisionUiDefinitions';
import { DivisionSubdivisionUiModal } from './DivisionSubdivisionUiModal';
import toast from 'react-hot-toast';

/**
 * Cartão no Super Admin para rever/editar todas as personalizações de entrada (supervisor).
 */
export const DivisionSubdivisionAppearanceCard: React.FC = () => {
  const [entries, setEntries] = useState<Record<string, DivisionSubdivisionUiEntry>>({});
  const [loading, setLoading] = useState(true);
  const [modalKey, setModalKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await aiConfigService.getDivisionSubdivisionUi();
      setEntries(data);
    } catch {
      toast.error('Erro ao carregar aparência das divisões');
      setEntries({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const defMap = DIVISION_UI_DEFINITIONS.reduce<Record<string, (typeof DIVISION_UI_DEFINITIONS)[0]>>((acc, d) => {
    acc[d.key] = d;
    return acc;
  }, {});

  const grouped = DIVISION_UI_DEFINITIONS.reduce<Record<string, typeof DIVISION_UI_DEFINITIONS>>((acc, d) => {
    if (!acc[d.group]) acc[d.group] = [];
    acc[d.group].push(d);
    return acc;
  }, {});

  const handleSave = async (uiKey: string, entry: DivisionSubdivisionUiEntry | null) => {
    try {
      await aiConfigService.mergeDivisionSubdivisionUi({ [uiKey]: entry });
      await load();
      toast.success('Aparência atualizada.');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || 'Erro ao guardar');
      throw e;
    }
  };

  const modalDef = modalKey ? defMap[modalKey] : undefined;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FEE4E2' }}>
            <span className="material-icons-outlined text-primary" style={{ color: '#F07000' }}>
              palette
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
              Aparência — Divisões e subdivisões (Entrada)
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
              Nomes e cores aplicados na barra lateral da entrada. Qualquer supervisor pode editar pelo ícone de paleta; esta página permite rever todas as chaves.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
            <span className="material-icons-outlined animate-spin mr-2">refresh</span>
            A carregar…
          </div>
        ) : (
          Object.entries(grouped).map(([group, defs]) => (
            <div key={group}>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{group}</h4>
              <div className="space-y-1">
                {defs.map((d) => {
                  const custom = entries[d.key];
                  const hasCustom = !!(custom?.label || custom?.color || custom?.accentColor);
                  return (
                    <div
                      key={d.key}
                      className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700"
                      style={{ backgroundColor: '#F8FAFC' }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate" style={{ color: '#0f172a' }}>
                          {custom?.label?.trim() || d.defaultLabel}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono truncate">{d.key}</p>
                        {hasCustom && (
                          <div className="flex gap-2 mt-1">
                            {custom?.color && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                                <span className="w-3 h-3 rounded-full border border-slate-300" style={{ backgroundColor: custom.color }} />
                                texto
                              </span>
                            )}
                            {custom?.accentColor && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                                <span className="w-3 h-3 rounded-full border border-slate-300" style={{ backgroundColor: custom.accentColor }} />
                                destaque
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalKey(d.key)}
                        className="shrink-0 p-2 rounded-lg hover:bg-white border border-slate-200 text-slate-600 transition-colors"
                        style={{ backgroundColor: '#fff' }}
                        title="Personalizar"
                      >
                        <span className="material-icons-round text-lg text-orange-600">tune</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <DivisionSubdivisionUiModal
        open={modalKey !== null}
        uiKey={modalKey}
        defaultLabel={modalDef?.defaultLabel ?? modalKey ?? ''}
        initial={modalKey ? entries[modalKey] : undefined}
        onClose={() => setModalKey(null)}
        onSave={handleSave}
      />
    </div>
  );
};
