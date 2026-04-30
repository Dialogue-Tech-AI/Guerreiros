import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { attendanceService, ManualFollowUpCandidateDto } from '../../services/attendance.service';
import {
  loadSupervisorFollowUpSession,
  persistSupervisorFollowUpSession,
  type SessionState,
  type ContactSnap,
  type PendingFollowUpJob,
  type SentFollowUpJob,
} from '../../utils/supervisorFollowUpSession';

const SEND_CHUNK_SIZE = 500;

async function sendManualFollowUpsChunked(opts: {
  attendanceIds: string[];
  customMessage: string;
}): Promise<{ sent: number; failed: Array<{ attendanceId: string; reason: string }> }> {
  const ids = opts.attendanceIds;
  let sent = 0;
  const failed: Array<{ attendanceId: string; reason: string }> = [];
  for (let i = 0; i < ids.length; i += SEND_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + SEND_CHUNK_SIZE);
    const r = await attendanceService.sendManualFollowUps({
      attendanceIds: chunk,
      customMessage: opts.customMessage,
    });
    sent += r.sent ?? 0;
    if (Array.isArray(r.failed)) failed.push(...r.failed);
  }
  return { sent, failed };
}

function normalizePhoneDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

/** Pesquisa por nome ou número (o número também coincide só pelos dígitos). */
function matchesContactSearch(c: ManualFollowUpCandidateDto, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const name = (c.clientName || '').toLowerCase();
  const phoneRaw = (c.clientPhone || '').toLowerCase();
  const phoneDigits = normalizePhoneDigits(c.clientPhone || '');
  const qDigits = normalizePhoneDigits(t);
  if (name.includes(t)) return true;
  if (phoneRaw.includes(t)) return true;
  if (qDigits.length > 0 && phoneDigits.includes(qDigits)) return true;
  return false;
}

