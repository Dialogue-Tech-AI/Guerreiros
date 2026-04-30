import React, { useMemo, useState } from 'react';
import type { SupervisorSidebarCustomNode } from '../../services/ai-config.service';
import {
  SUPERVISOR_SIDEBAR_NAV_TARGET_ID_SET,
  SUPERVISOR_SIDEBAR_TARGET_GROUPS,
  SUPERVISOR_DRAG_ATTENDANCE_MIME,
  divisionUiKeyForSupervisorNavTarget,
  supervisorNavTargetIdToMoveDrop,
  type SupervisorNavMoveDropTarget,
} from '../../constants/supervisorSidebarCustomNav';

type Props = {
  nodes: SupervisorSidebarCustomNode[];
  canEdit: boolean;
  onPersist: (next: SupervisorSidebarCustomNode[]) => Promise<void>;
  navigateToTarget: (targetId: string, customRowNodeId: string) => void;
  selectedCustomNavNodeId: string | null;
  divisionUiNavStyle: (uiKey: string, selected: boolean) => React.CSSProperties;
  conversationDragEnabled: boolean;
  supervisorDropHoverKey: string | null;
  setSupervisorDropHoverKey: React.Dispatch<React.SetStateAction<string | null>>;
  allowSupervisorAttendanceDrag: (e: React.DragEvent) => void;
  runSupervisorMoveDrop: (
    e: React.DragEvent,
    target: SupervisorNavMoveDropTarget,
    customSidebarNodeId?: string
  ) => boolean | Promise<boolean>;
  /** Contagem na fila virtual do atalho (backend: customSidebar-{nodeId}). */
  customLaneActiveCount: (nodeId: string) => number;
};

