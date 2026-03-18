import api from './api';

export interface QuoteItem {
  description?: string;
  quantity?: number;
  unit?: string;
  value?: number;
  [k: string]: unknown;
}

export interface QuoteQuestionAnswer {
  question: string;
  answer: string;
  at: string;
}

export interface QuoteRequest {
  id: string;
  attendanceId: string;
  sellerId?: string;
  clientPhone: string;
  clientName?: string;
  items?: QuoteItem[];
  observations?: string;
  status: 'pendente' | 'em_elaboracao' | 'enviado';
  questionAnswers?: QuoteQuestionAnswer[];
  /** null = vendedor ainda não viu */
  sellerViewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const quoteService = {
  async list(subdivision: string = 'pedidos-orcamentos'): Promise<QuoteRequest[]> {
    const res = await api.get<{ success: boolean; quotes: QuoteRequest[] }>(
      `/quote-requests?subdivision=${encodeURIComponent(subdivision)}`
    );
    return res.data.quotes ?? [];
  },

  async getById(id: string): Promise<QuoteRequest> {
    const res = await api.get<{ success: boolean; quote: QuoteRequest }>(`/quote-requests/${id}`);
    return res.data.quote;
  },

  async updateStatus(id: string, status: QuoteRequest['status']): Promise<void> {
    await api.patch(`/quote-requests/${id}`, { status });
  },

  async perguntar(id: string, content: string): Promise<void> {
    await api.post(`/quote-requests/${id}/perguntar`, { content });
  },

  async enviarOrcamento(id: string, content: string, mediaUrl?: string, mimeType?: string): Promise<void> {
    await api.post(`/quote-requests/${id}/enviar`, { content, mediaUrl, mimeType });
  },

  async markViewed(id: string): Promise<void> {
    await api.post(`/quote-requests/${id}/mark-viewed`);
  },

  async deletar(id: string): Promise<void> {
    await api.delete(`/quote-requests/${id}`);
  },
};
