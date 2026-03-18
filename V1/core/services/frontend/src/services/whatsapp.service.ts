import api from './api';

export interface ConnectWhatsAppRequest {
  name: string;
  config?: Record<string, any>;
  adapterType?: 'OFFICIAL' | 'UNOFFICIAL';
  phoneNumberId?: string;
  accessToken?: string;
  verifyToken?: string;
}

export interface ConnectWhatsAppResponse {
  success: boolean;
  message: string;
  numberId: string;
  qrCode?: string;
  status?: string;
}

export interface WhatsAppStatusResponse {
  numberId: string;
  status: string;
  connected: boolean;
  adapterType: string;
}

export interface WhatsAppNumberListItem {
  id: string;
  number: string;
  adapterType: 'OFFICIAL' | 'UNOFFICIAL';
  handledBy: 'AI' | 'HUMAN';
  numberType: 'UNDEFINED' | 'PRIMARY' | 'SECONDARY';
  active: boolean;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  sellerId?: string | null;
  seller?: {
    id: string;
    name: string;
    email: string;
  } | null;
  config?: {
    name?: string;
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ListWhatsAppNumbersResponse {
  success: boolean;
  numbers: WhatsAppNumberListItem[];
}

export interface UpdateWhatsAppNumberRequest {
  numberType?: 'PRIMARY' | 'SECONDARY';
  sellerId?: string | null;
}

export interface UpdateWhatsAppNumberResponse {
  success: boolean;
  message: string;
  number: WhatsAppNumberListItem;
}

export const whatsappService = {
  /**
   * Connect a WhatsApp number
   */
  async connectNumber(
    numberId: string,
    data: ConnectWhatsAppRequest
  ): Promise<ConnectWhatsAppResponse> {
    const response = await api.post<ConnectWhatsAppResponse>(
      `/whatsapp/${numberId}/connect`,
      data
    );
    return response.data;
  },

  /**
   * Disconnect a WhatsApp number
   */
  async disconnectNumber(numberId: string): Promise<void> {
    await api.post(`/whatsapp/${numberId}/disconnect`);
  },

  /**
   * Get connection status for a WhatsApp number
   */
  async getStatus(numberId: string): Promise<WhatsAppStatusResponse> {
    const response = await api.get<WhatsAppStatusResponse>(
      `/whatsapp/${numberId}/status`
    );
    return response.data;
  },

  /**
   * List all WhatsApp numbers
   */
  async listNumbers(): Promise<WhatsAppNumberListItem[]> {
    const response = await api.get<ListWhatsAppNumbersResponse>('/whatsapp');
    return response.data.numbers;
  },

  /**
   * Update WhatsApp number (type and seller)
   */
  async updateNumber(
    numberId: string,
    data: UpdateWhatsAppNumberRequest
  ): Promise<UpdateWhatsAppNumberResponse> {
    const response = await api.patch<UpdateWhatsAppNumberResponse>(
      `/whatsapp/${numberId}`,
      data
    );
    return response.data;
  },

  /**
   * List all sellers for assignment
   */
  async listSellers(): Promise<Array<{ id: string; name: string; email: string }>> {
    const response = await api.get<{ success: boolean; sellers: Array<{ id: string; name: string; email: string }> }>(
      '/whatsapp/sellers/list',
      { params: { _: Date.now() } }
    );
    return response.data.sellers;
  },

  /**
   * Delete WhatsApp number
   * @param numberId - The ID of the WhatsApp number to delete
   * @param force - If true, will delete even if there are related attendances
   */
  async deleteNumber(numberId: string, force: boolean = false): Promise<void> {
    const url = force ? `/whatsapp/${numberId}?force=true` : `/whatsapp/${numberId}`;
    await api.delete(url);
  },

  /**
   * Reset entire system - clears all data, connections, cache, etc.
   * WARNING: This is a destructive operation!
   */
  async resetSystem(): Promise<{ success: boolean; message: string }> {
    const response = await api.post<{ success: boolean; message: string }>(
      '/whatsapp/reset-system'
    );
    return response.data;
  },
};
