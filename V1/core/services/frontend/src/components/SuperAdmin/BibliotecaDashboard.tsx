import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { bibliotecaService } from '../../services/biblioteca.service';
import type { BibliotecaFolder, BibliotecaPrompt, BibliotecaFunctionCall, Process } from '../../services/biblioteca.service';
import { processToFCFields } from '../../services/biblioteca.service';
import { WorkflowTab } from './WorkflowTab';

export type BibliotecaSchema = {
  id: string;
  name: string;
  folderId: string | null;
  definition?: string;
  schemaType?: 'sem-tags' | 'com-tags';
};

type Props = {
  isLoading: boolean;
  folders: BibliotecaFolder[];
  prompts: BibliotecaPrompt[];
  functionCalls: BibliotecaFunctionCall[];
  schemas: BibliotecaSchema[];
  processes: Process[];
  selectedFolderId: string | null;
  selectedItem: { type: 'prompt' | 'function-call' | 'schema' | 'process'; id: string } | null;
  collapsedFolderIds: string[];
  editingFolderId: string | null;
  copiedItem: { type: 'prompt' | 'function-call' | 'folder'; data: any } | null;
  onFoldersChange: (v: BibliotecaFolder[] | ((prev: BibliotecaFolder[]) => BibliotecaFolder[])) => void;
  onSelectFolder: (id: string | null) => void;
  onSelectItem: (item: { type: 'prompt' | 'function-call' | 'schema' | 'process'; id: string } | null) => void;
  onToggleCollapse: (folderId: string) => void;
  onEditingFolderId: (id: string | null) => void;
  onEditFolderState: (state: { folderId: string; name: string; parentId: string | null } | null) => void;
  getDescendantIds: (id: string, list: BibliotecaFolder[]) => string[];
  onOpenCreatePrompt: () => void;
  onOpenEditPrompt?: (p: BibliotecaPrompt) => void;
  editPromptIdRequest?: string | null;
  onClearEditPromptIdRequest?: () => void;
  onUpdatePrompt: (id: string, data: { name?: string; content?: string }) => void;
  onDeletePrompt: (p: BibliotecaPrompt) => void;
  onOpenCreateFunctionCall: () => void;
  onOpenEditFunctionCall?: (fc: BibliotecaFunctionCall) => void;
  editFCIdRequest?: string | null;
  onClearEditFCIdRequest?: () => void;
  onUpdateFunctionCall: (
    id: string,
    data: {
      name: string;
      folderId: string | null;
      objective: string;
      triggerConditions: string;
      executionTiming: string;
      requiredFields: string;
      optionalFields: string;
      restrictions: string;
      processingNotes: string;
      isActive: boolean;
      hasOutput: boolean;
      processingMethod: 'RABBITMQ' | 'HTTP';
      customAttributes: Record<string, string>;
    }
  ) => Promise<void>;
  onDeleteFunctionCall: (fc: BibliotecaFunctionCall) => void;
  onPaste: (targetFolderId: string | null) => void;
  onCopyPrompt: (p: BibliotecaPrompt) => void;
  onCopyFunctionCall: (fc: BibliotecaFunctionCall) => void;
  onCopyFolder: (folderId: string) => void;
  onCreateSchema: (folderId: string | null) => void;
  onEditSchema: (s: BibliotecaSchema) => void;
  onRenameSchema: (s: BibliotecaSchema) => void;
  onUpdateSchema: (schemaId: string, data: { definition?: string }) => void;
  onDeleteSchema: (s: BibliotecaSchema) => void;
  getFCProcessId?: (fcName: string) => string | null;
  onUpdateFCProcessId?: (fcName: string, processId: string | null) => Promise<void>;
  onDeleteProcess?: (process: Process) => void;
};

