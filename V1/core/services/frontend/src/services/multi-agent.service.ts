import { api } from './api';

export interface SpecialistAgent {
  id: string;
  name: string;
  prompt: string;
  model: string;
  temperature: number;
  functionCallNames?: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MultiAgentStatus {
  isEnabled: boolean;
  universalPrompt?: string | null;
  universalFunctionCalls?: string[] | null;
}

export interface MultiAgentConfigData {
  isEnabled: boolean;
  universalPrompt?: string | null;
  universalFunctionCalls?: string[] | null;
  entryRouterId?: string | null;
  workflowId?: string | null;
}

export type RouterType = 'llm_choice' | 'intent_channel' | 'keyword' | 'condition';
export type DestinationType = 'specialist' | 'router' | 'fixed';

export interface Router {
  id: string;
  name: string;
  description?: string | null;
  routerType: RouterType;
  prompt?: string | null;
  model?: string | null;
  temperature?: number | null;
  config?: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RouterOutput {
  id: string;
  routerId: string;
  label: string;
  conditionType?: string | null;
  conditionValue?: Record<string, unknown> | null;
  destinationType: DestinationType;
  destinationId?: string | null;
  responseText?: string | null;
  isFallback: boolean;
  orderIndex: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

class MultiAgentService {
  /**
   * Get multi-agent status
   */
  async getStatus(): Promise<MultiAgentStatus> {
    const response = await api.get<{ success: boolean; data: MultiAgentStatus }>(
      '/ai/multi-agent/status'
    );
    return response.data.data;
  }

  /**
   * Toggle multi-agent mode
   */
  async toggle(enabled: boolean): Promise<MultiAgentStatus> {
    const response = await api.post<{ success: boolean; data: MultiAgentStatus }>(
      '/ai/multi-agent/toggle',
      { enabled }
    );
    return response.data.data;
  }

  /**
   * Get multi-agent config (status + universal prompt + universal function calls)
   */
  async getConfig(): Promise<MultiAgentConfigData> {
    const response = await api.get<{ success: boolean; data: MultiAgentConfigData }>(
      '/ai/multi-agent/config'
    );
    return response.data.data;
  }

  /**
   * Update multi-agent config (e.g. universal prompt, universal function calls, entry router)
   */
  async updateConfig(data: {
    universalPrompt?: string | null;
    universalFunctionCalls?: string[] | null;
    entryRouterId?: string | null;
    workflowId?: string | null;
  }): Promise<MultiAgentConfigData> {
    const response = await api.put<{ success: boolean; data: MultiAgentConfigData }>(
      '/ai/multi-agent/config',
      data
    );
    return response.data.data;
  }

  /** Entry router (modular) */
  async getEntryRouter(): Promise<{ entryRouterId?: string | null }> {
    const response = await api.get<{ success: boolean; data: { entryRouterId?: string | null } }>(
      '/ai/multi-agent/router/entry'
    );
    return response.data.data;
  }

  async setEntryRouter(entryRouterId: string | null): Promise<{ entryRouterId?: string | null }> {
    const response = await api.put<{ success: boolean; data: { entryRouterId?: string | null } }>(
      '/ai/multi-agent/router/entry',
      { entryRouterId }
    );
    return response.data.data;
  }

  /** Modular routers CRUD */
  async getRouters(): Promise<Router[]> {
    const response = await api.get<{ success: boolean; data: Router[] }>('/ai/multi-agent/routers');
    return response.data.data;
  }

  async getRouter(id: string, withOutputs = false): Promise<Router | { router: Router; outputs: RouterOutput[] }> {
    const url = withOutputs ? `/ai/multi-agent/routers/${id}?outputs=true` : `/ai/multi-agent/routers/${id}`;
    const response = await api.get<{ success: boolean; data: Router | { router: Router; outputs: RouterOutput[] } }>(url);
    return response.data.data;
  }

  async createRouter(data: {
    name: string;
    description?: string | null;
    routerType?: RouterType;
    prompt?: string | null;
    model?: string | null;
    temperature?: number | null;
    config?: Record<string, unknown> | null;
    isActive?: boolean;
  }): Promise<Router> {
    const response = await api.post<{ success: boolean; data: Router }>('/ai/multi-agent/routers', data);
    return response.data.data;
  }

  async updateRouter(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      routerType: RouterType;
      prompt: string | null;
      model: string | null;
      temperature: number | null;
      config: Record<string, unknown> | null;
      isActive: boolean;
    }>
  ): Promise<Router> {
    const response = await api.put<{ success: boolean; data: Router }>(`/ai/multi-agent/routers/${id}`, data);
    return response.data.data;
  }

  async deleteRouter(id: string): Promise<void> {
    await api.delete<{ success: boolean; message: string }>(`/ai/multi-agent/routers/${id}`);
  }

  async getRouterOutputs(routerId: string): Promise<RouterOutput[]> {
    const response = await api.get<{ success: boolean; data: RouterOutput[] }>(
      `/ai/multi-agent/routers/${routerId}/outputs`
    );
    return response.data.data;
  }

  async createRouterOutput(
    routerId: string,
    data: {
      label: string;
      conditionType?: string | null;
      conditionValue?: Record<string, unknown> | null;
      destinationType: DestinationType;
      destinationId?: string | null;
      responseText?: string | null;
      isFallback?: boolean;
      orderIndex?: number;
      isActive?: boolean;
    }
  ): Promise<RouterOutput> {
    const response = await api.post<{ success: boolean; data: RouterOutput }>(
      `/ai/multi-agent/routers/${routerId}/outputs`,
      data
    );
    return response.data.data;
  }

  async updateRouterOutput(
    routerId: string,
    outputId: string,
    data: Partial<{
      label: string;
      conditionType: string | null;
      conditionValue: Record<string, unknown> | null;
      destinationType: DestinationType;
      destinationId: string | null;
      responseText: string | null;
      isFallback: boolean;
      orderIndex: number;
      isActive: boolean;
    }>
  ): Promise<RouterOutput> {
    const response = await api.put<{ success: boolean; data: RouterOutput }>(
      `/ai/multi-agent/routers/${routerId}/outputs/${outputId}`,
      data
    );
    return response.data.data;
  }

  async deleteRouterOutput(routerId: string, outputId: string): Promise<void> {
    await api.delete<{ success: boolean; message: string }>(
      `/ai/multi-agent/routers/${routerId}/outputs/${outputId}`
    );
  }

  /**
   * Get all specialist agents
   */
  async getSpecialists(): Promise<SpecialistAgent[]> {
    const response = await api.get<{ success: boolean; data: SpecialistAgent[] }>(
      '/ai/multi-agent/specialists'
    );
    return response.data.data;
  }

  /**
   * Get specialist agent by ID
   */
  async getSpecialist(id: string): Promise<SpecialistAgent> {
    const response = await api.get<{ success: boolean; data: SpecialistAgent }>(
      `/ai/multi-agent/specialists/${id}`
    );
    return response.data.data;
  }

  /**
   * Create specialist agent
   */
  async createSpecialist(data: {
    name: string;
    prompt: string;
    model: string;
    temperature: number;
    functionCallNames?: string[];
    isActive?: boolean;
  }): Promise<SpecialistAgent> {
    const response = await api.post<{ success: boolean; data: SpecialistAgent }>(
      '/ai/multi-agent/specialists',
      data
    );
    return response.data.data;
  }

  /**
   * Update specialist agent
   */
  async updateSpecialist(
    id: string,
    data: {
      name?: string;
      prompt?: string;
      model?: string;
      temperature?: number;
      functionCallNames?: string[];
      isActive?: boolean;
    }
  ): Promise<SpecialistAgent> {
    const response = await api.put<{ success: boolean; data: SpecialistAgent }>(
      `/ai/multi-agent/specialists/${id}`,
      data
    );
    return response.data.data;
  }

  /**
   * Delete specialist agent
   */
  async deleteSpecialist(id: string): Promise<void> {
    await api.delete<{ success: boolean; message: string }>(
      `/ai/multi-agent/specialists/${id}`
    );
  }
}

export const multiAgentService = new MultiAgentService();
