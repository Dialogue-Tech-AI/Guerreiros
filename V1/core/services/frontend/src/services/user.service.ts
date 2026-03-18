import api from './api';

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  role: 'SELLER' | 'SUPERVISOR' | 'ADMIN_GENERAL';
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'SELLER' | 'SUPERVISOR' | 'ADMIN_GENERAL' | 'SUPER_ADMIN';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListUsersResponse {
  success: boolean;
  users: User[];
}

export interface AssignSellerToSupervisorRequest {
  sellerId: string;
  supervisorId: string;
}

export interface AssignSupervisorToAdminRequest {
  supervisorId: string;
  adminId: string;
}

export interface SellerAvailabilityResponse {
  success: boolean;
  sellerId: string;
  isUnavailable: boolean;
  unavailableUntil: string | null;
}

export const userService = {
  /**
   * Create a new user (seller, supervisor, or admin)
   */
  async createUser(data: CreateUserRequest): Promise<User> {
    const response = await api.post<{ success: boolean; data: User }>('/users', data);
    return response.data.data;
  },

  /**
   * List all users
   */
  async listUsers(): Promise<User[]> {
    const response = await api.get<ListUsersResponse>('/users', {
      params: { _: Date.now() },
    });
    return response.data.users;
  },

  /**
   * List users by role
   */
  async listUsersByRole(role: 'SELLER' | 'SUPERVISOR' | 'ADMIN_GENERAL'): Promise<User[]> {
    const response = await api.get<ListUsersResponse>(`/users/role/${role}`);
    return response.data.users;
  },

  /**
   * Assign seller to supervisor
   */
  async assignSellerToSupervisor(data: AssignSellerToSupervisorRequest): Promise<void> {
    await api.post('/users/assign/seller-to-supervisor', data);
  },

  /**
   * Assign supervisor to admin
   */
  async assignSupervisorToAdmin(data: AssignSupervisorToAdminRequest): Promise<void> {
    await api.post('/users/assign/supervisor-to-admin', data);
  },

  /**
   * Delete a user
   */
  async deleteUser(userId: string): Promise<void> {
    await api.delete(`/users/${userId}`);
  },

  /**
   * Get supervisor's sellers and brands (for supervisor dashboard)
   */
  async getSupervisorSellers(): Promise<{
    supervisor: { id: string; brands: string[] };
    sellers: Array<{ id: string; name: string; email: string; brands: string[]; isUnavailable: boolean; unavailableUntil: string | null }>;
  }> {
    const response = await api.get<{
      success: boolean;
      supervisor: { id: string; brands: string[] };
      sellers: Array<{ id: string; name: string; email: string; brands: string[]; isUnavailable?: boolean; unavailableUntil?: string | null }>;
    }>('/users/supervisor/sellers');
    return {
      supervisor: response.data.supervisor,
      sellers: (response.data.sellers || []).map((seller) => ({
        ...seller,
        isUnavailable: !!seller.isUnavailable,
        unavailableUntil: seller.unavailableUntil ?? null,
      })),
    };
  },

  /**
   * Get availability status of logged seller
   */
  async getMySellerAvailability(): Promise<SellerAvailabilityResponse> {
    const response = await api.get<SellerAvailabilityResponse>('/users/sellers/me/availability');
    return response.data;
  },

  /**
   * Set seller availability (absent=true => ausente por 2h)
   */
  async setSellerAvailability(sellerId: string, absent: boolean): Promise<SellerAvailabilityResponse> {
    const response = await api.put<SellerAvailabilityResponse>(`/users/sellers/${sellerId}/availability`, { absent });
    return response.data;
  },

  /**
   * Update seller brand
   */
  async updateSellerBrand(sellerId: string, brand: string): Promise<void> {
    await api.put(`/users/sellers/${sellerId}/brand`, { brand });
  },

  /**
   * Unassign seller from supervisor.
   * @param sellerId - vendedor
   * @param supervisorId - se informado, remove só esse vínculo; senão remove todos os vínculos do vendedor
   */
  async unassignSellerFromSupervisor(sellerId: string, supervisorId?: string): Promise<void> {
    const params = supervisorId ? { supervisorId } : {};
    await api.post(`/users/sellers/${sellerId}/unassign`, null, { params });
  },

  /**
   * Get sellers with details (brand, supervisor principal e lista de supervisores N:N)
   */
  async getSellersDetails(): Promise<
    Array<{
      id: string;
      name: string;
      email: string;
      active: boolean;
      brands: string[];
      isUnavailable?: boolean;
      unavailableUntil?: string | null;
      supervisorId: string | null;
      supervisor: { id: string; name: string; email: string } | null;
      supervisors: Array<{ id: string; name: string; email: string }>;
      createdAt: string;
      updatedAt: string;
    }>
  > {
    const response = await api.get<{
      success: boolean;
      sellers: Array<{
        id: string;
        name: string;
        email: string;
        active: boolean;
        brands: string[];
        isUnavailable?: boolean;
        unavailableUntil?: string | null;
        supervisorId: string | null;
        supervisor: { id: string; name: string; email: string } | null;
        supervisors?: Array<{ id: string; name: string; email: string }>;
        createdAt: string;
        updatedAt: string;
      }>;
    }>('/users/sellers/details', {
      params: { _: Date.now() },
    });
    return (response.data.sellers || []).map((s) => ({
      ...s,
      supervisors: s.supervisors || [],
    }));
  },
};