function formatDelayLabel(hours: number, minutes: number): string {
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} min`);
  return parts.join(' ');
}

function contactSnapsFromSelection(
  ids: string[],
  candidates: ManualFollowUpCandidateDto[]
): ContactSnap[] {
  const map = new Map(candidates.map((c) => [c.attendanceId, c]));
  return ids.map((id) => {
    const c = map.get(id);
    return {
      attendanceId: id,
      clientName: c?.clientName ?? '—',
      clientPhone: c?.clientPhone ?? '—',
    };
  });
}

/** Contacts guardados no job ou placeholders por ID (sessões antigas). */
function contactRowsForJob(attendanceIds: string[], contacts: ContactSnap[]): ContactSnap[] {
  if (contacts.length > 0) return contacts;
  return attendanceIds.map((id) => ({
    attendanceId: id,
    clientName: '—',
    clientPhone: '—',
  }));
}

function pendingJobWithoutAttendance(job: PendingFollowUpJob, attendanceId: string): PendingFollowUpJob {
  return {
    ...job,
    attendanceIds: job.attendanceIds.filter((id) => id !== attendanceId),
    contacts: job.contacts.filter((c) => c.attendanceId !== attendanceId),
  };
}

function sentJobWithoutAttendance(job: SentFollowUpJob, attendanceId: string): SentFollowUpJob {
  return {
    ...job,
    attendanceIds: job.attendanceIds.filter((id) => id !== attendanceId),
    contacts: job.contacts.filter((c) => c.attendanceId !== attendanceId),
  };
}

export function SupervisorFollowUpTab() {
  const [session, setSession] = useState<SessionState>(() => loadSupervisorFollowUpSession());
  const [candidates, setCandidates] = useState<ManualFollowUpCandidateDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [minInactive, setMinInactive] = useState(0);

  const [draftMessage, setDraftMessage] = useState('');
  const [scheduleHours, setScheduleHours] = useState(0);
  const [scheduleMinutes, setScheduleMinutes] = useState(15);
  const [contactSearchQuery, setContactSearchQuery] = useState('');

  const updateSession = useCallback((updater: (prev: SessionState) => SessionState) => {
    setSession((prev) => {
      const next = updater(prev);
      persistSupervisorFollowUpSession(next);
      return next;
    });
  }, []);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await attendanceService.getManualFollowUpCandidates({
        minInactiveMinutes: minInactive,
      });
      setCandidates(rows);
      setSelected(new Set());
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error ?? 'Erro ao carregar lista');
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [minInactive]);

  useEffect(() => {
    void fetchCandidates();
  }, [fetchCandidates]);

  const filteredCandidates = useMemo(
    () => candidates.filter((c) => matchesContactSearch(c, contactSearchQuery)),
    [candidates, contactSearchQuery]
  );

  const pendingSorted = useMemo(
    () => [...session.pending].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [session.pending]
  );

  const sentSorted = useMemo(
    () => [...session.sent].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    [session.sent]
  );

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectFiltered = () => {
    const ids = filteredCandidates.map((c) => c.attendanceId);
    const allSel = ids.length > 0 && ids.every((id) => selected.has(id));
    if (allSel) setSelected(new Set());
    else setSelected(new Set(ids));
  };

  const appendSent = useCallback(
    (job: Omit<SentFollowUpJob, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      updateSession((prev) => ({
        ...prev,
        sent: [{ ...job, id }, ...prev.sent],
      }));
    },
    [updateSession]
  );

  const runSendForJob = useCallback(
    async (opts: {
      attendanceIds: string[];
      message: string;
      contacts: ContactSnap[];
      onDone?: () => void;
    }) => {
      const { attendanceIds, message, contacts, onDone } = opts;
      if (attendanceIds.length === 0) {
        toast.error('Selecione pelo menos um atendimento');
        return;
      }

      const trimmed = message.trim();
      if (trimmed.length === 0) {
        toast.error('Escreva a mensagem antes de enviar');
        return;
      }
      if (trimmed.length > 4096) {
        toast.error('Mensagem demasiado longa (máx. 4096 caracteres)');
        return;
      }

      setSending(true);
      try {
        const result = await sendManualFollowUpsChunked({
          attendanceIds,
          customMessage: trimmed,
        });
        if (result.sent > 0) {
          toast.success(`${result.sent} envio(s) concluído(s)`);
        }
        if (result.failed.length) {
          toast.error(`${result.failed.length} falhou(ram).`);
          console.warn('Manual follow-up falhas:', result.failed);
        }
        appendSent({
          sentAt: new Date().toISOString(),
          message: trimmed,
          attendanceIds: [...attendanceIds],
          contacts,
          sent: result.sent,
          failed: result.failed.length,
        });
        await fetchCandidates();
        onDone?.();
      } catch (e: unknown) {
        const err = e as { response?: { data?: { error?: string } } };
        toast.error(err?.response?.data?.error ?? 'Erro ao enviar');
      } finally {
        setSending(false);
      }
    },
    [fetchCandidates, appendSent]
  );

  useEffect(() => {
    const tick = async () => {
      const state = loadSupervisorFollowUpSession();
      const now = Date.now();
      const due = state.pending.filter((j) => new Date(j.scheduledAt).getTime() <= now);
      const stillPending = state.pending.filter((j) => new Date(j.scheduledAt).getTime() > now);
      if (due.length === 0) return;

      let mergedSent = [...state.sent];
      let changed = stillPending.length !== state.pending.length;

      for (const job of due) {
        const trimmed = job.message.trim();
        if (trimmed.length === 0) {
          toast.error('Um envio agendado foi ignorado: a mensagem estava vazia. Agende novamente com texto.');
          changed = true;
          continue;
        }
        if (trimmed.length > 4096) {
          toast.error('Um envio agendado foi ignorado: mensagem demasiado longa.');
          changed = true;
          continue;
        }
        try {
          const result = await sendManualFollowUpsChunked({
            attendanceIds: job.attendanceIds,
            customMessage: trimmed,
          });
          if (result.sent > 0) {
            toast.success(`Agendado: ${result.sent} envio(s)`);
          }
          if (result.failed.length) {
            toast.error(`${result.failed.length} falha(s) num envio agendado`);
          }
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          mergedSent = [
            {
              id,
              sentAt: new Date().toISOString(),
              message: trimmed,
              attendanceIds: [...job.attendanceIds],
              contacts: job.contacts,
              sent: result.sent,
              failed: result.failed.length,
            },
            ...mergedSent,
          ];
          changed = true;
        } catch (e: unknown) {
          const err = e as { response?: { data?: { error?: string } } };
          toast.error(err?.response?.data?.error ?? 'Erro num envio agendado');
        }
      }

      if (changed) {
        persistSupervisorFollowUpSession({ pending: stillPending, sent: mergedSent });
        setSession({ pending: stillPending, sent: mergedSent });
        await fetchCandidates();
      }
    };

    const id = window.setInterval(() => void tick(), 5000);
    void tick();
    return () => window.clearInterval(id);
  }, [fetchCandidates]);

  const scheduleBatch = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error('Selecione atendimentos para agendar');
      return;
    }
    const msg = draftMessage.trim();
    if (msg.length === 0) {
      toast.error('Escreva a mensagem antes de agendar');
      return;
    }
    if (msg.length > 4096) {
      toast.error('Mensagem demasiado longa (máx. 4096 caracteres)');
      return;
    }
    const h = Math.max(0, Math.min(168, scheduleHours));
    const m = Math.max(0, Math.min(59, scheduleMinutes));
    const totalMin = h * 60 + m;
    if (totalMin < 1) {
      toast.error('Defina pelo menos 1 minuto de espera');
      return;
    }
    const when = new Date(Date.now() + totalMin * 60_000);
    const contacts = contactSnapsFromSelection(ids, candidates);
    const job: PendingFollowUpJob = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      attendanceIds: ids,
      message: msg,
      scheduledAt: when.toISOString(),
      contacts,
      createdAt: new Date().toISOString(),
    };
    updateSession((prev) => ({
      ...prev,
      pending: [...prev.pending, job],
    }));
    toast.success(
      `${ids.length} contato(s): envio daqui a ${formatDelayLabel(h, m)} (às ${when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})`
    );
  };

  const sendNowBatch = () => {
    const ids = Array.from(selected);
    const contacts = contactSnapsFromSelection(ids, candidates);
    void runSendForJob({
      attendanceIds: ids,
      message: draftMessage,
      contacts,
      onDone: () => setSelected(new Set()),
    });
  };

  const cancelPending = (jobId: string) => {
    updateSession((prev) => ({
      ...prev,
      pending: prev.pending.filter((j) => j.id !== jobId),
    }));
    toast.success('Removido de aguardando');
  };

  const clearAllPending = () => {
    if (session.pending.length === 0) return;
    if (
      !window.confirm(
        'Cancelar todos os envios agendados nesta sessão? Os atendimentos no servidor não são alterados.'
      )
    ) {
      return;
    }
    updateSession((prev) => ({ ...prev, pending: [] }));
    toast.success('Todos os agendamentos foram cancelados');
  };

  const removeSentJob = (jobId: string) => {
    updateSession((prev) => ({
      ...prev,
      sent: prev.sent.filter((j) => j.id !== jobId),
    }));
    toast.success('Registo removido do histórico de enviados');
  };

  const clearAllSent = () => {
    if (session.sent.length === 0) return;
    if (
      !window.confirm(
        'Remover todo o histórico de envios desta sessão? Isto só afeta esta lista no navegador; as conversas no servidor não são alteradas.'
      )
    ) {
      return;
    }
    updateSession((prev) => ({ ...prev, sent: [] }));
    toast.success('Histórico de enviados limpo');
  };

  const removeContactFromPending = (jobId: string, attendanceId: string) => {
    let droppedWholeJob = false;
    updateSession((prev) => {
      const job = prev.pending.find((j) => j.id === jobId);
      if (job) {
        const nextIds = job.attendanceIds.filter((id) => id !== attendanceId);
        droppedWholeJob = nextIds.length === 0;
      }
      const pending = prev.pending
        .map((j) => (j.id === jobId ? pendingJobWithoutAttendance(j, attendanceId) : j))
        .filter((j) => j.attendanceIds.length > 0);
      return { ...prev, pending };
    });
    toast.success(droppedWholeJob ? 'Agendamento cancelado (sem contatos)' : 'Contato removido do agendamento');
  };

  const removeContactFromSent = (jobId: string, attendanceId: string) => {
    let droppedWholeJob = false;
    updateSession((prev) => {
      const job = prev.sent.find((j) => j.id === jobId);
      if (job) {
        const nextIds = job.attendanceIds.filter((id) => id !== attendanceId);
        droppedWholeJob = nextIds.length === 0;
      }
      const sent = prev.sent
        .map((j) => (j.id === jobId ? sentJobWithoutAttendance(j, attendanceId) : j))
        .filter((j) => j.attendanceIds.length > 0);
      return { ...prev, sent };
    });
    toast.success(droppedWholeJob ? 'Registo removido do histórico' : 'Contato removido do histórico de enviados');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Follow up manual</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Nesta sessão do navegador usa apenas <strong className="font-medium text-slate-700 dark:text-slate-300">aguardando</strong> e{' '}
            <strong className="font-medium text-slate-700 dark:text-slate-300">enviado</strong>. Funciona mesmo com o envio automático desligado no Super Admin.
            É obrigatório escrever a mensagem antes de enviar ou agendar; não são usados os textos automáticos do sistema neste fluxo manual.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void fetchCandidates()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 shrink-0"
          style={{ backgroundColor: '#003070' }}
        >
          <span className="material-icons-round text-base">{loading ? 'hourglass_empty' : 'refresh'}</span>
          Atualizar lista
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 min-h-[200px] flex flex-col shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1">
            <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100 flex items-center gap-2 min-w-0">
              <span className="material-icons-round text-lg shrink-0">schedule</span>
              <span className="truncate">Aguardando follow up</span>
              <span className="text-xs font-normal opacity-80 shrink-0">({session.pending.length})</span>
            </h3>
            <button
              type="button"
              disabled={session.pending.length === 0}
              onClick={clearAllPending}
              className="shrink-0 text-xs px-2 py-1 rounded-md border border-amber-700/40 dark:border-amber-500/40 text-amber-950 dark:text-amber-100 hover:bg-amber-100/80 dark:hover:bg-amber-900/40 disabled:opacity-40 disabled:pointer-events-none"
            >
              Limpar todos
            </button>
          </div>
          <p className="text-[11px] text-amber-900/70 dark:text-amber-200/70 mt-1 mb-3">
            Envios agendados ficam aqui até à hora; depois passam para «Follow up enviado». Use «Remover» só neste cliente ou «Cancelar envio» para o lote inteiro.
          </p>
          <ul className="space-y-2 flex-1 overflow-y-auto max-h-[320px] text-sm">
            {pendingSorted.length === 0 ? (
              <li className="text-slate-500 dark:text-slate-400 text-xs py-6 text-center border border-dashed border-amber-300/50 dark:border-amber-800/40 rounded-lg">
                Nada aguardando nesta sessão.
              </li>
            ) : (
              pendingSorted.map((j) => (
                <li
                  key={j.id}
                  className="rounded-lg border border-amber-200/90 dark:border-amber-900/60 bg-white/80 dark:bg-slate-900/80 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Às{' '}
                        {new Date(j.scheduledAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">
                        ({new Date(j.scheduledAt).toLocaleDateString('pt-BR')} · criado{' '}
                        {new Date(j.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 mt-0.5">{j.attendanceIds.length} contato(s)</div>
                      <p className="text-slate-500 dark:text-slate-500 mt-2 whitespace-pre-wrap break-words line-clamp-4">
                        {j.message.trim() ? j.message : <em className="text-slate-400">(sem texto — agende de novo)</em>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => cancelPending(j.id)}
                      className="shrink-0 text-red-600 dark:text-red-400 hover:underline"
                    >
                      Cancelar envio
                    </button>
                  </div>
                  {j.attendanceIds.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-amber-200/70 dark:border-amber-900/50">
                      <div className="text-[10px] font-semibold text-amber-900 dark:text-amber-200 mb-1">Contatos</div>
                      <ul className="space-y-1 max-h-28 overflow-y-auto pr-0.5">
                        {contactRowsForJob(j.attendanceIds, j.contacts).map((c) => (
                          <li key={c.attendanceId} className="flex items-start justify-between gap-2">
                            <span className="min-w-0 break-words">
                              <span className="font-medium text-slate-800 dark:text-slate-100">{c.clientName}</span>
                              <span className="text-slate-500 dark:text-slate-400"> — </span>
                              <span className="font-mono text-[10px]">{c.clientPhone}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => removeContactFromPending(j.id, c.attendanceId)}
                              className="shrink-0 text-[10px] text-red-600 dark:text-red-400 hover:underline"
                            >
                              Remover
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 min-h-[200px] flex flex-col shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1">
            <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-100 flex items-center gap-2 min-w-0">
              <span className="material-icons-round text-lg shrink-0">send</span>
              <span className="truncate">Follow up enviado</span>
              <span className="text-xs font-normal opacity-80 shrink-0">({session.sent.length})</span>
            </h3>
            <button
              type="button"
              disabled={session.sent.length === 0}
              onClick={clearAllSent}
              className="shrink-0 text-xs px-2 py-1 rounded-md border border-emerald-700/40 dark:border-emerald-500/40 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 disabled:opacity-40 disabled:pointer-events-none"
            >
              Limpar todos
            </button>
          </div>
          <p className="text-[11px] text-emerald-900/70 dark:text-emerald-200/70 mt-1 mb-3">
            Histórico nesta sessão do navegador. Remover aqui só tira o cliente da divisão «Follow up enviado» na entrada; não apaga mensagens no servidor. Totais ok/falha referem-se ao lote original.
          </p>
          <ul className="space-y-2 flex-1 overflow-y-auto max-h-[320px] text-sm">
            {sentSorted.length === 0 ? (
              <li className="text-slate-500 dark:text-slate-400 text-xs py-6 text-center border border-dashed border-emerald-300/50 dark:border-emerald-800/40 rounded-lg">
                Ainda não houve envios nesta sessão.
              </li>
            ) : (
              sentSorted.map((j) => (
                <li
                  key={j.id}
                  className="rounded-lg border border-emerald-200/90 dark:border-emerald-900/60 bg-white/80 dark:bg-slate-900/80 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {new Date(j.sentAt).toLocaleString('pt-BR')}
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                        {j.sent} ok · {j.failed} falha(s) · {j.attendanceIds.length} contato(s) na lista
                      </div>
                      <p className="text-slate-500 dark:text-slate-500 mt-2 whitespace-pre-wrap break-words line-clamp-3">{j.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSentJob(j.id)}
                      className="shrink-0 text-red-600 dark:text-red-400 hover:underline"
                    >
                      Remover envio
                    </button>
                  </div>
                  {j.attendanceIds.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-emerald-200/70 dark:border-emerald-900/50">
                      <div className="text-[10px] font-semibold text-emerald-900 dark:text-emerald-200 mb-1">Contatos</div>
                      <ul className="space-y-1 max-h-28 overflow-y-auto pr-0.5">
                        {contactRowsForJob(j.attendanceIds, j.contacts).map((c) => (
                          <li key={c.attendanceId} className="flex items-start justify-between gap-2">
                            <span className="min-w-0 break-words">
                              <span className="font-medium text-slate-800 dark:text-slate-100">{c.clientName}</span>
                              <span className="text-slate-500 dark:text-slate-400"> — </span>
                              <span className="font-mono text-[10px]">{c.clientPhone}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => removeContactFromSent(j.id, c.attendanceId)}
                              className="shrink-0 text-[10px] text-red-600 dark:text-red-400 hover:underline"
                            >
                              Remover
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Configurar envio</h3>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
          Mensagem (obrigatória)
          <textarea
            value={draftMessage}
            onChange={(e) => setDraftMessage(e.target.value)}
            rows={4}
            placeholder="Texto que será enviado aos contactos selecionados."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2 text-sm resize-y min-h-[88px]"
          />
          <span className="text-[10px] font-normal text-slate-400">{draftMessage.length}/4096</span>
        </label>

        <div className="flex flex-wrap gap-4 items-end">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Agendar daqui a</span>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Horas
            <input
              type="number"
              min={0}
              max={168}
              value={scheduleHours}
              onChange={(e) => setScheduleHours(Math.max(0, Math.min(168, parseInt(e.target.value, 10) || 0)))}
              className="w-24 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Minutos
            <input
              type="number"
              min={0}
              max={59}
              value={scheduleMinutes}
              onChange={(e) => setScheduleMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
              className="w-24 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-2 text-sm"
            />
          </label>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs pb-1">
            Contagem a partir de agora; mínimo 1 minuto no total (ex.: 0 h + 15 min).
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400 mr-2">
            {selected.size} selecionado(s)
            {contactSearchQuery.trim() ? ` (lista filtrada: ${filteredCandidates.length} linhas)` : ''} · até {SEND_CHUNK_SIZE} contatos por pedido
          </span>
          <button
            type="button"
            disabled={sending || selected.size === 0 || draftMessage.trim().length === 0}
            onClick={sendNowBatch}
            className="text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Enviar agora
          </button>
          <button
            type="button"
            disabled={sending || selected.size === 0 || draftMessage.trim().length === 0}
            onClick={scheduleBatch}
            className="text-xs px-4 py-2 rounded-lg border border-slate-700 dark:border-slate-400 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Agendar
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3 items-end justify-between">
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                Inatividade mínima (min)
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={minInactive}
                  onChange={(e) => setMinInactive(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-32 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => void fetchCandidates()}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Aplicar filtro
              </button>
            </div>
            <button
              type="button"
              disabled={loading || filteredCandidates.length === 0}
              onClick={toggleSelectFiltered}
              className="text-xs px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Selecionar / limpar lista visível
            </button>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 max-w-xl">
            <span className="flex items-center gap-2">
              <span className="material-icons-round text-base text-slate-400">search</span>
              Pesquisar por nome ou telefone
            </span>
            <input
              type="search"
              value={contactSearchQuery}
              onChange={(e) => setContactSearchQuery(e.target.value)}
              placeholder="Ex.: Maria ou 5511999…"
              className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
            <span className="text-[10px] font-normal text-slate-400">
              Filtra apenas a tabela; mostra {filteredCandidates.length} de {candidates.length} candidato(s).
            </span>
          </label>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 w-10" />
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Inativo</th>
                <th className="px-3 py-2 hidden lg:table-cell max-w-md">Prévia da mensagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && candidates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                    A carregar…
                  </td>
                </tr>
              ) : candidates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                    Nenhum candidato com os filtros atuais.
                  </td>
                </tr>
              ) : filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                    Nenhum resultado para «{contactSearchQuery.trim()}». Limpe a pesquisa ou ajuste o texto.
                  </td>
                </tr>
              ) : (
                filteredCandidates.map((c) => (
                  <tr key={c.attendanceId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(c.attendanceId)}
                        onChange={() => toggleRow(c.attendanceId)}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 dark:text-white">{c.clientName}</div>
                      <div className="text-xs text-slate-500 font-mono">{c.clientPhone}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {c.inactiveMinutes} min
                      <div className="text-[10px] text-slate-400">
                        última msg cliente: {new Date(c.lastClientMessageAt).toLocaleString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell text-xs text-slate-600 dark:text-slate-400 max-w-md whitespace-pre-wrap">
                      {c.messagePreview?.slice(0, 200)}
                      {(c.messagePreview?.length ?? 0) > 200 ? '…' : ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
