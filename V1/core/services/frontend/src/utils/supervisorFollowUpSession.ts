const SESSION_STORAGE_KEY = 'supervisor_followup_manual_session_v2';
const LEGACY_SCHEDULE_KEY = 'supervisor_followup_manual_schedule_v1';

export type SupervisorFollowUpContactSnap = {
  attendanceId: string;
  clientName: string;
  clientPhone: string;
};

export type SupervisorManualFollowUpPendingJob = {
  id: string;
  scheduledAt: string;
  /** Legado: ignorado — o servidor infere o passo por atendimento. */
  phase?: 1 | 2;
  message: string;
  attendanceIds: string[];
  contacts: SupervisorFollowUpContactSnap[];
  createdAt: string;
};

export type SupervisorManualFollowUpSentJob = {
  id: string;
  sentAt: string;
  phase?: 1 | 2;
  message: string;
  attendanceIds: string[];
  contacts: SupervisorFollowUpContactSnap[];
  sent: number;
  failed: number;
};

export type SupervisorManualFollowUpSessionState = {
  pending: SupervisorManualFollowUpPendingJob[];
  sent: SupervisorManualFollowUpSentJob[];
};

export function emptySupervisorManualFollowUpSession(): SupervisorManualFollowUpSessionState {
  return { pending: [], sent: [] };
}

export function loadSupervisorFollowUpSession(): SupervisorManualFollowUpSessionState {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as SupervisorManualFollowUpSessionState;
      if (p && Array.isArray(p.pending) && Array.isArray(p.sent)) {
        return { pending: p.pending, sent: p.sent };
      }
    }
    const legacy = sessionStorage.getItem(LEGACY_SCHEDULE_KEY);
    if (legacy) {
      const arr = JSON.parse(legacy);
      if (Array.isArray(arr)) {
        const pending: SupervisorManualFollowUpPendingJob[] = arr.map((j: Record<string, unknown>) => ({
          id: String(j.id ?? `${Date.now()}-${Math.random()}`),
          scheduledAt: String(j.scheduledAt),
          phase: j.phase === 2 ? 2 : j.phase === 1 ? 1 : undefined,
          message: '',
          attendanceIds: Array.isArray(j.attendanceIds)
            ? (j.attendanceIds as unknown[]).filter((x): x is string => typeof x === 'string')
            : [],
          contacts: [],
          createdAt: String(j.scheduledAt),
        }));
        sessionStorage.removeItem(LEGACY_SCHEDULE_KEY);
        const migrated = emptySupervisorManualFollowUpSession();
        migrated.pending = pending;
        persistSupervisorFollowUpSession(migrated);
        return migrated;
      }
    }
  } catch {
    /* ignore */
  }
  return emptySupervisorManualFollowUpSession();
}

/** Persiste e notifica outros listeners na mesma aba (ex.: contadores na entrada). */
export function persistSupervisorFollowUpSession(state: SupervisorManualFollowUpSessionState): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('supervisor-followup-session-changed'));
}

export function countManualFollowUpPendingContacts(state: SupervisorManualFollowUpSessionState): number {
  return state.pending.reduce((acc, j) => acc + j.attendanceIds.length, 0);
}

/** Aliases para componentes */
export type ContactSnap = SupervisorFollowUpContactSnap;
export type PendingFollowUpJob = SupervisorManualFollowUpPendingJob;
export type SentFollowUpJob = SupervisorManualFollowUpSentJob;
export type SessionState = SupervisorManualFollowUpSessionState;

