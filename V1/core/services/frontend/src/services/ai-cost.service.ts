import api from './api';

export interface AiCostRow {
  id: string;
  attendanceId: string;
  messageId: string | null;
  clientPhone: string | null;
  scenario: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  whisperMinutes: number | null;
  usdCost: number;
  brlCost: number;
  routerModel: string | null;
  routerPromptTokens: number;
  routerCompletionTokens: number;
  routerTotalTokens: number;
  routerUsdCost: number;
  routerBrlCost: number;
  specialistName: string | null;
  specialistModel: string | null;
  specialistPromptTokens: number;
  specialistCompletionTokens: number;
  specialistTotalTokens: number;
  specialistUsdCost: number;
  specialistBrlCost: number;
  createdAt: string;
}

export interface AiCostsResponse {
  success: boolean;
  data: { rows: AiCostRow[]; total: number };
  aggregates: { sumUsd: number; sumBrl: number; sumTokens: number };
}

export const aiCostService = {
  async list(params?: {
    limit?: number;
    offset?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<AiCostsResponse> {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set('limit', String(params.limit));
    if (params?.offset != null) qs.set('offset', String(params.offset));
    if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params?.dateTo) qs.set('dateTo', params.dateTo);
    const url = `/ai-costs${qs.toString() ? `?${qs.toString()}` : ''}`;
    const res = await api.get<AiCostsResponse>(url);
    return res.data;
  },

  async reset(): Promise<{ success: boolean; deleted?: number }> {
    const res = await api.delete<{ success: boolean; deleted?: number }>('/ai-costs');
    return res.data;
  },

  async getById(id: string): Promise<{
    success: boolean;
    data: AiCostRow & { executionLog?: Record<string, unknown> | null };
  }> {
    const res = await api.get<{ success: boolean; data: AiCostRow & { executionLog?: Record<string, unknown> | null } }>(
      `/ai-costs/${id}`
    );
    return res.data;
  },
};