export function BibliotecaDashboard({
  isLoading,
  folders,
  prompts,
  functionCalls,
  schemas,
  processes: processesList = [],
  selectedFolderId,
  selectedItem,
  collapsedFolderIds,
  editingFolderId,
  copiedItem,
  onFoldersChange,
  onSelectFolder,
  onSelectItem,
  onToggleCollapse,
  onEditingFolderId,
  onEditFolderState,
  getDescendantIds,
  onOpenCreatePrompt,
  onOpenEditPrompt,
  editPromptIdRequest,
  onClearEditPromptIdRequest,
  onUpdatePrompt,
  onDeletePrompt,
  onOpenCreateFunctionCall,
  onOpenEditFunctionCall,
  editFCIdRequest,
  onClearEditFCIdRequest,
  onUpdateFunctionCall,
  onDeleteFunctionCall,
  onPaste,
  onCopyPrompt,
  onCopyFunctionCall,
  onCopyFolder,
  onCreateSchema,
  onEditSchema,
  onRenameSchema,
  onUpdateSchema,
  onDeleteSchema,
  getFCProcessId,
  onUpdateFCProcessId,
  onDeleteProcess,
}: Props) {
  const SIDEBAR_STORAGE_KEY = 'biblioteca-sidebar-width';
  const SIDEBAR_MIN = 200;
  const SIDEBAR_MAX = 560;
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const w = parseInt(localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? '', 10);
      return Number.isFinite(w) && w >= SIDEBAR_MIN && w <= SIDEBAR_MAX ? w : 320;
    } catch {
      return 320;
    }
  });
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingPromptForm, setEditingPromptForm] = useState<{ name: string; content: string } | null>(null);
  const [editingFCId, setEditingFCId] = useState<string | null>(null);
  const [editingFCForm, setEditingFCForm] = useState<{
    name: string;
    folderId: string | null;
    objective: string;
    triggerConditions: string;
    executionTiming: string;
    requiredFields: string;
    optionalFields: string;
    restrictions: string;
    processingNotes: string;
    isActive: boolean;
    hasOutput: boolean;
    processingMethod: 'RABBITMQ' | 'HTTP';
    customAttributes: Array<{ key: string; value: string }>;
  } | null>(null);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startW: sidebarWidth };
    setIsResizing(true);
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const move = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = e.clientX - resizeRef.current.startX;
      const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, resizeRef.current.startW + dx));
      setSidebarWidth(next);
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    };
    const up = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, [isResizing]);

  useEffect(() => {
    const viewingThisPrompt = selectedItem?.type === 'prompt' && selectedItem?.id === editingPromptId;
    if (editingPromptId && !viewingThisPrompt) {
      setEditingPromptId(null);
      setEditingPromptForm(null);
    }
  }, [selectedItem, editingPromptId]);

  useEffect(() => {
    const viewingThisFC = selectedItem?.type === 'function-call' && selectedItem?.id === editingFCId;
    if (editingFCId && !viewingThisFC) {
      setEditingFCId(null);
      setEditingFCForm(null);
    }
  }, [selectedItem, editingFCId]);

  useEffect(() => {
    if (editPromptIdRequest && selectedItem?.type === 'prompt' && selectedItem.id === editPromptIdRequest) {
      const p = prompts.find((x) => x.id === editPromptIdRequest);
      if (p) {
        setEditingPromptId(p.id);
        setEditingPromptForm({ name: p.name, content: p.content ?? '' });
      }
      onClearEditPromptIdRequest?.();
    }
  }, [editPromptIdRequest, selectedItem, prompts, onClearEditPromptIdRequest]);

  useEffect(() => {
    if (editFCIdRequest && selectedItem?.type === 'function-call' && selectedItem.id === editFCIdRequest) {
      const fc = functionCalls.find((x) => x.id === editFCIdRequest);
      if (fc) {
        setEditingFCId(fc.id);
        setEditingFCForm({
          name: fc.name,
          folderId: fc.folderId ?? null,
          objective: fc.objective ?? '',
          triggerConditions: fc.triggerConditions ?? '',
          executionTiming: fc.executionTiming ?? '',
          requiredFields: fc.requiredFields ?? '',
          optionalFields: fc.optionalFields ?? '',
          restrictions: fc.restrictions ?? '',
          processingNotes: fc.processingNotes ?? '',
          isActive: fc.isActive ?? true,
          hasOutput: fc.hasOutput ?? false,
          processingMethod: fc.processingMethod ?? 'RABBITMQ',
          customAttributes: fc.customAttributes
            ? Object.entries(fc.customAttributes).map(([key, value]) => ({ key, value }))
            : [],
        });
      }
      onClearEditFCIdRequest?.();
    }
  }, [editFCIdRequest, selectedItem, functionCalls, onClearEditFCIdRequest]);

  const roots = folders.filter((f) => !f.parentId);
  const getChildren = (parentId: string) => folders.filter((f) => f.parentId === parentId);
  const getPromptsInFolder = (folderId: string | null) =>
    prompts.filter((p) => (p.folderId || null) === folderId);
  const getFcFolderId = (fc: BibliotecaFunctionCall) => {
    const id = (fc as BibliotecaFunctionCall & { folder_id?: string | null }).folder_id ?? fc.folderId;
    return id === '' ? null : (id || null);
  };
  const getFunctionCallsInFolder = (folderId: string | null) =>
    functionCalls.filter((fc) => getFcFolderId(fc) === folderId);
  const getSchemasInFolder = (folderId: string | null) =>
    schemas.filter((s) => (s.folderId || null) === folderId);

  const updateFolderName = async (id: string, name: string) => {
    try {
      const updated = await bibliotecaService.updateFolder(id, { name });
      onFoldersChange((prev) => prev.map((f) => (f.id === id ? updated : f)));
      onEditingFolderId(null);
    } catch (error: any) {
      console.error('Error updating folder name:', error);
      toast.error('Erro ao atualizar nome da pasta');
    }
  };

  const deleteFolder = async (id: string) => {
    if (!window.confirm('Excluir esta pasta e todo seu conteúdo?')) return;
    const ids = getDescendantIds(id, folders);
    try {
      await Promise.all(ids.map((folderId) => bibliotecaService.deleteFolder(folderId)));
      onFoldersChange((prev) => prev.filter((f) => !ids.includes(f.id)));
      onEditingFolderId(null);
      if (selectedFolderId && ids.includes(selectedFolderId)) onSelectFolder(null);
      toast.success('Pasta excluída.');
    } catch (error: any) {
      console.error('Error deleting folder:', error);
      toast.error('Erro ao excluir pasta');
    }
  };

  const getFolderPath = (folderId: string | null): string[] => {
    if (!folderId) return [];
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return [];
    return [...getFolderPath(folder.parentId), folder.name];
  };

  const PROCESSOS_FOLDER_ID = '__processos__';
  const TREE_INDENT = 5;
  const itemBaseCls =
    'group relative flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer overflow-hidden min-w-0 mb-1.5 last:mb-0';
  const itemSelectedCls = 'bg-primary/10 dark:bg-primary/15';
  const itemHoverCls = 'hover:bg-slate-100 dark:hover:bg-slate-700/40';
  const itemIconCls =
    'material-icons-outlined text-sm flex-shrink-0 w-5 h-5 flex items-center justify-center shrink-0';

  type ContextMenu = { type: 'folder'; id: string } | { type: 'prompt'; id: string } | { type: 'function-call'; id: string } | { type: 'schema'; id: string };
  const [openContextMenu, setOpenContextMenu] = useState<ContextMenu | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openContextMenu) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if ((target as Element).closest?.('[data-context-menu-trigger]')) return;
      setOpenContextMenu(null);
      setMenuPosition(null);
    };
    const t = setTimeout(() => document.addEventListener('mousedown', close), 10);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', close);
    };
  }, [openContextMenu]);

  const renderTreeFolder = (parentId: string | null, level: number): React.ReactNode => {
    const items = parentId === null ? roots : getChildren(parentId);
    const promptsHere = getPromptsInFolder(parentId);
    const fcHere = getFunctionCallsInFolder(parentId);
    const schemasHere = getSchemasInFolder(parentId);

    return (
      <>
        {parentId === null && (
          <div className="mb-1.5" style={{ marginLeft: level * TREE_INDENT }}>
            <div
              className={`${itemBaseCls} ${selectedFolderId === PROCESSOS_FOLDER_ID ? itemSelectedCls : itemHoverCls}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectFolder(PROCESSOS_FOLDER_ID);
                onSelectItem(null);
              }}
            >
              <span className="material-icons-outlined text-base text-slate-400 w-5 flex-shrink-0">folder</span>
              <span className="flex-1 min-w-0 text-xs text-slate-700 dark:text-slate-200 truncate" title="Somente leitura">
                Processos
              </span>
              <span className="text-[10px] text-slate-400 flex-shrink-0" title="Somente visualização">somente leitura</span>
            </div>
          </div>
        )}
        {items.map((folder) => {
          const isCollapsed = collapsedFolderIds.includes(folder.id);
          const isSelected = selectedFolderId === folder.id;
          return (
            <div key={folder.id} className="mb-1.5" style={{ marginLeft: level * TREE_INDENT }}>
              <div
                className={`${itemBaseCls} ${isSelected ? itemSelectedCls : itemHoverCls}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectFolder(folder.id);
                  onSelectItem(null);
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse(folder.id);
                  }}
                  className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0 focus:outline-none"
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? 'Expandir pasta' : 'Recolher pasta'}
                >
                  <span
                    className="material-icons-outlined text-base inline-block align-middle"
                    style={{
                      transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                      transition: 'transform 0.3s ease-out',
                      transformOrigin: 'center center',
                    }}
                  >
                    chevron_right
                  </span>
                </button>
                <span
                  className={`${itemIconCls} text-amber-600/80 dark:text-amber-400/70`}
                >
                  {isCollapsed ? 'folder' : 'folder_open'}
                </span>
                {editingFolderId === folder.id ? (
                  <input
                    type="text"
                    value={folder.name}
                    onChange={(e) =>
                      onFoldersChange((prev) =>
                        prev.map((f) => (f.id === folder.id ? { ...f, name: e.target.value } : f))
                      )
                    }
                    onBlur={() => updateFolderName(folder.id, folder.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 outline-none shadow-inner"
                    autoFocus
                  />
                ) : (
                  <div className="flex-1 min-w-0 overflow-hidden" title={folder.name}>
                    <span
                      className="block text-xs text-slate-700 dark:text-slate-200 truncate overflow-hidden whitespace-nowrap min-w-0"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onEditingFolderId(folder.id);
                      }}
                    >
                      {folder.name}
                    </span>
                  </div>
                )}
                <div className="flex-shrink-0 relative">
                  <button
                    type="button"
                    data-context-menu-trigger
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setMenuPosition({
                        top: rect.bottom + 4,
                        left: Math.min(rect.right - 160, window.innerWidth - 170),
                      });
                      setOpenContextMenu((prev) =>
                        prev?.type === 'folder' && prev?.id === folder.id
                          ? null
                          : { type: 'folder', id: folder.id }
                      );
                    }}
                    className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0 opacity-0 group-hover:opacity-100"
                    title="Ações"
                    aria-label="Ações da pasta"
                  >
                    <span className="material-icons-outlined text-sm">more_vert</span>
                  </button>
                </div>
              </div>
              <div
                style={{
                  overflow: 'hidden',
                  maxHeight: isCollapsed ? 0 : 2000,
                  opacity: isCollapsed ? 0 : 1,
                  transition: 'max-height 300ms ease-out, opacity 300ms ease-out',
                }}
                aria-hidden={isCollapsed}
              >
                <div
                  className="border-l border-slate-200 dark:border-slate-600/50 mt-0.5 pl-1 space-y-0"
                  style={{ marginLeft: 18 }}
                >
                  {getPromptsInFolder(folder.id).map((p) => (
                    <div
                      key={p.id}
                      className={`${itemBaseCls} ${selectedItem?.type === 'prompt' && selectedItem?.id === p.id ? itemSelectedCls : itemHoverCls}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem({ type: 'prompt', id: p.id });
                        onSelectFolder(null);
                      }}
                    >
                      <span
                        className={`${itemIconCls} text-orange-500/80 dark:text-orange-400/70`}
                      >
                        article
                      </span>
                      <div className="flex-1 min-w-0 overflow-hidden" title={p.name}>
                        <span className="block text-xs text-slate-700 dark:text-slate-200 truncate overflow-hidden whitespace-nowrap min-w-0">
                          {p.name}
                        </span>
                      </div>
                      <div className="flex-shrink-0 relative">
                        <button
                          type="button"
                          data-context-menu-trigger
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setMenuPosition({
                              top: rect.bottom + 4,
                              left: Math.min(rect.right - 140, window.innerWidth - 150),
                            });
                            setOpenContextMenu((prev) =>
                              prev?.type === 'prompt' && prev?.id === p.id
                                ? null
                                : { type: 'prompt', id: p.id }
                            );
                          }}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 flex-shrink-0 opacity-0 group-hover:opacity-100"
                          title="Ações"
                          aria-label="Ações"
                        >
                          <span className="material-icons-outlined text-xs">more_vert</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {getFunctionCallsInFolder(folder.id).map((fc) => (
                    <div
                      key={fc.id}
                      className={`${itemBaseCls} ${selectedItem?.type === 'function-call' && selectedItem?.id === fc.id ? itemSelectedCls : itemHoverCls}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem({ type: 'function-call', id: fc.id });
                        onSelectFolder(null);
                      }}
                    >
                      <span className={`${itemIconCls} text-slate-500 dark:text-slate-400`}>code</span>
                      <div className="flex-1 min-w-0 overflow-hidden" title={fc.name}>
                        <span className="block text-xs text-slate-700 dark:text-slate-200 truncate overflow-hidden whitespace-nowrap min-w-0">
                          {fc.name}
                        </span>
                      </div>
                      <div className="flex-shrink-0 relative">
                        <button
                          type="button"
                          data-context-menu-trigger
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setMenuPosition({
                              top: rect.bottom + 4,
                              left: Math.min(rect.right - 140, window.innerWidth - 150),
                            });
                            setOpenContextMenu((prev) =>
                              prev?.type === 'function-call' && prev?.id === fc.id
                                ? null
                                : { type: 'function-call', id: fc.id }
                            );
                          }}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 flex-shrink-0 opacity-0 group-hover:opacity-100"
                          title="Ações"
                          aria-label="Ações"
                        >
                          <span className="material-icons-outlined text-xs">more_vert</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {getSchemasInFolder(folder.id).map((s) => (
                    <div
                      key={s.id}
                      className={`${itemBaseCls} ${selectedItem?.type === 'schema' && selectedItem?.id === s.id ? itemSelectedCls : itemHoverCls}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem({ type: 'schema', id: s.id });
                        onSelectFolder(null);
                      }}
                    >
                      <span
                        className={`${itemIconCls} text-emerald-600/80 dark:text-emerald-400/70`}
                      >
                        account_tree
                      </span>
                      <div className="flex-1 min-w-0 overflow-hidden" title={s.name}>
                        <span className="block text-xs text-slate-700 dark:text-slate-200 truncate overflow-hidden whitespace-nowrap min-w-0">
                          {s.name}
                        </span>
                      </div>
                      <div className="flex-shrink-0 relative">
                        <button
                          type="button"
                          data-context-menu-trigger
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setMenuPosition({
                              top: rect.bottom + 4,
                              left: Math.min(rect.right - 140, window.innerWidth - 150),
                            });
                            setOpenContextMenu((prev) =>
                              prev?.type === 'schema' && prev?.id === s.id
                                ? null
                                : { type: 'schema', id: s.id }
                            );
                          }}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 flex-shrink-0 opacity-0 group-hover:opacity-100"
                          title="Ações"
                          aria-label="Ações"
                        >
                          <span className="material-icons-outlined text-xs">more_vert</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {renderTreeFolder(folder.id, level + 1)}
                </div>
              </div>
            </div>
          );
        })}
        {parentId === null &&
          (promptsHere.length > 0 || fcHere.length > 0 || schemasHere.length > 0) && (
            <div className="mt-1 pl-1 border-l border-slate-200 dark:border-slate-600/50 space-y-0">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mb-1 px-1">Raiz</div>
              {promptsHere.map((p) => (
                <div
                  key={p.id}
                  className={`${itemBaseCls} ${selectedItem?.type === 'prompt' && selectedItem?.id === p.id ? itemSelectedCls : itemHoverCls}`}
                  onClick={() => {
                    onSelectItem({ type: 'prompt', id: p.id });
                    onSelectFolder(null);
                  }}
                >
                  <span
                    className={`${itemIconCls} text-orange-500/80 dark:text-orange-400/70`}
                  >
                    article
                  </span>
                  <span
                    className="text-xs truncate flex-1 min-w-0 text-slate-700 dark:text-slate-200 overflow-hidden"
                    title={p.name}
                  >
                    {p.name}
                  </span>
                </div>
              ))}
              {fcHere.map((fc) => (
                <div
                  key={fc.id}
                  className={`${itemBaseCls} ${selectedItem?.type === 'function-call' && selectedItem?.id === fc.id ? itemSelectedCls : itemHoverCls}`}
                  onClick={() => {
                    onSelectItem({ type: 'function-call', id: fc.id });
                    onSelectFolder(null);
                  }}
                >
                  <span className={`${itemIconCls} text-slate-500 dark:text-slate-400`}>code</span>
                  <span
                    className="text-xs truncate flex-1 min-w-0 text-slate-700 dark:text-slate-200 overflow-hidden"
                    title={fc.name}
                  >
                    {fc.name}
                  </span>
                </div>
              ))}
              {schemasHere.map((s) => (
                <div
                  key={s.id}
                  className={`${itemBaseCls} ${selectedItem?.type === 'schema' && selectedItem?.id === s.id ? itemSelectedCls : itemHoverCls}`}
                  onClick={() => {
                    onSelectItem({ type: 'schema', id: s.id });
                    onSelectFolder(null);
                  }}
                >
                  <span
                    className={`${itemIconCls} text-emerald-600/80 dark:text-emerald-400/70`}
                  >
                    account_tree
                  </span>
                  <span
                    className="text-xs truncate flex-1 min-w-0 text-slate-700 dark:text-slate-200 overflow-hidden"
                    title={s.name}
                  >
                    {s.name}
                  </span>
                </div>
              ))}
            </div>
          )}
      </>
    );
  };

  const isProcessosSelected = selectedFolderId === PROCESSOS_FOLDER_ID;
  const isRootSelected = (selectedFolderId === null || selectedFolderId === '') && !isProcessosSelected;
  const folderIdForContent =
    selectedFolderId === null || selectedFolderId === '' ? null : selectedFolderId;
  const breadcrumb =
    isProcessosSelected
      ? ['Processos']
      : selectedFolderId && selectedFolderId !== '' && selectedFolderId !== PROCESSOS_FOLDER_ID
        ? getFolderPath(selectedFolderId)
        : [];
  const subfolders =
    isProcessosSelected ? [] : folderIdForContent === null ? roots : getChildren(selectedFolderId!);
  const contentPrompts = getPromptsInFolder(isProcessosSelected ? null : folderIdForContent);
  const contentFCs = getFunctionCallsInFolder(isProcessosSelected ? null : folderIdForContent);
  const contentSchemas = getSchemasInFolder(isProcessosSelected ? null : folderIdForContent);

  return (
    <div
      className="flex flex-1 min-h-0 overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 transition-shadow duration-300"
      style={{ backgroundColor: '#FFFFFF' }}
    >
      {/* Sidebar */}
      <div
        className="flex-shrink-0 flex flex-col overflow-hidden bg-slate-50/80 dark:bg-slate-800/40 border-r border-slate-200 dark:border-slate-700/80"
        style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN, maxWidth: SIDEBAR_MAX }}
      >
        <div className="p-3 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between bg-white dark:bg-slate-900/80 shadow-sm">
          <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            Biblioteca
          </h2>
          <button
            type="button"
            onClick={async () => {
              const name = window.prompt('Nome da pasta:', 'Nova pasta');
              if (name == null) return;
              const trimmed = name.trim() || 'Nova pasta';
              try {
                const f = await bibliotecaService.createFolder({ name: trimmed, parentId: null });
                onFoldersChange((prev) => [...prev, f]);
                toast.success('Pasta criada.');
              } catch (error: any) {
                console.error('Error creating folder:', error);
                toast.error('Erro ao criar pasta');
              }
            }}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 active:scale-95 transition-all duration-200"
            title="Nova pasta"
          >
            <span className="material-icons-outlined text-base">create_new_folder</span>
          </button>
        </div>
        <div className="px-3 pt-2 pb-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Raiz
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <span className="material-icons-outlined text-lg text-slate-400 animate-spin">
                refresh
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Carregando...</span>
            </div>
          ) : (
            <>{renderTreeFolder(null, 0)}</>
          )}
        </div>
      </div>

      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleResizeStart}
        className="flex-shrink-0 w-1.5 cursor-col-resize flex items-stretch group hover:bg-primary/20 transition-colors"
        title="Arrastar para redimensionar a coluna"
      >
        <span className="w-0.5 bg-slate-200 dark:bg-slate-600 group-hover:bg-primary/40 rounded-full my-1 mx-0.5 self-stretch" />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
        {!selectedItem && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between flex-wrap gap-3 bg-white dark:bg-slate-900/90 shadow-sm">
              <nav className="flex items-center gap-2 text-sm">
                {isProcessosSelected ? (
                  <span className="font-semibold text-slate-900 dark:text-white px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                    Processos
                  </span>
                ) : isRootSelected ? (
                  <span className="font-semibold text-slate-900 dark:text-white px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                    Raiz
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectFolder(null)}
                    className="px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-200"
                  >
                    Raiz
                  </button>
                )}
                {breadcrumb.map((name, i) => (
                  <React.Fragment key={i}>
                    <span className="text-slate-300 dark:text-slate-600">/</span>
                    <span className="text-slate-700 dark:text-slate-200 font-medium">{name}</span>
                  </React.Fragment>
                ))}
              </nav>
              {!isProcessosSelected && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={async () => {
                    const name = window.prompt('Nome da pasta:', 'Nova pasta');
                    if (name == null) return;
                    const trimmed = (name.trim() || 'Nova pasta');
                    try {
                      const newFolder = await bibliotecaService.createFolder({
                        name: trimmed,
                        parentId: isRootSelected ? null : selectedFolderId ?? null,
                      });
                      onFoldersChange((prev) => [...prev, newFolder]);
                      toast.success('Pasta criada.');
                    } catch (error: any) {
                      console.error('Error creating folder:', error);
                      toast.error('Erro ao criar pasta');
                    }
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98]"
                >
                  <span className="material-icons-outlined text-base">create_new_folder</span>
                  Nova subpasta
                </button>
                <button
                  type="button"
                  onClick={onOpenCreatePrompt}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
                  style={{ backgroundColor: '#F07000' }}
                >
                  <span className="material-icons-outlined text-base">add</span>
                  Criar prompt
                </button>
                <button
                  type="button"
                  onClick={onOpenCreateFunctionCall}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
                  style={{ backgroundColor: '#F07000' }}
                >
                  <span className="material-icons-outlined text-base">add</span>
                  Criar function call
                </button>
                <button
                  type="button"
                  onClick={() => onCreateSchema(isRootSelected ? null : selectedFolderId ?? null)}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
                  style={{ backgroundColor: '#F07000' }}
                >
                  <span className="material-icons-outlined text-base">add</span>
                  Criar schema de multi agentes
                </button>
                {copiedItem && (
                  <button
                    type="button"
                    onClick={() => onPaste(isRootSelected ? null : selectedFolderId ?? null)}
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98]"
                  >
                    <span className="material-icons-outlined text-base">content_paste</span>
                    Colar
                  </button>
                )}
              </div>
              )}
            </div>
            {isProcessosSelected ? (
              <div className="flex-1 overflow-y-auto p-5">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Processos do sistema (somente visualização). A partir de um acionamento com as informações X o sistema faz Y.</p>
                {processesList.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum processo cadastrado.</p>
                ) : (
                  <ul className="space-y-2">
                    {processesList.map((proc) => (
                      <li
                        key={proc.id}
                        className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-sm group/process"
                      >
                        <span className="material-icons-outlined text-slate-500 dark:text-slate-400 flex-shrink-0 mt-0.5">account_tree</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900 dark:text-white text-sm">{proc.name}</div>
                          {proc.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{proc.description}</p>}
                          {proc.triggerFunctionCallName && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Acionador: {proc.triggerFunctionCallName}</p>
                          )}
                          {proc.requiredInputs && proc.requiredInputs.length > 0 && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Obrigatórios: {proc.requiredInputs.join(', ')}</p>
                          )}
                        </div>
                        {onDeleteProcess && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Excluir o processo "${proc.name}"?`)) onDeleteProcess(proc);
                            }}
                            className="flex-shrink-0 p-1.5 rounded-lg opacity-0 group-hover/process:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600 transition-all"
                            title="Excluir processo"
                          >
                            <span className="material-icons-outlined text-lg">delete_outline</span>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
            <div className="flex-1 overflow-y-auto p-5 flex flex-wrap gap-3 content-start items-start">
              {subfolders.map((f) => (
                <div
                  key={f.id}
                  className="flex flex-col items-center justify-center gap-1.5 w-32 h-32 min-w-[8rem] min-h-[8rem] flex-shrink-0 p-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/50 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer transition-all duration-200 active:scale-[0.995]"
                  onClick={() => onSelectFolder(f.id)}
                >
                  <span className="material-icons-outlined text-xl text-amber-500/90 dark:text-amber-400/80">
                    folder
                  </span>
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate w-full text-center">{f.name}</span>
                </div>
              ))}
              {contentPrompts.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col items-center justify-center gap-1.5 w-32 h-32 min-w-[8rem] min-h-[8rem] flex-shrink-0 p-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/50 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer transition-all duration-200 active:scale-[0.995] group/card relative"
                  onClick={() => onSelectItem({ type: 'prompt', id: p.id })}
                >
                  <span
                    className="material-icons-outlined text-xl"
                    style={{ color: '#F07000' }}
                  >
                    article
                  </span>
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate w-full text-center">{p.name}</span>
                  <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEditPrompt(p);
                      }}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                    >
                      <span className="material-icons-outlined text-xs">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePrompt(p);
                      }}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600 transition-colors"
                    >
                      <span className="material-icons-outlined text-xs">delete_outline</span>
                    </button>
                  </div>
                </div>
              ))}
              {contentFCs.map((fc) => (
                <div
                  key={fc.id}
                  className="flex flex-col items-center justify-center gap-1.5 w-32 h-32 min-w-[8rem] min-h-[8rem] flex-shrink-0 p-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/50 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer transition-all duration-200 active:scale-[0.995] group/card relative"
                  onClick={() => onSelectItem({ type: 'function-call', id: fc.id })}
                >
                  <span className="material-icons-outlined text-xl text-slate-600 dark:text-slate-300">
                    code
                  </span>
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate w-full text-center">{fc.name}</span>
                  <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEditFunctionCall?.(fc);
                      }}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                    >
                      <span className="material-icons-outlined text-xs">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFunctionCall(fc);
                      }}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600 transition-colors"
                    >
                      <span className="material-icons-outlined text-xs">delete_outline</span>
                    </button>
                  </div>
                </div>
              ))}
              {contentSchemas.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-col items-center justify-center gap-1.5 w-32 h-32 min-w-[8rem] min-h-[8rem] flex-shrink-0 p-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/50 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer transition-all duration-200 active:scale-[0.995] group/card relative"
                  onClick={() => onSelectItem({ type: 'schema', id: s.id })}
                >
                  <span className="material-icons-outlined text-xl text-emerald-600 dark:text-emerald-400">
                    account_tree
                  </span>
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate w-full text-center">{s.name}</span>
                  <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditSchema(s);
                      }}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                    >
                      <span className="material-icons-outlined text-xs">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSchema(s);
                      }}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600 transition-colors"
                    >
                      <span className="material-icons-outlined text-xs">delete_outline</span>
                    </button>
                  </div>
                </div>
              ))}
              {subfolders.length === 0 &&
                contentPrompts.length === 0 &&
                contentFCs.length === 0 &&
                contentSchemas.length === 0 && (
                  <div className="w-full rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/30 p-8 text-center">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Pasta vazia. Use os botões acima para criar itens.
                    </p>
                  </div>
                )}
            </div>
            )}
          </div>
        )}

        {selectedItem && (
          <div className="flex-1 flex flex-col overflow-hidden p-5 animate-fade-in">
            {selectedItem.type === 'prompt' && (() => {
              const p = prompts.find((x) => x.id === selectedItem.id);
              if (!p)
                return (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Prompt não encontrado.
                  </p>
                );
              const isEditing = editingPromptId === p.id;
              const form = isEditing && editingPromptForm ? editingPromptForm : null;

              const startEdit = () => {
                setEditingPromptId(p.id);
                setEditingPromptForm({ name: p.name, content: p.content ?? '' });
              };

              const cancelEdit = () => {
                setEditingPromptId(null);
                setEditingPromptForm(null);
              };

              const handleSave = async () => {
                if (!form) return;
                const name = form.name.trim();
                if (!name) {
                  toast.error('Informe o nome do prompt.');
                  return;
                }
                try {
                  await onUpdatePrompt(p.id, { name, content: form.content });
                  setEditingPromptId(null);
                  setEditingPromptForm(null);
                } catch {
                  /* toast já mostrado pelo parent */
                }
              };

              const inputCls =
                'w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none';
              const textareaCls = inputCls + ' resize-none';

              return (
                <div className="flex flex-col h-full gap-4 max-w-4xl mx-auto w-full overflow-y-auto">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/50 shadow-md p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                          Nome
                        </span>
                        {isEditing && form ? (
                          <input
                            type="text"
                            value={form.name}
                            onChange={(e) =>
                              setEditingPromptForm((f) => (f ? { ...f, name: e.target.value } : null))
                            }
                            placeholder="Nome do prompt"
                            className={inputCls}
                          />
                        ) : (
                          <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{p.name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleSave}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors"
                              style={{ backgroundColor: '#F07000' }}
                            >
                              Salvar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={startEdit}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                              <span className="material-icons-outlined text-base">edit</span>
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeletePrompt(p)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                            >
                              <span className="material-icons-outlined text-base">delete_outline</span>
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/50 shadow-md overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700/80">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Conteúdo
                      </span>
                    </div>
                    <div className="flex-1 overflow-auto p-4 min-h-0">
                      {isEditing && form ? (
                        <textarea
                          value={form.content}
                          onChange={(e) =>
                            setEditingPromptForm((f) => (f ? { ...f, content: e.target.value } : null))
                          }
                          placeholder="Conteúdo do prompt..."
                          className={`${textareaCls} min-h-[200px] h-full`}
                          rows={12}
                        />
                      ) : (
                        <pre className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-sans">
                          {p.content || '(vazio)'}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
            {selectedItem.type === 'function-call' && (() => {
              const fc = functionCalls.find((x) => x.id === selectedItem.id);
              if (!fc)
                return (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Function call não encontrado.
                  </p>
                );
              const isEditing = editingFCId === fc.id;
              const form = isEditing && editingFCForm ? editingFCForm : null;

              const startEdit = () => {
                setEditingFCId(fc.id);
                setEditingFCForm({
                  name: fc.name,
                  folderId: fc.folderId ?? null,
                  objective: fc.objective ?? '',
                  triggerConditions: fc.triggerConditions ?? '',
                  executionTiming: fc.executionTiming ?? '',
                  requiredFields: fc.requiredFields ?? '',
                  optionalFields: fc.optionalFields ?? '',
                  restrictions: fc.restrictions ?? '',
                  processingNotes: fc.processingNotes ?? '',
                  isActive: fc.isActive ?? true,
                  hasOutput: fc.hasOutput ?? false,
                  processingMethod: fc.processingMethod ?? 'RABBITMQ',
                  customAttributes: fc.customAttributes
                    ? Object.entries(fc.customAttributes).map(([key, value]) => ({ key, value }))
                    : [],
                });
              };

              const cancelEdit = () => {
                setEditingFCId(null);
                setEditingFCForm(null);
              };

              const handleSave = async () => {
                if (!form) return;
                const name = form.name.trim();
                if (!name) {
                  toast.error('Informe o nome da function call.');
                  return;
                }
                try {
                  await onUpdateFunctionCall(fc.id, {
                    name,
                    folderId: form.folderId?.trim() || null,
                    objective: form.objective.trim(),
                    triggerConditions: form.triggerConditions.trim(),
                    executionTiming: form.executionTiming.trim(),
                    requiredFields: form.requiredFields.trim(),
                    optionalFields: form.optionalFields.trim(),
                    restrictions: form.restrictions.trim(),
                    processingNotes: form.processingNotes.trim(),
                    isActive: form.isActive,
                    hasOutput: form.hasOutput,
                    processingMethod: form.processingMethod,
                    customAttributes: form.customAttributes.reduce<Record<string, string>>((acc, { key, value }) => {
                      const k = key.trim();
                      if (k) acc[k] = value;
                      return acc;
                    }, {}),
                  });
                  setEditingFCId(null);
                  setEditingFCForm(null);
                } catch {
                  /* toast já mostrado pelo parent */
                }
              };

              const customAttrs = fc.customAttributes ? Object.entries(fc.customAttributes) : [];
              const emptyText = '(não preenchido)';
              const inputCls =
                'w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none';
              const textareaCls = inputCls + ' resize-none';

              return (
                <div className="flex flex-col h-full gap-4 max-w-4xl mx-auto w-full overflow-y-auto p-1">
                  {/* Header */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/50 shadow-md p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                          Nome da function call
                        </span>
                        {isEditing && form ? (
                          <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setEditingFCForm((f) => (f ? { ...f, name: e.target.value } : null))}
                            placeholder="Ex: Alocabalcao"
                            className={inputCls}
                          />
                        ) : (
                          <p className="text-lg font-semibold text-slate-800 dark:text-slate-200">{fc.name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleSave}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors"
                              style={{ backgroundColor: '#F07000' }}
                            >
                              Salvar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={startEdit}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                              <span className="material-icons-outlined text-base">edit</span>
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteFunctionCall(fc)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                            >
                              <span className="material-icons-outlined text-base">delete_outline</span>
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Campos principais */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/50 shadow-md p-4 space-y-4">
                    {isEditing && form ? (
                      <>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Pasta (opcional)
                          </label>
                          <select
                            value={form.folderId ?? ''}
                            onChange={(e) =>
                              setEditingFCForm((f) => (f ? { ...f, folderId: e.target.value.trim() || null } : null))
                            }
                            className={inputCls}
                          >
                            <option value="">Nenhuma (raiz)</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Objetivo
                          </label>
                          <textarea
                            value={form.objective}
                            onChange={(e) => setEditingFCForm((f) => (f ? { ...f, objective: e.target.value } : null))}
                            rows={2}
                            placeholder="Ex.: Identificar se o cliente precisa de algo relacionado a compras no balcão"
                            className={textareaCls}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Quando Acionar
                          </label>
                          <textarea
                            value={form.triggerConditions}
                            onChange={(e) =>
                              setEditingFCForm((f) => (f ? { ...f, triggerConditions: e.target.value } : null))
                            }
                            rows={2}
                            placeholder="Ex.: Após o cliente falar que comprou no balcão"
                            className={textareaCls}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Momento de Execução
                          </label>
                          <textarea
                            value={form.executionTiming}
                            onChange={(e) =>
                              setEditingFCForm((f) => (f ? { ...f, executionTiming: e.target.value } : null))
                            }
                            rows={2}
                            placeholder="Ex.: Quando o cliente falar de assuntos de balcão disparar imediatamente"
                            className={textareaCls}
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              Campos Obrigatórios (separados por vírgula)
                            </label>
                            <input
                              type="text"
                              value={form.requiredFields}
                              onChange={(e) =>
                                setEditingFCForm((f) => (f ? { ...f, requiredFields: e.target.value } : null))
                              }
                              placeholder="Ex.: resumo"
                              className={inputCls}
                            />
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                              A FC só dispara quando todos os campos obrigatórios forem coletados
                            </p>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              Campos Opcionais (separados por vírgula)
                            </label>
                            <input
                              type="text"
                              value={form.optionalFields}
                              onChange={(e) =>
                                setEditingFCForm((f) => (f ? { ...f, optionalFields: e.target.value } : null))
                              }
                              placeholder="Ex.: NumeroDoPedido, ObservacaoExtra"
                              className={inputCls}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Restrições (o que NÃO fazer)
                          </label>
                          <textarea
                            value={form.restrictions}
                            onChange={(e) =>
                              setEditingFCForm((f) => (f ? { ...f, restrictions: e.target.value } : null))
                            }
                            rows={2}
                            placeholder="Ex.: Não chamar se o cliente apenas comente sobre o e-commerce"
                            className={textareaCls}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Anotações de Processamento
                          </label>
                          <textarea
                            value={form.processingNotes}
                            onChange={(e) =>
                              setEditingFCForm((f) => (f ? { ...f, processingNotes: e.target.value } : null))
                            }
                            rows={3}
                            placeholder="Descreva como essa FC é processada no backend"
                            className={textareaCls}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Objetivo
                          </span>
                          <p
                            className={`text-sm whitespace-pre-wrap ${fc.objective?.trim() ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 italic'}`}
                          >
                            {fc.objective?.trim() || emptyText}
                          </p>
                        </div>
                        <div>
                          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Quando Acionar
                          </span>
                          <p
                            className={`text-sm whitespace-pre-wrap ${fc.triggerConditions?.trim() ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 italic'}`}
                          >
                            {fc.triggerConditions?.trim() || emptyText}
                          </p>
                        </div>
                        <div>
                          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Momento de Execução
                          </span>
                          <p
                            className={`text-sm whitespace-pre-wrap ${fc.executionTiming?.trim() ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 italic'}`}
                          >
                            {fc.executionTiming?.trim() || emptyText}
                          </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              Campos Obrigatórios
                            </span>
                            <p
                              className={`text-sm ${fc.requiredFields?.trim() ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 italic'}`}
                            >
                              {fc.requiredFields?.trim() || emptyText}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                              A FC só dispara quando todos os campos obrigatórios forem coletados
                            </p>
                          </div>
                          <div>
                            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              Campos Opcionais
                            </span>
                            <p
                              className={`text-sm ${fc.optionalFields?.trim() ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 italic'}`}
                            >
                              {fc.optionalFields?.trim() || emptyText}
                            </p>
                          </div>
                        </div>
                        <div>
                          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Restrições (o que NÃO fazer)
                          </span>
                          <p
                            className={`text-sm whitespace-pre-wrap ${fc.restrictions?.trim() ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 italic'}`}
                          >
                            {fc.restrictions?.trim() || emptyText}
                          </p>
                        </div>
                        <div>
                          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Anotações de Processamento
                          </span>
                          <p
                            className={`text-sm whitespace-pre-wrap ${fc.processingNotes?.trim() ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 italic'}`}
                          >
                            {fc.processingNotes?.trim() || emptyText}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Configuração de Processamento */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/50 shadow-md p-4">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                      Configuração de Processamento
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      A function call é sempre processada na fila (RabbitMQ). As opções abaixo definem apenas se a
                      resposta processada é usada na mensagem ao cliente.
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <div className="flex-1">
                          <span className="text-sm font-medium text-slate-900 dark:text-white">
                            Usar resposta no atendimento
                          </span>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Se ativado, o agente espera uma resposta processada para usar na mensagem ao cliente.
                          </p>
                        </div>
                        {isEditing && form ? (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={form.hasOutput}
                            onClick={() =>
                              setEditingFCForm((f) => (f ? { ...f, hasOutput: !f.hasOutput } : null))
                            }
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${form.hasOutput ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
                            style={form.hasOutput ? { backgroundColor: '#F07000' } : {}}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${form.hasOutput ? 'translate-x-5' : 'translate-x-1'}`}
                            />
                          </button>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${fc.hasOutput ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${fc.hasOutput ? 'bg-green-500' : 'bg-slate-400'}`} />
                            {fc.hasOutput ? 'Ativado' : 'Desativado'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <div className="flex-1">
                          <span className="text-sm font-medium text-slate-900 dark:text-white">
                            Método de Processamento
                          </span>
                        </div>
                        {isEditing && form ? (
                          <select
                            value={form.processingMethod}
                            onChange={(e) =>
                              setEditingFCForm((f) =>
                                f ? { ...f, processingMethod: e.target.value as 'RABBITMQ' | 'HTTP' } : null
                              )
                            }
                            className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white"
                          >
                            <option value="RABBITMQ">RabbitMQ</option>
                            <option value="HTTP" disabled className="opacity-50">
                              HTTP Request (Em breve)
                            </option>
                          </select>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            {fc.processingMethod}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <div className="flex-1">
                          <span className="text-sm font-medium text-slate-900 dark:text-white">Usar processo</span>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Se ativado, ao executar esta function call o processo selecionado também será executado.
                          </p>
                        </div>
                        {isEditing && form && getFCProcessId && onUpdateFCProcessId ? (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={!!getFCProcessId(fc.name)}
                            onClick={async () => {
                              const current = getFCProcessId(fc.name);
                              if (current) {
                                if (form) {
                                  setEditingFCForm((f) => (f ? { ...f, requiredFields: '', optionalFields: '' } : null));
                                }
                                await onUpdateFCProcessId(fc.name, null);
                                return;
                              }
                              if (processesList.length === 0) {
                                toast.error('Cadastre pelo menos um processo na pasta Processos para poder ativar o uso.');
                                return;
                              }
                              const firstProcess = processesList[0];
                              if (form) {
                                const { requiredFields, optionalFields } = processToFCFields(firstProcess);
                                setEditingFCForm((f) =>
                                  f ? { ...f, requiredFields, optionalFields } : null
                                );
                              }
                              await onUpdateFCProcessId(fc.name, firstProcess.id);
                            }}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${getFCProcessId(fc.name) ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
                            style={getFCProcessId(fc.name) ? { backgroundColor: '#F07000' } : {}}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${getFCProcessId(fc.name) ? 'translate-x-5' : 'translate-x-1'}`}
                            />
                          </button>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${getFCProcessId?.(fc.name) ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${getFCProcessId?.(fc.name) ? 'bg-green-500' : 'bg-slate-400'}`} />
                            {getFCProcessId?.(fc.name) ? 'Ativado' : 'Desativado'}
                          </span>
                        )}
                      </div>
                      {isEditing && form && onUpdateFCProcessId && getFCProcessId?.(fc.name) && (
                        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Processo</label>
                          <select
                            value={getFCProcessId(fc.name) ?? ''}
                            onChange={async (e) => {
                              const value = e.target.value || null;
                              const selectedProcess = value ? processesList.find((p) => p.id === value) : null;
                              if (selectedProcess && form) {
                                const { requiredFields, optionalFields } = processToFCFields(selectedProcess);
                                setEditingFCForm((f) =>
                                  f ? { ...f, requiredFields, optionalFields } : null
                                );
                              } else if (!value && form) {
                                setEditingFCForm((f) => (f ? { ...f, requiredFields: '', optionalFields: '' } : null));
                              }
                              await onUpdateFCProcessId(fc.name, value);
                            }}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                          >
                            <option value="">Nenhum</option>
                            {processesList.map((proc) => (
                              <option key={proc.id} value={proc.id}>{proc.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Atributos Personalizados */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/50 shadow-md p-4">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                      Atributos Personalizados
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                      Configurações específicas desta function call
                    </p>
                    {isEditing && form ? (
                      <div className="space-y-2">
                        {form.customAttributes.map((attr, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={attr.key}
                              onChange={(e) =>
                                setEditingFCForm((f) =>
                                  f
                                    ? {
                                        ...f,
                                        customAttributes: f.customAttributes.map((a, i) =>
                                          i === idx ? { ...a, key: e.target.value } : a
                                        ),
                                      }
                                    : null
                                )
                              }
                              placeholder="Chave"
                              className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm"
                            />
                            <input
                              type="text"
                              value={attr.value}
                              onChange={(e) =>
                                setEditingFCForm((f) =>
                                  f
                                    ? {
                                        ...f,
                                        customAttributes: f.customAttributes.map((a, i) =>
                                          i === idx ? { ...a, value: e.target.value } : a
                                        ),
                                      }
                                    : null
                                )
                              }
                              placeholder="Valor"
                              className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setEditingFCForm((f) =>
                                  f
                                    ? {
                                        ...f,
                                        customAttributes: f.customAttributes.filter((_, i) => i !== idx),
                                      }
                                    : null
                                )
                              }
                              className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500"
                              title="Remover"
                            >
                              <span className="material-icons-outlined text-sm">delete_outline</span>
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setEditingFCForm((f) =>
                              f ? { ...f, customAttributes: [...f.customAttributes, { key: '', value: '' }] } : null
                            )
                          }
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white rounded-lg"
                          style={{ backgroundColor: '#F07000' }}
                        >
                          <span className="material-icons-outlined text-sm">add</span>
                          Adicionar
                        </button>
                      </div>
                    ) : customAttrs.length > 0 ? (
                      <div className="space-y-2">
                        {customAttrs.map(([key, val], idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg"
                          >
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300 min-w-[120px]">
                              {key}
                            </span>
                            <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">{val}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                        Nenhum atributo personalizado configurado
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
            {selectedItem.type === 'schema' && (() => {
              const s = schemas.find((x) => x.id === selectedItem.id);
              if (!s)
                return (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Schema não encontrado.
                  </p>
                );
              return (
                <div className="flex flex-col flex-1 min-h-0 gap-4">
                  <div className="flex items-center justify-between px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 shadow-sm flex-shrink-0">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                      {s.name}
                    </h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onRenameSchema(s)}
                        className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 hover:border-slate-300 dark:hover:border-slate-500 rounded-xl shadow-sm transition-colors"
                      >
                        Renomear
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSchema(s)}
                        className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/25 border border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl shadow-sm transition-colors"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-[400px] overflow-hidden w-full flex flex-col">
                    <WorkflowTab
                      schemaMode={{
                        schemaId: s.id,
                        schemaName: s.name,
                        definition: s.definition,
                        schemaType: s.schemaType,
                        onSave: (def) => onUpdateSchema(s.id, { definition: def }),
                      }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {openContextMenu &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[10rem] py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-xl"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            {openContextMenu.type === 'folder' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onEditingFolderId(openContextMenu.id);
                    setOpenContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Renomear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCopyFolder(openContextMenu.id);
                    setOpenContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Copiar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const folder = folders.find((f) => f.id === openContextMenu.id);
                    if (folder) onEditFolderState({ folderId: folder.id, name: folder.name, parentId: folder.parentId });
                    setOpenContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Mover
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteFolder(openContextMenu.id);
                    setOpenContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Excluir
                </button>
              </>
            )}
            {openContextMenu.type === 'prompt' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const p = prompts.find((x) => x.id === openContextMenu.id);
                    if (p) onOpenEditPrompt(p);
                    setOpenContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = prompts.find((x) => x.id === openContextMenu.id);
                    if (p) {
                      onCopyPrompt(p);
                      setOpenContextMenu(null);
                    }
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Copiar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = prompts.find((x) => x.id === openContextMenu.id);
                    if (p) {
                      onDeletePrompt(p);
                      setOpenContextMenu(null);
                    }
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Excluir
                </button>
              </>
            )}
            {openContextMenu.type === 'function-call' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const fc = functionCalls.find((x) => x.id === openContextMenu.id);
                    if (fc) onOpenEditFunctionCall(fc);
                    setOpenContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const fc = functionCalls.find((x) => x.id === openContextMenu.id);
                    if (fc) {
                      onCopyFunctionCall(fc);
                      setOpenContextMenu(null);
                    }
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Copiar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const fc = functionCalls.find((x) => x.id === openContextMenu.id);
                    if (fc) {
                      onDeleteFunctionCall(fc);
                      setOpenContextMenu(null);
                    }
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Excluir
                </button>
              </>
            )}
            {openContextMenu.type === 'schema' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const s = schemas.find((x) => x.id === openContextMenu.id);
                    if (s) onEditSchema(s);
                    setOpenContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const s = schemas.find((x) => x.id === openContextMenu.id);
                    if (s) {
                      onDeleteSchema(s);
                      setOpenContextMenu(null);
                    }
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Excluir
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
