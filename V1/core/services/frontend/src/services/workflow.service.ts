import { api } from './api';

export type WorkflowNodeType = 'function' | 'router' | 'specialist' | 'tool' | 'recebe_mensagem' | 'envia_mensagem' | 'envia_mensagem_pronta' | 'identifica_tag' | 'adiciona_tag' | 'tag_sim_nao';

export type WorkflowHandleSide = 'top' | 'right' | 'bottom' | 'left';

export interface WorkflowHandlePosition {
  side: WorkflowHandleSide;
  /** Offset percentual ao longo da borda (0–1) */
  offset: number;
}

export interface WorkflowNodeOutput {
  handle: string;
  targetNodeId?: string;
  conditionType?: string;
  conditionValue?: unknown;
  isFallback?: boolean;
  /** Nome da entrada de destino que essa saída aceita conectar */
  targetEntryName?: string;
  /** Tipo(s) de nó que essa saída aceita conectar */
  targetEntryType?: WorkflowNodeType | WorkflowNodeType[];
  /** Posição do handle na borda do nó */
  handlePosition?: WorkflowHandlePosition;
}

export interface WorkflowNodeInput {
  handle: string;
  name: string;
  /** Tipos de nó de origem que podem conectar nessa entrada */
  acceptsFromType?: WorkflowNodeType[];
  /** Se foi criada automaticamente pelo modo AUTO (ao clicar no +) */
  autoLinked?: boolean;
  /** ID do nó de origem que criou essa entrada (modo AUTO) */
  sourceNodeId?: string;
  /** Handle da saída de origem que criou essa entrada (modo AUTO) */
  sourceHandle?: string;
  /** Posição do handle na borda do nó */
  handlePosition?: WorkflowHandlePosition;
}

export interface WorkflowNodeConfig {
  handler?: string;
  params?: Record<string, unknown>;
  routerId?: string;
  specialistId?: string;
  functionCallName?: string;
  /** Function calls no especialista: ativado (true) ou não (false) */
  functionCallsEnabled?: boolean;
  /** Quantidade de slots de function call (1 a 6), quando functionCallsEnabled é true */
  functionCallCount?: number;
}

export interface WorkflowNodeDefinition {
  id: string;
  type: WorkflowNodeType;
  name: string;
  config: WorkflowNodeConfig;
  outputs: WorkflowNodeOutput[];
  inputs?: WorkflowNodeInput[];
  position?: { x: number; y: number };
}

/** Tipo visual da linha: reta, curva suave (bezier) ou curva 90° (step) */
export type WorkflowEdgePathType = 'straight' | 'smooth' | 'step';

/** Estilo do traço da linha */
export type WorkflowEdgeStrokeStyle = 'solid' | 'dashed';

/** Espessura da linha (estilo Excalidraw) */
export type WorkflowEdgeStrokeWidth = 'thin' | 'medium' | 'thick';

/** Ponto de dobra no caminho da linha (coordenadas do fluxo) */
export interface WorkflowEdgePathPoint {
  x: number;
  y: number;
}

export interface WorkflowEdgeDefinition {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  /** Tipo da linha (apenas visual) */
  pathType?: WorkflowEdgePathType;
  /** Pontos intermediários de dobra (caminho customizado) */
  pathPoints?: WorkflowEdgePathPoint[];
  /** Estilo do traço */
  strokeStyle?: WorkflowEdgeStrokeStyle;
  /** Espessura da linha */
  strokeWidth?: WorkflowEdgeStrokeWidth;
  /** Rótulo/caixa de texto ancorada à linha */
  label?: string;
  /** Posição do rótulo ao longo da linha (0–1) */
  labelPosition?: number;
  /** Offset da saída na borda do nó (0–1) */
  sourceOffset?: number;
  /** Offset da entrada na borda do nó (0–1) */
  targetOffset?: number;
  /** Deslocamento do meio da linha em px (posição visual) */
  pathOffsetX?: number;
  pathOffsetY?: number;
  /** Offset do segmento do meio (0 = centro, positivo = direita/baixo) */
  stepOffset?: number;
  /** Exibir seta na ponta (alvo). Padrão: true */
  showArrow?: boolean;
}

export interface WorkflowDefinition {
  version?: number;
  nodes: WorkflowNodeDefinition[];
  edges?: WorkflowEdgeDefinition[];
}

export interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  entryNodeId?: string | null;
  definition: WorkflowDefinition;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface WorkflowFunctionHandler {
  name: string;
  description: string;
  paramsSchema?: Record<string, unknown>;
}

class WorkflowService {
  async list(): Promise<Workflow[]> {
    const response = await api.get<{ success: boolean; data: Workflow[] }>('/ai/workflows');
    return response.data.data;
  }

  async getById(id: string): Promise<Workflow> {
    const response = await api.get<{ success: boolean; data: Workflow }>(`/ai/workflows/${id}`);
    return response.data.data;
  }

  async create(data: {
    name: string;
    description?: string | null;
    entryNodeId?: string | null;
    definition: WorkflowDefinition;
    isActive?: boolean;
  }): Promise<{ workflow: Workflow; validation: WorkflowValidationResult }> {
    const response = await api.post<{ success: boolean; data: Workflow; validation: WorkflowValidationResult }>('/ai/workflows', data);
    return { workflow: response.data.data, validation: response.data.validation };
  }

  async update(id: string, data: Partial<Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>>): Promise<{ workflow: Workflow; validation: WorkflowValidationResult }> {
    const response = await api.put<{ success: boolean; data: Workflow; validation: WorkflowValidationResult }>(`/ai/workflows/${id}`, data);
    return { workflow: response.data.data, validation: response.data.validation };
  }

  async delete(id: string): Promise<void> {
    await api.delete<{ success: boolean }>(`/ai/workflows/${id}`);
  }

  async validateDefinition(definition: WorkflowDefinition, entryNodeId?: string | null): Promise<WorkflowValidationResult> {
    const response = await api.post<{ success: boolean; data: WorkflowValidationResult }>('/ai/workflows/validate', {
      definition,
      entryNodeId,
    });
    return response.data.data;
  }

  async getFunctionHandlers(): Promise<WorkflowFunctionHandler[]> {
    const response = await api.get<{ success: boolean; data: WorkflowFunctionHandler[] }>(
      '/ai/workflows/function-handlers'
    );
    return response.data.data;
  }
}

export const workflowService = new WorkflowService();
