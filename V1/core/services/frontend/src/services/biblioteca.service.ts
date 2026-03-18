import { api } from './api';

export interface BibliotecaPrompt {
  id: string;
  name: string;
  content: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BibliotecaFunctionCall {
  id: string;
  name: string;
  folderId: string | null;
  objective?: string;
  triggerConditions?: string;
  executionTiming?: string;
  requiredFields?: string;
  optionalFields?: string;
  restrictions?: string;
  processingNotes?: string;
  isActive: boolean;
  hasOutput: boolean;
  processingMethod: 'RABBITMQ' | 'HTTP';
  customAttributes?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface BibliotecaFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BibliotecaSchema {
  id: string;
  name: string;
  folderId: string | null;
  definition?: string | null;
  schemaType?: 'sem-tags' | 'com-tags' | null;
  createdAt: string;
  updatedAt: string;
}

/** Processo do sistema (somente leitura na pasta Processos). */
export interface Process {
  id: string;
  name: string;
  description: string | null;
  triggerFunctionCallName: string | null;
  requiredInputs: string[] | null;
  optionalInputs: string[] | null;
  createdAt: string;
  updatedAt: string;
}

/** Garante separação correta: campos obrigatórios e opcionais do processo (ex.: placa só em opcionais). */
export function processToFCFields(process: Process | null | undefined): { requiredFields: string; optionalFields: string } {
  if (!process) return { requiredFields: '', optionalFields: '' };
  const required = process.requiredInputs ?? [];
  const optional = process.optionalInputs ?? [];
  const requiredFiltered = required.filter((x) => x !== 'placa');
  const optionalResolved =
    optional.length > 0 ? optional : (required.includes('placa') ? ['placa'] : []);
  return {
    requiredFields: requiredFiltered.join(', '),
    optionalFields: optionalResolved.join(', '),
  };
}

/** Retorna arrays para a API (requiredFields e optionalFields da config). */
export function processToFCFieldsArrays(process: Process | null | undefined): {
  requiredFields: string[];
  optionalFields: string[];
} {
  if (!process) return { requiredFields: [], optionalFields: [] };
  const required = process.requiredInputs ?? [];
  const optional = process.optionalInputs ?? [];
  const requiredFiltered = required.filter((x) => x !== 'placa');
  const optionalResolved =
    optional.length > 0 ? optional : (required.includes('placa') ? ['placa'] : []);
  return { requiredFields: requiredFiltered, optionalFields: optionalResolved };
}

export interface AgentFunctionCall {
  id: string;
  name: string;
  objective?: string;
  triggerConditions?: string;
  executionTiming?: string;
  requiredFields?: string;
  optionalFields?: string;
  restrictions?: string;
  processingNotes?: string;
  isActive: boolean;
  hasOutput: boolean;
  processingMethod: 'RABBITMQ' | 'HTTP';
  customAttributes?: Record<string, string>;
  bibliotecaId?: string | null;
  createdAt: string;
  updatedAt: string;
}

class BibliotecaService {
  // ========== PROMPTS ==========
  async getAllPrompts(): Promise<BibliotecaPrompt[]> {
    const response = await api.get<{ success: boolean; data: BibliotecaPrompt[] }>('/biblioteca/prompts');
    return response.data.data;
  }

  async getPromptById(id: string): Promise<BibliotecaPrompt> {
    const response = await api.get<{ success: boolean; data: BibliotecaPrompt }>(`/biblioteca/prompts/${id}`);
    return response.data.data;
  }

  async createPrompt(data: {
    name: string;
    content: string;
    folderId?: string | null;
  }): Promise<BibliotecaPrompt> {
    const response = await api.post<{ success: boolean; data: BibliotecaPrompt }>('/biblioteca/prompts', data);
    return response.data.data;
  }

  async updatePrompt(id: string, data: {
    name?: string;
    content?: string;
    folderId?: string | null;
  }): Promise<BibliotecaPrompt> {
    const response = await api.put<{ success: boolean; data: BibliotecaPrompt }>(`/biblioteca/prompts/${id}`, data);
    return response.data.data;
  }

  async deletePrompt(id: string): Promise<void> {
    await api.delete<{ success: boolean; message: string }>(`/biblioteca/prompts/${id}`);
  }

  // ========== FUNCTION CALLS ==========
  private normalizeFunctionCall(raw: Record<string, unknown>): BibliotecaFunctionCall {
    const folderId = (raw.folderId ?? raw.folder_id ?? null) as string | null;
    return {
      id: raw.id as string,
      name: raw.name as string,
      folderId: folderId === '' ? null : folderId,
      objective: raw.objective as string | undefined,
      triggerConditions: raw.triggerConditions as string | undefined,
      executionTiming: raw.executionTiming as string | undefined,
      requiredFields: raw.requiredFields as string | undefined,
      optionalFields: raw.optionalFields as string | undefined,
      restrictions: raw.restrictions as string | undefined,
      processingNotes: raw.processingNotes as string | undefined,
      isActive: (raw.isActive ?? true) as boolean,
      hasOutput: (raw.hasOutput ?? false) as boolean,
      processingMethod: (raw.processingMethod ?? 'RABBITMQ') as 'RABBITMQ' | 'HTTP',
      customAttributes: raw.customAttributes as Record<string, string> | undefined,
      createdAt: raw.createdAt as string,
      updatedAt: raw.updatedAt as string,
    };
  }

  async getAllFunctionCalls(): Promise<BibliotecaFunctionCall[]> {
    const response = await api.get<{ success: boolean; data: unknown[] }>('/biblioteca/function-calls');
    const data = response.data.data ?? [];
    return data.map((item) => this.normalizeFunctionCall(item as Record<string, unknown>));
  }

  async getFunctionCallById(id: string): Promise<BibliotecaFunctionCall> {
    const response = await api.get<{ success: boolean; data: unknown }>(`/biblioteca/function-calls/${id}`);
    return this.normalizeFunctionCall(response.data.data as Record<string, unknown>);
  }

  async createFunctionCall(data: Partial<BibliotecaFunctionCall>): Promise<BibliotecaFunctionCall> {
    const response = await api.post<{ success: boolean; data: unknown }>('/biblioteca/function-calls', data);
    return this.normalizeFunctionCall(response.data.data as Record<string, unknown>);
  }

  async updateFunctionCall(id: string, data: Partial<BibliotecaFunctionCall>): Promise<BibliotecaFunctionCall> {
    const response = await api.put<{ success: boolean; data: unknown }>(`/biblioteca/function-calls/${id}`, data);
    return this.normalizeFunctionCall(response.data.data as Record<string, unknown>);
  }

  async deleteFunctionCall(id: string): Promise<void> {
    await api.delete<{ success: boolean; message: string }>(`/biblioteca/function-calls/${id}`);
  }

  // ========== FOLDERS ==========
  async getAllFolders(): Promise<BibliotecaFolder[]> {
    const response = await api.get<{ success: boolean; data: BibliotecaFolder[] }>('/biblioteca/folders');
    return response.data.data;
  }

  async getFolderById(id: string): Promise<BibliotecaFolder> {
    const response = await api.get<{ success: boolean; data: BibliotecaFolder }>(`/biblioteca/folders/${id}`);
    return response.data.data;
  }

  async createFolder(data: { name: string; parentId?: string | null }): Promise<BibliotecaFolder> {
    const response = await api.post<{ success: boolean; data: BibliotecaFolder }>('/biblioteca/folders', data);
    return response.data.data;
  }

  async updateFolder(id: string, data: {
    name?: string;
    parentId?: string | null;
  }): Promise<BibliotecaFolder> {
    const response = await api.put<{ success: boolean; data: BibliotecaFolder }>(`/biblioteca/folders/${id}`, data);
    return response.data.data;
  }

  async deleteFolder(id: string): Promise<void> {
    await api.delete<{ success: boolean; message: string }>(`/biblioteca/folders/${id}`);
  }

  // ========== SCHEMAS ==========
  async getAllSchemas(): Promise<BibliotecaSchema[]> {
    const response = await api.get<{ success: boolean; data: BibliotecaSchema[] }>('/biblioteca/schemas');
    return response.data.data ?? [];
  }

  async getSchemaById(id: string): Promise<BibliotecaSchema> {
    const response = await api.get<{ success: boolean; data: BibliotecaSchema }>(`/biblioteca/schemas/${id}`);
    return response.data.data;
  }

  async createSchema(data: {
    name: string;
    folderId?: string | null;
    definition?: string | null;
    schemaType?: 'sem-tags' | 'com-tags' | null;
  }): Promise<BibliotecaSchema> {
    const response = await api.post<{ success: boolean; data: BibliotecaSchema }>('/biblioteca/schemas', data);
    return response.data.data;
  }

  async updateSchema(
    id: string,
    data: { name?: string; folderId?: string | null; definition?: string | null; schemaType?: 'sem-tags' | 'com-tags' | null }
  ): Promise<BibliotecaSchema> {
    const response = await api.put<{ success: boolean; data: BibliotecaSchema }>(`/biblioteca/schemas/${id}`, data);
    return response.data.data;
  }

  async deleteSchema(id: string): Promise<void> {
    await api.delete<{ success: boolean; message: string }>(`/biblioteca/schemas/${id}`);
  }

  // ========== PROCESSOS (somente leitura) ==========
  async getAllProcesses(): Promise<Process[]> {
    const response = await api.get<{ success: boolean; data: Process[] }>('/biblioteca/processes');
    return response.data.data ?? [];
  }

  async getProcessById(id: string): Promise<Process> {
    const response = await api.get<{ success: boolean; data: Process }>(`/biblioteca/processes/${id}`);
    return response.data.data;
  }

  async deleteProcess(id: string): Promise<void> {
    await api.delete<{ success: boolean }>(`/biblioteca/processes/${id}`);
  }

  // ========== AGENT FUNCTION CALLS ==========
  async getAllAgentFunctionCalls(): Promise<AgentFunctionCall[]> {
    const response = await api.get<{ success: boolean; data: AgentFunctionCall[] }>('/biblioteca/agent/function-calls');
    return response.data.data;
  }

  async getAgentFunctionCallById(id: string): Promise<AgentFunctionCall> {
    const response = await api.get<{ success: boolean; data: AgentFunctionCall }>(`/biblioteca/agent/function-calls/${id}`);
    return response.data.data;
  }

  async createAgentFunctionCall(data: Partial<AgentFunctionCall>): Promise<AgentFunctionCall> {
    const response = await api.post<{ success: boolean; data: AgentFunctionCall }>('/biblioteca/agent/function-calls', data);
    return response.data.data;
  }

  async updateAgentFunctionCall(id: string, data: Partial<AgentFunctionCall>): Promise<AgentFunctionCall> {
    const response = await api.put<{ success: boolean; data: AgentFunctionCall }>(`/biblioteca/agent/function-calls/${id}`, data);
    return response.data.data;
  }

  async deleteAgentFunctionCall(id: string): Promise<void> {
    await api.delete<{ success: boolean; message: string }>(`/biblioteca/agent/function-calls/${id}`);
  }

  async saveAllAgentFunctionCalls(functionCalls: Partial<AgentFunctionCall>[]): Promise<AgentFunctionCall[]> {
    const response = await api.put<{ success: boolean; data: AgentFunctionCall[] }>('/biblioteca/agent/function-calls', { functionCalls });
    return response.data.data;
  }
}

export const bibliotecaService = new BibliotecaService();