function sorted(nodes: SupervisorSidebarCustomNode[]) {
  return [...nodes].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

function childrenMap(nodes: SupervisorSidebarCustomNode[]) {
  const m = new Map<string | null, SupervisorSidebarCustomNode[]>();
  for (const n of nodes) {
    const p = n.parentId;
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(n);
  }
  for (const [, arr] of m) arr.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return m;
}

function descendantIds(nodes: SupervisorSidebarCustomNode[], rootId: string): Set<string> {
  const ch = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    if (!ch.has(n.parentId)) ch.set(n.parentId, []);
    ch.get(n.parentId)!.push(n.id);
  }
  const out = new Set<string>();
  const stack = [...(ch.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    out.add(id);
    stack.push(...(ch.get(id) ?? []));
  }
  return out;
}

function nextOrderForParent(nodes: SupervisorSidebarCustomNode[], parentId: string | null): number {
  const siblings = nodes.filter((n) => n.parentId === parentId);
  if (!siblings.length) return 0;
  return Math.max(...siblings.map((s) => s.order)) + 1;
}

/** Mesmo ritmo visual que SupervisorDivisionUiBtn na Entrada */
const actionIconBtn =
  'opacity-45 hover:opacity-100 p-0.5 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700/60 flex-shrink-0 text-slate-500 dark:text-slate-400 transition-opacity';

export function SupervisorCustomSidebarSection({
  nodes,
  canEdit,
  onPersist,
  navigateToTarget,
  selectedCustomNavNodeId,
  divisionUiNavStyle,
  conversationDragEnabled,
  supervisorDropHoverKey,
  setSupervisorDropHoverKey,
  allowSupervisorAttendanceDrag,
  runSupervisorMoveDrop,
  customLaneActiveCount,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupervisorSidebarCustomNode | 'new' | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formIcon, setFormIcon] = useState('bookmark');
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formTargetId, setFormTargetId] = useState('abertos');
  const [saving, setSaving] = useState(false);

  const byParent = useMemo(() => childrenMap(nodes), [nodes]);

  const forbiddenParentIds = useMemo(() => {
    if (!editing || editing === 'new') return new Set<string>();
    const d = descendantIds(nodes, editing.id);
    d.add(editing.id);
    return d;
  }, [editing, nodes]);

  const parentOptions = useMemo(() => {
    return sorted(nodes).filter((n) => !forbiddenParentIds.has(n.id));
  }, [nodes, forbiddenParentIds]);

  const openCreate = (parentId: string | null) => {
    setEditing('new');
    setFormLabel('');
    setFormIcon('bookmark');
    setFormParentId(parentId);
    setFormTargetId('abertos');
    setModalOpen(true);
  };

  const openEdit = (node: SupervisorSidebarCustomNode) => {
    setEditing(node);
    setFormLabel(node.label);
    setFormIcon(node.icon || 'bookmark');
    setFormParentId(node.parentId);
    setFormTargetId(SUPERVISOR_SIDEBAR_NAV_TARGET_ID_SET.has(node.targetId) ? node.targetId : 'abertos');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleSaveModal = async () => {
    const label = formLabel.trim();
    if (!label) return;
    const iconRaw = formIcon.trim();
    const icon =
      /^[a-z0-9_]{1,48}$/i.test(iconRaw) ? iconRaw.slice(0, 48) : undefined;
    if (!SUPERVISOR_SIDEBAR_NAV_TARGET_ID_SET.has(formTargetId)) return;

    setSaving(true);
    try {
      if (editing === 'new') {
        const id =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const parentId = formParentId;
        const order = nextOrderForParent(nodes, parentId);
        const row: SupervisorSidebarCustomNode = {
          id,
          label: label.slice(0, 80),
          icon,
          parentId,
          order,
          targetId: formTargetId,
        };
        await onPersist([...nodes, row]);
        closeModal();
        return;
      }

      if (editing !== null) {
        const parentId = formParentId;
        if (parentId === editing.id) return;
        const others = nodes.filter((n) => n.id !== editing.id);
        const parentChanged = parentId !== editing.parentId;
        const order = parentChanged ? nextOrderForParent(others, parentId) : editing.order;
        const updated: SupervisorSidebarCustomNode = {
          ...editing,
          label: label.slice(0, 80),
          icon,
          parentId,
          order,
          targetId: formTargetId,
        };
        await onPersist([...others, updated]);
        closeModal();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este atalho e subdivisões associadas na lista personalizada?')) return;
    const drop = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of nodes) {
        if (n.parentId && drop.has(n.parentId) && !drop.has(n.id)) {
          drop.add(n.id);
          grew = true;
        }
      }
    }
    await onPersist(nodes.filter((n) => !drop.has(n.id)));
  };

  const moveWithinParent = async (id: string, dir: -1 | 1) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const siblings = sorted(nodes.filter((n) => n.parentId === node.parentId));
    const idx = siblings.findIndex((s) => s.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const a = siblings[idx];
    const b = siblings[swapIdx];
    const next = nodes.map((n) => {
      if (n.id === a.id) return { ...n, order: b.order };
      if (n.id === b.id) return { ...n, order: a.order };
      return n;
    });
    await onPersist(next);
  };

  const renderRows = (parentId: string | null): React.ReactNode => {
    const list = byParent.get(parentId) ?? [];
    const branch =
      list.map((node) => {
        const active = selectedCustomNavNodeId === node.id;
        const uiKey = divisionUiKeyForSupervisorNavTarget(node.targetId);
        const iconName = node.icon?.trim() || 'bookmark';
        const subtree = renderRows(node.id);
        const hasChildren = (byParent.get(node.id)?.length ?? 0) > 0;
        const moveDropTarget = supervisorNavTargetIdToMoveDrop(node.targetId);
        const dropKey = `custom-drop-${node.id}`;
        const dropActive =
          conversationDragEnabled &&
          !!moveDropTarget &&
          supervisorDropHoverKey === dropKey;

        const laneCount = customLaneActiveCount(node.id);
        /** Drop na linha inteira (sublinha + ícones): evita soltar no botão errado ou numa zona sem handler. */
        const rowDragHandlers =
          conversationDragEnabled && moveDropTarget
            ? {
                onDragOver: (e: React.DragEvent) => {
                  allowSupervisorAttendanceDrag(e);
                  if (e.dataTransfer.types.includes(SUPERVISOR_DRAG_ATTENDANCE_MIME)) {
                    setSupervisorDropHoverKey(dropKey);
                  }
                },
                onDragLeave: (e: React.DragEvent) => {
                  const rel = e.relatedTarget as Node | null;
                  if (rel && e.currentTarget.contains(rel)) return;
                  setSupervisorDropHoverKey((k) => (k === dropKey ? null : k));
                },
                onDrop: async (e: React.DragEvent) => {
                  e.stopPropagation();
                  const laneId = (e.currentTarget as HTMLElement).dataset.dropNodeId?.trim();
                  if (!laneId) return;
                  const ok = await runSupervisorMoveDrop(e, moveDropTarget, laneId);
                  if (ok) navigateToTarget(node.targetId, laneId);
                },
              }
            : {};

        const row = (
          <div
            className={`relative z-10 w-full flex items-center justify-between gap-2 min-w-0 rounded-lg transition-colors duration-500 ease-in-out ${
              dropActive ? 'ring-2 ring-sky-500 ring-inset ' : ''
            }`}
            data-drop-node-id={node.id}
            {...rowDragHandlers}
          >
            <button
              type="button"
              data-custom-division-active={active ? true : undefined}
              onClick={() => navigateToTarget(node.targetId, node.id)}
              className={`flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg transition-colors duration-500 ease-in-out active:scale-[0.99] ${
                active
                  ? 'text-slate-900 dark:text-white font-medium'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              style={active && uiKey ? divisionUiNavStyle(uiKey, true) : {}}
            >
              <span className="material-icons-round text-base flex-shrink-0 text-slate-600 dark:text-slate-400">
                {iconName}
              </span>
              <div className="flex flex-col items-start min-w-0 flex-1">
                <span className="truncate">{node.label}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {laneCount} atendimentos
                </span>
              </div>
            </button>
            {canEdit && (
              <div className="flex items-center gap-0.5 flex-shrink-0 pr-2 py-1">
                <button type="button" title="Subdivisão" className={actionIconBtn} onClick={() => openCreate(node.id)}>
                  <span className="material-icons-round text-[14px]">add</span>
                </button>
                <button type="button" title="Editar" className={actionIconBtn} onClick={() => openEdit(node)}>
                  <span className="material-icons-round text-[14px]">edit</span>
                </button>
                <button
                  type="button"
                  title="Subir"
                  className={actionIconBtn}
                  onClick={() => void moveWithinParent(node.id, -1)}
                >
                  <span className="material-icons-round text-[14px]">arrow_upward</span>
                </button>
                <button
                  type="button"
                  title="Descer"
                  className={actionIconBtn}
                  onClick={() => void moveWithinParent(node.id, 1)}
                >
                  <span className="material-icons-round text-[14px]">arrow_downward</span>
                </button>
                <button
                  type="button"
                  title="Remover"
                  className={`${actionIconBtn} opacity-70 hover:opacity-100 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/35`}
                  onClick={() => void handleDelete(node.id)}
                >
                  <span className="material-icons-round text-[14px]">delete_outline</span>
                </button>
              </div>
            )}
          </div>
        );

        if (!hasChildren) {
          return <div key={node.id}>{row}</div>;
        }

        return (
          <div key={node.id}>
            {row}
            <div className="ml-4 border-l border-slate-200 dark:border-slate-700 pl-2 space-y-0.5">{subtree}</div>
          </div>
        );
      });

    return <>{branch}</>;
  };

  if (!canEdit && nodes.length === 0) return null;

  return (
    <div className="w-full border-t border-slate-200 dark:border-slate-700 pt-4 mt-2">
      <div className="px-3 py-4 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          Divisões personalizadas
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => openCreate(null)}
            className="inline-flex items-center gap-1 shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold text-sky-700 dark:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-icons-round text-[14px] leading-none">add</span>
            Nova divisão
          </button>
        )}
      </div>
      <div className="space-y-1 mb-6">{renderRows(null)}</div>
      {canEdit && nodes.length === 0 && (
        <p className="px-3 pb-4 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          Crie atalhos com o nome que quiser; pode editar ícone, hierarquia e vista depois.
        </p>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/[0.06] dark:bg-slate-950/[0.22] backdrop-blur-[3px] animate-fade-in motion-reduce:backdrop-blur-none motion-reduce:animate-none"
          aria-hidden
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="supervisor-custom-sidebar-modal-title"
            className="bg-white dark:bg-slate-900 rounded-xl shadow-xl shadow-slate-900/10 dark:shadow-black/30 max-w-md w-full border border-slate-200/90 dark:border-slate-600/80 p-4 space-y-3 animate-modal-sheet-in motion-reduce:animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center gap-2">
              <h3 id="supervisor-custom-sidebar-modal-title" className="text-sm font-bold text-slate-900 dark:text-white">
                {editing === 'new' ? 'Nova divisão' : 'Editar atalho'}
              </h3>
              <button
                type="button"
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                onClick={closeModal}
              >
                <span className="material-icons-round text-xl">close</span>
              </button>
            </div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Nome
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                maxLength={80}
                placeholder="Ex.: Minha triagem"
              />
            </label>
            {editing !== 'new' && (
              <>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Ícone (Material Icons)
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                    value={formIcon}
                    onChange={(e) => setFormIcon(e.target.value)}
                    maxLength={48}
                    placeholder="bookmark"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Dentro de…
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                    value={formParentId ?? ''}
                    onChange={(e) => setFormParentId(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">Raiz (divisão principal)</option>
                    {parentOptions.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Abre a vista
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                    value={formTargetId}
                    onChange={(e) => setFormTargetId(e.target.value)}
                  >
                    {SUPERVISOR_SIDEBAR_TARGET_GROUPS.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                onClick={closeModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving || !formLabel.trim()}
                className="px-3 py-2 text-xs rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: '#003070' }}
                onClick={() => void handleSaveModal()}
              >
                {saving ? 'A guardar…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
