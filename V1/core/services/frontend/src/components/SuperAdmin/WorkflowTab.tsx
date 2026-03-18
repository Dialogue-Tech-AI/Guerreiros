import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Panel,
  Position,
  ViewportPortal,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useNodes,
  useEdges,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import {
  workflowService,
  type Workflow,
  type WorkflowDefinition,
  type WorkflowFunctionHandler,
  type WorkflowNodeConfig,
  type WorkflowNodeOutput,
  type WorkflowNodeInput,
  type WorkflowNodeType,
  type WorkflowValidationResult,
  type WorkflowEdgeDefinition,
  type WorkflowEdgePathType,
  type WorkflowEdgeStrokeStyle,
  type WorkflowEdgeStrokeWidth,
  type WorkflowHandlePosition,
  type WorkflowHandleSide,
} from '../../services/workflow.service';
import {
  multiAgentService,
  type Router,
  type SpecialistAgent,
} from '../../services/multi-agent.service';
import {
  functionCallConfigService,
  type FunctionCallConfig,
} from '../../services/ai-config.service';
import { ExcalidrawEdge } from './ExcalidrawEdge';
import { GhostConnectionEdgeComponent } from './GhostConnectionEdge';
import { EdgeDataContext } from './WorkflowEdgeContext';

const RECEBE_MENSAGEM_ID = 'recebe-mensagem';
const ENVIA_MENSAGEM_ID = 'envia-mensagem';

/**
 * Regras de compatibilidade: quais tipos de nó cada categoria pode conectar
 * Baseado nas regras do builder:
 * - Recebe mensagem → identifica_tag, router
 * - Identifica tag → router, specialist
 * - Adiciona tag → specialist, identifica_tag
 * - Router → router, specialist, adiciona_tag, envia_mensagem_pronta (tudo exceto envia_mensagem e identifica_tag)
 * - Specialist → adiciona_tag, envia_mensagem_pronta, envia_mensagem (nós finais ou adiciona_tag)
 */
const allowedTargetTypes: Record<WorkflowNodeType, WorkflowNodeType[]> = {
  recebe_mensagem: ['router', 'tag_sim_nao'],
  identifica_tag: ['router', 'specialist', 'tag_sim_nao'],
  adiciona_tag: ['specialist', 'identifica_tag'],
  router: ['router', 'specialist', 'adiciona_tag', 'envia_mensagem_pronta', 'tag_sim_nao'],
  specialist: ['adiciona_tag', 'envia_mensagem_pronta', 'envia_mensagem'],
  function: ['router', 'specialist', 'adiciona_tag', 'envia_mensagem_pronta', 'envia_mensagem'],
  tool: ['specialist'], // Function call (tool) retorna para o especialista que o chamou
  envia_mensagem: [], // Nó final, sem saídas
  envia_mensagem_pronta: [], // Nó final, sem saídas
  tag_sim_nao: ['router', 'specialist', 'identifica_tag'],
};

type HandleSide = WorkflowHandleSide;
type HandlePosition = WorkflowHandlePosition;

const oppositeHandleSide: Record<HandleSide, HandleSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

const defaultHandleLayout: Record<
  WorkflowNodeType,
  { output: HandleSide; input?: HandleSide }
> = {
  recebe_mensagem: { output: 'bottom' },
  identifica_tag: { output: 'bottom' },
  adiciona_tag: { output: 'bottom' },
  router: { output: 'bottom' },
  specialist: { output: 'right', input: 'left' },
  function: { output: 'bottom' },
  tool: { output: 'right', input: 'left' },
  envia_mensagem: { output: 'bottom' },
  envia_mensagem_pronta: { output: 'bottom' },
  tag_sim_nao: { output: 'bottom' },
};

const DEFAULT_HANDLE_OFFSET = 0.5;
const HANDLE_OFFSET_PX = 6;
const PLUS_DISTANCE_PX = 34; // Distância entre a bolinha e o botão +
const BASE_NODE_WIDTH = 152;
const WIDTH_PER_OUTPUT = 44; // Espaço extra por saída para organizar handles

const sideToPosition: Record<HandleSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const getDefaultOutputPosition = (
  category: WorkflowNodeType,
  index: number,
  total: number
): HandlePosition => {
  const layout = defaultHandleLayout[category] ?? { output: 'bottom' as HandleSide };
  const effectiveTotal = Math.max(total, 1);
  // Margem nas bordas para manter handles dentro do nó; centralizado
  const margin = total > 1 ? 0.12 : 0;
  const range = 1 - 2 * margin;
  const offset = total === 0 ? DEFAULT_HANDLE_OFFSET : margin + (index + 0.5) / effectiveTotal * range;
  return { side: layout.output, offset };
};

const getDefaultInputPosition = (category: WorkflowNodeType): HandlePosition => {
  const layout = defaultHandleLayout[category] ?? { output: 'bottom' as HandleSide };
  const inputSide = layout.input ?? oppositeHandleSide[layout.output];
  return { side: inputSide, offset: DEFAULT_HANDLE_OFFSET };
};

const getOffsetForIndexInGroup = (indexInGroup: number, totalInGroup: number): number => {
  if (totalInGroup <= 1) return DEFAULT_HANDLE_OFFSET;
  const margin = 0.12;
  const range = 1 - 2 * margin;
  return margin + ((indexInGroup + 0.5) / totalInGroup) * range;
};

/** Setores do modo com-tags: padrão de posicionamento de entradas/saídas por tipo de nó (baseado no print) */
const COM_TAGS_SECTORS = {
  recebe_mensagem: { input: null as null, output: { side: 'bottom' as HandleSide, offset: 0.5 } },
  tag_sim_nao: {
    input: { side: 'top' as HandleSide, offset: 0.5 },
    output: { side: 'bottom' as HandleSide, offsets: { sim: 0.35, nao: 0.65 } },
  },
  identifica_tag: {
    input: { side: 'right' as HandleSide, offset: 0.5 },
    output: { side: 'left' as HandleSide, offset: 0.5 },
  },
  router: {
    input: { side: 'left' as HandleSide, offset: 0.5 },
    output: { side: 'bottom' as HandleSide, offsets: { opcao_1: 0.35, opcao_2: 0.65 } },
  },
  adiciona_tag: {
    input: { side: 'top' as HandleSide, offset: 0.5 },
    output: { side: 'left' as HandleSide, offset: 0.5 },
  },
  specialist: {
    input: { side: 'right' as HandleSide, offset: 0.5 },
    output: { side: 'left' as HandleSide, offset: 0.5 },
  },
  envia_mensagem: {
    input: { side: 'right' as HandleSide, offset: 0.5 },
    output: null as null,
  },
} as const;

/** Espaço fixo em px entre as áreas — padrão de criação e desenho (as três nunca se sobrepõem) */
const COM_TAGS_SECTOR_GAP_PX = 20;
/** Setores (colunas) do canvas no modo com-tags: limites em X já com 80px de margem entre as áreas */
const COM_TAGS_CANVAS_SECTOR_RED = { minX: -700, maxX: -400 };
const COM_TAGS_CANVAS_SECTOR_BLUE = { minX: -400 + COM_TAGS_SECTOR_GAP_PX, maxX: 120 - COM_TAGS_SECTOR_GAP_PX };
const COM_TAGS_CANVAS_SECTOR_ORANGE = { minX: 120, maxX: 600 };
/** Margem horizontal interna (em px) ao redor do conteúdo dentro de cada área */
const COM_TAGS_SECTOR_MARGIN_X = 20;
/** Altura igual para as três áreas (fixa entre as três) */
const COM_TAGS_SECTOR_BASE_HEIGHT = 320;
/** Espaço horizontal extra ao redor dos nós (aumenta o tamanho horizontal das áreas) */
const COM_TAGS_SECTOR_PADDING_X = 64;
/** Espaço vertical para cálculo da altura comum das áreas */
const COM_TAGS_SECTOR_PADDING_Y = 48;
/** Largura mínima de cada área ao retrair horizontalmente */
const COM_TAGS_SECTOR_MIN_WIDTH = 220;

/** Centro X neutro para Recebe mensagem (início do fluxo, entre as áreas) */
const COM_TAGS_NEUTRAL_CENTER_X = (COM_TAGS_CANVAS_SECTOR_RED.minX + COM_TAGS_CANVAS_SECTOR_ORANGE.maxX) / 2 - BASE_NODE_WIDTH / 2;
/** Centro X para nós da área de tag (Tag Sim/Não, Identifica tag) */
const COM_TAGS_BLUE_CENTER_X = (COM_TAGS_CANVAS_SECTOR_BLUE.minX + COM_TAGS_CANVAS_SECTOR_BLUE.maxX) / 2 - BASE_NODE_WIDTH / 2;
/** Centro X para nós da área de roteadores */
const COM_TAGS_ORANGE_CENTER_X = (COM_TAGS_CANVAS_SECTOR_ORANGE.minX + COM_TAGS_CANVAS_SECTOR_ORANGE.maxX) / 2 - BASE_NODE_WIDTH / 2;

function getComTagsSectorBounds(category: WorkflowNodeType): { minX: number; maxX: number } | null {
  switch (category) {
    case 'specialist':
    case 'envia_mensagem':
      return COM_TAGS_CANVAS_SECTOR_RED;
    case 'recebe_mensagem':
      return null; // Fica fora de qualquer área, acima das três
    case 'tag_sim_nao':
    case 'identifica_tag':
    case 'adiciona_tag':
      return COM_TAGS_CANVAS_SECTOR_BLUE;
    case 'router':
      return COM_TAGS_CANVAS_SECTOR_ORANGE;
    default:
      return null;
  }
}

function clampPositionToComTagsSector(
  position: { x: number; y: number },
  category: WorkflowNodeType
): { x: number; y: number } {
  const bounds = getComTagsSectorBounds(category);
  if (!bounds) return position;
  const x = Math.max(bounds.minX, Math.min(bounds.maxX, position.x));
  return { x, y: position.y };
}

function getComTagsInputPosition(
  category: keyof typeof COM_TAGS_SECTORS,
  index: number,
  total: number
): { side: HandleSide; offset: number } {
  const sector = COM_TAGS_SECTORS[category]?.input;
  if (!sector) return { side: 'top', offset: DEFAULT_HANDLE_OFFSET };
  const offset = total <= 1 ? sector.offset : getOffsetForIndexInGroup(index, total);
  return { side: sector.side, offset };
}

function getComTagsOutputPosition(
  category: keyof typeof COM_TAGS_SECTORS,
  handle: string,
  index: number,
  total: number
): { side: HandleSide; offset: number } {
  const sector = COM_TAGS_SECTORS[category]?.output;
  if (!sector) return { side: 'bottom', offset: DEFAULT_HANDLE_OFFSET };
  const offsets = 'offsets' in sector && sector.offsets && (sector.offsets as Record<string, number>)[handle];
  const offset = offsets ?? (total <= 1 ? sector.offset : getOffsetForIndexInGroup(index, total));
  return { side: sector.side, offset };
}

const getDefaultInputPositionForIndex = (
  category: WorkflowNodeType,
  index: number,
  total: number
): HandlePosition => {
  const base = getDefaultInputPosition(category);
  const offset = getOffsetForIndexInGroup(index, total);
  return { side: base.side, offset };
};

/** Posição do input considerando distribuição por lado (inputs no mesmo lado compartilham a borda) */
const getInputPositionForRender = (
  input: WorkflowNodeInput,
  inputs: WorkflowNodeInput[],
  category: WorkflowNodeType,
  index: number
): HandlePosition => {
  const defaultSide = getDefaultInputPosition(category).side;
  const side = input.handlePosition?.side ?? defaultSide;
  const sameSideInputs = inputs
    .map((inp, i) => ({ inp, i }))
    .filter(({ inp }) => (inp.handlePosition?.side ?? defaultSide) === side);
  const idxInGroup = sameSideInputs.findIndex(({ i }) => i === index);
  const totalInGroup = sameSideInputs.length;
  const offset = getOffsetForIndexInGroup(idxInGroup >= 0 ? idxInGroup : index, totalInGroup);
  return { side, offset };
};

/** Posição do output considerando distribuição por lado */
const getOutputPositionForRender = (
  output: WorkflowNodeOutput,
  outputs: WorkflowNodeOutput[],
  category: WorkflowNodeType,
  index: number
): HandlePosition => {
  const layout = defaultHandleLayout[category] ?? { output: 'bottom' as HandleSide };
  const defaultSide = layout.output;
  const side = output.handlePosition?.side ?? defaultSide;
  const regularOutputs = outputs.filter((o) => isRegularOutputHandle(category, o));
  const sameSideOutputs = regularOutputs
    .map((o, i) => ({ o, i }))
    .filter(
      ({ o }) => (o.handlePosition?.side ?? defaultSide) === side
    );
  const idxInGroup = sameSideOutputs.findIndex(({ o }) => o.handle === output.handle);
  const totalInGroup = sameSideOutputs.length;
  const offset = getOffsetForIndexInGroup(idxInGroup >= 0 ? idxInGroup : index, Math.max(totalInGroup, 1));
  return { side, offset };
};


const getHandleStyle = (position: HandlePosition): React.CSSProperties => {
  const percent = `${position.offset * 100}%`;
  const base = { position: 'absolute' as const, pointerEvents: 'auto' as const, zIndex: 10 };
  switch (position.side) {
    case 'top':
      return {
        ...base,
        left: percent,
        top: -HANDLE_OFFSET_PX,
        transform: 'translateX(-50%)',
      };
    case 'bottom':
      return {
        ...base,
        left: percent,
        bottom: -HANDLE_OFFSET_PX,
        transform: 'translateX(-50%)',
      };
    case 'left':
      return {
        ...base,
        top: percent,
        left: -HANDLE_OFFSET_PX,
        transform: 'translateY(-50%)',
      };
    case 'right':
      return {
        ...base,
        top: percent,
        right: -HANDLE_OFFSET_PX,
        transform: 'translateY(-50%)',
      };
    default:
      return {
        ...base,
        left: percent,
        bottom: -HANDLE_OFFSET_PX,
        transform: 'translateX(-50%)',
      };
  }
};

const getPlusButtonStyle = (position: HandlePosition): React.CSSProperties => {
  const percent = `${position.offset * 100}%`;
  switch (position.side) {
    case 'top':
      return {
        left: percent,
        top: -(HANDLE_OFFSET_PX + PLUS_DISTANCE_PX),
        transform: 'translateX(-50%)',
        zIndex: 9,
      };
    case 'bottom':
      return {
        left: percent,
        bottom: -(HANDLE_OFFSET_PX + PLUS_DISTANCE_PX),
        transform: 'translateX(-50%)',
        zIndex: 9,
      };
    case 'left':
      return {
        top: percent,
        left: -(HANDLE_OFFSET_PX + PLUS_DISTANCE_PX),
        transform: 'translateY(-50%)',
        zIndex: 9,
      };
    case 'right':
      return {
        top: percent,
        right: -(HANDLE_OFFSET_PX + PLUS_DISTANCE_PX),
        transform: 'translateY(-50%)',
        zIndex: 9,
      };
    default:
      return {
        left: percent,
        bottom: -(HANDLE_OFFSET_PX + PLUS_DISTANCE_PX),
        transform: 'translateX(-50%)',
        zIndex: 9,
      };
  }
};

/** Entrada padrão para cada tipo de nó (o handle de entrada) */
const defaultInputs: Record<WorkflowNodeType, WorkflowNodeInput[]> = {
  recebe_mensagem: [], // Nó inicial, sem entrada
  identifica_tag: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['tag_sim_nao', 'adiciona_tag'] }],
  adiciona_tag: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['router', 'specialist'] }],
  router: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['recebe_mensagem', 'identifica_tag', 'router', 'tag_sim_nao'] }],
  specialist: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['identifica_tag', 'router', 'adiciona_tag', 'function', 'tool', 'tag_sim_nao'] }],
  function: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['router', 'specialist'] }],
  tool: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['specialist'] }], // Function call vem do especialista
  envia_mensagem: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['specialist'] }],
  envia_mensagem_pronta: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['router', 'specialist'] }],
  tag_sim_nao: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['recebe_mensagem', 'identifica_tag', 'router'] }],
};

const isFunctionCallHandle = (handle: string) =>
  handle === 'function_call' || handle.startsWith('function_call_');

/** Handle de entrada no specialist para retorno de Function call (tool). Múltiplas conexões = entrada_fc_0, entrada_fc_1, ... */
const SPECIALIST_FC_INPUT_PREFIX = 'entrada_fc_';
const isSpecialistFcInputHandle = (handle: string) =>
  handle.startsWith(SPECIALIST_FC_INPUT_PREFIX);

const isRegularOutputHandle = (category: WorkflowNodeType, output: WorkflowNodeOutput) =>
  !(category === 'specialist' && isFunctionCallHandle(output.handle)) && category !== 'tool';

/** inputSide: quando definido na criação, a saída fica no lado oposto à entrada */
const withDefaultOutputPositions = (
  category: WorkflowNodeType,
  outputs: WorkflowNodeOutput[],
  inputSide?: HandleSide
): WorkflowNodeOutput[] => {
  const regularIndices = outputs
    .map((output, index) => ({ output, index }))
    .filter(({ output }) => isRegularOutputHandle(category, output));
  const totalRegular = regularIndices.length;
  let cursor = 0;
  const outputSideFromInput = inputSide != null ? oppositeHandleSide[inputSide] : undefined;

  return outputs.map((output) => {
    if (!isRegularOutputHandle(category, output)) {
      return { ...output };
    }
    const defaultPos = getDefaultOutputPosition(category, cursor, totalRegular);
    const side = outputSideFromInput ?? defaultPos.side;
    const position =
      output.handlePosition != null
        ? { side: output.handlePosition.side, offset: output.handlePosition.offset ?? defaultPos.offset }
        : { ...defaultPos, side };
    cursor += 1;
    return { ...output, handlePosition: position };
  });
};

const withDefaultInputPositions = (
  category: WorkflowNodeType,
  inputs: WorkflowNodeInput[] | undefined
): WorkflowNodeInput[] => {
  if (!inputs?.length) return inputs ?? [];
  const total = inputs.length;
  return inputs.map((input, index) => {
    const defaultPos = getDefaultInputPositionForIndex(category, index, total);
    if (total === 1) {
      return { ...input, handlePosition: input.handlePosition ?? defaultPos };
    }
    const preserveSide = input.handlePosition?.side != null;
    return {
      ...input,
      handlePosition: {
        side: preserveSide ? input.handlePosition!.side : defaultPos.side,
        offset: defaultPos.offset,
      },
    };
  });
};

const FUNCTION_CALL_NODE_WIDTH = 100;
/** Espaço entre a borda do especialista e o primeiro nó Function call */
const GAP_SPECIALIST_TO_FC = 24;
const GAP_BETWEEN_TOOLS = 32;
const VERTICAL_GAP_NEXT = 280;
/** Gap entre nó de origem e novo nó ao criar pelo "+" (alinhado à saída) */
const GAP_NEXT_NODE = 24;
/** Gap maior quando o novo nó é agente especialista criado a partir do router */
const GAP_ROUTER_TO_SPECIALIST = 56;
/** Altura aproximada do nó especialista (min-height) */
const SPECIALIST_NODE_HEIGHT = 152;
/** Margem mínima entre nós/linhas ao verificar sobreposição */
const OVERLAP_PADDING = 12;
/** Passo ao buscar posição livre (na direção da saída) */
const FREE_POSITION_STEP = 40;
/** Largura da faixa lateral (overlay) do especialista (w-9 = 36px) */
const SPECIALIST_STRIP_SIZE = 36;
/** Largura/altura aproximada por tipo (para colisão) */
const NODE_SIZE_BY_CATEGORY: Record<WorkflowNodeType, { w: number; h: number }> = {
  tool: { w: FUNCTION_CALL_NODE_WIDTH, h: FUNCTION_CALL_NODE_WIDTH },
  specialist: { w: BASE_NODE_WIDTH, h: SPECIALIST_NODE_HEIGHT },
  router: { w: BASE_NODE_WIDTH, h: SPECIALIST_NODE_HEIGHT },
  function: { w: BASE_NODE_WIDTH, h: SPECIALIST_NODE_HEIGHT },
  recebe_mensagem: { w: BASE_NODE_WIDTH, h: SPECIALIST_NODE_HEIGHT },
  envia_mensagem: { w: BASE_NODE_WIDTH, h: SPECIALIST_NODE_HEIGHT },
  envia_mensagem_pronta: { w: BASE_NODE_WIDTH, h: SPECIALIST_NODE_HEIGHT },
  identifica_tag: { w: BASE_NODE_WIDTH, h: SPECIALIST_NODE_HEIGHT },
  adiciona_tag: { w: BASE_NODE_WIDTH, h: SPECIALIST_NODE_HEIGHT },
  tag_sim_nao: { w: BASE_NODE_WIDTH, h: SPECIALIST_NODE_HEIGHT },
};

type Rect = { x: number; y: number; width: number; height: number };

function getRectForNodeAt(
  category: WorkflowNodeType,
  position: { x: number; y: number }
): Rect {
  const size = NODE_SIZE_BY_CATEGORY[category] ?? { w: BASE_NODE_WIDTH, h: SPECIALIST_NODE_HEIGHT };
  return {
    x: position.x,
    y: position.y,
    width: size.w,
    height: size.h,
  };
}

/** Retângulo real do nó incluindo overlays (faixas cinza do especialista). Para especialista usa sempre o máximo (com faixa) para nunca colocar novo nó em cima. */
function getRectForExistingNode(
  node: { id: string; position: { x: number; y: number }; data?: { category?: WorkflowNodeType; outputs?: Array<{ handle: string }>; config?: { functionCallSide?: string } } }
): Rect {
  const category = (node.data?.category ?? 'router') as WorkflowNodeType;
  const base = getRectForNodeAt(category, node.position);
  if (category !== 'specialist') return base;
  const outputs = node.data?.outputs ?? [];
  const fcOutputs = outputs.filter((o) => o.handle === 'function_call' || String(o.handle).startsWith('function_call_'));
  const side = node.data?.config?.functionCallSide as string | undefined;
  const hasLateralStrip = fcOutputs.length > 0 && (side === 'left' || side === 'right');
  const hasTopBottomStrip = fcOutputs.length > 0 && (side === 'top' || side === 'bottom');
  const width = base.width + (hasLateralStrip ? SPECIALIST_STRIP_SIZE : 0);
  const height = base.height + (hasTopBottomStrip ? SPECIALIST_STRIP_SIZE : 0);
  return {
    x: node.position.x,
    y: node.position.y,
    width,
    height,
  };
}

/** Categorias por setor do canvas com-tags (para o overlay dinâmico). Recebe mensagem fica fora de qualquer área (acima). */
function getSectorCategories(sector: 'red' | 'blue' | 'orange'): WorkflowNodeType[] {
  switch (sector) {
    case 'red':
      return ['specialist', 'envia_mensagem'];
    case 'blue':
      return ['tag_sim_nao', 'identifica_tag', 'adiciona_tag'];
    case 'orange':
      return ['router'];
    default:
      return [];
  }
}

/** Overlay das áreas (setores) no modo com-tags: áreas desenhadas em volta dos nós (bounding box + padding), altura igual para as três */
function ComTagsSectorOverlay() {
  const nodes = useNodes<FlowNodeData>();
  const bounds = useMemo(() => {
    const M = COM_TAGS_SECTOR_MARGIN_X;
    const padX = COM_TAGS_SECTOR_PADDING_X;
    const padY = COM_TAGS_SECTOR_PADDING_Y;
    const baseH = COM_TAGS_SECTOR_BASE_HEIGHT;
    const minW = COM_TAGS_SECTOR_MIN_WIDTH;
    const sectors: Array<'red' | 'blue' | 'orange'> = ['red', 'blue', 'orange'];

    const sectorLogical: Record<'red' | 'blue' | 'orange', { left: number; right: number }> = {
      red: { left: COM_TAGS_CANVAS_SECTOR_RED.minX, right: COM_TAGS_CANVAS_SECTOR_RED.maxX - M },
      blue: { left: COM_TAGS_CANVAS_SECTOR_BLUE.minX + M, right: COM_TAGS_CANVAS_SECTOR_BLUE.maxX - M },
      orange: { left: COM_TAGS_CANVAS_SECTOR_ORANGE.minX + M, right: COM_TAGS_CANVAS_SECTOR_ORANGE.maxX },
    };

    // Topo da faixa = nó mais alto dos setores (exclui Recebe mensagem); assim ele fica acima das áreas
    let globalTop = Infinity;
    let globalBottom = -Infinity;
    const contentBox: Record<'red' | 'blue' | 'orange', { left: number; right: number }> = {
      red: { left: sectorLogical.red.left, right: sectorLogical.red.right },
      blue: { left: sectorLogical.blue.left, right: sectorLogical.blue.right },
      orange: { left: sectorLogical.orange.left, right: sectorLogical.orange.right },
    };

    for (const sector of sectors) {
      const categories = getSectorCategories(sector);
      const sectorNodes = nodes.filter((n) => n.data?.category && categories.includes(n.data.category as WorkflowNodeType));
      if (sectorNodes.length > 0) {
        let minY = Infinity;
        let maxY = -Infinity;
        let minX = Infinity;
        let maxX = -Infinity;
        for (const node of sectorNodes) {
          const rect = getRectForExistingNode(node);
          minY = Math.min(minY, rect.y);
          maxY = Math.max(maxY, rect.y + rect.height);
          minX = Math.min(minX, rect.x);
          maxX = Math.max(maxX, rect.x + rect.width);
        }
        globalTop = Math.min(globalTop, minY - padY);
        globalBottom = Math.max(globalBottom, maxY + padY);
        contentBox[sector] = { left: minX - padX, right: maxX + padX };
      }
    }
    if (globalTop === Infinity) globalTop = 0;
    if (globalBottom === -Infinity) globalBottom = baseH;

    const height = Math.max(baseH, globalBottom - globalTop);

    // Laterais que fazem divisa com outras áreas ficam fixas; cada área só cresce para o lado livre
    const redRightFixed = COM_TAGS_CANVAS_SECTOR_RED.maxX;
    const blueLeftFixed = COM_TAGS_CANVAS_SECTOR_BLUE.minX;
    const blueRightFixed = COM_TAGS_CANVAS_SECTOR_BLUE.maxX;
    const orangeLeftFixed = COM_TAGS_CANVAS_SECTOR_ORANGE.minX;

    // Vermelho: divisa fixa à direita; cresce para a esquerda quando puxa o conteúdo
    let redLeft = Math.min(COM_TAGS_CANVAS_SECTOR_RED.minX, contentBox.red.left);
    const redRight = redRightFixed;
    if (redRight - redLeft < minW) redLeft = redRight - minW;

    // Azul: ambas as laterais são divisa (com vermelho e laranja), largura fixa
    const blueLeft = blueLeftFixed;
    const blueRight = blueRightFixed;

    // Laranja: divisa fixa à esquerda; cresce para a direita quando puxa o conteúdo
    const orangeLeft = orangeLeftFixed;
    let orangeRight = Math.max(COM_TAGS_CANVAS_SECTOR_ORANGE.maxX, contentBox.orange.right);
    if (orangeRight - orangeLeft < minW) orangeRight = orangeLeft + minW;

    return {
      red: { top: globalTop, height, left: redLeft, width: redRight - redLeft },
      blue: { top: globalTop, height, left: blueLeft, width: blueRight - blueLeft },
      orange: { top: globalTop, height, left: orangeLeft, width: orangeRight - orangeLeft },
    };
  }, [nodes]);

  const overlayStyle = { borderRadius: 12 };

  return (
    <div
      className="pointer-events-none"
      style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, zIndex: -1 }}
      aria-hidden
    >
      <div
        className="absolute"
        style={{
          ...overlayStyle,
          left: bounds.red.left,
          width: bounds.red.width,
          top: bounds.red.top,
          height: bounds.red.height,
          backgroundColor: 'rgba(239, 68, 68, 0.06)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
        }}
      />
      <div
        className="absolute"
        style={{
          ...overlayStyle,
          left: bounds.blue.left,
          width: bounds.blue.width,
          top: bounds.blue.top,
          height: bounds.blue.height,
          backgroundColor: 'rgba(59, 130, 246, 0.06)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
        }}
      />
      <div
        className="absolute"
        style={{
          ...overlayStyle,
          left: bounds.orange.left,
          width: bounds.orange.width,
          top: bounds.orange.top,
          height: bounds.orange.height,
          backgroundColor: 'rgba(249, 115, 22, 0.06)',
          border: '1px solid rgba(249, 115, 22, 0.2)',
        }}
      />
    </div>
  );
}

function rectsOverlap(a: Rect, b: Rect, padding: number = OVERLAP_PADDING): boolean {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

/** Verifica se o segmento de reta (ax,ay)-(bx,by) intersecta o retângulo (com padding). */
function segmentIntersectsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: Rect,
  padding: number = OVERLAP_PADDING
): boolean {
  const rx = r.x - padding;
  const ry = r.y - padding;
  const rw = r.width + 2 * padding;
  const rh = r.height + 2 * padding;
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);
  if (maxX < rx || minX > rx + rw || maxY < ry || minY > ry + rh) return false;
  const sign = (px: number, py: number, qx: number, qy: number, sx: number, sy: number) =>
    (qx - px) * (sy - py) - (sx - px) * (qy - py);
  const corners = [
    [rx, ry],
    [rx + rw, ry],
    [rx + rw, ry + rh],
    [rx, ry + rh],
  ];
  for (let i = 0; i < 4; i++) {
    const [cx, cy] = corners[i];
    const [nx, ny] = corners[(i + 1) % 4];
    const o1 = sign(ax, ay, bx, by, cx, cy);
    const o2 = sign(ax, ay, bx, by, nx, ny);
    const o3 = sign(cx, cy, nx, ny, ax, ay);
    const o4 = sign(cx, cy, nx, ny, bx, by);
    if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  }
  if (ax >= rx && ax <= rx + rw && ay >= ry && ay <= ry + rh) return true;
  if (bx >= rx && bx <= rx + rw && by >= ry && by <= ry + rh) return true;
  return false;
}

function positionOccupied(
  pos: { x: number; y: number },
  category: WorkflowNodeType,
  nodes: Array<{ id: string; position: { x: number; y: number }; data?: { category?: WorkflowNodeType; outputs?: Array<{ handle: string }>; config?: { functionCallSide?: string } } }>,
  edges: Array<{ source: string; target: string }>,
  excludeNodeId?: string
): boolean {
  const rect = getRectForNodeAt(category, pos);
  for (const node of nodes) {
    if (node.id === excludeNodeId) continue;
    const other = getRectForExistingNode(node);
    if (rectsOverlap(rect, other)) return true;
  }
  for (const edge of edges) {
    const src = nodes.find((n) => n.id === edge.source);
    const tgt = nodes.find((n) => n.id === edge.target);
    if (!src || !tgt) continue;
    const srcRect = getRectForExistingNode(src);
    const tgtRect = getRectForExistingNode(tgt);
    const ax = srcRect.x + srcRect.width / 2;
    const ay = srcRect.y + srcRect.height / 2;
    const bx = tgtRect.x + tgtRect.width / 2;
    const by = tgtRect.y + tgtRect.height / 2;
    if (segmentIntersectsRect(ax, ay, bx, by, rect)) return true;
  }
  return false;
}

/** Encontra a posição livre mais próxima do ideal, na direção dada. Se sectorBounds for passado, candidatos têm x limitado ao setor. */
function findFreePositionNear(
  idealPos: { x: number; y: number },
  direction: HandleSide,
  category: WorkflowNodeType,
  nodes: Array<{ id: string; position: { x: number; y: number }; data?: { category?: WorkflowNodeType } }>,
  edges: Array<{ source: string; target: string }>,
  excludeNodeId?: string,
  maxTries: number = 30,
  sectorBounds?: { minX: number; maxX: number }
): { x: number; y: number } {
  const clampToSector = (p: { x: number; y: number }) =>
    sectorBounds
      ? { x: Math.max(sectorBounds.minX, Math.min(sectorBounds.maxX, p.x)), y: p.y }
      : p;
  const idealClamped = clampToSector(idealPos);
  if (!positionOccupied(idealClamped, category, nodes, edges, excludeNodeId))
    return idealClamped;
  const step = FREE_POSITION_STEP;
  for (let k = 1; k <= maxTries; k++) {
    let candidate: { x: number; y: number };
    switch (direction) {
      case 'right':
        candidate = { x: idealPos.x + k * step, y: idealPos.y };
        break;
      case 'left':
        candidate = { x: idealPos.x - k * step, y: idealPos.y };
        break;
      case 'bottom':
        candidate = { x: idealPos.x, y: idealPos.y + k * step };
        break;
      case 'top':
        candidate = { x: idealPos.x, y: idealPos.y - k * step };
        break;
      default:
        candidate = { x: idealPos.x + k * step, y: idealPos.y };
    }
    candidate = clampToSector(candidate);
    if (!positionOccupied(candidate, category, nodes, edges, excludeNodeId)) return candidate;
  }
  for (let k = 1; k <= maxTries; k++) {
    const perpendicular = (dir: HandleSide, i: number): { x: number; y: number } => {
      const s = i * (step / 2);
      switch (dir) {
        case 'right':
        case 'left':
          return { x: idealPos.x + (direction === 'right' ? k * step : -k * step), y: idealPos.y + (i % 2 === 0 ? 1 : -1) * s };
        case 'top':
        case 'bottom':
          return { x: idealPos.x + (i % 2 === 0 ? 1 : -1) * s, y: idealPos.y + (direction === 'bottom' ? k * step : -k * step) };
        default:
          return { x: idealPos.x + k * step, y: idealPos.y };
      }
    };
    for (const i of [0, 1, 2, 3]) {
      let candidate = perpendicular(direction, i);
      candidate = clampToSector(candidate);
      if (!positionOccupied(candidate, category, nodes, edges, excludeNodeId)) return candidate;
    }
  }
  return clampToSector(idealPos);
}

type AddPanelContextValue = {
  openAddPanel: (nodeId: string, sourceHandle?: string) => void;
};
const AddPanelContext = createContext<AddPanelContextValue | null>(null);

type ConnectionTargetPickerContextValue = {
  openConnectionPicker: (nodeId: string, handle: string) => void;
};
const ConnectionTargetPickerContext = createContext<ConnectionTargetPickerContextValue | null>(null);

/** Ref global para updateNodeInternals (atualizado de dentro do ReactFlow) */
const updateNodeInternalsRef = { current: null as ((nodeId: string | string[]) => void) | null };

/** Componente interno que atualiza a ref com updateNodeInternals */
function NodeInternalsUpdaterInner({ children }: { children: React.ReactNode }) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternalsRef.current = updateNodeInternals;
    return () => {
      updateNodeInternalsRef.current = null;
    };
  }, [updateNodeInternals]);
  return <>{children}</>;
}

type NodeSettingsPanelContextValue = {
  openNodeSettings: (nodeId: string) => void;
};
const NodeSettingsPanelContext = createContext<NodeSettingsPanelContextValue | null>(null);

type EdgeOptionsContextValue = {
  onEdgeDataUpdate: (edgeId: string, dataUpdate: Record<string, unknown>) => void;
  onEdgeDelete: (edge: Edge) => void;
  selectedNodeId: string | null;
};
const EdgeOptionsContext = createContext<EdgeOptionsContextValue | null>(null);

type DeleteSelectionContextValue = {
  deleteSelection: () => void;
  hasRemovableSelection: boolean;
};
const DeleteSelectionContext = createContext<DeleteSelectionContextValue | null>(null);

/** Botão único de exclusão: exclui nós e/ou linhas conforme a seleção */
function DeleteSelectionPanelInner(): React.ReactElement | null {
  const ctx = useContext(DeleteSelectionContext);
  if (!ctx?.hasRemovableSelection) return null;
  return (
    <div className="mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg p-3 nodrag nopan">
      <button
        type="button"
        onClick={() => ctx.deleteSelection()}
        className="w-full py-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium flex items-center justify-center gap-1.5"
      >
        <span className="material-icons-outlined text-sm">delete_outline</span>
        Excluir
      </button>
    </div>
  );
}

/** Painel de opções da linha: só aparece quando uma linha está selecionada e nenhum nó está selecionado */
function EdgeOptionsPanelInner(): React.ReactElement | null {
  const edges = useEdges();
  const { setEdges } = useReactFlow();
  const ctx = useContext(EdgeOptionsContext);
  const onEdgeDataUpdate = ctx?.onEdgeDataUpdate;
  const onEdgeDelete = ctx?.onEdgeDelete;
  const selectedNodeId = ctx?.selectedNodeId ?? null;
  const selectedEdge = useMemo(
    () => edges.find((e) => e.selected) ?? null,
    [edges]
  );

  const updateEdge = useCallback(
    (edgeId: string, dataUpdate: Record<string, unknown>) => {
      setEdges((eds: Edge[]) =>
        eds.map((ed) =>
          ed.id === edgeId
            ? { ...ed, data: { ...(ed.data ?? {}), ...dataUpdate } }
            : ed
        )
      );
      onEdgeDataUpdate?.(edgeId, dataUpdate);
    },
    [setEdges, onEdgeDataUpdate]
  );

  if (!selectedEdge || selectedNodeId !== null) return null;

  const data = (selectedEdge.data ?? {}) as Record<string, string | undefined>;

  return (
    <div className="w-56 rounded-xl border border-slate-200 bg-white shadow-lg p-3 nodrag nopan">
      <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
        <span className="material-icons-outlined text-slate-500 text-lg">timeline</span>
        Opções
      </h3>
      <div className="space-y-2.5">
        <div>
          <label className="text-[10px] text-slate-500 block mb-0.5">Tipo</label>
          <select
            value={data.pathType ?? 'step'}
            onChange={(e) =>
              updateEdge(selectedEdge.id, { pathType: e.target.value as WorkflowEdgePathType })
            }
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5"
          >
            <option value="straight">Reta</option>
            <option value="smooth">Curva</option>
            <option value="step">90°</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-500 block mb-0.5">Traço</label>
          <select
            value={data.strokeStyle ?? 'solid'}
            onChange={(e) =>
              updateEdge(selectedEdge.id, { strokeStyle: e.target.value as WorkflowEdgeStrokeStyle })
            }
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5"
          >
            <option value="solid">Sólida</option>
            <option value="dashed">Tracejada</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-500 block mb-0.5">Direção</label>
          <select
            value={data.showArrow === false ? 'none' : 'target'}
            onChange={(e) =>
              updateEdge(selectedEdge.id, { showArrow: e.target.value !== 'none' })
            }
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5"
          >
            <option value="target">Com indicador de direção</option>
            <option value="none">Sem indicador</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-500 block mb-0.5">Espessura</label>
          <select
            value={data.strokeWidth ?? 'medium'}
            onChange={(e) =>
              updateEdge(selectedEdge.id, { strokeWidth: e.target.value as WorkflowEdgeStrokeWidth })
            }
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5"
          >
            <option value="thin">Fina</option>
            <option value="medium">Média</option>
            <option value="thick">Grossa</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-500 block mb-0.5">Rótulo na linha</label>
          <input
            type="text"
            value={data.label ?? ''}
            onChange={(e) =>
              updateEdge(selectedEdge.id, { label: e.target.value || undefined })
            }
            placeholder="Ex.: Sucesso, Erro..."
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5"
          />
        </div>
        {((selectedEdge.data as Record<string, unknown>)?.stepOffset as number) !== 0 && (
          <button
            type="button"
            onClick={() => updateEdge(selectedEdge.id, { stepOffset: 0 })}
            className="text-[10px] text-slate-500 hover:text-slate-700 underline"
          >
            Resetar caminho
          </button>
        )}
      </div>
    </div>
  );
}

type FlowNodeData = {
  category: WorkflowNodeType;
  name: string;
  config: WorkflowNodeConfig;
  outputs: WorkflowNodeOutput[];
  inputs?: WorkflowNodeInput[];
  isEntry?: boolean;
  isFixed?: boolean;
  /** Quando true com isFixed, permite arrastar o nó (ex.: especialistas fixos em sem-tags) */
  draggable?: boolean;
};

type FlowNode = Node<FlowNodeData>;

const nodeVisuals: Record<
  WorkflowNodeType,
  { label: string; icon: string; handle: string; iconBg: string }
> = {
  function: {
    label: 'Função',
    icon: 'code',
    handle: '#3b82f6',
    iconBg: 'bg-blue-50',
  },
  router: {
    label: 'Agente roteador',
    icon: 'account_tree',
    handle: '#f97316',
    iconBg: 'bg-orange-50',
  },
  specialist: {
    label: 'Agente especialista',
    icon: 'smart_toy',
    handle: '#e11d48',
    iconBg: 'bg-rose-50',
  },
  tool: {
    label: 'Function call',
    icon: 'build',
    handle: '#16a34a',
    iconBg: 'bg-emerald-50',
  },
  recebe_mensagem: {
    label: 'Recebe mensagem',
    icon: 'login',
    handle: '#64748b',
    iconBg: 'bg-slate-100',
  },
  envia_mensagem: {
    label: 'Envia mensagem (apenas um no fluxo)',
    icon: 'send',
    handle: '#64748b',
    iconBg: 'bg-slate-100',
  },
  identifica_tag: {
    label: 'Identifica tag',
    icon: 'label',
    handle: '#3b82f6',
    iconBg: 'bg-blue-50',
  },
  adiciona_tag: {
    label: 'Adiciona tag',
    icon: 'label_off',
    handle: '#3b82f6',
    iconBg: 'bg-blue-50',
  },
  envia_mensagem_pronta: {
    label: 'Mensagem pronta',
    icon: 'mark_email_read',
    handle: '#3b82f6',
    iconBg: 'bg-blue-50',
  },
  tag_sim_nao: {
    label: 'Tag (Sim/Não)',
    icon: 'toggle_on',
    handle: '#3b82f6',
    iconBg: 'bg-blue-50',
  },
};

const defaultOutputs: Record<WorkflowNodeType, WorkflowNodeOutput[]> = {
  function: [
    { handle: 'success', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.function },
    { handle: 'fallback', isFallback: true, targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.function },
  ],
  router: [
    { handle: 'opcao_1', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.router },
    { handle: 'opcao_2', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.router },
  ],
  specialist: [{ handle: 'next', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.specialist }],
  tool: [
    { handle: 'success', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.tool },
    { handle: 'fallback', isFallback: true, targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.tool },
  ],
  recebe_mensagem: [{ handle: 'next', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.recebe_mensagem }],
  envia_mensagem: [],
  identifica_tag: [{ handle: 'next', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.identifica_tag }],
  adiciona_tag: [{ handle: 'next', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.adiciona_tag }],
  envia_mensagem_pronta: [],
  tag_sim_nao: [
    { handle: 'sim', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.tag_sim_nao },
    { handle: 'nao', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.tag_sim_nao, isFallback: true },
  ],
};

const WorkflowCanvasNode: React.FC<NodeProps<FlowNodeData>> = ({ id, data, selected }) => {
  const { deleteElements } = useReactFlow();
  const addPanel = useContext(AddPanelContext);
  const connectionPicker = useContext(ConnectionTargetPickerContext);
  const nodeSettingsPanel = useContext(NodeSettingsPanelContext);
  const info = nodeVisuals[data.category];
  const outputs = data.outputs ?? [];
  const dragFromPlusRef = React.useRef(false);
  const [plusButtonPressed, setPlusButtonPressed] = React.useState(false);
  const [hoveredOutputHandle, setHoveredOutputHandle] = React.useState<string | null>(null);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.isFixed) return;
    deleteElements({ nodes: [{ id }] });
  };

  const handleAddNext = (e: React.MouseEvent, sourceHandle: string) => {
    e.stopPropagation();
    addPanel?.openAddPanel(id, sourceHandle);
  };

  const isFixedNode = data.isFixed ?? false;
  const preventDrag = isFixedNode && (data.draggable !== true);

  const subtitle =
    data.category === 'recebe_mensagem'
      ? 'Início do fluxo'
      : data.category === 'envia_mensagem' || data.category === 'envia_mensagem_pronta'
        ? 'Fim do fluxo'
        : `${outputs.length} saída${outputs.length === 1 ? '' : 's'}`;

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    nodeSettingsPanel?.openNodeSettings(id);
  };

  const handleOutputHandleClick = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    connectionPicker?.openConnectionPicker(id, handle);
  };

  const isToolNode = data.category === 'tool';
  const nodeInputs = (data.inputs ?? defaultInputs[data.category] ?? []) as WorkflowNodeInput[];

  const specialistFunctionCallOutputs =
    data.category === 'specialist' ? outputs.filter((o) => isFunctionCallHandle(o.handle)) : [];
  const regularOutputs = outputs.filter((o) => isRegularOutputHandle(data.category, o));
  const functionCallSide = data.config?.functionCallSide as HandleSide | undefined;

  /** Overlay das function calls só quando o lado estiver definido */
  const specialistFcOnOverlay =
    functionCallSide === 'top' || functionCallSide === 'bottom'
      ? specialistFunctionCallOutputs
      : [];
  const specialistFcOnStrip =
    functionCallSide === 'left' || functionCallSide === 'right'
      ? specialistFunctionCallOutputs
      : [];

  const hasSpecialistFcStrip =
    data.category === 'specialist' && specialistFcOnStrip.length > 0;
  const hasSpecialistFcTopStrip =
    data.category === 'specialist' && specialistFcOnOverlay.length > 0 && functionCallSide === 'top';
  const hasSpecialistFcBottomStrip =
    data.category === 'specialist' && specialistFcOnOverlay.length > 0 && functionCallSide === 'bottom';
  const hasSpecialistFcHorizontalStrip = hasSpecialistFcTopStrip || hasSpecialistFcBottomStrip;
  const hasBottomOutputs = ['identifica_tag', 'router', 'adiciona_tag', 'recebe_mensagem', 'function', 'envia_mensagem', 'envia_mensagem_pronta', 'tag_sim_nao'].includes(data.category);
  const nodeWidth = hasBottomOutputs && regularOutputs.length > 1
    ? Math.max(BASE_NODE_WIDTH, 64 + regularOutputs.length * WIDTH_PER_OUTPUT)
    : BASE_NODE_WIDTH;
  const nodeContent = (
    <>
      <div
        className={`relative flex bg-white border border-slate-200 shadow-sm overflow-visible ${
          isToolNode
            ? 'w-[100px] h-[100px] rounded-full flex-col'
            : hasSpecialistFcStrip
              ? 'flex-row min-h-[152px] rounded-2xl'
              : 'flex-col min-h-[152px] rounded-2xl'
        } ${hasSpecialistFcHorizontalStrip ? 'flex-col' : ''} ${!isToolNode && !hasSpecialistFcStrip ? '' : ''} ${selected ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
        style={
          isToolNode
            ? undefined
            : hasSpecialistFcStrip
              ? { minWidth: BASE_NODE_WIDTH }
              : { width: nodeWidth, minWidth: nodeWidth }
        }
      >
        {/* Faixa superior: saídas FC no topo (mesma “divisão” que direita/esquerda) */}
        {hasSpecialistFcTopStrip && addPanel && (
          <div
            className="flex flex-row flex-shrink-0 min-h-9 border-b border-slate-200 bg-slate-50/50 justify-evenly items-center rounded-t-2xl"
            style={{ minWidth: BASE_NODE_WIDTH }}
          >
            {specialistFcOnOverlay.map((output, idx) => {
              const isPlusFree = !output.targetNodeId;
              return (
                <div
                  key={output.handle}
                  className={`flex items-center justify-center flex-1 min-h-[28px] relative ${isPlusFree ? (plusButtonPressed ? 'cursor-grabbing' : 'cursor-pointer hover:cursor-grab') : ''}`}
                  onMouseDown={() => {
                    dragFromPlusRef.current = false;
                    if (isPlusFree) setPlusButtonPressed(true);
                  }}
                  onMouseMove={() => { dragFromPlusRef.current = true; }}
                  onMouseUp={(e) => {
                    if (isPlusFree) setPlusButtonPressed(false);
                    if (!dragFromPlusRef.current && isPlusFree) {
                      e.stopPropagation();
                      handleAddNext(e, output.handle);
                    }
                  }}
                  onMouseLeave={() => { if (isPlusFree) setPlusButtonPressed(false); }}
                >
                  {addPanel && !output.targetNodeId ? (
                    <>
                      <Handle
                        type="source"
                        position={Position.Top}
                        id={output.handle}
                        isConnectableStart={false}
                        className="nopan !w-3 !h-3 !rounded-full !border-2 !border-white !bg-slate-400 cursor-pointer"
                        style={{ top: -2 }}
                        onMouseDown={(e) => handleOutputHandleClick(e as unknown as React.MouseEvent, output.handle)}
                      />
                      <button
                        type="button"
                        className="absolute w-6 h-6 rounded-full border border-slate-200 bg-white shadow-sm flex items-center justify-center text-slate-500 hover:border-slate-400 hover:bg-slate-50 transition-colors flex-shrink-0 cursor-pointer"
                        style={{ top: 4, left: '50%', transform: 'translateX(-50%)' }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAddNext(e, output.handle);
                        }}
                        title="Clique para adicionar Function call"
                      >
                        <span className="material-icons-outlined text-sm leading-none">add</span>
                      </button>
                    </>
                  ) : (
                    <Handle
                      type="source"
                      position={Position.Top}
                      id={output.handle}
                      isConnectableStart={false}
                      className="nopan !w-3 !h-3 !rounded-full !border-2 !border-white pointer-events-auto cursor-pointer"
                      style={{ background: info.handle }}
                      onMouseDown={(e) => handleOutputHandleClick(e as unknown as React.MouseEvent, output.handle)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* Parte esquerda: conteúdo principal */}
        <div
          className={`relative flex flex-col flex-1 min-w-0 overflow-visible rounded-2xl ${hasSpecialistFcStrip ? 'rounded-r-none' : ''} ${hasSpecialistFcTopStrip ? 'rounded-t-none' : ''} ${hasSpecialistFcBottomStrip ? 'rounded-b-none' : ''} ${isToolNode ? '' : 'rounded-2xl'}`}
        >
          {/* Handles de entrada: overlay absoluto para posicionar relativamente ao nó inteiro */}
          {nodeInputs.length > 0 && (
            <div className="absolute inset-0 pointer-events-none rounded-2xl">
              {nodeInputs.map((input, idx) => {
                const inputPosition =
                  nodeInputs.length === 1
                    ? (input.handlePosition ?? getDefaultInputPosition(data.category))
                    : getInputPositionForRender(input, nodeInputs, data.category, idx);
                return (
                  <Handle
                    key={input.handle}
                    type="target"
                    id={input.handle}
                    position={sideToPosition[inputPosition.side]}
                    className="!w-2.5 !h-2.5 !border-2 !border-white !bg-slate-400 pointer-events-auto"
                    style={getHandleStyle(inputPosition)}
                  />
                );
              })}
            </div>
          )}
          <div
            className={`flex flex-1 flex-col items-center justify-center text-center ${
              isToolNode ? 'p-2' : 'p-4'
            }`}
          >
            <div
              className={`flex-shrink-0 rounded-xl ${info.iconBg} flex items-center justify-center ${
                isToolNode ? 'w-8 h-8 mb-0.5' : 'w-11 h-11 mb-2'
              }`}
              style={{ color: info.handle }}
            >
              <span className={`material-icons-outlined ${isToolNode ? 'text-base' : 'text-xl'}`}>{info.icon}</span>
            </div>
            <p
              className={`font-medium text-slate-800 leading-tight px-0.5 ${
                isToolNode ? 'text-[10px] line-clamp-2' : 'text-sm line-clamp-2'
              }`}
            >
              {data.name || info.label}
            </p>
            {!isToolNode && (
              <p className="text-[11px] text-slate-500 mt-1">{subtitle}</p>
            )}
            {!data.isFixed && (
              <button
                type="button"
                onClick={handleRemove}
                className={`absolute flex items-center justify-center w-6 h-6 rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-50 hover:border-slate-300 text-slate-400 hover:text-slate-600 ${isToolNode ? 'top-0.5 right-0.5' : 'top-1 right-1'}`}
                title="Remover nó"
              >
                <span className={`material-icons-outlined ${isToolNode ? 'text-sm' : 'text-base'}`}>close</span>
              </button>
            )}
          </div>
        </div>
        {/* Faixa inferior: saídas FC embaixo (mesma “divisão” que direita/esquerda) */}
        {hasSpecialistFcBottomStrip && addPanel && (
          <div
            className="flex flex-row flex-shrink-0 min-h-9 border-t border-slate-200 bg-slate-50/50 justify-evenly items-center rounded-b-2xl"
            style={{ minWidth: BASE_NODE_WIDTH }}
          >
            {specialistFcOnOverlay.map((output) => {
              const isPlusFree = !output.targetNodeId;
              return (
                <div
                  key={output.handle}
                  className={`flex items-center justify-center flex-1 min-h-[28px] relative ${isPlusFree ? (plusButtonPressed ? 'cursor-grabbing' : 'cursor-pointer hover:cursor-grab') : ''}`}
                  onMouseDown={() => {
                    dragFromPlusRef.current = false;
                    if (isPlusFree) setPlusButtonPressed(true);
                  }}
                  onMouseMove={() => { dragFromPlusRef.current = true; }}
                  onMouseUp={(e) => {
                    if (isPlusFree) setPlusButtonPressed(false);
                    if (!dragFromPlusRef.current && isPlusFree) {
                      e.stopPropagation();
                      handleAddNext(e, output.handle);
                    }
                  }}
                  onMouseLeave={() => { if (isPlusFree) setPlusButtonPressed(false); }}
                >
                  {addPanel && !output.targetNodeId ? (
                    <>
                      <Handle
                        type="source"
                        position={Position.Bottom}
                        id={output.handle}
                        isConnectableStart={false}
                        className="nopan !w-3 !h-3 !rounded-full !border-2 !border-white !bg-slate-400 cursor-pointer"
                        style={{ bottom: -2 }}
                        onMouseDown={(e) => handleOutputHandleClick(e as unknown as React.MouseEvent, output.handle)}
                      />
                      <button
                        type="button"
                        className="absolute w-6 h-6 rounded-full border border-slate-200 bg-white shadow-sm flex items-center justify-center text-slate-500 hover:border-slate-400 hover:bg-slate-50 transition-colors flex-shrink-0 cursor-pointer"
                        style={{ bottom: 4, left: '50%', transform: 'translateX(-50%)' }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAddNext(e, output.handle);
                        }}
                        title="Clique para adicionar Function call"
                      >
                        <span className="material-icons-outlined text-sm leading-none">add</span>
                      </button>
                    </>
                  ) : (
                    <Handle
                      type="source"
                      position={Position.Bottom}
                      id={output.handle}
                      isConnectableStart={false}
                      className="nopan !w-3 !h-3 !rounded-full !border-2 !border-white pointer-events-auto cursor-pointer"
                      style={{ background: info.handle }}
                      onMouseDown={(e) => handleOutputHandleClick(e as unknown as React.MouseEvent, output.handle)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* Faixa lateral do especialista: saídas FC com lado esquerda/direita (ou não definido) */}
        {hasSpecialistFcStrip && specialistFcOnStrip.length > 0 && (
          <div
            className={`flex flex-col flex-shrink-0 w-12 border-slate-200 bg-slate-50/50 justify-evenly ${functionCallSide === 'right' ? 'border-l' : 'border-r order-first'}`}
            style={{ minHeight: specialistFcOnStrip.length * 32 }}
          >
            {specialistFcOnStrip.map((output) => {
              const isPlusFree = addPanel && !output.targetNodeId;
              return (
              <div
                key={output.handle}
                className={`flex items-center relative flex-1 min-h-[28px] ${functionCallSide === 'right' ? 'justify-end pr-0.5' : 'justify-start pl-0.5'} ${isPlusFree ? (plusButtonPressed ? 'cursor-grabbing' : 'cursor-pointer hover:cursor-grab') : ''}`}
                onMouseDown={() => {
                  dragFromPlusRef.current = false;
                  if (isPlusFree) setPlusButtonPressed(true);
                }}
                onMouseMove={() => { dragFromPlusRef.current = true; }}
                onMouseUp={(e) => {
                  if (isPlusFree) setPlusButtonPressed(false);
                  if (!dragFromPlusRef.current && isPlusFree) {
                    e.stopPropagation();
                    handleAddNext(e, output.handle);
                  }
                }}
                onMouseLeave={() => { if (isPlusFree) setPlusButtonPressed(false); }}
              >
                {functionCallSide === 'left' && !(addPanel && !output.targetNodeId) && (
                  <Handle
                    type="source"
                    position={Position.Left}
                    id={output.handle}
                    isConnectableStart={false}
                    className="nopan !w-2.5 !h-2.5 !border-2 !border-white !-left-1 cursor-pointer"
                    style={{ top: '50%', transform: 'translateY(-50%)', background: info.handle }}
                    onMouseDown={(e) => handleOutputHandleClick(e as unknown as React.MouseEvent, output.handle)}
                  />
                )}
                {addPanel && !output.targetNodeId ? (
                  <>
                    <Handle
                      type="source"
                      position={functionCallSide === 'right' ? Position.Right : Position.Left}
                      id={output.handle}
                      isConnectableStart={false}
                      className="nopan !w-3 !h-3 !rounded-full !border-2 !border-white !bg-slate-400 cursor-pointer"
                      style={{ [functionCallSide === 'right' ? 'right' : 'left']: -2, top: '50%', transform: 'translateY(-50%)' }}
                      onMouseDown={(e) => handleOutputHandleClick(e as unknown as React.MouseEvent, output.handle)}
                    />
                    <button
                      type="button"
                      className="absolute w-6 h-6 rounded-full border border-slate-200 bg-white shadow-sm flex items-center justify-center text-slate-500 hover:border-slate-400 hover:bg-slate-50 transition-colors flex-shrink-0 cursor-pointer"
                      style={{
                        [functionCallSide === 'right' ? 'right' : 'left']: 18,
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAddNext(e, output.handle);
                      }}
                      title="Clique para adicionar Function call"
                    >
                      <span className="material-icons-outlined text-sm leading-none">add</span>
                    </button>
                  </>
                ) : (
                  <>
                    {functionCallSide === 'left' && (
                      <Handle
                        type="source"
                        position={Position.Left}
                        id={output.handle}
                        className="!w-2.5 !h-2.5 !border-2 !border-white !-left-1"
                        style={{ top: '50%', transform: 'translateY(-50%)', background: info.handle }}
                      />
                    )}
                    {functionCallSide === 'right' && (
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={output.handle}
                        className="!w-2.5 !h-2.5 !border-2 !border-white !-right-1"
                        style={{ top: '50%', transform: 'translateY(-50%)', background: info.handle }}
                      />
                    )}
                  </>
                )}
              </div>
            );
            })}
          </div>
        )}
        {/* Bolinhas das saídas posicionadas na borda — no especialista com faixa FC, o overlay cobre só o conteúdo principal (sem a faixa) para centralizar igual à entrada */}
        {regularOutputs.length > 0 && addPanel && data.category !== 'tool' && data.category !== 'envia_mensagem_pronta' && (
          <div
            className="absolute pointer-events-none"
            style={
              data.category === 'specialist' && (hasSpecialistFcStrip || hasSpecialistFcTopStrip || hasSpecialistFcBottomStrip)
                ? {
                    top: hasSpecialistFcTopStrip ? SPECIALIST_STRIP_SIZE : 0,
                    right: hasSpecialistFcStrip && functionCallSide === 'right' ? SPECIALIST_STRIP_SIZE : 0,
                    bottom: hasSpecialistFcBottomStrip ? SPECIALIST_STRIP_SIZE : 0,
                    left: hasSpecialistFcStrip && functionCallSide === 'left' ? SPECIALIST_STRIP_SIZE : 0,
                  }
                : hasBottomOutputs && regularOutputs.length > 1
                  ? {
                      left: '50%',
                      top: 0,
                      right: 'auto',
                      bottom: 0,
                      width: nodeWidth,
                      transform: 'translateX(-50%)',
                    }
                  : { inset: 0 }
            }
          >
            {regularOutputs.map((output, index) => {
              const position =
                regularOutputs.length === 1
                  ? (output.handlePosition ?? getDefaultOutputPosition(data.category, 0, 1))
                  : getOutputPositionForRender(output, regularOutputs, data.category, index);
              const isFree = !output.targetNodeId;
              const showAdd =
                data.category === 'specialist'
                  ? false
                  : data.category === 'recebe_mensagem'
                    ? regularOutputs.length === 1 && isFree
                    : isFree;
              const baseHandleStyle = getHandleStyle(position);
              const handleStyle = {
                ...baseHandleStyle,
                ...(showAdd ? {} : { background: output.isFallback ? '#f97316' : info.handle }),
                transition: 'transform 150ms',
                transform: hoveredOutputHandle === output.handle
                  ? `${baseHandleStyle.transform ?? 'translateX(-50%)'} scale(1.25)`
                  : baseHandleStyle.transform ?? 'translateX(-50%)',
              };
              return (
                <React.Fragment key={output.handle}>
                  <Handle
                    type="source"
                    position={sideToPosition[position.side]}
                    id={output.handle}
                    isConnectableStart={false}
                    className={`nopan !w-3 !h-3 !rounded-full !border-2 !border-white cursor-pointer pointer-events-auto ${showAdd ? '!bg-slate-400' : ''}`}
                    style={handleStyle}
                    onMouseEnter={() => setHoveredOutputHandle(output.handle)}
                    onMouseLeave={() => setHoveredOutputHandle(null)}
                    onMouseDown={(e) => handleOutputHandleClick(e as unknown as React.MouseEvent, output.handle)}
                  />
                  {showAdd ? (
                    <button
                      type="button"
                      className="absolute w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center transition-opacity cursor-pointer hover:bg-slate-200 pointer-events-auto"
                      style={getPlusButtonStyle(position)}
                      title="Clique para adicionar nó"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddNext(e, output.handle);
                      }}
                    >
                      <span className="material-icons-outlined text-slate-500 text-base leading-none">add</span>
                    </button>
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
      {/* Handles para saídas de baixo quando não há painel (nó fixo etc.): pequenos círculos */}
      {regularOutputs.length > 0 && (!addPanel || data.category === 'tool' || data.category === 'envia_mensagem_pronta') &&
        regularOutputs.map((output, index) => {
          const position =
            regularOutputs.length === 1
              ? (output.handlePosition ?? getDefaultOutputPosition(data.category, 0, 1))
              : getOutputPositionForRender(output, regularOutputs, data.category, index);
          const baseStyle = getHandleStyle(position);
          const isHovered = hoveredOutputHandle === output.handle;
          return (
            <Handle
              key={output.handle}
              type="source"
              position={sideToPosition[position.side]}
              id={output.handle}
              isConnectableStart={false}
              className="nopan !w-2.5 !h-2.5 !border-2 !border-white cursor-pointer pointer-events-auto"
              style={{
                ...baseStyle,
                background: output.isFallback ? '#f97316' : info.handle,
                transition: 'transform 150ms',
                transform: isHovered
                  ? `${baseStyle.transform ?? 'translateX(-50%)'} scale(1.25)`
                  : baseStyle.transform ?? 'translateX(-50%)',
              }}
              onMouseEnter={() => setHoveredOutputHandle(output.handle)}
              onMouseLeave={() => setHoveredOutputHandle(null)}
              onMouseDown={(e) => handleOutputHandleClick(e as unknown as React.MouseEvent, output.handle)}
            />
          );
        })}
    </>
  );

  const growBothSides =
    hasBottomOutputs && regularOutputs.length > 1 && nodeWidth > BASE_NODE_WIDTH;
  const offsetLeft = growBothSides ? (nodeWidth - BASE_NODE_WIDTH) / 2 : 0;
  const outerStyle: React.CSSProperties =
    hasBottomOutputs && regularOutputs.length > 1
      ? {
          position: 'relative' as const,
          width: nodeWidth,
          minWidth: nodeWidth,
          ...(growBothSides ? { marginLeft: -offsetLeft } : {}),
        }
      : { position: 'relative' as const };

  return (
    <div
      className={`flex flex-col items-center ${preventDrag ? 'nodrag nopan' : ''}`}
      style={outerStyle}
      onDoubleClick={handleDoubleClick}
    >
      {nodeContent}
    </div>
  );
};

const nodeTypes = {
  workflowNode: WorkflowCanvasNode,
};

const edgeTypes = {
  excalidraw: ExcalidrawEdge,
  ghost: GhostConnectionEdgeComponent,
};

const createFixedNodes = (): FlowNode[] => [
  {
    id: RECEBE_MENSAGEM_ID,
    type: 'workflowNode',
    position: { x: 80, y: 40 },
    data: {
      category: 'recebe_mensagem',
      name: 'Recebe mensagem',
      config: {},
      outputs: withDefaultOutputPositions('recebe_mensagem', [
        { handle: 'next', targetNodeId: undefined },
      ]),
      isEntry: false,
      isFixed: true,
    },
  },
];

const definitionToFlow = (
  definition: WorkflowDefinition | null | undefined,
  entryNodeId?: string | null
): { nodes: FlowNode[]; edges: Edge[] } => {
  const fixedNodes = createFixedNodes();

  if (!definition?.nodes?.length) {
    return { nodes: fixedNodes, edges: [] };
  }

  const defNodes = definition.nodes;
  const recebeFromDef = defNodes.find((n) => n.id === RECEBE_MENSAGEM_ID);

  const fixedMerged: FlowNode[] = [
    recebeFromDef
      ? {
          id: RECEBE_MENSAGEM_ID,
          type: 'workflowNode',
          position: recebeFromDef.position ?? { x: 80, y: 40 },
          data: {
            category: 'recebe_mensagem',
            name: recebeFromDef.name || 'Recebe mensagem',
            config: recebeFromDef.config ?? {},
            outputs: withDefaultOutputPositions(
              'recebe_mensagem',
              recebeFromDef.outputs ?? [{ handle: 'next', targetNodeId: undefined }]
            ),
            isEntry: false,
            isFixed: true,
          },
        }
      : fixedNodes[0],
  ];

  const otherNodes = defNodes.filter((n) => n.id !== RECEBE_MENSAGEM_ID);
  const nodes: FlowNode[] = [
    ...fixedMerged,
    ...otherNodes.map((node, index) => {
      const inputsWithDefaults = withDefaultInputPositions(node.type, node.inputs ?? defaultInputs[node.type] ?? []);
      const inputSide = inputsWithDefaults[0]?.handlePosition?.side ?? getDefaultInputPosition(node.type).side;
      return {
        id: node.id,
        type: 'workflowNode',
        position: node.position ?? { x: 120 + index * 80, y: 80 + index * 40 },
        data: {
          category: node.type,
          name: node.name,
          config: node.config ?? {},
          outputs: withDefaultOutputPositions(node.type, node.outputs ?? defaultOutputs[node.type] ?? [], inputSide),
          inputs: inputsWithDefaults,
          isEntry: node.id === entryNodeId,
        },
      };
    }),
  ];

  const derivedEdges =
    definition.edges && definition.edges.length > 0
      ? definition.edges
      : definition.nodes.flatMap((node) =>
          (node.outputs ?? [])
            .filter((output) => output.targetNodeId)
            .map((output) => ({
              id: `${node.id}-${output.handle}-${output.targetNodeId}`,
              source: node.id,
              target: output.targetNodeId!,
              sourceHandle: output.handle,
              targetHandle: output.targetEntryName ?? 'entrada',
            }))
        );

  const nodeTypeById = new Map(defNodes.map((n) => [n.id, n.type]));
  const specialistIds = new Set(defNodes.filter((n) => n.type === 'specialist').map((n) => n.id));
  const fcEdgesBySpecialist: Record<string, WorkflowEdgeDefinition[]> = {};
  for (const e of derivedEdges) {
    const sourceType = nodeTypeById.get(e.source);
    if (e.target && specialistIds.has(e.target) && (sourceType === 'function' || sourceType === 'tool')) {
      if (!fcEdgesBySpecialist[e.target]) fcEdgesBySpecialist[e.target] = [];
      fcEdgesBySpecialist[e.target].push(e);
    }
  }
  for (const arr of Object.values(fcEdgesBySpecialist)) {
    arr.sort((a, b) =>
      `${a.source}-${a.sourceHandle ?? ''}`.localeCompare(`${b.source}-${b.sourceHandle ?? ''}`)
    );
  }
  const edgeToFcTargetHandle = new Map<string, string>();
  for (const [specialistId, fcEdges] of Object.entries(fcEdgesBySpecialist)) {
    fcEdges.forEach((edge, i) => {
      const edgeId = edge.id ?? `${edge.source}-${edge.sourceHandle ?? 'default'}-${edge.target}`;
      edgeToFcTargetHandle.set(edgeId, `${SPECIALIST_FC_INPUT_PREFIX}${i}`);
    });
  }

  const edges: Edge[] = derivedEdges.map((edge: WorkflowEdgeDefinition) => {
    const edgeId = edge.id ?? `${edge.source}-${edge.sourceHandle ?? 'default'}-${edge.target}`;
    const fcHandle = edgeToFcTargetHandle.get(edgeId);
    const targetHandle = fcHandle ?? edge.targetHandle;
    return {
      id: edgeId,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle,
      type: 'excalidraw',
      animated: false,
      deletable: true,
      data: {
        pathType: edge.pathType ?? 'step',
        strokeStyle: edge.strokeStyle ?? 'solid',
        strokeWidth: edge.strokeWidth ?? 'medium',
        label: edge.label,
        labelPosition: edge.labelPosition ?? 0.5,
        sourceOffset: edge.sourceOffset,
        targetOffset: edge.targetOffset,
        stepOffset: edge.stepOffset ?? 0,
        showArrow: edge.showArrow !== false,
      },
    };
  });

  const specialistFcInputsByNodeId: Record<string, WorkflowNodeInput[]> = {};
  for (const [specialistId, fcEdges] of Object.entries(fcEdgesBySpecialist)) {
    specialistFcInputsByNodeId[specialistId] = fcEdges.map((_, i) => ({
      handle: `${SPECIALIST_FC_INPUT_PREFIX}${i}`,
      name: 'Function call',
      acceptsFromType: ['function', 'tool'],
    }));
  }

  const nodesWithFcInputs: FlowNode[] = nodes.map((node) => {
    const fcInputs = specialistFcInputsByNodeId[node.id];
    if (!fcInputs?.length) return node;
    const baseInputs = (node.data.inputs ?? defaultInputs[node.data.category] ?? []) as WorkflowNodeInput[];
    const mainEntrada = baseInputs.find((i) => i.handle === 'entrada') ?? defaultInputs.specialist[0];
    const existingFc = baseInputs.filter((i) => isSpecialistFcInputHandle(i.handle));
    const mergedFc = fcInputs.map((fc) => existingFc.find((e) => e.handle === fc.handle) ?? fc);
    const fullInputs = [mainEntrada, ...mergedFc];
    return {
      ...node,
      data: {
        ...node.data,
        inputs: withDefaultInputPositions(node.data.category, fullInputs),
      },
    };
  });

  return { nodes: nodesWithFcInputs, edges };
};

const flowToDefinition = (nodes: FlowNode[], edges: Edge[]): WorkflowDefinition => ({
  version: 1,
  nodes: nodes.map((node) => ({
    id: node.id,
    type: node.data.category,
    name: node.data.name,
    config: node.data.config ?? {},
    outputs: (node.data.outputs ?? []).map((output) => ({
      handle: output.handle,
      targetNodeId: output.targetNodeId,
      conditionType: output.conditionType,
      conditionValue: output.conditionValue,
      isFallback: output.isFallback,
      targetEntryName: output.targetEntryName,
      targetEntryType: output.targetEntryType,
      handlePosition: output.handlePosition,
    })),
    inputs: (node.data.inputs ?? []).map((input) => ({
      handle: input.handle,
      name: input.name,
      acceptsFromType: input.acceptsFromType,
      autoLinked: input.autoLinked,
      sourceNodeId: input.sourceNodeId,
      sourceHandle: input.sourceHandle,
      handlePosition: input.handlePosition,
    })),
    position: node.position,
  })),
  edges: edges.map((edge) => {
    const d = edge.data as Record<string, unknown> | undefined;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      pathType: d?.pathType,
      strokeStyle: d?.strokeStyle,
      strokeWidth: d?.strokeWidth,
      label: d?.label,
      labelPosition: d?.labelPosition,
      sourceOffset: d?.sourceOffset,
      targetOffset: d?.targetOffset,
      stepOffset: d?.stepOffset,
      showArrow: d?.showArrow,
    };
  }),
});

const blankState = {
  nodes: createFixedNodes(),
  edges: [] as Edge[],
};

const getSnapshotFromState = (
  workflowId: string | null,
  name: string,
  description: string | null | undefined,
  entryNodeId: string | null,
  isActive: boolean,
  definition: WorkflowDefinition
): string =>
  JSON.stringify({
    workflowId,
    name: (name ?? '').trim(),
    description: (description ?? '').trim(),
    entryNodeId,
    isActive,
    definition,
  });

const INITIAL_NEW_SNAPSHOT = getSnapshotFromState(
  null,
  'Novo workflow',
  '',
  RECEBE_MENSAGEM_ID,
  true,
  flowToDefinition(createFixedNodes(), [])
);

export type WorkflowTabSchemaMode = {
  schemaId: string;
  schemaName: string;
  definition: string | undefined;
  schemaType?: 'sem-tags' | 'com-tags';
  onSave: (definition: string) => void;
};

const SEM_TAGS_ROUTER_ID = 'router-sem-tags-fixo';
const SEM_TAGS_SPECIALIST_1_ID = 'specialist-opcao-1';
const SEM_TAGS_SPECIALIST_2_ID = 'specialist-opcao-2';

const COM_TAGS_TAG_SIM_NAO_ID = 'tag-sim-nao-com-tags';
const COM_TAGS_IDENTIFICA_TAG_ID = 'identifica-tag-com-tags';
const COM_TAGS_ROUTER_ID = 'router-com-tags';

export type WorkflowTabProps = {
  schemaMode?: WorkflowTabSchemaMode;
};

export const WorkflowTab: React.FC<WorkflowTabProps> = ({ schemaMode }) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [workflowActiveFlag, setWorkflowActiveFlag] = useState(true);
  const [entryNodeId, setEntryNodeId] = useState<string | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>(INITIAL_NEW_SNAPSHOT);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [functionHandlers, setFunctionHandlers] = useState<WorkflowFunctionHandler[]>([]);
  const [specialists, setSpecialists] = useState<SpecialistAgent[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [functionCallNames, setFunctionCallNames] = useState<string[]>([]);
  const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);
  const [workflowValidationMap, setWorkflowValidationMap] = useState<Record<string, WorkflowValidationResult>>({});
  const [validationPopoverOpen, setValidationPopoverOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDefinition, setIsLoadingDefinition] = useState(false);
  const [workflowListOpen, setWorkflowListOpen] = useState(true);
  const [workflowSearchQuery, setWorkflowSearchQuery] = useState('');
  const [addPanelSourceNodeId, setAddPanelSourceNodeId] = useState<string | null>(null);
  const [addPanelSourceHandle, setAddPanelSourceHandle] = useState<string | null>(null);
  const [addPanelVisible, setAddPanelVisible] = useState(false);
  const [specialistTagChoicePending, setSpecialistTagChoicePending] = useState<{
    sourceNodeId: string;
    sourceHandle: string;
  } | null>(null);
  const [connectionPickerSource, setConnectionPickerSource] = useState<{ nodeId: string; handle: string } | null>(null);
  const [nodeSettingsPanelOpen, setNodeSettingsPanelOpen] = useState(false);
  const [nodeSettingsPanelAnimateIn, setNodeSettingsPanelAnimateIn] = useState(false);
  const [nodeSettingsPanelClosing, setNodeSettingsPanelClosing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editWorkflowId, setEditWorkflowId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isNewWorkflow, setIsNewWorkflow] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [functionParamsDraft, setFunctionParamsDraft] = useState('');
  const nodeSettingsPanelRef = React.useRef<HTMLDivElement | null>(null);
  const edgeReconnectSuccessfulRef = React.useRef(true);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<FlowNodeData>(blankState.nodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(blankState.edges);

  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const MAX_UNDO = 50;
  const undoStackRef = React.useRef<Array<{ nodes: FlowNode[]; edges: Edge[] }>>([]);
  const [canUndo, setCanUndo] = useState(false);

  const pushUndo = useCallback(() => {
    const snapshot = {
      nodes: JSON.parse(JSON.stringify(nodesRef.current)) as FlowNode[],
      edges: JSON.parse(JSON.stringify(edgesRef.current)) as Edge[],
    };
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setCanUndo(true);
  }, []);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop()!;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setCanUndo(undoStackRef.current.length > 0);
  }, [setNodes, setEdges]);

  /** No modo sem-tags/com-tags, impede remoção das linhas fixas do template */
  const onEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChangeBase>[0]) => {
      if (schemaMode?.schemaType === 'sem-tags') {
        const isFixedEdge = (e: Edge) =>
          (e.source === RECEBE_MENSAGEM_ID && e.target === SEM_TAGS_ROUTER_ID) ||
          e.target === ENVIA_MENSAGEM_ID;
        const fixedEdgeIds = new Set(edges.filter((e) => isFixedEdge(e)).map((e) => e.id));
        const filtered = changes.filter((ch) => {
          if (ch.type === 'remove' && ch.id && fixedEdgeIds.has(ch.id)) return false;
          return true;
        });
        if (filtered.length > 0) {
          pushUndo();
          onEdgesChangeBase(filtered);
        }
        return;
      }
      if (schemaMode?.schemaType === 'com-tags') {
        const isFixedEdge = (e: Edge) =>
          (e.source === RECEBE_MENSAGEM_ID && e.target === COM_TAGS_TAG_SIM_NAO_ID) ||
          (e.source === COM_TAGS_TAG_SIM_NAO_ID && e.target === COM_TAGS_IDENTIFICA_TAG_ID) ||
          (e.source === COM_TAGS_TAG_SIM_NAO_ID && e.target === COM_TAGS_ROUTER_ID);
        const fixedEdgeIds = new Set(edges.filter((e) => isFixedEdge(e)).map((e) => e.id));
        const filtered = changes.filter((ch) => {
          if (ch.type === 'remove' && ch.id && fixedEdgeIds.has(ch.id)) return false;
          return true;
        });
        if (filtered.length > 0) {
          pushUndo();
          onEdgesChangeBase(filtered);
        }
        return;
      }
      if (changes.length > 0) pushUndo();
      onEdgesChangeBase(changes);
    },
    [onEdgesChangeBase, schemaMode?.schemaType, edges, pushUndo]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNodeData>[]) => {
      const fixedNodeIds = schemaMode?.schemaType === 'sem-tags'
        ? [RECEBE_MENSAGEM_ID, SEM_TAGS_ROUTER_ID, ENVIA_MENSAGEM_ID]
        : schemaMode?.schemaType === 'com-tags'
          ? [RECEBE_MENSAGEM_ID, COM_TAGS_TAG_SIM_NAO_ID, COM_TAGS_IDENTIFICA_TAG_ID, COM_TAGS_ROUTER_ID]
          : [RECEBE_MENSAGEM_ID];
      const filtered = changes.filter((ch) => {
        if (ch.type === 'remove' && ch.id && fixedNodeIds.includes(ch.id)) return false;
        return true;
      });
      if (filtered.length > 0) pushUndo();
      const removeChanges = filtered.filter((ch): ch is Extract<typeof ch, { type: 'remove' }> => ch.type === 'remove');
      const removedIds = removeChanges.map((ch) => ch.id);
      let otherChanges = filtered.filter((ch) => ch.type !== 'remove');

      const positionChanges = filtered.filter(
        (ch): ch is Extract<typeof ch, { type: 'position'; id: string; position?: { x: number; y: number } }> =>
          ch.type === 'position' && !!ch.id
      );
      if (positionChanges.length > 0) {
        const nodeIdToDelta = new Map<string, { x: number; y: number }>();
        for (const ch of positionChanges) {
          const node = nodes.find((n) => n.id === ch.id);
          if (node && ch.position) {
            nodeIdToDelta.set(ch.id, {
              x: ch.position.x - node.position.x,
              y: ch.position.y - node.position.y,
            });
          }
        }
        // Com-tags: restringir arraste ao setor (coluna) do tipo do nó
        if (schemaMode?.schemaType === 'com-tags') {
          otherChanges = otherChanges.map((ch) => {
            if (ch.type === 'position' && ch.id && ch.position) {
              const node = nodes.find((n) => n.id === ch.id);
              const category = node?.data?.category;
              if (category) {
                const clamped = clampPositionToComTagsSector(ch.position, category);
                return { ...ch, position: clamped };
              }
            }
            return ch;
          });
        }
      }

      if (removedIds.length > 0) {
        const edgesAfterRemove = edges.filter(
          (e) => !removedIds.includes(e.source) && !removedIds.includes(e.target)
        );
        const nodesAfterRemove = nodes.filter((n) => !removedIds.includes(n.id));
        const orphanEnviaIds = new Set(
          nodesAfterRemove
            .filter(
              (n) =>
                n.data?.category === 'envia_mensagem' &&
                !edgesAfterRemove.some((e) => e.target === n.id)
            )
            .map((n) => n.id)
        );
        setEdges((eds) =>
          eds.filter(
            (e) =>
              !removedIds.includes(e.source) &&
              !removedIds.includes(e.target) &&
              !orphanEnviaIds.has(e.target)
          )
        );
        const enviaIdsToUpdate = nodesAfterRemove
          .filter((n) => n.data?.category === 'envia_mensagem' && !orphanEnviaIds.has(n.id))
          .map((n) => n.id);
        setNodes((nds) => {
          const afterRemove = nds.filter((n) => !removedIds.includes(n.id));
          const afterOrphan = afterRemove.filter((n) => !orphanEnviaIds.has(n.id));
          return afterOrphan.map((n) => {
            const outputsUpdated = (n.data.outputs ?? []).map((o) =>
              o.targetNodeId &&
              (removedIds.includes(o.targetNodeId) || orphanEnviaIds.has(o.targetNodeId))
                ? { ...o, targetNodeId: undefined }
                : o
            );
            if (n.data?.category === 'envia_mensagem') {
              const handlesWithEdge = new Set(
                edgesAfterRemove.filter((e) => e.target === n.id).map((e) => e.targetHandle ?? '')
              );
              const inputsFiltered = (n.data.inputs ?? []).filter((inp) => handlesWithEdge.has(inp.handle));
              const enviaDefaultSide = schemaMode?.schemaType === 'com-tags' ? COM_TAGS_SECTORS.envia_mensagem.input.side : 'top';
              const currentEnviaSide = (n.data.inputs?.[0]?.handlePosition?.side ?? enviaDefaultSide) as HandleSide;
              const inputsRecentered = inputsFiltered.map((inp, i) => {
                const pos = schemaMode?.schemaType === 'com-tags'
                  ? getComTagsInputPosition('envia_mensagem', i, inputsFiltered.length)
                  : { side: currentEnviaSide, offset: (i + 1) / (inputsFiltered.length + 1) };
                return { ...inp, handlePosition: pos };
              });
              return { ...n, data: { ...n.data, outputs: outputsUpdated, inputs: inputsRecentered } };
            }
            return { ...n, data: { ...n.data, outputs: outputsUpdated } };
          });
        });
        if (enviaIdsToUpdate.length > 0 && updateNodeInternalsRef.current) {
          requestAnimationFrame(() => updateNodeInternalsRef.current(enviaIdsToUpdate));
        }
        // Não chamar onNodesChangeBase(removeChanges): já removemos os nós e limpamos os outputs acima
      }
      if (otherChanges.length > 0) onNodesChangeBase(otherChanges);
    },
    [onNodesChangeBase, setEdges, setNodes, schemaMode?.schemaType, pushUndo, nodes]
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const fixedNodeIds = useMemo(
    () =>
      schemaMode?.schemaType === 'sem-tags'
        ? [RECEBE_MENSAGEM_ID, SEM_TAGS_ROUTER_ID, ENVIA_MENSAGEM_ID]
        : schemaMode?.schemaType === 'com-tags'
          ? [RECEBE_MENSAGEM_ID, COM_TAGS_TAG_SIM_NAO_ID, COM_TAGS_IDENTIFICA_TAG_ID, COM_TAGS_ROUTER_ID]
          : [RECEBE_MENSAGEM_ID],
    [schemaMode?.schemaType]
  );

  const deleteSelectedNodes = useCallback(() => {
    const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
    const idsToRemove =
      selectedIds.length > 0 ? selectedIds : selectedNodeId ? [selectedNodeId] : [];
    const removable = idsToRemove.filter((id) => !fixedNodeIds.includes(id));
    if (removable.length === 0) return;
    setConnectionPickerSource(null);
    const edgesAfterRemove = edges.filter(
      (e) => !removable.includes(e.source) && !removable.includes(e.target)
    );
    const nodesAfterRemove = nodes.filter((n) => !removable.includes(n.id));
    const orphanEnviaIds = new Set(
      nodesAfterRemove
        .filter(
          (n) =>
            n.data?.category === 'envia_mensagem' &&
            !edgesAfterRemove.some((e) => e.target === n.id)
        )
        .map((n) => n.id)
    );
    const enviaIdsToUpdate = nodesAfterRemove
      .filter((n) => n.data?.category === 'envia_mensagem' && !orphanEnviaIds.has(n.id))
      .map((n) => n.id);
    setEdges((eds) =>
      eds.filter(
        (e) =>
          !removable.includes(e.source) &&
          !removable.includes(e.target) &&
          !orphanEnviaIds.has(e.target)
      )
    );
    setNodes((nds) => {
      const afterRemove = nds.filter((n) => !removable.includes(n.id));
      const afterOrphan = afterRemove.filter((n) => !orphanEnviaIds.has(n.id));
      return afterOrphan.map((n) => {
        const outputsUpdated = (n.data.outputs ?? []).map((o) =>
          o.targetNodeId && (removable.includes(o.targetNodeId) || orphanEnviaIds.has(o.targetNodeId))
            ? { ...o, targetNodeId: undefined }
            : o
        );
        if (n.data?.category === 'envia_mensagem') {
          const handlesWithEdge = new Set(
            edgesAfterRemove.filter((e) => e.target === n.id).map((e) => e.targetHandle ?? '')
          );
          const inputsFiltered = (n.data.inputs ?? []).filter((inp) => handlesWithEdge.has(inp.handle));
          const enviaDefaultSide = schemaMode?.schemaType === 'com-tags' ? COM_TAGS_SECTORS.envia_mensagem.input.side : 'top';
          const currentEnviaSide = (n.data.inputs?.[0]?.handlePosition?.side ?? enviaDefaultSide) as HandleSide;
          const inputsRecentered = inputsFiltered.map((inp, i) => {
            const pos = schemaMode?.schemaType === 'com-tags'
              ? getComTagsInputPosition('envia_mensagem', i, inputsFiltered.length)
              : { side: currentEnviaSide, offset: (i + 1) / (inputsFiltered.length + 1) };
            return { ...inp, handlePosition: pos };
          });
          return { ...n, data: { ...n.data, outputs: outputsUpdated, inputs: inputsRecentered } };
        }
        return { ...n, data: { ...n.data, outputs: outputsUpdated } };
      });
    });
    if (enviaIdsToUpdate.length > 0 && updateNodeInternalsRef.current) {
      requestAnimationFrame(() => updateNodeInternalsRef.current(enviaIdsToUpdate));
    }
    if (removable.includes(selectedNodeId ?? '') || orphanEnviaIds.has(selectedNodeId ?? '')) setSelectedNodeId(null);
  }, [
    nodes,
    edges,
    selectedNodeId,
    fixedNodeIds,
    setEdges,
    setNodes,
    schemaMode?.schemaType,
  ]);

  const hasRemovableSelectedNodes = useMemo(() => {
    const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
    const ids =
      selectedIds.length > 0 ? selectedIds : selectedNodeId ? [selectedNodeId] : [];
    return ids.some((id) => !fixedNodeIds.includes(id));
  }, [nodes, selectedNodeId, fixedNodeIds]);

  const hasUnsavedChanges = useMemo(() => {
    const def = flowToDefinition(nodes, edges);
    if (schemaMode) {
      return JSON.stringify(def) !== lastSavedSnapshot;
    }
    const effectiveEntry =
      entryNodeId ?? (nodes.some((n) => n.id === RECEBE_MENSAGEM_ID) ? RECEBE_MENSAGEM_ID : null);
    const current = getSnapshotFromState(
      currentWorkflowId,
      workflowName,
      workflowDescription,
      effectiveEntry,
      workflowActiveFlag,
      def
    );
    return current !== lastSavedSnapshot;
  }, [
    nodes,
    edges,
    workflowName,
    workflowDescription,
    entryNodeId,
    workflowActiveFlag,
    currentWorkflowId,
    lastSavedSnapshot,
    schemaMode,
  ]);

  const handleEdgeDataUpdate = useCallback(
    (edgeId: string, dataUpdate: Record<string, unknown>) => {
      setEdges((eds) =>
        eds.map((ed) =>
          ed.id === edgeId
            ? { ...ed, data: { ...(ed.data ?? {}), ...dataUpdate } }
            : ed
        )
      );
    },
    [setEdges]
  );

  // Contexto com edges do pai para a edge ler dados atualizados (contorna store do React Flow)
  const edgesFromParent = useMemo(
    () => ({ edges, onEdgeDataUpdate: handleEdgeDataUpdate }),
    [edges, handleEdgeDataUpdate]
  );

  useEffect(() => {
    if (addPanelSourceNodeId) {
      setAddPanelVisible(false);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setAddPanelVisible(true));
      });
      return () => cancelAnimationFrame(id);
    } else {
      setAddPanelVisible(false);
    }
  }, [addPanelSourceNodeId]);

  useEffect(() => {
    if (nodeSettingsPanelOpen && selectedNodeId) {
      setNodeSettingsPanelAnimateIn(false);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setNodeSettingsPanelAnimateIn(true));
      });
      return () => cancelAnimationFrame(id);
    } else {
      setNodeSettingsPanelAnimateIn(false);
    }
  }, [nodeSettingsPanelOpen, selectedNodeId]);

  useEffect(() => {
    if (!nodeSettingsPanelClosing) return;
    const t = setTimeout(() => {
      setNodeSettingsPanelClosing(false);
      setSelectedNodeId(null);
    }, 300);
    return () => clearTimeout(t);
  }, [nodeSettingsPanelClosing]);

  const closeNodeSettingsPanel = useCallback(() => {
    setNodeSettingsPanelOpen(false);
    setNodeSettingsPanelClosing(true);
  }, []);

  const openNodeSettings = useCallback((nodeId: string) => {
    setAddPanelSourceNodeId(null);
    setAddPanelVisible(false);
    setNodeSettingsPanelClosing(false);
    setSelectedNodeId(nodeId);
    setNodeSettingsPanelOpen(true);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      setIsLoading(true);
      try {
        if (schemaMode) {
          const [handlers, specialistList, routerList, functionConfigs] = await Promise.all([
            workflowService.getFunctionHandlers(),
            multiAgentService.getSpecialists(),
            multiAgentService.getRouters(),
            functionCallConfigService.getAll(),
          ]);
          setFunctionHandlers(handlers);
          setSpecialists(specialistList);
          setRouters(routerList);
          setFunctionCallNames(
            functionConfigs
              .filter((configItem: FunctionCallConfig) => configItem.isActive !== false)
              .map((configItem) => configItem.functionCallName)
          );
          let def: WorkflowDefinition | null = null;
          const hasDefinition = !!schemaMode.definition?.trim();
          if (hasDefinition) {
            try {
              def = JSON.parse(schemaMode.definition!) as WorkflowDefinition;
            } catch {
              def = null;
            }
          }
          if (!hasDefinition && schemaMode.schemaType === 'sem-tags') {
            const firstRouter = routerList[0];
            const recebeY = 40;
            const recebeH = SPECIALIST_NODE_HEIGHT;
            const gap = 56;
            const routerY = recebeY + recebeH + gap;
            def = {
              version: 1,
              nodes: [
                {
                  id: RECEBE_MENSAGEM_ID,
                  type: 'recebe_mensagem',
                  name: 'Recebe mensagem',
                  config: {},
                  outputs: [{ handle: 'next', targetNodeId: SEM_TAGS_ROUTER_ID }],
                  position: { x: 80, y: recebeY },
                },
                {
                  id: SEM_TAGS_ROUTER_ID,
                  type: 'router',
                  name: firstRouter ? `${firstRouter.name}` : 'Agente roteador 2',
                  config: { routerId: firstRouter?.id ?? null },
                  outputs: [
                    { handle: 'opcao_1', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.router },
                    { handle: 'opcao_2', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.router },
                  ],
                  inputs: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['recebe_mensagem'] }],
                  position: { x: 80, y: routerY },
                },
              ],
              edges: [
                {
                  id: `${RECEBE_MENSAGEM_ID}-next-${SEM_TAGS_ROUTER_ID}`,
                  source: RECEBE_MENSAGEM_ID,
                  target: SEM_TAGS_ROUTER_ID,
                  sourceHandle: 'next',
                  targetHandle: 'entrada',
                },
              ],
            };
          } else if (!hasDefinition && schemaMode.schemaType === 'com-tags') {
            const firstRouter = routerList[0];
            const recebeY = 40;
            const recebeH = SPECIALIST_NODE_HEIGHT;
            const gap = 56;
            const tagY = recebeY + recebeH + gap;
            const branchY = tagY + SPECIALIST_NODE_HEIGHT + gap;
            def = {
              version: 1,
              nodes: [
                {
                  id: RECEBE_MENSAGEM_ID,
                  type: 'recebe_mensagem',
                  name: 'Recebe mensagem',
                  config: {},
                  outputs: [{ handle: 'next', targetNodeId: COM_TAGS_TAG_SIM_NAO_ID, handlePosition: getComTagsOutputPosition('recebe_mensagem', 'next', 0, 1) }],
                  position: { x: COM_TAGS_NEUTRAL_CENTER_X, y: recebeY },
                },
                {
                  id: COM_TAGS_TAG_SIM_NAO_ID,
                  type: 'tag_sim_nao',
                  name: 'Tag (Sim/Não) 2',
                  config: {},
                  outputs: [
                    { handle: 'sim', targetNodeId: COM_TAGS_IDENTIFICA_TAG_ID, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.identifica_tag, handlePosition: getComTagsOutputPosition('tag_sim_nao', 'sim', 0, 2) },
                    { handle: 'nao', targetNodeId: COM_TAGS_ROUTER_ID, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.router, handlePosition: getComTagsOutputPosition('tag_sim_nao', 'nao', 1, 2) },
                  ],
                  inputs: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['recebe_mensagem', 'identifica_tag', 'router'], handlePosition: getComTagsInputPosition('tag_sim_nao', 0, 1) }],
                  position: { x: COM_TAGS_BLUE_CENTER_X, y: tagY },
                },
                {
                  id: COM_TAGS_IDENTIFICA_TAG_ID,
                  type: 'identifica_tag',
                  name: 'Identifica tag 3',
                  config: {},
                  outputs: [{ handle: 'next', targetNodeId: undefined, handlePosition: getComTagsOutputPosition('identifica_tag', 'next', 0, 1) }],
                  inputs: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['tag_sim_nao', 'adiciona_tag'], handlePosition: getComTagsInputPosition('identifica_tag', 0, 1) }],
                  position: { x: COM_TAGS_BLUE_CENTER_X, y: branchY },
                },
                {
                  id: COM_TAGS_ROUTER_ID,
                  type: 'router',
                  name: firstRouter ? `${firstRouter.name}` : 'Agente roteador 4',
                  config: { routerId: firstRouter?.id ?? null },
                  outputs: [
                    { handle: 'opcao_1', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.router, handlePosition: getComTagsOutputPosition('router', 'opcao_1', 0, 2) },
                    { handle: 'opcao_2', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.router, handlePosition: getComTagsOutputPosition('router', 'opcao_2', 1, 2) },
                  ],
                  inputs: [{ handle: 'entrada', name: 'Entrada', acceptsFromType: ['recebe_mensagem', 'identifica_tag', 'router', 'tag_sim_nao'], handlePosition: getComTagsInputPosition('router', 0, 1) }],
                  position: { x: COM_TAGS_ORANGE_CENTER_X, y: branchY },
                },
              ],
              edges: [
                { id: `${RECEBE_MENSAGEM_ID}-next-${COM_TAGS_TAG_SIM_NAO_ID}`, source: RECEBE_MENSAGEM_ID, target: COM_TAGS_TAG_SIM_NAO_ID, sourceHandle: 'next', targetHandle: 'entrada' },
                { id: `${COM_TAGS_TAG_SIM_NAO_ID}-sim-${COM_TAGS_IDENTIFICA_TAG_ID}`, source: COM_TAGS_TAG_SIM_NAO_ID, target: COM_TAGS_IDENTIFICA_TAG_ID, sourceHandle: 'sim', targetHandle: 'entrada' },
                { id: `${COM_TAGS_TAG_SIM_NAO_ID}-nao-${COM_TAGS_ROUTER_ID}`, source: COM_TAGS_TAG_SIM_NAO_ID, target: COM_TAGS_ROUTER_ID, sourceHandle: 'nao', targetHandle: 'entrada' },
              ],
            };
          }
          const { nodes: flowNodes, edges: flowEdges } = definitionToFlow(
            def ?? undefined,
            RECEBE_MENSAGEM_ID
          );
          const nodesWithFixed = schemaMode.schemaType === 'sem-tags'
            ? flowNodes.map((n) => {
                const isFixedNode = n.id === RECEBE_MENSAGEM_ID || n.id === SEM_TAGS_ROUTER_ID;
                const isSemTagsFixedSpecialist =
                  n.id === SEM_TAGS_SPECIALIST_1_ID || n.id === SEM_TAGS_SPECIALIST_2_ID;
                const isSemTagsEnviaMensagem = n.id === ENVIA_MENSAGEM_ID;
                return {
                  ...n,
                  draggable: !isFixedNode,
                  data: {
                    ...n.data,
                    isFixed: isFixedNode || isSemTagsFixedSpecialist || isSemTagsEnviaMensagem ? true : n.data.isFixed,
                    draggable: isSemTagsFixedSpecialist || isSemTagsEnviaMensagem ? true : n.data.draggable,
                  },
                };
              })
            : schemaMode.schemaType === 'com-tags'
              ? flowNodes.map((n) => {
                  const comTagsFixedNotMovable =
                    n.id === RECEBE_MENSAGEM_ID ||
                    n.id === COM_TAGS_TAG_SIM_NAO_ID ||
                    n.id === COM_TAGS_IDENTIFICA_TAG_ID;
                  const comTagsRouter = n.id === COM_TAGS_ROUTER_ID;
                  const isTemplateNode = comTagsFixedNotMovable || comTagsRouter;
                  return {
                    ...n,
                    draggable: comTagsRouter ? true : !comTagsFixedNotMovable,
                    data: {
                      ...n.data,
                      isFixed: isTemplateNode ? true : n.data.isFixed,
                      draggable: comTagsRouter ? true : n.data.draggable,
                    },
                  };
                })
              : flowNodes;
          undoStackRef.current = [];
          setCanUndo(false);
          setNodes(nodesWithFixed);
          setEdges(flowEdges);
          setEntryNodeId(RECEBE_MENSAGEM_ID);
          setIsNewWorkflow(false);
          setCurrentWorkflowId(null);
          const snapshotDef = flowToDefinition(nodesWithFixed, flowEdges);
          setLastSavedSnapshot(JSON.stringify(snapshotDef));
          if (!hasDefinition && (schemaMode.schemaType === 'sem-tags' || schemaMode.schemaType === 'com-tags')) {
            schemaMode.onSave(JSON.stringify(snapshotDef));
          }
        } else {
          const [workflowList, config, handlers, specialistList, routerList, functionConfigs] =
            await Promise.all([
              workflowService.list(),
              multiAgentService.getConfig(),
              workflowService.getFunctionHandlers(),
              multiAgentService.getSpecialists(),
              multiAgentService.getRouters(),
              functionCallConfigService.getAll(),
            ]);

          setWorkflows(workflowList);
          setActiveWorkflowId(config.workflowId ?? null);
          setFunctionHandlers(handlers);
          setSpecialists(specialistList);
          setRouters(routerList);
          setFunctionCallNames(
            functionConfigs
              .filter((configItem: FunctionCallConfig) => configItem.isActive !== false)
              .map((configItem) => configItem.functionCallName)
          );

          const initialWorkflowId = config.workflowId ?? workflowList[0]?.id ?? null;
          if (initialWorkflowId) {
            await loadWorkflow(initialWorkflowId);
          } else if (workflowList.length === 0) {
            setCurrentWorkflowId(null);
            setWorkflowName('Novo workflow');
            setWorkflowDescription('');
            setWorkflowActiveFlag(true);
            setEntryNodeId(null);
            setIsNewWorkflow(false);
            setValidationResult(null);
            setSelectedNodeId(null);
            undoStackRef.current = [];
            setCanUndo(false);
            setNodes(createFixedNodes());
            setEdges([]);
          } else {
            resetCanvas();
          }
        }
      } catch (error: any) {
        console.error('Erro ao carregar workflows', error);
        toast.error(error.response?.data?.error || 'Erro ao carregar workflows');
        resetCanvas();
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, [schemaMode?.schemaId, schemaMode?.definition]);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isEntry: node.id === entryNodeId,
        },
      }))
    );
  }, [entryNodeId, setNodes]);

  useEffect(() => {
    if (selectedNode?.data.category === 'function') {
      setFunctionParamsDraft(JSON.stringify(selectedNode.data.config?.params ?? {}, null, 2));
    } else {
      setFunctionParamsDraft('');
    }
  }, [selectedNode?.id, selectedNode?.data.category, selectedNode?.data.config?.params]);

  const loadWorkflow = useCallback(
    async (workflowId: string) => {
      setIsLoadingDefinition(true);
      try {
        const workflow = await workflowService.getById(workflowId);
        setCurrentWorkflowId(workflow.id);
        setWorkflowName(workflow.name);
        setWorkflowDescription(workflow.description ?? '');
        setWorkflowActiveFlag(workflow.isActive);
        setEntryNodeId(workflow.entryNodeId ?? null);
        setIsNewWorkflow(false);

        const { nodes: flowNodes, edges: flowEdges } = definitionToFlow(
          workflow.definition,
          workflow.entryNodeId
        );
        undoStackRef.current = [];
        setCanUndo(false);
        setNodes(flowNodes);
        setEdges(flowEdges);

        const validation = await workflowService.validateDefinition(
          workflow.definition,
          workflow.entryNodeId ?? null
        );
        setWorkflowValidationMap((m) => ({ ...m, [workflow.id]: validation }));
        setValidationResult(validation);
        setLastSavedSnapshot(
          getSnapshotFromState(
            workflow.id,
            workflow.name,
            workflow.description ?? '',
            workflow.entryNodeId ?? null,
            workflow.isActive,
            flowToDefinition(flowNodes, flowEdges)
          )
        );
      } catch (error: any) {
        console.error('Erro ao carregar workflow', error);
        toast.error(error.response?.data?.error || 'Erro ao carregar workflow');
      } finally {
        setIsLoadingDefinition(false);
      }
    },
    [setEdges, setNodes]
  );

  const resetCanvas = () => {
    setCurrentWorkflowId(null);
    setWorkflowName('Novo workflow');
    setWorkflowDescription('');
    setWorkflowActiveFlag(true);
    setEntryNodeId(RECEBE_MENSAGEM_ID);
    setIsNewWorkflow(true);
    setValidationResult(null);
    setSelectedNodeId(null);
    undoStackRef.current = [];
    setCanUndo(false);
    setNodes(createFixedNodes());
    setEdges([]);
    setLastSavedSnapshot(INITIAL_NEW_SNAPSHOT);
  };

  const handleOpenCreateModal = () => {
    setNewWorkflowName('');
    setShowCreateModal(true);
  };

  const handleConfirmCreateWorkflow = async () => {
    const name = newWorkflowName.trim();
    if (!name) {
      toast.error('Informe o nome do workflow');
      return;
    }
    setIsCreatingWorkflow(true);
    try {
      const initialDef = flowToDefinition(createFixedNodes(), []);
      const created = await workflowService.create({
        name,
        description: null,
        entryNodeId: null,
        definition: { nodes: initialDef.nodes, edges: [] },
        isActive: false,
      });
      setWorkflows((list) => [created, ...list]);
      setShowCreateModal(false);
      setNewWorkflowName('');
      await loadWorkflow(created.id);
      toast.success('Workflow criado. Adicione nós ao fluxo.');
    } catch (error: any) {
      console.error('Erro ao criar workflow', error);
      toast.error(error.response?.data?.error || 'Erro ao criar workflow');
    } finally {
      setIsCreatingWorkflow(false);
    }
  };

  const handleOpenEditModal = (e: React.MouseEvent, workflow: Workflow) => {
    e.stopPropagation();
    setEditWorkflowId(workflow.id);
    setEditName(workflow.name);
    setEditDescription(workflow.description ?? '');
    setShowEditModal(true);
  };

  const handleSaveEditModal = async () => {
    if (!editWorkflowId) return;
    if (!editName.trim()) {
      toast.error('O nome é obrigatório');
      return;
    }
    setIsSavingEdit(true);
    try {
      const updated = await workflowService.update(editWorkflowId, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      });
      setWorkflows((list) => list.map((wf) => (wf.id === updated.id ? updated : wf)));
      if (currentWorkflowId === editWorkflowId) {
        setWorkflowName(updated.name);
        setWorkflowDescription(updated.description ?? '');
      }
      setShowEditModal(false);
      setEditWorkflowId(null);
      toast.success('Workflow atualizado');
    } catch (error: any) {
      console.error('Erro ao atualizar workflow', error);
      toast.error(error.response?.data?.error || 'Erro ao atualizar');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const hasEnviaMensagemNode = useCallback(
    (workflowId: string): boolean => {
      if (workflowId === currentWorkflowId) {
        return nodes.some((n) => n.data?.category === 'envia_mensagem');
      }
      const w = workflows.find((wf) => wf.id === workflowId);
      const defNodes = w?.definition?.nodes ?? [];
      return defNodes.some((n: { type?: string }) => n.type === 'envia_mensagem');
    },
    [currentWorkflowId, nodes, workflows]
  );

  const handleToggleWorkflowActive = async (e: React.MouseEvent, workflowId: string) => {
    e.stopPropagation();
    const isCurrentlyActive = activeWorkflowId === workflowId;
    if (!isCurrentlyActive && workflowValidationMap[workflowId]?.valid === false) {
      toast.error('Corrija os erros do workflow para ativá-lo.');
      return;
    }
    try {
      if (isCurrentlyActive) {
        await multiAgentService.updateConfig({ workflowId: null });
        setActiveWorkflowId(null);
        toast.success('Workflow desabilitado');
      } else {
        if (!hasEnviaMensagemNode(workflowId)) {
          toast.error('Adicione um nó "Envia mensagem" ao fluxo antes de habilitar o workflow.');
          return;
        }
        await multiAgentService.updateConfig({ workflowId });
        setActiveWorkflowId(workflowId);
        toast.success('Workflow habilitado');
      }
    } catch (error: any) {
      console.error('Erro ao alternar workflow', error);
      toast.error(error.response?.data?.error || 'Erro ao alternar workflow');
    }
  };

  const addNode = useCallback(
    (category: WorkflowNodeType, sourceNodeId?: string, sourceHandle?: string) => {
      pushUndo();
      const sourceNode = sourceNodeId ? nodes.find((n) => n.id === sourceNodeId) : null;
      const defaultName = `${nodeVisuals[category].label} ${nodes.length + 1}`;
      const nodeId = uuidv4();
      const outputsBase = (defaultOutputs[category] ?? []).map((output, index) => ({
        ...output,
        handle: output.handle ?? `out_${index + 1}`,
      }));
      // Sem-tags: envia_mensagem_pronta precisa de saída 'next' para auto-link ao Envia mensagem
      const effectiveOutputsBase =
        schemaMode?.schemaType === 'sem-tags' && category === 'envia_mensagem_pronta' && outputsBase.length === 0
          ? [{ handle: 'next', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.envia_mensagem_pronta }]
          : outputsBase;

      // MODO AUTO: criar entrada vinculada quando o nó vem do "+" — entrada espelhada com a saída
      let inputs: WorkflowNodeInput[];
      let mirroredInputPosition: HandlePosition | null = null;
      if (sourceNodeId && sourceNode && sourceHandle) {
        const sourceOutput = sourceNode.data?.outputs?.find((o) => o.handle === sourceHandle);
        const entryName = sourceOutput?.targetEntryName ?? 'entrada';
        // Lado da saída de origem (ex.: bottom) → entrada do nó novo no lado oposto (ex.: top)
        const sourceLayout = defaultHandleLayout[sourceNode.data.category] ?? { output: 'bottom' as HandleSide };
        const sourceSide: HandleSide =
          sourceOutput?.handlePosition?.side ??
          (sourceNode.data?.category === 'specialist' && sourceHandle && isFunctionCallHandle(sourceHandle)
            ? ((sourceNode.data?.config?.functionCallSide as HandleSide) ?? sourceLayout.output)
            : sourceLayout.output);
        const mirroredSide = oppositeHandleSide[sourceSide];
        mirroredInputPosition = { side: mirroredSide, offset: DEFAULT_HANDLE_OFFSET };
        inputs = [
          {
            handle: 'entrada',
            name: entryName,
            acceptsFromType: [sourceNode.data.category],
            autoLinked: true,
            sourceNodeId,
            sourceHandle,
            handlePosition: mirroredInputPosition,
          },
        ];
      } else {
        // Nó criado solto (sem +): entrada neutra padrão
        inputs = (defaultInputs[category] ?? []).map((input) => ({ ...input }));
      }
      let inputsWithPositions = withDefaultInputPositions(category, inputs);
      // Garantir entrada espelhada na criação pelo "+" (todos os nós: especialista, tool, etc.)
      if (mirroredInputPosition && inputsWithPositions.length > 0) {
        inputsWithPositions = inputsWithPositions.map((inp, i) =>
          i === 0 ? { ...inp, handlePosition: mirroredInputPosition } : inp
        );
      }
      // Saída no lado oposto à entrada na criação
      const inputSide = inputsWithPositions[0]?.handlePosition?.side ?? getDefaultInputPosition(category).side;
      let outputs = withDefaultOutputPositions(category, effectiveOutputsBase, inputSide);

      // Modo com-tags: usar setor do especialista (saída à esquerda)
      const comTagsSpecialistLinkEnvia = schemaMode?.schemaType === 'com-tags' && category === 'specialist';
      if (comTagsSpecialistLinkEnvia) {
        const nextPos = getComTagsOutputPosition('specialist', 'next', 0, 1);
        outputs = outputs.map((out) =>
          out.handle === 'next' ? { ...out, handlePosition: nextPos } : out
        );
      }

      let position: { x: number; y: number };
      let directionForFree: HandleSide = 'bottom';
      if (
        category === 'tool' &&
        sourceNode &&
        sourceNode.data?.category === 'specialist' &&
        sourceHandle &&
        isFunctionCallHandle(sourceHandle)
      ) {
        const side = (sourceNode.data.config?.functionCallSide as HandleSide) ?? 'right';
        directionForFree = side;
        const existingCount = edges.filter(
          (e) => e.source === sourceNodeId && e.sourceHandle && isFunctionCallHandle(e.sourceHandle)
        ).length;
        const step = FUNCTION_CALL_NODE_WIDTH + GAP_BETWEEN_TOOLS;
        const specialistRect = getRectForExistingNode(sourceNode);
        const sx = specialistRect.x;
        const sy = specialistRect.y;
        const sw = specialistRect.width;
        const sh = specialistRect.height;
        switch (side) {
          case 'right':
            position = {
              x: sx + sw + GAP_SPECIALIST_TO_FC + existingCount * step,
              y: sy + (sh - FUNCTION_CALL_NODE_WIDTH) / 2,
            };
            break;
          case 'left':
            position = {
              x: sx - GAP_SPECIALIST_TO_FC - FUNCTION_CALL_NODE_WIDTH - existingCount * step,
              y: sy + (sh - FUNCTION_CALL_NODE_WIDTH) / 2,
            };
            break;
          case 'top':
            position = {
              x: sx + (sw - FUNCTION_CALL_NODE_WIDTH) / 2,
              y: sy - GAP_SPECIALIST_TO_FC - FUNCTION_CALL_NODE_WIDTH - existingCount * step,
            };
            break;
          case 'bottom':
            position = {
              x: sx + (sw - FUNCTION_CALL_NODE_WIDTH) / 2,
              y: sy + sh + GAP_SPECIALIST_TO_FC + existingCount * step,
            };
            break;
          default:
            position = {
              x: sx + sw + GAP_SPECIALIST_TO_FC + existingCount * step,
              y: sy + (sh - FUNCTION_CALL_NODE_WIDTH) / 2,
            };
        }
        position = findFreePositionNear(
          position,
          directionForFree,
          category,
          nodes,
          edges,
          undefined,
          30,
          schemaMode?.schemaType === 'com-tags' ? getComTagsSectorBounds(category) ?? undefined : undefined
        );
      } else if (sourceNode) {
        const sourceRect = getRectForExistingNode(sourceNode);
        const sourceOutput = sourceNode.data?.outputs?.find((o) => o.handle === sourceHandle);
        const sourceLayout = defaultHandleLayout[sourceNode.data?.category ?? 'router'] ?? { output: 'bottom' as HandleSide };
        const sourceSide: HandleSide =
          sourceOutput?.handlePosition?.side ??
          (sourceNode.data?.category === 'specialist' && sourceHandle && isFunctionCallHandle(sourceHandle)
            ? ((sourceNode.data?.config?.functionCallSide as HandleSide) ?? sourceLayout.output)
            : sourceLayout.output);
        directionForFree = sourceSide;
        const newSize = NODE_SIZE_BY_CATEGORY[category] ?? { w: BASE_NODE_WIDTH, h: SPECIALIST_NODE_HEIGHT };
        const gap =
          sourceNode.data?.category === 'router' && category === 'specialist'
            ? GAP_ROUTER_TO_SPECIALIST
            : GAP_NEXT_NODE;
        switch (sourceSide) {
          case 'bottom':
            position = {
              x: sourceRect.x + (sourceRect.width - newSize.w) / 2,
              y: sourceRect.y + sourceRect.height + gap,
            };
            break;
          case 'top':
            position = {
              x: sourceRect.x + (sourceRect.width - newSize.w) / 2,
              y: sourceRect.y - newSize.h - gap,
            };
            break;
          case 'right':
            position = {
              x: sourceRect.x + sourceRect.width + gap,
              y: sourceRect.y + (sourceRect.height - newSize.h) / 2,
            };
            break;
          case 'left':
            position = {
              x: sourceRect.x - newSize.w - gap,
              y: sourceRect.y + (sourceRect.height - newSize.h) / 2,
            };
            break;
          default:
            position = {
              x: sourceRect.x + (sourceRect.width - newSize.w) / 2,
              y: sourceRect.y + sourceRect.height + gap,
            };
        }
        position = findFreePositionNear(
          position,
          directionForFree,
          category,
          nodes,
          edges,
          undefined,
          50,
          schemaMode?.schemaType === 'com-tags' ? getComTagsSectorBounds(category) ?? undefined : undefined
        );
      } else {
        position = { x: 120 + nodes.length * 50, y: 120 + nodes.length * VERTICAL_GAP_NEXT };
        position = findFreePositionNear(
          position,
          'right',
          category,
          nodes,
          edges,
          undefined,
          30,
          schemaMode?.schemaType === 'com-tags' ? getComTagsSectorBounds(category) ?? undefined : undefined
        );
      }
      if (schemaMode?.schemaType === 'com-tags') {
        position = clampPositionToComTagsSector(position, category);
      }
      const newNode: FlowNode = {
        id: nodeId,
        type: 'workflowNode',
        position,
        data: {
          category,
          name: defaultName,
          config: {},
          outputs,
          inputs: inputsWithPositions,
          isEntry: entryNodeId === nodeId,
        },
      };

      if (sourceNodeId && sourceNode) {
        const sourceOutputs = sourceNode.data?.outputs ?? [];
        const handle =
          sourceHandle &&
          (sourceOutputs.some((o) => o.handle === sourceHandle && !o.targetNodeId) ||
            !sourceOutputs.some((o) => o.handle === sourceHandle))
            ? sourceHandle
            : sourceOutputs.find((o) => !o.targetNodeId)?.handle;
        const enviaNode = nodes.find((n) => n.id === ENVIA_MENSAGEM_ID);
        const semTagsLinkToEnvia =
          (schemaMode?.schemaType === 'sem-tags' || schemaMode?.schemaType === 'com-tags') &&
          (category === 'specialist' || category === 'envia_mensagem_pronta');
        const existingEnviaHandles = new Set((enviaNode?.data?.inputs ?? []).map((inp) => inp.handle));
        let nextEntradaIndex = 1;
        while (existingEnviaHandles.has(`entrada_${nextEntradaIndex}`)) nextEntradaIndex++;
        const nextEntradaHandle = semTagsLinkToEnvia ? `entrada_${nextEntradaIndex}` : null;
        const createEnviaMensagemNode = semTagsLinkToEnvia && !enviaNode;
        if (handle) {
          const fcSide = (sourceNode.data?.config?.functionCallSide as HandleSide) ?? 'right';
          const updatedSourceOutputs = (() => {
            const outs = sourceOutputs;
            const hasHandle = outs.some((o) => o.handle === handle);
            const newOutputPayload = {
              handle,
              targetNodeId: nodeId,
              ...(sourceNode.data?.category === 'specialist' && isFunctionCallHandle(handle)
                ? { handlePosition: { side: fcSide, offset: 0.5 } }
                : {}),
            };
            return hasHandle
              ? outs.map((o) => (o.handle === handle ? { ...o, targetNodeId: nodeId } : o))
              : [...outs, newOutputPayload];
          })();
          setNodes((nds) => {
            const withSource = nds.map((n) => {
              if (n.id !== sourceNodeId) {
                if (nextEntradaHandle && n.id === ENVIA_MENSAGEM_ID) {
                  const currentInputs = n.data?.inputs ?? [];
                  const defaultSide = schemaMode?.schemaType === 'com-tags' ? COM_TAGS_SECTORS.envia_mensagem.input.side : 'top';
                  const currentSide = (currentInputs[0]?.handlePosition?.side ?? defaultSide) as HandleSide;
                  const pos = schemaMode?.schemaType === 'com-tags'
                    ? getComTagsInputPosition('envia_mensagem', currentInputs.length, currentInputs.length + 1)
                    : { side: currentSide, offset: (currentInputs.length + 1) / (currentInputs.length + 2) };
                  const newInput = {
                    handle: nextEntradaHandle,
                    name: `Entrada ${nextEntradaIndex}`,
                    acceptsFromType: ['specialist', 'envia_mensagem_pronta'] as WorkflowNodeType[],
                    handlePosition: pos,
                  };
                  return {
                    ...n,
                    data: { ...n.data, inputs: [...currentInputs, newInput] },
                  };
                }
                return n;
              }
              return {
                ...n,
                data: { ...n.data, outputs: updatedSourceOutputs },
              };
            });
            const toAdd: FlowNode[] = [newNode];
            if (createEnviaMensagemNode) {
              const newHeight = NODE_SIZE_BY_CATEGORY[category]?.h ?? SPECIALIST_NODE_HEIGHT;
              const enviaInputPos = schemaMode?.schemaType === 'com-tags'
                ? getComTagsInputPosition('envia_mensagem', 0, 1)
                : { side: 'top' as HandleSide, offset: 0.5 };
              toAdd.push({
                id: ENVIA_MENSAGEM_ID,
                type: 'workflowNode',
                position: {
                  x: newNode.position.x,
                  y: newNode.position.y + newHeight + 40,
                },
                data: {
                  category: 'envia_mensagem',
                  name: 'Envia mensagem',
                  config: {},
                  outputs: [],
                  inputs: [
                    {
                      handle: 'entrada_1',
                      name: 'Entrada 1',
                      acceptsFromType: ['specialist', 'envia_mensagem_pronta'] as WorkflowNodeType[],
                      handlePosition: enviaInputPos,
                    },
                  ],
                  isFixed: true,
                  draggable: true,
                },
              });
            }
            return withSource.concat(...toAdd);
          });
          const newEdge: Edge = {
            source: sourceNodeId,
            sourceHandle: handle,
            target: nodeId,
            targetHandle: 'entrada',
            id: `${sourceNodeId}-${handle}-${nodeId}`,
            type: 'excalidraw',
            deletable: true,
            data: {
              pathType: 'step',
              strokeStyle: 'solid',
              strokeWidth: 'medium',
              labelPosition: 0.5,
              showArrow: true,
            },
          };
          // Forçar o React Flow a reconhecer os novos handles e adicionar as arestas
          requestAnimationFrame(() => {
            if (updateNodeInternalsRef.current) {
              updateNodeInternalsRef.current(sourceNodeId);
              // Quando linkamos ao Envia mensagem (novo input), avisar o React Flow para registrar o handle antes da aresta
              if (nextEntradaHandle) {
                updateNodeInternalsRef.current(ENVIA_MENSAGEM_ID);
              }
            }
            // Segundo rAF quando há link ao Envia mensagem: dar tempo do nó re-renderizar com o novo handle antes de adicionar a aresta
            const addEdges = () => {
              setEdges((eds) => {
                let next = eds;
                const exists = eds.some(
                  (e) =>
                    e.source === sourceNodeId &&
                    e.sourceHandle === handle &&
                    e.target === nodeId
                );
                if (!exists) next = [...next, newEdge];
                if (nextEntradaHandle) {
                  const enviaEdge: Edge = {
                    source: nodeId,
                    sourceHandle: 'next',
                    target: ENVIA_MENSAGEM_ID,
                    targetHandle: nextEntradaHandle,
                    id: `${nodeId}-next-${ENVIA_MENSAGEM_ID}-${nextEntradaHandle}`,
                    type: 'excalidraw',
                    deletable: false,
                    data: {
                      pathType: 'step',
                      strokeStyle: 'solid',
                      strokeWidth: 'medium',
                      labelPosition: 0.5,
                      showArrow: true,
                    },
                  };
                  const enviaExists = next.some(
                    (e) => e.source === nodeId && e.target === ENVIA_MENSAGEM_ID && e.targetHandle === nextEntradaHandle
                  );
                  if (!enviaExists) next = [...next, enviaEdge];
                }
                return next;
              });
            };
            if (nextEntradaHandle) {
              requestAnimationFrame(addEdges);
            } else {
              addEdges();
            }
          });
        } else {
          setNodes((nds) => nds.concat(newNode));
        }
      } else {
        setNodes((nds) => nds.concat(newNode));
      }
    },
    [nodes, edges, entryNodeId, setEdges, setNodes, pushUndo, schemaMode?.schemaType]
  );

  /** Com-tags: ao adicionar especialista com tag a partir do router: Adiciona tag → Identifica tag (nova entrada) → nova saída no Identifica tag → Especialista → Envia mensagem */
  const addSpecialistWithTagFromRouter = useCallback(
    (routerNodeId: string, routerHandle: string) => {
      const routerNode = nodes.find((n) => n.id === routerNodeId);
      const identificaNode = nodes.find((n) => n.id === COM_TAGS_IDENTIFICA_TAG_ID);
      const enviaNode = nodes.find((n) => n.id === ENVIA_MENSAGEM_ID);
      if (!routerNode || !identificaNode || routerNode.data?.category !== 'router') return;
      pushUndo();
      const routerRect = getRectForExistingNode(routerNode);
      const gap = GAP_NEXT_NODE;
      const adicionaTagId = uuidv4();
      const specialistId = uuidv4();
      const identificaInputs = identificaNode.data?.inputs ?? defaultInputs.identifica_tag ?? [];
      const nextInputHandle = identificaInputs.length === 0 ? 'entrada' : `entrada_${identificaInputs.length + 1}`;
      const identificaOutputs = identificaNode.data?.outputs ?? [{ handle: 'next', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.identifica_tag }];
      const nextOutputIndex = identificaOutputs.filter((o) => o.handle?.startsWith('opcao_')).length + 1;
      const newOutputHandle = `opcao_${nextOutputIndex}`;
      const specialistCount = nodes.filter((n) => n.data?.category === 'specialist').length + 1;
      const specialistName = `Agente especialista ${specialistCount}`;
      const existingEnviaInputs = (enviaNode?.data?.inputs ?? []).map((inp) => inp.handle);
      let nextEntradaIndex = 1;
      while (existingEnviaInputs.includes(`entrada_${nextEntradaIndex}`)) nextEntradaIndex++;
      const nextEntradaHandle = `entrada_${nextEntradaIndex}`;
      const createEnvia = !enviaNode;

      let adicionaTagPosition = {
        x: routerRect.x + (routerRect.width - BASE_NODE_WIDTH) / 2,
        y: routerRect.y + routerRect.height + gap,
      };
      adicionaTagPosition = clampPositionToComTagsSector(adicionaTagPosition, 'adiciona_tag');
      let specialistPosition = {
        x: adicionaTagPosition.x,
        y: adicionaTagPosition.y + SPECIALIST_NODE_HEIGHT + gap,
      };
      specialistPosition = clampPositionToComTagsSector(specialistPosition, 'specialist');
      const enviaPosition = createEnvia
        ? clampPositionToComTagsSector(
            { x: specialistPosition.x, y: specialistPosition.y + SPECIALIST_NODE_HEIGHT + 40 },
            'envia_mensagem'
          )
        : null;

      const newAdicionaTagNode: FlowNode = {
        id: adicionaTagId,
        type: 'workflowNode',
        position: adicionaTagPosition,
        data: {
          category: 'adiciona_tag',
          name: 'Adiciona tag',
          config: {},
          outputs: [
            { handle: 'next', targetNodeId: COM_TAGS_IDENTIFICA_TAG_ID, targetEntryName: nextInputHandle, targetEntryType: allowedTargetTypes.identifica_tag, handlePosition: { side: 'left' as HandleSide, offset: 0.5 } },
          ],
          inputs: [
            { handle: 'entrada', name: 'Entrada', acceptsFromType: ['router', 'specialist'], autoLinked: true, sourceNodeId: routerNodeId, sourceHandle: routerHandle, handlePosition: { side: 'top' as HandleSide, offset: 0.5 } },
          ],
        },
      };

      const newSpecialistNode: FlowNode = {
        id: specialistId,
        type: 'workflowNode',
        position: specialistPosition,
        data: {
          category: 'specialist',
          name: specialistName,
          config: {},
          outputs: [
            { handle: 'next', targetNodeId: ENVIA_MENSAGEM_ID, targetEntryName: nextEntradaHandle, targetEntryType: allowedTargetTypes.envia_mensagem, handlePosition: { side: 'left' as HandleSide, offset: 0.5 } },
          ],
          inputs: [
            { handle: 'entrada', name: specialistName, acceptsFromType: ['identifica_tag'], autoLinked: true, sourceNodeId: COM_TAGS_IDENTIFICA_TAG_ID, sourceHandle: newOutputHandle, handlePosition: { side: 'right' as HandleSide, offset: 0.5 } },
          ],
        },
      };

      const enviaNodeToAdd: FlowNode | null = createEnvia && enviaPosition
        ? {
            id: ENVIA_MENSAGEM_ID,
            type: 'workflowNode',
            position: enviaPosition,
            data: {
              category: 'envia_mensagem',
              name: 'Envia mensagem',
              config: {},
              outputs: [],
              inputs: [
                { handle: 'entrada_1', name: 'Entrada 1', acceptsFromType: ['specialist', 'envia_mensagem_pronta'], handlePosition: getComTagsInputPosition('envia_mensagem', 0, 1) },
              ],
              isFixed: true,
              draggable: true,
            },
          }
        : null;

      setNodes((nds) => {
        const updated = nds.map((n) => {
          if (n.id === routerNodeId) {
            const outs = (n.data?.outputs ?? []).map((o) =>
              o.handle === routerHandle ? { ...o, targetNodeId: adicionaTagId, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.adiciona_tag } : o
            );
            return { ...n, data: { ...n.data, outputs: outs } };
          }
          if (n.id === COM_TAGS_IDENTIFICA_TAG_ID) {
            const currentInputs = n.data?.inputs ?? [];
            const currentOutputs = n.data?.outputs ?? [];
            const newInputPos = getComTagsInputPosition('identifica_tag', currentInputs.length, currentInputs.length + 1);
            const newOutputPos = getComTagsOutputPosition('identifica_tag', newOutputHandle, currentOutputs.length, currentOutputs.length + 1);
            const newInput = {
              handle: nextInputHandle,
              name: `Entrada ${currentInputs.length + 1}`,
              acceptsFromType: ['tag_sim_nao', 'adiciona_tag'],
              handlePosition: newInputPos,
            };
            const newOutputs = [
              ...currentOutputs,
              { handle: newOutputHandle, name: specialistName, targetNodeId: specialistId, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.specialist, handlePosition: newOutputPos },
            ];
            return {
              ...n,
              data: {
                ...n.data,
                inputs: [...currentInputs, newInput],
                outputs: newOutputs,
              },
            };
          }
          if (enviaNode && n.id === ENVIA_MENSAGEM_ID) {
            const currentInputs = n.data?.inputs ?? [];
            const newInputPos = getComTagsInputPosition('envia_mensagem', currentInputs.length, currentInputs.length + 1);
            const newInput = {
              handle: nextEntradaHandle,
              name: `Entrada ${nextEntradaIndex}`,
              acceptsFromType: ['specialist', 'envia_mensagem_pronta'],
              handlePosition: newInputPos,
            };
            return { ...n, data: { ...n.data, inputs: [...currentInputs, newInput] } };
          }
          return n;
        });
        const toAdd: FlowNode[] = [newAdicionaTagNode, newSpecialistNode];
        if (enviaNodeToAdd) toAdd.push(enviaNodeToAdd);
        return updated.concat(toAdd);
      });

      const newEdges: Edge[] = [
        { id: `${routerNodeId}-${routerHandle}-${adicionaTagId}`, source: routerNodeId, target: adicionaTagId, sourceHandle: routerHandle, targetHandle: 'entrada', type: 'excalidraw', deletable: true, data: { pathType: 'step', strokeStyle: 'solid', strokeWidth: 'medium', labelPosition: 0.5, showArrow: true } },
        { id: `${adicionaTagId}-next-${COM_TAGS_IDENTIFICA_TAG_ID}-${nextInputHandle}`, source: adicionaTagId, target: COM_TAGS_IDENTIFICA_TAG_ID, sourceHandle: 'next', targetHandle: nextInputHandle, type: 'excalidraw', deletable: true, data: { pathType: 'step', strokeStyle: 'solid', strokeWidth: 'medium', labelPosition: 0.5, showArrow: true } },
        { id: `${COM_TAGS_IDENTIFICA_TAG_ID}-${newOutputHandle}-${specialistId}`, source: COM_TAGS_IDENTIFICA_TAG_ID, target: specialistId, sourceHandle: newOutputHandle, targetHandle: 'entrada', type: 'excalidraw', deletable: true, data: { pathType: 'step', strokeStyle: 'solid', strokeWidth: 'medium', labelPosition: 0.5, showArrow: true } },
        { id: `${specialistId}-next-${ENVIA_MENSAGEM_ID}-${nextEntradaHandle}`, source: specialistId, target: ENVIA_MENSAGEM_ID, sourceHandle: 'next', targetHandle: nextEntradaHandle, type: 'excalidraw', deletable: false, data: { pathType: 'step', strokeStyle: 'solid', strokeWidth: 'medium', labelPosition: 0.5, showArrow: true } },
      ];

      requestAnimationFrame(() => {
        if (updateNodeInternalsRef.current) {
          updateNodeInternalsRef.current([routerNodeId, COM_TAGS_IDENTIFICA_TAG_ID, adicionaTagId, specialistId, ENVIA_MENSAGEM_ID]);
        }
        setEdges((eds) => {
          const ids = new Set(newEdges.map((e) => e.id));
          const kept = eds.filter((e) => !ids.has(e.id));
          return [...kept, ...newEdges];
        });
      });
    },
    [nodes, setNodes, setEdges, pushUndo]
  );

  /**
   * Validação de conexão: verifica se a saída pode conectar no nó de destino
   * Regras:
   * 1. A saída deve ter targetEntryType definido
   * 2. O tipo do nó de destino deve estar na lista de tipos permitidos
   * 3. Se a entrada do destino tiver acceptsFromType, o tipo de origem deve estar na lista
   */
  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !connection.sourceHandle) return false;
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      const sourceCategory = sourceNode.data?.category;
      const targetCategory = targetNode.data?.category;

      // Conexão specialist (saída function call) -> tool: sempre permitir (overlay do especialista conta como especialista)
      if (
        sourceCategory === 'specialist' &&
        targetCategory === 'tool' &&
        isFunctionCallHandle(connection.sourceHandle)
      ) {
        return true;
      }

      // Buscar a saída de origem
      const sourceOutput = sourceNode.data?.outputs?.find((o) => o.handle === connection.sourceHandle);
      if (!sourceOutput) return false;

      // Verificar se o tipo do nó de destino está na lista de tipos permitidos
      let allowedTypes = sourceOutput.targetEntryType;
      // Normalizar: se targetEntryType é string (ex: 'router'), usar allowedTargetTypes para permitir tipos corretos
      if (allowedTypes && typeof allowedTypes === 'string' && allowedTypes in allowedTargetTypes) {
        allowedTypes = allowedTargetTypes[allowedTypes as WorkflowNodeType];
      }
      if (allowedTypes) {
        const typesArray = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
        if (!typesArray.includes(targetCategory)) {
          return false;
        }
      }

      // Verificar se a entrada do destino aceita o tipo de origem
      const targetInputs = targetNode.data?.inputs ?? defaultInputs[targetCategory] ?? [];
      const targetInput = targetInputs.find((i) => i.handle === (connection.targetHandle ?? 'entrada')) ?? targetInputs[0];
      const defaultAccepts = defaultInputs[targetCategory]?.[0]?.acceptsFromType ?? [];
      const effectiveAccepts = [
        ...new Set([
          ...(targetInput?.acceptsFromType ?? []),
          ...defaultAccepts,
        ]),
      ];
      if (effectiveAccepts.length > 0 && !effectiveAccepts.includes(sourceCategory)) {
        return false;
      }

      return true;
    },
    [nodes]
  );

  /** Retorna os nós existentes que podem ser conectados à saída especificada (para as linhas fantasmas) */
  const getValidTargetsWithHandles = useCallback(
    (sourceNodeId: string, sourceHandle: string): { node: Node<FlowNodeData>; targetHandle: string }[] => {
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return [];
      const valid: { node: Node<FlowNodeData>; targetHandle: string }[] = [];
      for (const targetNode of nodes) {
        if (targetNode.id === sourceNodeId) continue;
        if (!isValidConnection({ source: sourceNodeId, sourceHandle, target: targetNode.id, targetHandle: undefined }))
          continue;
        const isFcToSpecialist =
          targetNode.data?.category === 'specialist' &&
          (sourceNode.data?.category === 'function' || sourceNode.data?.category === 'tool');
        let targetHandle = 'entrada';
        if (isFcToSpecialist) {
          const existingFcToSpecialist = edges.filter((e) => {
            if (e.target !== targetNode.id) return false;
            const src = nodes.find((n) => n.id === e.source);
            return src?.data?.category === 'function' || src?.data?.category === 'tool';
          });
          targetHandle = `${SPECIALIST_FC_INPUT_PREFIX}${existingFcToSpecialist.length}`;
        }
        // Só incluir se a entrada do destino estiver vazia (sem edge conectada)
        const entradaOcupada = edges.some(
          (e) => e.target === targetNode.id && (e.targetHandle ?? 'entrada') === targetHandle
        );
        if (entradaOcupada) continue;
        valid.push({ node: targetNode, targetHandle });
      }
      return valid;
    },
    [nodes, edges, isValidConnection]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !connection.sourceHandle) return;
      pushUndo();
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      const isFcToSpecialist =
        targetNode?.data?.category === 'specialist' &&
        (sourceNode?.data?.category === 'function' || sourceNode?.data?.category === 'tool');
      let targetHandle = connection.targetHandle ?? 'entrada';
      if (isFcToSpecialist) {
        const filteredEdges = edges.filter(
          (e) =>
            !(e.source === connection.source && e.sourceHandle === connection.sourceHandle)
        );
        const existingFcToSpecialist = filteredEdges.filter((e) => {
          if (e.target !== connection.target) return false;
          const src = nodes.find((n) => n.id === e.source);
          return src?.data?.category === 'function' || src?.data?.category === 'tool';
        });
        targetHandle = `${SPECIALIST_FC_INPUT_PREFIX}${existingFcToSpecialist.length}`;
      }

      const connectionWithHandle = { ...connection, targetHandle };
      setEdges((eds) => {
        const filtered = eds.filter(
          (edge) =>
            !(
              edge.source === connection.source && edge.sourceHandle === connection.sourceHandle
            )
        );
        const edgeId = `${connection.source}-${connection.sourceHandle}-${connection.target}`;
        return addEdge(
          {
            ...connectionWithHandle,
            id: edgeId,
            type: 'excalidraw',
            deletable: true,
            data: {
              pathType: 'step',
              strokeStyle: 'solid',
              strokeWidth: 'medium',
              labelPosition: 0.5,
              showArrow: true,
            },
          },
          filtered
        );
      });

      setNodes((nds) => {
        const sourceNodeInner = nds.find((node) => node.id === connection.source);
        const sourceOutput = sourceNodeInner?.data.outputs?.find(
          (output) => output.handle === connection.sourceHandle
        );
        const mirroredPosition = sourceOutput?.handlePosition
          ? {
              side: oppositeHandleSide[sourceOutput.handlePosition.side],
              offset: sourceOutput.handlePosition.offset,
            }
          : undefined;

        return nds.map((node) => {
          if (node.id === connection.source) {
            const updatedOutputs = (node.data.outputs ?? []).map((output) =>
              output.handle === connection.sourceHandle
                ? { ...output, targetNodeId: connection.target ?? undefined }
                : output
            );
            return {
              ...node,
              data: { ...node.data, outputs: updatedOutputs },
            };
          }

          if (node.id === connection.target) {
            let baseInputs =
              node.data.inputs ??
              withDefaultInputPositions(
                node.data.category,
                (defaultInputs[node.data.category] ?? []).map((input) => ({ ...input }))
              );
            if (
              isSpecialistFcInputHandle(targetHandle) &&
              !baseInputs.some((i) => i.handle === targetHandle)
            ) {
              baseInputs = [
                ...baseInputs,
                {
                  handle: targetHandle,
                  name: 'Function call',
                  acceptsFromType: ['function', 'tool'],
                },
              ];
            }
            const targetHasSingleInput = baseInputs.length === 1;
            const updatedInputs = baseInputs.map((input) => {
              if (input.handle !== targetHandle) return input;
              if (targetHasSingleInput) {
                return input.handlePosition
                  ? input
                  : { ...input, handlePosition: getDefaultInputPosition(node.data.category) };
              }
              if (!mirroredPosition) {
                return input.handlePosition
                  ? input
                  : { ...input, handlePosition: getDefaultInputPosition(node.data.category) };
              }
              if (input.autoLinked || !input.handlePosition) {
                return { ...input, handlePosition: mirroredPosition };
              }
              return input;
            });
            return {
              ...node,
              data: {
                ...node.data,
                inputs: withDefaultInputPositions(node.data.category, updatedInputs),
              },
            };
          }

          return node;
        });
      });
      if (updateNodeInternalsRef.current) {
        updateNodeInternalsRef.current([
          connection.source,
          connection.target ?? connection.source,
        ]);
      }
    },
    [setEdges, setNodes, nodes, edges, pushUndo]
  );

  /** Linhas fantasmas exibidas ao clicar na bolinha de saída: uma para cada nó válido */
  const ghostEdges = useMemo(() => {
    if (!connectionPickerSource) return [];
    const targets = getValidTargetsWithHandles(connectionPickerSource.nodeId, connectionPickerSource.handle);
    return targets.map(({ node, targetHandle }) => ({
      id: `ghost-${connectionPickerSource.nodeId}-${connectionPickerSource.handle}-${node.id}`,
      type: 'ghost' as const,
      source: connectionPickerSource.nodeId,
      sourceHandle: connectionPickerSource.handle,
      target: node.id,
      targetHandle,
      deletable: false,
      data: {
        onConnect: () => {
          handleConnect({
            source: connectionPickerSource.nodeId,
            sourceHandle: connectionPickerSource.handle,
            target: node.id,
            targetHandle: undefined,
          });
          setConnectionPickerSource(null);
        },
      },
    }));
  }, [connectionPickerSource, getValidTargetsWithHandles, handleConnect]);

  const displayEdges = connectionPickerSource ? [...edges, ...ghostEdges] : edges;

  /** No modo sem-tags/com-tags, linhas do template não podem ser excluídas */
  const effectiveEdges = useMemo(() => {
    if (schemaMode?.schemaType === 'sem-tags') {
      const isFixedEdge = (e: Edge) =>
        (e.source === RECEBE_MENSAGEM_ID && e.target === SEM_TAGS_ROUTER_ID) ||
        e.target === ENVIA_MENSAGEM_ID;
      return displayEdges.map((e) => (isFixedEdge(e) ? { ...e, deletable: false } : e));
    }
    if (schemaMode?.schemaType === 'com-tags') {
      const isFixedEdge = (e: Edge) =>
        (e.source === RECEBE_MENSAGEM_ID && e.target === COM_TAGS_TAG_SIM_NAO_ID) ||
        (e.source === COM_TAGS_TAG_SIM_NAO_ID && e.target === COM_TAGS_IDENTIFICA_TAG_ID) ||
        (e.source === COM_TAGS_TAG_SIM_NAO_ID && e.target === COM_TAGS_ROUTER_ID);
      return displayEdges.map((e) => (isFixedEdge(e) ? { ...e, deletable: false } : e));
    }
    return displayEdges;
  }, [displayEdges, schemaMode?.schemaType]);

  const handleEdgesDelete = useCallback(
    (removedEdges: Edge[]) => {
      if (!removedEdges.length) return;
      pushUndo();
      let filteredRemoved = removedEdges;
      if (schemaMode?.schemaType === 'sem-tags') {
        const isFixedEdge = (e: Edge) =>
          (e.source === RECEBE_MENSAGEM_ID && e.target === SEM_TAGS_ROUTER_ID) ||
          e.target === ENVIA_MENSAGEM_ID;
        filteredRemoved = removedEdges.filter((e) => !isFixedEdge(e));
        if (filteredRemoved.length === 0) return;
      }
      if (schemaMode?.schemaType === 'com-tags') {
        const isFixedEdge = (e: Edge) =>
          (e.source === RECEBE_MENSAGEM_ID && e.target === COM_TAGS_TAG_SIM_NAO_ID) ||
          (e.source === COM_TAGS_TAG_SIM_NAO_ID && e.target === COM_TAGS_IDENTIFICA_TAG_ID) ||
          (e.source === COM_TAGS_TAG_SIM_NAO_ID && e.target === COM_TAGS_ROUTER_ID);
        filteredRemoved = removedEdges.filter((e) => !isFixedEdge(e));
        if (filteredRemoved.length === 0) return;
      }
      const removedIds = new Set(filteredRemoved.map((r) => r.id));
      const keptEdges = edges.filter((e) => !removedIds.has(e.id));
      const orphanEnviaIds = new Set(
        nodes
          .filter(
            (n) =>
              n.data?.category === 'envia_mensagem' &&
              !keptEdges.some((e) => e.target === n.id)
          )
          .map((n) => n.id)
      );
      const enviaIdsToUpdate = nodes
        .filter((n) => n.data?.category === 'envia_mensagem' && !orphanEnviaIds.has(n.id))
        .map((n) => n.id);
      setEdges((eds) => {
        const kept = eds.filter((e) => !removedIds.has(e.id));
        const specialistIdsAffected = new Set(
          filteredRemoved
            .filter((e) => isSpecialistFcInputHandle(e.targetHandle ?? ''))
            .map((e) => e.target)
        );
        let result = specialistIdsAffected.size === 0 ? kept : kept.map((edge) => {
          if (edge.target && specialistIdsAffected.has(edge.target)) {
            const srcNode = nodes.find((n) => n.id === edge.source);
            const isFc =
              srcNode?.data?.category === 'function' || srcNode?.data?.category === 'tool';
            if (!isFc) return edge;
            const fcEdgesToSame = kept.filter((e) => {
              if (e.target !== edge.target) return false;
              const s = nodes.find((n) => n.id === e.source);
              return s?.data?.category === 'function' || s?.data?.category === 'tool';
            });
            const sorted = [...fcEdgesToSame].sort((a, b) =>
              `${a.source}-${a.sourceHandle ?? ''}`.localeCompare(`${b.source}-${b.sourceHandle ?? ''}`)
            );
            const idx = sorted.findIndex(
              (e) => e.source === edge.source && e.sourceHandle === edge.sourceHandle
            );
            if (idx < 0) return edge;
            return { ...edge, targetHandle: `${SPECIALIST_FC_INPUT_PREFIX}${idx}` };
          }
          return edge;
        });
        return result.filter((e) => !orphanEnviaIds.has(e.target));
      });
      setNodes((nds) => {
        const mapped = nds.map((node) => {
          const outputs = (node.data.outputs ?? []).map((output) => {
            const shouldClear = filteredRemoved.some(
              (edge) => edge.source === node.id && edge.sourceHandle === output.handle
            );
            if (!shouldClear) return output;
            return { ...output, targetNodeId: undefined };
          });
          if (
            filteredRemoved.some(
              (e) => e.target === node.id && isSpecialistFcInputHandle(e.targetHandle ?? '')
            )
          ) {
            const remainingFcEdges = (() => {
              const currentEdges = edges.filter((e) => !removedIds.has(e.id));
              return currentEdges.filter((e) => {
                if (e.target !== node.id) return false;
                const src = nds.find((n) => n.id === e.source);
                return src?.data?.category === 'function' || src?.data?.category === 'tool';
              });
            })();
            const baseInputs = (node.data.inputs ?? defaultInputs[node.data.category] ?? []) as WorkflowNodeInput[];
            const mainEntrada = baseInputs.find((i) => i.handle === 'entrada') ?? defaultInputs.specialist[0];
            const fcInputs = remainingFcEdges
              .sort((a, b) =>
                `${a.source}-${a.sourceHandle ?? ''}`.localeCompare(`${b.source}-${b.sourceHandle ?? ''}`)
              )
              .map((_, i) => ({
                handle: `${SPECIALIST_FC_INPUT_PREFIX}${i}`,
                name: 'Function call',
                acceptsFromType: ['function', 'tool'],
              }));
            const fullInputs = [mainEntrada, ...fcInputs];
            return {
              ...node,
              data: {
                ...node.data,
                outputs,
                inputs: withDefaultInputPositions(node.data.category, fullInputs),
              },
            };
          }
          if (node.data?.category === 'envia_mensagem') {
            const keptEdges = edges.filter((e) => !removedIds.has(e.id));
            const handlesWithEdge = new Set(
              keptEdges.filter((e) => e.target === node.id).map((e) => e.targetHandle ?? '')
            );
            const inputsFiltered = (node.data.inputs ?? []).filter((inp) => handlesWithEdge.has(inp.handle));
            const enviaDefaultSide = schemaMode?.schemaType === 'com-tags' ? COM_TAGS_SECTORS.envia_mensagem.input.side : 'top';
            const currentEnviaSide = (node.data.inputs?.[0]?.handlePosition?.side ?? enviaDefaultSide) as HandleSide;
            const inputsRecentered = inputsFiltered.map((inp, i) => {
              const pos = schemaMode?.schemaType === 'com-tags'
                ? getComTagsInputPosition('envia_mensagem', i, inputsFiltered.length)
                : { side: currentEnviaSide, offset: (i + 1) / (inputsFiltered.length + 1) };
              return { ...inp, handlePosition: pos };
            });
            return { ...node, data: { ...node.data, outputs, inputs: inputsRecentered } };
          }
          return { ...node, data: { ...node.data, outputs } };
        });
        if (orphanEnviaIds.size === 0) return mapped;
        return mapped
          .filter((n) => !orphanEnviaIds.has(n.id))
          .map((node) => ({
            ...node,
            data: {
              ...node.data,
              outputs: (node.data.outputs ?? []).map((o) =>
                o.targetNodeId && orphanEnviaIds.has(o.targetNodeId)
                  ? { ...o, targetNodeId: undefined }
                  : o
              ),
            },
          }));
      });
      if (enviaIdsToUpdate.length > 0 && updateNodeInternalsRef.current) {
        requestAnimationFrame(() => updateNodeInternalsRef.current(enviaIdsToUpdate));
      }
    },
    [setEdges, setNodes, nodes, edges, schemaMode?.schemaType, pushUndo]
  );

  const hasRemovableSelectedEdges = useMemo(() => {
    const selected = edges.filter((e) => e.selected);
    if (selected.length === 0) return false;
    if (schemaMode?.schemaType !== 'sem-tags' && schemaMode?.schemaType !== 'com-tags') return true;
    const isFixedEdge = (e: Edge) =>
      schemaMode?.schemaType === 'sem-tags'
        ? (e.source === RECEBE_MENSAGEM_ID && e.target === SEM_TAGS_ROUTER_ID) || e.target === ENVIA_MENSAGEM_ID
        : (e.source === RECEBE_MENSAGEM_ID && e.target === COM_TAGS_TAG_SIM_NAO_ID) ||
          (e.source === COM_TAGS_TAG_SIM_NAO_ID && e.target === COM_TAGS_IDENTIFICA_TAG_ID) ||
          (e.source === COM_TAGS_TAG_SIM_NAO_ID && e.target === COM_TAGS_ROUTER_ID);
    return selected.some((e) => !isFixedEdge(e));
  }, [edges, schemaMode?.schemaType]);

  const hasRemovableSelection = hasRemovableSelectedNodes || hasRemovableSelectedEdges;

  const deleteSelectedEdges = useCallback(() => {
    const selected = edges.filter((e) => e.selected);
    if (selected.length === 0) return;
    handleEdgesDelete(selected);
  }, [edges, handleEdgesDelete]);

  const deleteSelection = useCallback(() => {
    pushUndo();
    deleteSelectedNodes();
    deleteSelectedEdges();
  }, [deleteSelectedNodes, deleteSelectedEdges, pushUndo]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (!hasRemovableSelection) return;
      e.preventDefault();
      e.stopPropagation();
      deleteSelection();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [deleteSelection, hasRemovableSelection]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        const target = e.target as HTMLElement | null;
        if (target?.closest('input, textarea, [contenteditable="true"]')) return;
        if (undoStackRef.current.length === 0) return;
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [undo]);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessfulRef.current = false;
  }, []);

  const onReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessfulRef.current) {
        handleEdgesDelete([edge]);
      }
      edgeReconnectSuccessfulRef.current = true;
    },
    [handleEdgesDelete]
  );

  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!newConnection.source || !newConnection.target || !newConnection.sourceHandle) return;
      pushUndo();
      edgeReconnectSuccessfulRef.current = true;
      const sourceNode = nodes.find((n) => n.id === newConnection.source);
      const targetNode = nodes.find((n) => n.id === newConnection.target);
      const isFcToSpecialist =
        targetNode?.data?.category === 'specialist' &&
        (sourceNode?.data?.category === 'function' || sourceNode?.data?.category === 'tool');
      let targetHandle = newConnection.targetHandle ?? 'entrada';
      if (isFcToSpecialist) {
        const edgesWithoutOld = edges.filter((e) => e.id !== oldEdge.id);
        const fcToNewTarget = edgesWithoutOld.filter((e) => {
          if (e.target !== newConnection.target) return false;
          const src = nodes.find((n) => n.id === e.source);
          return src?.data?.category === 'function' || src?.data?.category === 'tool';
        });
        targetHandle = `${SPECIALIST_FC_INPUT_PREFIX}${fcToNewTarget.length}`;
      }
      const newId = `${newConnection.source}-${newConnection.sourceHandle}-${newConnection.target}`;
      setEdges((eds) => {
        let result = eds.map((e) =>
          e.id === oldEdge.id
            ? {
                ...e,
                id: newId,
                source: newConnection.source!,
                target: newConnection.target!,
                sourceHandle: newConnection.sourceHandle ?? e.sourceHandle,
                targetHandle,
              }
            : e
        );
        if (oldEdge.target && isSpecialistFcInputHandle(oldEdge.targetHandle ?? '')) {
          const fcToOld = result.filter((e) => {
            if (e.target !== oldEdge.target) return false;
            const src = nodes.find((n) => n.id === e.source);
            return src?.data?.category === 'function' || src?.data?.category === 'tool';
          });
          const sorted = [...fcToOld].sort((a, b) =>
            `${a.source}-${a.sourceHandle ?? ''}`.localeCompare(`${b.source}-${b.sourceHandle ?? ''}`)
          );
          result = result.map((edge) => {
            if (edge.target !== oldEdge.target) return edge;
            const src = nodes.find((n) => n.id === edge.source);
            const isFc = src?.data?.category === 'function' || src?.data?.category === 'tool';
            if (!isFc) return edge;
            const idx = sorted.findIndex(
              (e) => e.source === edge.source && e.sourceHandle === edge.sourceHandle
            );
            if (idx < 0) return edge;
            return { ...edge, targetHandle: `${SPECIALIST_FC_INPUT_PREFIX}${idx}` };
          });
        }
        return result;
      });
      setNodes((nds) => {
        const sourceNodeInner = nds.find((node) => node.id === newConnection.source);
        const sourceOutput = sourceNodeInner?.data.outputs?.find(
          (output) => output.handle === newConnection.sourceHandle
        );
        const mirroredPosition = sourceOutput?.handlePosition
          ? {
              side: oppositeHandleSide[sourceOutput.handlePosition.side],
              offset: sourceOutput.handlePosition.offset,
            }
          : undefined;
        let edgesAfterReconnect = edges.map((e) =>
          e.id === oldEdge.id
            ? {
                ...e,
                source: newConnection.source!,
                target: newConnection.target!,
                sourceHandle: newConnection.sourceHandle ?? e.sourceHandle,
                targetHandle,
              }
            : e
        );
        if (oldEdge.target && isSpecialistFcInputHandle(oldEdge.targetHandle ?? '')) {
          const fcToOld = edgesAfterReconnect.filter((e) => {
            if (e.target !== oldEdge.target) return false;
            const src = nds.find((n) => n.id === e.source);
            return src?.data?.category === 'function' || src?.data?.category === 'tool';
          });
          const sorted = [...fcToOld].sort((a, b) =>
            `${a.source}-${a.sourceHandle ?? ''}`.localeCompare(`${b.source}-${b.sourceHandle ?? ''}`)
          );
          edgesAfterReconnect = edgesAfterReconnect.map((edge) => {
            if (edge.target !== oldEdge.target) return edge;
            const src = nds.find((n) => n.id === edge.source);
            const isFc = src?.data?.category === 'function' || src?.data?.category === 'tool';
            if (!isFc) return edge;
            const idx = sorted.findIndex(
              (e) => e.source === edge.source && e.sourceHandle === edge.sourceHandle
            );
            if (idx < 0) return edge;
            return { ...edge, targetHandle: `${SPECIALIST_FC_INPUT_PREFIX}${idx}` };
          });
        }

        const mapped = nds.map((node) => {
          if (node.id === newConnection.source) {
            const updatedOutputs = (node.data.outputs ?? []).map((output) =>
              output.handle === newConnection.sourceHandle
                ? { ...output, targetNodeId: newConnection.target ?? undefined }
                : output
            );
            return { ...node, data: { ...node.data, outputs: updatedOutputs } };
          }
          if (node.id === newConnection.target) {
            let baseInputs =
              node.data.inputs ??
              withDefaultInputPositions(
                node.data.category,
                (defaultInputs[node.data.category] ?? []).map((input) => ({ ...input }))
              );
            if (
              isSpecialistFcInputHandle(targetHandle) &&
              !baseInputs.some((i) => i.handle === targetHandle)
            ) {
              baseInputs = [
                ...baseInputs,
                {
                  handle: targetHandle,
                  name: 'Function call',
                  acceptsFromType: ['function', 'tool'],
                },
              ];
            }
            const targetHasSingleInput = baseInputs.length === 1;
            const updatedInputs = baseInputs.map((input) => {
              if (input.handle !== targetHandle) return input;
              if (targetHasSingleInput) {
                return input.handlePosition
                  ? input
                  : { ...input, handlePosition: getDefaultInputPosition(node.data.category) };
              }
              if (!mirroredPosition) {
                return input.handlePosition
                  ? input
                  : { ...input, handlePosition: getDefaultInputPosition(node.data.category) };
              }
              if (input.autoLinked || !input.handlePosition) {
                return { ...input, handlePosition: mirroredPosition };
              }
              return input;
            });
            return {
              ...node,
              data: {
                ...node.data,
                inputs: withDefaultInputPositions(node.data.category, updatedInputs),
              },
            };
          }
          if (
            node.id === oldEdge.target &&
            node.data.category === 'specialist' &&
            isSpecialistFcInputHandle(oldEdge.targetHandle ?? '')
          ) {
            const remainingFcEdges = edgesAfterReconnect.filter((e) => {
              if (e.target !== node.id) return false;
              const src = nds.find((n) => n.id === e.source);
              return src?.data?.category === 'function' || src?.data?.category === 'tool';
            });
            const baseInputs = (node.data.inputs ?? defaultInputs.specialist ?? []) as WorkflowNodeInput[];
            const mainEntrada = baseInputs.find((i) => i.handle === 'entrada') ?? defaultInputs.specialist[0];
            const fcInputs = remainingFcEdges
              .sort((a, b) =>
                `${a.source}-${a.sourceHandle ?? ''}`.localeCompare(`${b.source}-${b.sourceHandle ?? ''}`)
              )
              .map((_, i) => ({
                handle: `${SPECIALIST_FC_INPUT_PREFIX}${i}`,
                name: 'Function call',
                acceptsFromType: ['function', 'tool'],
              }));
            const fullInputs = [mainEntrada, ...fcInputs];
            return {
              ...node,
              data: {
                ...node.data,
                inputs: withDefaultInputPositions(node.data.category, fullInputs),
              },
            };
          }
          if (node.id === oldEdge.target && node.data?.category === 'envia_mensagem') {
            const handlesWithEdge = new Set(
              edgesAfterReconnect.filter((e) => e.target === node.id).map((e) => e.targetHandle ?? '')
            );
            const inputsFiltered = (node.data.inputs ?? []).filter((inp) => handlesWithEdge.has(inp.handle));
            const enviaDefaultSide = schemaMode?.schemaType === 'com-tags' ? COM_TAGS_SECTORS.envia_mensagem.input.side : 'top';
            const currentEnviaSide = (node.data.inputs?.[0]?.handlePosition?.side ?? enviaDefaultSide) as HandleSide;
            const inputsRecentered = inputsFiltered.map((inp, i) => {
              const pos = schemaMode?.schemaType === 'com-tags'
                ? getComTagsInputPosition('envia_mensagem', i, inputsFiltered.length)
                : { side: currentEnviaSide, offset: (i + 1) / (inputsFiltered.length + 1) };
              return { ...inp, handlePosition: pos };
            });
            return { ...node, data: { ...node.data, inputs: inputsRecentered } };
          }
          return node;
        });
        const orphanEnviaIds = new Set(
          mapped
            .filter(
              (n) =>
                n.data?.category === 'envia_mensagem' &&
                !edgesAfterReconnect.some((e) => e.target === n.id)
            )
            .map((n) => n.id)
        );
        if (orphanEnviaIds.size === 0) return mapped;
        return mapped
          .filter((n) => !orphanEnviaIds.has(n.id))
          .map((node) => ({
            ...node,
            data: {
              ...node.data,
              outputs: (node.data.outputs ?? []).map((o) =>
                o.targetNodeId && orphanEnviaIds.has(o.targetNodeId)
                  ? { ...o, targetNodeId: undefined }
                  : o
              ),
            },
          }));
      });
      if (updateNodeInternalsRef.current) {
        const idsToUpdate = [
          newConnection.source,
          newConnection.target ?? newConnection.source,
          oldEdge.target,
        ].filter(Boolean);
        requestAnimationFrame(() => updateNodeInternalsRef.current(idsToUpdate));
      }
    },
    [setEdges, setNodes, nodes, edges, pushUndo, schemaMode?.schemaType]
  );

  const updateSelectedNode = (updater: (node: FlowNode) => FlowNode) => {
    if (!selectedNode) return;
    setNodes((nds) => nds.map((node) => (node.id === selectedNode.id ? updater(node) : node)));
  };

  const updateSelectedNodeOutputs = (
    updater: (outputs: WorkflowNodeOutput[]) => WorkflowNodeOutput[]
  ) => {
    updateSelectedNode((node) => ({
      ...node,
      data: {
        ...node.data,
        outputs: updater(node.data.outputs ?? []),
      },
    }));
  };

  const updateSelectedNodeInputs = (
    updater: (inputs: WorkflowNodeInput[]) => WorkflowNodeInput[]
  ) => {
    updateSelectedNode((node) => ({
      ...node,
      data: {
        ...node.data,
        inputs: updater(node.data.inputs ?? []),
      },
    }));
  };

  const handleInputSideChange = (inputHandle: string, newSide: HandleSide) => {
    if (!selectedNode) return;
    updateSelectedNodeInputs((inputs) =>
      inputs.map((input, idx) => {
        if (input.handle !== inputHandle) return input;
        const currentPos = input.handlePosition ?? getDefaultInputPositionForIndex(selectedNode.data.category, idx, inputs.length);
        return {
          ...input,
          handlePosition: { side: newSide, offset: currentPos.offset },
        };
      })
    );
    if (updateNodeInternalsRef.current) {
      updateNodeInternalsRef.current(selectedNode.id);
    }
  };

  const handleOutputSideChange = (outputHandle: string, newSide: HandleSide) => {
    if (!selectedNode) return;
    updateSelectedNodeOutputs((outputs) =>
      outputs.map((output, index) => {
        if (output.handle !== outputHandle) return output;
        const regularOutputs = outputs.filter((o) =>
          isRegularOutputHandle(selectedNode.data.category, o)
        );
        const regularIndex = regularOutputs.findIndex((o) => o.handle === outputHandle);
        const currentPos = output.handlePosition ?? getDefaultOutputPosition(
          selectedNode.data.category,
          regularIndex >= 0 ? regularIndex : index,
          regularOutputs.length || outputs.length
        );
        return {
          ...output,
          handlePosition: { side: newSide, offset: currentPos.offset },
        };
      })
    );
    if (updateNodeInternalsRef.current) {
      updateNodeInternalsRef.current(selectedNode.id);
    }
  };

  const handleOutputTargetChange = (handle: string, targetNodeId: string) => {
    if (!selectedNode) return;
    updateSelectedNodeOutputs((outputs) =>
      outputs.map((output) =>
        output.handle === handle ? { ...output, targetNodeId: targetNodeId || undefined } : output
      )
    );

    setEdges((eds) => {
      const filtered = eds.filter(
        (edge) => !(edge.source === selectedNode.id && edge.sourceHandle === handle)
      );
      if (!targetNodeId) return filtered;
      return filtered.concat({
        id: `${selectedNode.id}-${handle}-${targetNodeId}`,
        source: selectedNode.id,
        target: targetNodeId,
        sourceHandle: handle,
        targetHandle: 'entrada',
        type: 'excalidraw',
        deletable: true,
        data: {
          pathType: 'step',
          strokeStyle: 'solid',
          strokeWidth: 'medium',
          labelPosition: 0.5,
          showArrow: true,
        },
      });
    });
    if (targetNodeId) {
      setNodes((nds) => {
        const sourceNode = nds.find((node) => node.id === selectedNode.id);
        const sourceOutput = sourceNode?.data.outputs?.find((output) => output.handle === handle);
        const mirroredPosition = sourceOutput?.handlePosition
          ? {
              side: oppositeHandleSide[sourceOutput.handlePosition.side],
              offset: sourceOutput.handlePosition.offset,
            }
          : undefined;
        return nds.map((node) => {
          if (node.id !== targetNodeId) return node;
          const baseInputs =
            node.data.inputs ??
            withDefaultInputPositions(
              node.data.category,
              (defaultInputs[node.data.category] ?? []).map((input) => ({ ...input }))
            );
          const targetHasSingleInput = baseInputs.length === 1;
          const updatedInputs = baseInputs.map((input) => {
            if (input.handle !== 'entrada') return input;
            if (targetHasSingleInput) {
              return { ...input, handlePosition: getDefaultInputPosition(node.data.category) };
            }
            if (!mirroredPosition) {
              return input.handlePosition
                ? input
                : { ...input, handlePosition: getDefaultInputPosition(node.data.category) };
            }
            if (input.autoLinked || !input.handlePosition) {
              return { ...input, handlePosition: mirroredPosition };
            }
            return input;
          });
          return { ...node, data: { ...node.data, inputs: updatedInputs } };
        });
      });
      if (updateNodeInternalsRef.current) {
        updateNodeInternalsRef.current([selectedNode.id, targetNodeId]);
      }
    }
  };

  const ROUTER_MIN_OUTPUTS = 2;
  const ROUTER_MAX_OUTPUTS = 6;

  const handleRemoveOutput = (handle: string) => {
    if (!selectedNode) return;
    const category = selectedNode.data.category;
    const outputs = selectedNode.data?.outputs ?? [];
    if (category === 'router' && outputs.length <= ROUTER_MIN_OUTPUTS) {
      toast.error(`O agente roteador deve ter no mínimo ${ROUTER_MIN_OUTPUTS} saídas`);
      return;
    }
    updateSelectedNodeOutputs((out) => out.filter((output) => output.handle !== handle));
    setEdges((eds) =>
      eds.filter((edge) => !(edge.source === selectedNode.id && edge.sourceHandle === handle))
    );
  };

  const handleAddOutput = () => {
    if (!selectedNode) return;
    const category = selectedNode.data.category;
    if (category === 'specialist') return;
    const outputs = selectedNode.data?.outputs ?? [];
    if (category === 'router' && outputs.length >= ROUTER_MAX_OUTPUTS) {
      toast.error(`O agente roteador deve ter no máximo ${ROUTER_MAX_OUTPUTS} saídas`);
      return;
    }
    const defaults = defaultOutputs[category];
    const firstDefault = Array.isArray(defaults) && defaults[0] ? defaults[0] : null;
    updateSelectedNodeOutputs((outputs) => {
      const newOutput = {
        handle: `saida_${outputs.length + 1}`,
        targetNodeId: undefined,
        targetEntryName: firstDefault?.targetEntryName ?? 'entrada',
        targetEntryType: firstDefault?.targetEntryType ?? allowedTargetTypes[category],
      };
      const newOutputs = [...outputs, newOutput];
      return withDefaultOutputPositions(category, newOutputs);
    });
  };

  const nodesWithMultipleInputs: WorkflowNodeType[] = ['identifica_tag'];

  const handleAddInput = () => {
    if (!selectedNode || !nodesWithMultipleInputs.includes(selectedNode.data.category)) return;
    const inputs = selectedNode.data?.inputs ?? defaultInputs[selectedNode.data.category] ?? [];
    const newInputs = [
      ...inputs,
      {
        handle: inputs.length === 0 ? 'entrada' : `entrada_${inputs.length + 1}`,
        name: inputs.length === 0 ? 'Entrada' : `Entrada ${inputs.length + 1}`,
        acceptsFromType: defaultInputs[selectedNode.data.category]?.[0]?.acceptsFromType ?? [],
      },
    ];
    updateSelectedNodeInputs(() => withDefaultInputPositions(selectedNode.data.category, newInputs));
    if (updateNodeInternalsRef.current) updateNodeInternalsRef.current(selectedNode.id);
  };

  const handleRemoveInput = (handle: string) => {
    if (!selectedNode) return;
    const inputs = (selectedNode.data?.inputs ?? []).filter((i) => i.handle !== handle);
    if (inputs.length < 1) return;
    updateSelectedNodeInputs(() => inputs);
    setEdges((eds) =>
      eds.filter(
        (e) => !(e.target === selectedNode.id && (e.targetHandle ?? 'entrada') === handle)
      )
    );
    if (updateNodeInternalsRef.current) updateNodeInternalsRef.current(selectedNode.id);
  };

  /** Envia mensagem: define o lado de todas as entradas e redistribui os offsets */
  const handleEnviaMensagemAllInputsSideChange = (newSide: HandleSide) => {
    if (!selectedNode || selectedNode.data?.category !== 'envia_mensagem') return;
    updateSelectedNodeInputs((inputs) =>
      inputs.map((inp, i) => ({
        ...inp,
        handlePosition: { side: newSide, offset: (i + 1) / (inputs.length + 1) },
      }))
    );
    if (updateNodeInternalsRef.current) updateNodeInternalsRef.current(selectedNode.id);
  };

  /** Envia mensagem: move entrada para cima/baixo na ordem (reorganiza posição no mesmo lado) */
  const handleMoveInputOrder = (inputHandle: string, direction: 'up' | 'down') => {
    if (!selectedNode || selectedNode.data?.category !== 'envia_mensagem') return;
    const inputs = selectedNode.data?.inputs ?? [];
    const idx = inputs.findIndex((i) => i.handle === inputHandle);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === inputs.length - 1) return;
    const next = [...inputs];
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    const currentSide = (inputs[0]?.handlePosition?.side ?? 'top') as HandleSide;
    const reordered = next.map((inp, i) => ({
      ...inp,
      handlePosition: { side: currentSide, offset: (i + 1) / (next.length + 1) },
    }));
    updateSelectedNodeInputs(() => reordered);
    if (updateNodeInternalsRef.current) updateNodeInternalsRef.current(selectedNode.id);
  };

  const handleOutputHandleChange = (
    outputIndex: number,
    currentHandle: string,
    newHandle: string
  ) => {
    if (!selectedNode) return;
    const value = newHandle.trim();
    updateSelectedNodeOutputs((outputs) =>
      outputs.map((output, i) =>
        i === outputIndex ? { ...output, handle: value } : output
      )
    );
    setEdges((eds) =>
      eds.map((edge) =>
        edge.source === selectedNode.id && edge.sourceHandle === currentHandle
          ? {
              ...edge,
              sourceHandle: value,
              id: `${selectedNode.id}-${value}-${edge.target}`,
            }
          : edge
      )
    );
  };

  const handleFallbackToggle = (handle: string, value: boolean) => {
    updateSelectedNodeOutputs((outputs) =>
      outputs.map((output) =>
        output.handle === handle
          ? { ...output, isFallback: value }
          : { ...output, isFallback: value ? false : output.isFallback }
      )
    );
  };

  const handleSaveWorkflow = async () => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const effectiveEntryNodeId =
      entryNodeId ?? (currentNodes.some((n) => n.id === RECEBE_MENSAGEM_ID) ? RECEBE_MENSAGEM_ID : null);
    if (!effectiveEntryNodeId) {
      toast.error('Selecione um nó de entrada');
      return;
    }
    if (!currentNodes.length) {
      toast.error('Adicione ao menos um nó ao workflow');
      return;
    }

    const definition = flowToDefinition(currentNodes, currentEdges);

    if (schemaMode) {
      setIsSaving(true);
      try {
        const json = JSON.stringify(definition);
        schemaMode.onSave(json);
        setLastSavedSnapshot(json);
        toast.success('Schema salvo com sucesso');
      } catch (err: any) {
        toast.error(err?.message || 'Erro ao salvar schema');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!workflowName.trim()) {
      toast.error('Defina um nome para o workflow');
      return;
    }

    setIsSaving(true);
    try {
      if (currentWorkflowId) {
        const { workflow: updated, validation } = await workflowService.update(currentWorkflowId, {
          name: workflowName.trim(),
          description: workflowDescription.trim() || null,
          entryNodeId: effectiveEntryNodeId,
          definition,
          isActive: workflowActiveFlag,
        });
        setWorkflows((list) => list.map((wf) => (wf.id === updated.id ? updated : wf)));
        setWorkflowValidationMap((m) => ({ ...m, [updated.id]: validation }));
        setValidationResult(validation);
        setWorkflowActiveFlag(updated.isActive);
        if (!entryNodeId && effectiveEntryNodeId === RECEBE_MENSAGEM_ID) setEntryNodeId(RECEBE_MENSAGEM_ID);
        setLastSavedSnapshot(
          getSnapshotFromState(
            currentWorkflowId,
            workflowName.trim(),
            workflowDescription.trim() || null,
            effectiveEntryNodeId,
            workflowActiveFlag,
            definition
          )
        );
        toast.success('Workflow atualizado com sucesso');
        if (!validation.valid) toast('Corrija os erros para poder ativar o workflow.', { icon: '⚠️' });
      } else {
        const { workflow: created, validation } = await workflowService.create({
          name: workflowName.trim(),
          description: workflowDescription.trim() || null,
          entryNodeId: effectiveEntryNodeId,
          definition,
          isActive: workflowActiveFlag,
        });
        setWorkflows((list) => [created, ...list]);
        setWorkflowValidationMap((m) => ({ ...m, [created.id]: validation }));
        setValidationResult(validation);
        setCurrentWorkflowId(created.id);
        setIsNewWorkflow(false);
        setWorkflowActiveFlag(created.isActive);
        if (!entryNodeId && effectiveEntryNodeId === RECEBE_MENSAGEM_ID) setEntryNodeId(RECEBE_MENSAGEM_ID);
        setLastSavedSnapshot(
          getSnapshotFromState(
            created.id,
            workflowName.trim(),
            workflowDescription.trim() || null,
            effectiveEntryNodeId,
            workflowActiveFlag,
            definition
          )
        );
        toast.success('Workflow criado com sucesso');
        if (!validation.valid) toast('Corrija os erros para poder ativar o workflow.', { icon: '⚠️' });
      }
    } catch (error: any) {
      console.error('Erro ao salvar workflow', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar workflow');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWorkflow = async (e: React.MouseEvent, workflowId: string) => {
    e.stopPropagation();
    if (!confirm('Deseja remover este workflow? Esta ação não pode ser desfeita.')) return;
    try {
      await workflowService.delete(workflowId);
      setWorkflows((list) => list.filter((wf) => wf.id !== workflowId));
      setWorkflowValidationMap((m) => {
        const next = { ...m };
        delete next[workflowId];
        return next;
      });
      if (activeWorkflowId === workflowId) {
        await multiAgentService.updateConfig({ workflowId: null });
        setActiveWorkflowId(null);
      }
      if (currentWorkflowId === workflowId) {
        resetCanvas();
      }
      toast.success('Workflow removido');
    } catch (error: any) {
      console.error('Erro ao remover workflow', error);
      toast.error(error.response?.data?.error || 'Erro ao remover workflow');
    }
  };

  const paletteButtons = [
    { type: 'router' as WorkflowNodeType, label: 'Agente roteador' },
    { type: 'specialist' as WorkflowNodeType, label: 'Agente especialista' },
    { type: 'identifica_tag' as WorkflowNodeType, label: 'Identifica tag' },
    { type: 'tag_sim_nao' as WorkflowNodeType, label: 'Tag (Sim/Não)' },
    { type: 'adiciona_tag' as WorkflowNodeType, label: 'Adiciona tag' },
    { type: 'envia_mensagem_pronta' as WorkflowNodeType, label: 'Mensagem pronta' },
    { type: 'envia_mensagem' as WorkflowNodeType, label: 'Envia mensagem (apenas um no fluxo)' },
  ];

  const effectivePaletteButtons =
    schemaMode?.schemaType === 'sem-tags'
      ? paletteButtons.filter(
          (b) =>
            b.type !== 'tag_sim_nao' &&
            b.type !== 'adiciona_tag' &&
            b.type !== 'identifica_tag'
        )
      : paletteButtons;

  const filteredWorkflows = workflows.filter((wf) => {
    if (!workflowSearchQuery.trim()) return true;
    const q = workflowSearchQuery.toLowerCase();
    return wf.name.toLowerCase().includes(q) || (wf.description ?? '').toLowerCase().includes(q);
  });

  const addPanelSourceNode = addPanelSourceNodeId
    ? nodes.find((n) => n.id === addPanelSourceNodeId)
    : null;
  const addPanelPaletteButtons = (() => {
    const buttons = effectivePaletteButtons;
    const category = addPanelSourceNode?.data?.category;
    if (category === 'recebe_mensagem') {
      return buttons.filter(
        (b) => b.type === 'router' || b.type === 'tag_sim_nao'
      );
    }
    if (category === 'identifica_tag') {
      return buttons.filter(
        (b) => b.type === 'router' || b.type === 'specialist' || b.type === 'tag_sim_nao'
      );
    }
    if (category === 'tag_sim_nao') {
      return buttons.filter(
        (b) => b.type === 'router' || b.type === 'specialist' || b.type === 'identifica_tag'
      );
    }
    if (category === 'router') {
      return buttons.filter(
        (b) =>
          b.type !== 'envia_mensagem' &&
          b.type !== 'identifica_tag' &&
          !(schemaMode?.schemaType === 'com-tags' && b.type === 'tag_sim_nao')
      );
    }
    if (category === 'adiciona_tag') {
      return buttons.filter((b) => b.type === 'specialist' || b.type === 'identifica_tag');
    }
    return buttons;
  })();

  return (
    <div className={`flex gap-6 w-full min-w-0 items-stretch min-h-0 overflow-hidden ${schemaMode ? 'flex-1 h-full' : 'flex-1'}`}>
      {/* Coluna esquerda - Lista de Workflows (colapsável) - oculta em schemaMode */}
      {!schemaMode && (
      <div
        className={`flex-shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out flex flex-col min-h-0 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm isolate ${
          workflowListOpen ? 'w-64' : 'w-[52px]'
        }`}
        style={{ backgroundColor: '#FFFFFF' }}
      >
      {workflowListOpen ? (
        <div className="w-64 flex-1 flex flex-col min-h-0 relative">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Workflows</h3>
          </div>
          <button
            type="button"
            onClick={() => setWorkflowListOpen(false)}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-l-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition-all duration-200 z-10"
            title="Fechar lista"
          >
            <span className="material-icons-outlined text-lg">chevron_left</span>
          </button>
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 space-y-2">
            <div className="relative">
              <span className="material-icons-outlined absolute left-2.5 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm" style={{ color: '#94A3B8' }}>search</span>
              <input
                type="text"
                value={workflowSearchQuery}
                onChange={(e) => setWorkflowSearchQuery(e.target.value)}
                placeholder="Pesquisar workflows..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                style={{ backgroundColor: '#F8FAFC', color: '#0F172A' }}
              />
            </div>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="w-full px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-1.5"
              style={{ backgroundColor: '#F07000' }}
            >
              <span className="material-icons-outlined text-base">add</span>
              Novo workflow
            </button>
          </div>
          <div className="flex-1 p-3 space-y-1.5 overflow-y-auto min-h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <span className="material-icons-outlined text-slate-400 animate-spin" style={{ color: '#94A3B8' }}>refresh</span>
                <span className="ml-2 text-slate-500 text-sm">Carregando...</span>
              </div>
            ) : filteredWorkflows.length === 0 ? (
              <div className="text-center py-8 text-slate-500" style={{ color: '#64748B' }}>
                <span className="material-icons-outlined text-4xl mb-2" style={{ color: '#94A3B8' }}>hub</span>
                <p className="text-sm">Nenhum workflow encontrado</p>
              </div>
            ) : (
              filteredWorkflows.map((workflow) => {
                const isSelected = currentWorkflowId === workflow.id;
                const isActive = activeWorkflowId === workflow.id;
                return (
                  <div
                    key={workflow.id}
                    onClick={() => void loadWorkflow(workflow.id)}
                    className={`px-2 py-1.5 rounded-md border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-slate-300 hover:shadow-sm'
                    }`}
                    style={{
                      borderColor: isSelected ? '#F07000' : '#E2E8F0',
                      backgroundColor: isSelected ? '#FFF4ED' : '#F8FAFC',
                    }}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <div
                          className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'bg-primary' : 'bg-indigo-100'
                          }`}
                          style={{ backgroundColor: isSelected ? '#F07000' : '#E0E7FF' }}
                        >
                          <span
                            className={`material-icons-outlined text-sm ${isSelected ? 'text-white' : 'text-indigo-600'}`}
                            style={{ color: isSelected ? '#FFFFFF' : '#4F46E5' }}
                          >
                            hub
                          </span>
                        </div>
                        <div className="min-w-0 leading-tight">
                          <h3
                            className={`font-semibold text-[11px] truncate ${isSelected ? 'text-primary' : 'text-slate-900 dark:text-white'}`}
                            style={{ color: isSelected ? '#F07000' : '#0F172A' }}
                          >
                            {workflow.name}
                          </h3>
                          <span className="text-[10px] text-slate-500" style={{ color: '#64748B' }}>
                            {(workflow.definition?.nodes ?? []).length} nós
                            {workflowValidationMap[workflow.id]?.valid === false && (
                              <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-800">
                                Incompleto
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      <div
                        className="flex items-center gap-1 cursor-pointer select-none flex-shrink-0"
                        onClick={(e) => handleToggleWorkflowActive(e, workflow.id)}
                      >
                        <div
                          className={`relative w-7 h-3.5 rounded-full transition-colors ${
                            isActive ? 'bg-primary' : 'bg-slate-300'
                          }`}
                          style={{ backgroundColor: isActive ? '#F07000' : undefined }}
                        >
                          <div
                            className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow transition-transform ${
                              isActive ? 'left-[16px]' : 'left-0.5'
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 mt-1 justify-end">
                      <button
                        type="button"
                        onClick={(e) => handleOpenEditModal(e, workflow)}
                        className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                        title="Renomear"
                      >
                        <span className="material-icons-outlined text-xs">drive_file_rename_outline</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteWorkflow(e, workflow.id)}
                        className="p-0.5 rounded hover:bg-red-100 text-slate-500 hover:text-red-600"
                        title="Excluir"
                      >
                        <span className="material-icons-outlined text-xs">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="w-[52px] flex-1 flex items-center justify-center overflow-hidden">
          <button
            type="button"
            onClick={() => setWorkflowListOpen(true)}
            className="w-full flex items-center justify-center py-4 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-primary transition-colors duration-200"
            title="Abrir lista de workflows"
          >
            <span className="material-icons-outlined text-2xl">chevron_right</span>
          </button>
        </div>
      )}
      </div>
      )}

      {/* Área principal */}
      <div className="flex-1 min-w-0 flex flex-col gap-6 min-h-0">
      {!schemaMode && workflows.length === 0 && !isLoading && !isNewWorkflow ? (
        <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col items-center justify-center min-h-0 p-8">
          <span className="material-icons-outlined text-6xl text-slate-300 mb-4" style={{ color: '#94A3B8' }}>hub</span>
          <p className="text-slate-500 text-center mb-6" style={{ color: '#64748B' }}>
            Nenhum workflow criado ainda
          </p>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
            style={{ backgroundColor: '#F07000' }}
          >
            <span className="material-icons-outlined">add</span>
            Criar workflow
          </button>
        </div>
      ) : (
      <>
      <div
        className="relative flex-1 min-h-0 w-full rounded-xl border-2 border-slate-300 dark:border-slate-600 overflow-hidden bg-white shadow-sm"
        onMouseDownCapture={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
      >
        {isLoading || isLoadingDefinition ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm bg-white z-20">
            Carregando workflow...
          </div>
        ) : (
          <EdgeDataContext.Provider value={edgesFromParent}>
          <EdgeOptionsContext.Provider
            value={{
              onEdgeDataUpdate: handleEdgeDataUpdate,
              onEdgeDelete: (edge) => handleEdgesDelete([edge]),
              selectedNodeId,
            }}
          >
          <DeleteSelectionContext.Provider
            value={{ deleteSelection, hasRemovableSelection }}
          >
          <ConnectionTargetPickerContext.Provider
            value={{
              openConnectionPicker: (nodeId, handle) => {
                const alreadyConnected = edges.some(
                  (e) => e.source === nodeId && (e.sourceHandle ?? '') === handle
                );
                if (alreadyConnected) {
                  toast('Esta saída já está conectada. Cada saída só pode ter uma conexão.', {
                    icon: '⚠️',
                  });
                  return;
                }
                const targets = getValidTargetsWithHandles(nodeId, handle);
                if (targets.length === 0) {
                  toast('Nenhum nó disponível para conectar nesta saída.', { icon: '⚠️' });
                  return;
                }
                setConnectionPickerSource({ nodeId, handle });
              },
            }}
          >
          <AddPanelContext.Provider
            value={{
              openAddPanel: (nodeId, sourceHandle) => {
                const sourceNode = nodes.find((n) => n.id === nodeId);
                if (sourceNode?.data?.category === 'specialist' && sourceHandle && isFunctionCallHandle(sourceHandle)) {
                  addNode('tool', nodeId, sourceHandle);
                  if (nodeSettingsPanelOpen || nodeSettingsPanelClosing) closeNodeSettingsPanel();
                  return;
                }
                // Schema sem-tags: ao clicar + na saída do especialista, criar "Envia mensagem" já linkado (se ainda não houver um no fluxo)
                if (
                  schemaMode?.schemaType === 'sem-tags' &&
                  sourceNode?.data?.category === 'specialist' &&
                  sourceHandle &&
                  !isFunctionCallHandle(sourceHandle)
                ) {
                  const alreadyHasEnviaMensagem = nodes.some((n) => n.data?.category === 'envia_mensagem');
                  if (!alreadyHasEnviaMensagem) {
                    addNode('envia_mensagem', nodeId, sourceHandle);
                    if (nodeSettingsPanelOpen || nodeSettingsPanelClosing) closeNodeSettingsPanel();
                    return;
                  }
                }
                if (nodeSettingsPanelOpen || nodeSettingsPanelClosing) closeNodeSettingsPanel();
                setAddPanelSourceNodeId(nodeId);
                setAddPanelSourceHandle(sourceHandle ?? null);
              },
            }}
          >
          <NodeSettingsPanelContext.Provider value={{ openNodeSettings }}>
          <ReactFlow
            className="w-full h-full"
            nodes={nodes}
            edges={effectiveEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onEdgesDelete={handleEdgesDelete}
            onConnect={handleConnect}
            onReconnect={handleReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            isValidConnection={isValidConnection}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
            }}
            onNodeDoubleClick={(_, node) => {
              openNodeSettings(node.id);
            }}
            onEdgeClick={() => {
              if (nodeSettingsPanelOpen || nodeSettingsPanelClosing) closeNodeSettingsPanel();
              else setSelectedNodeId(null);
            }}
            onPaneClick={(e) => {
              const target = e.target as HTMLElement | null;
              if (target && nodeSettingsPanelRef.current?.contains(target)) return;
              if (connectionPickerSource) setConnectionPickerSource(null);
              if (nodeSettingsPanelOpen || nodeSettingsPanelClosing) closeNodeSettingsPanel();
              else setSelectedNodeId(null);
            }}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 0.8 }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{
              type: 'excalidraw',
              animated: false,
              deletable: true,
            }}
            edgesReconnectable={true}
            proOptions={{ hideAttribution: true }}
            panOnDrag={[1]}
            selectionOnDrag
            zoomOnScroll={false}
            zoomActivationKeyCode="Control"
            preventScrolling={false}
          >
            <NodeInternalsUpdaterInner>
              <Background variant={BackgroundVariant.Lines} gap={16} size={1} color="rgba(226, 232, 240, 0.4)" />
              {schemaMode?.schemaType === 'com-tags' && (
                <ViewportPortal>
                  <ComTagsSectorOverlay />
                </ViewportPortal>
              )}
              <Controls />
              <Panel position={Position.TopLeft} className="!m-4">
                <EdgeOptionsPanelInner />
                <DeleteSelectionPanelInner />
              </Panel>
            </NodeInternalsUpdaterInner>
          </ReactFlow>

          {/* Barra lateral direita: configurações do nó (duplo clique no nó) — animação slide */}
          {selectedNode && (nodeSettingsPanelOpen || nodeSettingsPanelClosing) && (
            <div
              ref={nodeSettingsPanelRef}
              className={`absolute top-0 right-0 bottom-0 w-72 z-20 bg-white border-l border-slate-200 shadow-xl flex flex-col nodrag nopan transition-transform duration-300 ease-out ${
                nodeSettingsPanelOpen && nodeSettingsPanelAnimateIn ? 'translate-x-0' : 'translate-x-full'
              }`}
              style={{ backgroundColor: '#FFFFFF', willChange: nodeSettingsPanelOpen && nodeSettingsPanelAnimateIn ? 'auto' : 'transform' }}
            >
              <div className="p-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="material-icons-outlined text-slate-500 text-lg">tune</span>
                  Configurações do nó
                </h3>
                <button
                  type="button"
                  onClick={closeNodeSettingsPanel}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                  title="Fechar"
                >
                  <span className="material-icons-outlined text-lg">close</span>
                </button>
              </div>
              <div className="p-3 flex-1 overflow-y-auto space-y-4">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">
                    Nome do nó
                  </label>
                  <input
                    type="text"
                    value={selectedNode.data?.name ?? ''}
                    onChange={(e) =>
                      updateSelectedNode((n) => ({
                        ...n,
                        data: { ...n.data, name: e.target.value },
                      }))
                    }
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-800"
                    placeholder="Ex.: Roteador principal"
                  />
                </div>
                {/* Configuração de entradas */}
                {selectedNode.data?.category !== 'recebe_mensagem' && (
                  <div>
                    <h4 className="text-[10px] text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <span className="material-icons-outlined text-xs">input</span>
                      Entrada do nó
                    </h4>
                    {selectedNode.data?.category === 'envia_mensagem' && (() => {
                      const inputs = selectedNode.data?.inputs ?? [];
                      const allInputsSide = (inputs[0]?.handlePosition?.side ?? 'top') as HandleSide;
                      return (
                        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
                          <label className="text-[10px] text-slate-500 block mb-1">Lado de todas as entradas</label>
                          <select
                            value={allInputsSide}
                            onChange={(e) => handleEnviaMensagemAllInputsSideChange(e.target.value as HandleSide)}
                            className="w-full text-[11px] border border-slate-200 rounded px-2 py-1.5 bg-white"
                          >
                            <option value="top">Topo</option>
                            <option value="right">Direita</option>
                            <option value="bottom">Baixo</option>
                            <option value="left">Esquerda</option>
                          </select>
                        </div>
                      );
                    })()}
                    {(selectedNode.data?.inputs ?? defaultInputs[selectedNode.data.category] ?? []).map((input, idx) => {
                      const inputs = selectedNode.data?.inputs ?? defaultInputs[selectedNode.data.category] ?? [];
                      const acceptsTypes = input.acceptsFromType ?? [];
                      const currentSide = input.handlePosition?.side ?? getDefaultInputPositionForIndex(selectedNode.data.category, idx, inputs.length).side;
                      const canAddInput = nodesWithMultipleInputs.includes(selectedNode.data.category);
                      const category = selectedNode.data?.category;
                      const outputs = selectedNode.data?.outputs ?? [];
                      const layout = defaultHandleLayout[category] ?? { output: 'bottom' as HandleSide };
                      const defaultInputSide = getDefaultInputPosition(category).side;
                      const defaultOutputSide = layout.output;
                      const sidesOccupied = new Set<HandleSide>();
                      const regularOuts = outputs.filter((o) => isRegularOutputHandle(category, o));
                      for (const o of regularOuts) {
                        sidesOccupied.add((o.handlePosition?.side ?? defaultOutputSide) as HandleSide);
                      }
                      if (category === 'specialist') {
                        const fcSide = selectedNode.data?.config?.functionCallSide as HandleSide | undefined;
                        if (fcSide && ['top', 'right', 'bottom', 'left'].includes(fcSide)) {
                          sidesOccupied.add(fcSide);
                        }
                      }
                      for (const inp of inputs) {
                        if (inp.handle !== input.handle) {
                          sidesOccupied.add((inp.handlePosition?.side ?? defaultInputSide) as HandleSide);
                        }
                      }
                      return (
                        <div
                          key={`input-${idx}`}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 space-y-1"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-700">{input.name || input.handle}</span>
                            {input.autoLinked && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-100 text-emerald-700">
                                AUTO
                              </span>
                            )}
                            {canAddInput && inputs.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveInput(input.handle)}
                                className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 ml-auto"
                                title="Remover entrada"
                              >
                                <span className="material-icons-outlined text-sm">remove_circle_outline</span>
                              </button>
                            )}
                          </div>
                          {acceptsTypes.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-slate-400">Aceita de:</span>
                              {acceptsTypes.map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                                  style={{
                                    backgroundColor: `${nodeVisuals[t]?.handle}15`,
                                    color: nodeVisuals[t]?.handle,
                                  }}
                                >
                                  {nodeVisuals[t]?.label ?? t}
                                </span>
                              ))}
                            </div>
                          )}
                          {input.sourceNodeId && (
                            <div className="flex items-center gap-1 text-[10px] text-emerald-600">
                              <span className="material-icons-outlined text-xs">link</span>
                              Vinculada automaticamente
                            </div>
                          )}
                          {category === 'envia_mensagem' ? (
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[10px] text-slate-500">Ordem:</span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleMoveInputOrder(input.handle, 'up')}
                                  disabled={idx === 0}
                                  className="p-1 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600"
                                  title="Mover entrada para cima"
                                >
                                  <span className="material-icons-outlined text-sm">arrow_upward</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveInputOrder(input.handle, 'down')}
                                  disabled={idx === inputs.length - 1}
                                  className="p-1 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600"
                                  title="Mover entrada para baixo"
                                >
                                  <span className="material-icons-outlined text-sm">arrow_downward</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 pt-1">
                              <label className="text-[10px] text-slate-500">Lado:</label>
                              <select
                                value={currentSide}
                                onChange={(e) => handleInputSideChange(input.handle, e.target.value as HandleSide)}
                                className="flex-1 text-[11px] border border-slate-200 rounded px-2 py-1 bg-white"
                              >
                                <option value="top" disabled={sidesOccupied.has('top')}>Topo{sidesOccupied.has('top') ? ' (lado ocupado)' : ''}</option>
                                <option value="right" disabled={sidesOccupied.has('right')}>Direita{sidesOccupied.has('right') ? ' (lado ocupado)' : ''}</option>
                                <option value="bottom" disabled={sidesOccupied.has('bottom')}>Baixo{sidesOccupied.has('bottom') ? ' (lado ocupado)' : ''}</option>
                                <option value="left" disabled={sidesOccupied.has('left')}>Esquerda{sidesOccupied.has('left') ? ' (lado ocupado)' : ''}</option>
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {nodesWithMultipleInputs.includes(selectedNode.data?.category) && (
                      <button
                        type="button"
                        onClick={handleAddInput}
                        className="w-full mt-2 py-2 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50 text-xs font-medium flex items-center justify-center gap-1"
                      >
                        <span className="material-icons-outlined text-base">add</span>
                        Adicionar entrada
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <h4 className="text-[10px] text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <span className="material-icons-outlined text-xs">output</span>
                    Configuração de saídas
                  </h4>
                  {selectedNode.data?.category === 'recebe_mensagem' ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                      <p className="font-medium text-slate-700">Saída única (fixa)</p>
                      <p className="mt-0.5">
                        {(selectedNode.data.outputs ?? [])[0]?.handle ?? 'next'}
                        {(selectedNode.data.outputs ?? [])[0]?.targetNodeId
                          ? ' — conectada'
                          : ' — livre'}
                      </p>
                    </div>
                  ) : selectedNode.data?.category === 'envia_mensagem' ||
                    selectedNode.data?.category === 'envia_mensagem_pronta' ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                      Nó de fim de fluxo (sem saídas)
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(() => {
                        const allOutputs = (selectedNode.data?.outputs ?? []) as WorkflowNodeOutput[];
                        const isSpecialistFcEnabled =
                          selectedNode.data?.category === 'specialist' &&
                          (selectedNode.data?.config?.functionCallsEnabled ?? (allOutputs.filter((o) => isFunctionCallHandle(o.handle)).length > 0));
                        const displayedOutputs = allOutputs
                          .map((output, realIndex) => ({ output, realIndex }))
                          .filter(({ output }) => !(isSpecialistFcEnabled && isFunctionCallHandle(output.handle)));
                        return displayedOutputs.map(({ output, realIndex }, displayIndex) => {
                        const allowedTypes = output.targetEntryType
                          ? Array.isArray(output.targetEntryType)
                            ? output.targetEntryType
                            : [output.targetEntryType]
                          : allowedTargetTypes[selectedNode.data.category] ?? [];
                        const regularOutputs = (selectedNode.data?.outputs ?? []).filter((o) =>
                          isRegularOutputHandle(selectedNode.data.category, o)
                        );
                        const currentSide =
                          output.handlePosition?.side ??
                          getDefaultOutputPosition(selectedNode.data.category, displayIndex, regularOutputs.length).side;
                        const outCategory = selectedNode.data?.category;
                        const outInputs = selectedNode.data?.inputs ?? defaultInputs[outCategory] ?? [];
                        const outLayout = defaultHandleLayout[outCategory] ?? { output: 'bottom' as HandleSide };
                        const defaultInSide = getDefaultInputPosition(outCategory).side;
                        const defaultOutSide = outLayout.output;
                        const sidesOccupiedOut = new Set<HandleSide>();
                        for (const inp of outInputs) {
                          sidesOccupiedOut.add((inp.handlePosition?.side ?? defaultInSide) as HandleSide);
                        }
                        for (const o of regularOutputs) {
                          if (o.handle !== output.handle) {
                            sidesOccupiedOut.add((o.handlePosition?.side ?? defaultOutSide) as HandleSide);
                          }
                        }
                        if (outCategory === 'specialist') {
                          const fcSide = selectedNode.data?.config?.functionCallSide as HandleSide | undefined;
                          if (fcSide && ['top', 'right', 'bottom', 'left'].includes(fcSide)) {
                            sidesOccupiedOut.add(fcSide);
                          }
                        }
                        return (
                          <div
                            key={`output-${output.handle}`}
                            className="rounded-lg border border-slate-200 bg-white p-2 space-y-2"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={output.handle}
                                onChange={(e) =>
                                  handleOutputHandleChange(
                                    realIndex,
                                    output.handle,
                                    e.target.value
                                  )
                                }
                                className="flex-1 min-w-0 text-xs border border-slate-200 rounded px-2 py-1.5"
                                placeholder="Nome da saída"
                              />
                              {(selectedNode.data?.category === 'function' ||
                                selectedNode.data?.category === 'tool') && (
                                <label className="flex items-center gap-1 text-[10px] text-slate-500 whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={!!output.isFallback}
                                    onChange={(e) =>
                                      handleFallbackToggle(output.handle, e.target.checked)
                                    }
                                  />
                                  fallback
                                </label>
                              )}
                              {(selectedNode.data?.category === 'router'
                                ? displayedOutputs.length > ROUTER_MIN_OUTPUTS
                                : displayedOutputs.length > 1) && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOutput(output.handle)}
                                  className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"
                                  title="Remover saída"
                                >
                                  <span className="material-icons-outlined text-sm">remove_circle_outline</span>
                                </button>
                              )}
                            </div>
                            {/* Tipos de nó permitidos para esta saída */}
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-slate-400">Conecta em:</span>
                              {allowedTypes.length > 0 ? (
                                allowedTypes.map((t) => (
                                  <span
                                    key={t}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                                    style={{
                                      backgroundColor: `${nodeVisuals[t]?.handle}15`,
                                      color: nodeVisuals[t]?.handle,
                                    }}
                                  >
                                    {nodeVisuals[t]?.label ?? t}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">qualquer</span>
                              )}
                            </div>
                            {output.targetNodeId && (
                              <div className="flex items-center gap-1 text-[10px] text-emerald-600">
                                <span className="material-icons-outlined text-xs">link</span>
                                Conectada
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] text-slate-500">Lado:</label>
                              <select
                                value={currentSide}
                                onChange={(e) => handleOutputSideChange(output.handle, e.target.value as HandleSide)}
                                className="flex-1 text-[11px] border border-slate-200 rounded px-2 py-1 bg-white"
                              >
                                <option value="top" disabled={sidesOccupiedOut.has('top')}>Topo{sidesOccupiedOut.has('top') ? ' (lado ocupado)' : ''}</option>
                                <option value="right" disabled={sidesOccupiedOut.has('right')}>Direita{sidesOccupiedOut.has('right') ? ' (lado ocupado)' : ''}</option>
                                <option value="bottom" disabled={sidesOccupiedOut.has('bottom')}>Baixo{sidesOccupiedOut.has('bottom') ? ' (lado ocupado)' : ''}</option>
                                <option value="left" disabled={sidesOccupiedOut.has('left')}>Esquerda{sidesOccupiedOut.has('left') ? ' (lado ocupado)' : ''}</option>
                              </select>
                            </div>
                          </div>
                        );
                      });
                      })()}
                      {selectedNode.data?.category !== 'specialist' && (
                        <button
                          type="button"
                          onClick={handleAddOutput}
                          disabled={
                            selectedNode.data?.category === 'router' &&
                            (selectedNode.data?.outputs ?? []).length >= ROUTER_MAX_OUTPUTS
                          }
                          className="w-full py-2 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent text-xs font-medium flex items-center justify-center gap-1"
                        >
                          <span className="material-icons-outlined text-base">add</span>
                          Adicionar saída
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Agente especialista: toggle Function calls e quantidade 1–6 */}
                {selectedNode.data?.category === 'specialist' && (() => {
                  const specialistFcOutputs = (selectedNode.data?.outputs ?? []).filter((o: WorkflowNodeOutput) => isFunctionCallHandle(o.handle));
                  const functionCallsEnabled = selectedNode.data?.config?.functionCallsEnabled ?? (specialistFcOutputs.length > 0);
                  const functionCallCount = Math.min(6, Math.max(1, selectedNode.data?.config?.functionCallCount ?? (specialistFcOutputs.length || 1)));
                  const specialistInputs = selectedNode.data?.inputs ?? defaultInputs.specialist ?? [];
                  const mainEntrada = Array.isArray(specialistInputs) ? specialistInputs.find((i: WorkflowNodeInput) => i.handle === 'entrada') : null;
                  const entradaSide: HandleSide = (mainEntrada?.handlePosition?.side as HandleSide) ?? getDefaultInputPosition('specialist').side;
                  const specialistOutputs = selectedNode.data?.outputs ?? [];
                  const nextOutput = specialistOutputs.find((o: WorkflowNodeOutput) => !isFunctionCallHandle(o.handle));
                  const saidaSide: HandleSide = (nextOutput?.handlePosition?.side as HandleSide) ?? (defaultHandleLayout.specialist?.output ?? 'right');
                  const sidesUsedByEntradaSaida = new Set<HandleSide>([entradaSide, saidaSide]);
                  return (
                  <div>
                    <h4 className="text-[10px] text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <span className="material-icons-outlined text-xs">code</span>
                      Function calls
                    </h4>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs text-slate-600">Ativar</span>
                      <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                        <button
                          type="button"
                          onClick={() => {
                            if (functionCallsEnabled) return;
                            updateSelectedNode((n) => {
                              const config = {
                                ...n.data.config,
                                functionCallsEnabled: true,
                                functionCallCount: Math.min(6, Math.max(1, n.data.config?.functionCallCount ?? 1)),
                                functionCallSide: undefined,
                              };
                              const nextOutput = (n.data.outputs ?? []).find((o) => !isFunctionCallHandle(o.handle)) ?? defaultOutputs.specialist[0];
                              const fcCount = config.functionCallCount ?? 1;
                              const fcOutputs: WorkflowNodeOutput[] = Array.from({ length: fcCount }, (_, i) =>
                                i === 0
                                  ? { handle: 'function_call', targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.tool }
                                  : { handle: `function_call_${i + 1}`, targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.tool }
                              );
                              return { ...n, data: { ...n.data, config, outputs: [nextOutput, ...fcOutputs] } };
                            });
                            if (updateNodeInternalsRef.current) updateNodeInternalsRef.current(selectedNode.id);
                          }}
                          className={`px-3 py-1.5 text-xs font-medium ${functionCallsEnabled ? 'bg-white border border-slate-200 shadow-sm text-slate-800' : 'text-slate-500'}`}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!functionCallsEnabled) return;
                            updateSelectedNode((n) => {
                              const config = { ...n.data.config, functionCallsEnabled: false, functionCallCount: 0 };
                              const nextOutput = (n.data.outputs ?? []).find((o) => !isFunctionCallHandle(o.handle)) ?? defaultOutputs.specialist[0];
                              return { ...n, data: { ...n.data, config, outputs: [nextOutput] } };
                            });
                            setEdges((eds) => eds.filter((e) => !(e.source === selectedNode.id && e.sourceHandle && isFunctionCallHandle(e.sourceHandle))));
                            if (updateNodeInternalsRef.current) updateNodeInternalsRef.current(selectedNode.id);
                          }}
                          className={`px-3 py-1.5 text-xs font-medium ${!functionCallsEnabled ? 'bg-white border border-slate-200 shadow-sm text-slate-800' : 'text-slate-500'}`}
                        >
                          Não
                        </button>
                      </div>
                    </div>
                    {functionCallsEnabled && (() => {
                      const hasValidFunctionCallSide = ['top', 'right', 'bottom', 'left'].includes((selectedNode.data?.config?.functionCallSide as string) ?? '');
                      return (
                      <>
                        <div className="mb-2">
                          <label className="text-[10px] text-slate-500 block mb-1">Lado dos nós Function call</label>
                          <select
                            value={(selectedNode.data?.config?.functionCallSide as string) ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const value = raw === '' ? undefined : (raw as HandleSide);
                              updateSelectedNode((n) => ({
                                ...n,
                                data: { ...n.data, config: { ...n.data.config, functionCallSide: value } },
                              }));
                              if (updateNodeInternalsRef.current) updateNodeInternalsRef.current(selectedNode.id);
                            }}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                          >
                            <option value="">Selecionar...</option>
                            <option value="top" disabled={sidesUsedByEntradaSaida.has('top')}>Topo{sidesUsedByEntradaSaida.has('top') ? ' (lado ocupado)' : ''}</option>
                            <option value="right" disabled={sidesUsedByEntradaSaida.has('right')}>Direita{sidesUsedByEntradaSaida.has('right') ? ' (lado ocupado)' : ''}</option>
                            <option value="bottom" disabled={sidesUsedByEntradaSaida.has('bottom')}>Baixo{sidesUsedByEntradaSaida.has('bottom') ? ' (lado ocupado)' : ''}</option>
                            <option value="left" disabled={sidesUsedByEntradaSaida.has('left')}>Esquerda{sidesUsedByEntradaSaida.has('left') ? ' (lado ocupado)' : ''}</option>
                          </select>
                        </div>
                        <div className={!hasValidFunctionCallSide ? 'opacity-60 pointer-events-none' : ''}>
                          <label className="text-[10px] text-slate-500 block mb-1.5">Quantidade (1 a 6)</label>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 relative pt-1 pb-2">
                              <input
                                type="range"
                                min={1}
                                max={6}
                                step={1}
                                value={functionCallCount}
                                disabled={!hasValidFunctionCallSide}
                                onChange={(e) => {
                                  const count = Number(e.target.value);
                                  const newHandles = new Set(Array.from({ length: count }, (_, i) => (i === 0 ? 'function_call' : `function_call_${i + 1}`)));
                                  updateSelectedNode((n) => {
                                    const currentOutputs = n.data.outputs ?? [];
                                    const nextOutput = currentOutputs.find((o) => !isFunctionCallHandle(o.handle)) ?? defaultOutputs.specialist[0];
                                    const currentFc = currentOutputs.filter((o) => isFunctionCallHandle(o.handle));
                                    const fcOutputs: WorkflowNodeOutput[] = Array.from({ length: count }, (_, i) => {
                                      const existing = currentFc[i];
                                      const handle = i === 0 ? 'function_call' : `function_call_${i + 1}`;
                                      return existing && existing.handle === handle
                                        ? existing
                                        : { handle, targetNodeId: undefined, targetEntryName: 'entrada', targetEntryType: allowedTargetTypes.tool };
                                    });
                                    const config = { ...n.data.config, functionCallCount: count };
                                    return { ...n, data: { ...n.data, config, outputs: [nextOutput, ...fcOutputs] } };
                                  });
                                  setEdges((eds) =>
                                    eds.filter((e) => {
                                      if (e.source !== selectedNode.id || !e.sourceHandle) return true;
                                      if (!isFunctionCallHandle(e.sourceHandle)) return true;
                                      return newHandles.has(e.sourceHandle);
                                    })
                                  );
                                  if (updateNodeInternalsRef.current) updateNodeInternalsRef.current(selectedNode.id);
                                }}
                                className="w-full h-2 rounded-full appearance-none bg-slate-200 accent-orange-500"
                                style={{ accentColor: '#f97316' }}
                              />
                              <div className="absolute left-0 right-0 flex justify-between text-[10px] text-slate-400 mt-0.5 px-0.5">
                                {[1, 2, 3, 4, 5, 6].map((m) => (
                                  <span key={m}>{m}</span>
                                ))}
                              </div>
                            </div>
                            <div className="flex-shrink-0 min-w-[3rem] rounded-lg bg-slate-100 border border-slate-200 px-2 py-1.5 text-center">
                              <span className="text-sm font-semibold" style={{ color: '#f97316' }}>
                                {functionCallCount}
                              </span>
                              <span className="text-[10px] text-slate-500 block">slot(s)</span>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                    })()}
                  </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Barra lateral direita: tipos de nó ao clicar no + (animação slide) */}
          {addPanelSourceNodeId && (
            <div
              className={`absolute top-0 right-0 bottom-0 w-64 z-20 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-xl flex flex-col transition-transform duration-300 ease-out ${
                addPanelVisible ? 'translate-x-0' : 'translate-x-full'
              }`}
              style={{ willChange: addPanelVisible ? 'auto' : 'transform' }}
            >
              <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Adicionar nó</h3>
                <button
                  type="button"
                  onClick={() => {
                    setAddPanelVisible(false);
                    setTimeout(() => {
                      setAddPanelSourceNodeId(null);
                      setAddPanelSourceHandle(null);
                    }, 300);
                  }}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700"
                  title="Fechar"
                >
                  <span className="material-icons-outlined text-lg">close</span>
                </button>
              </div>
              <div className="p-3 flex-1 overflow-y-auto space-y-2">
                {addPanelPaletteButtons.map((button) => {
                  const visuals = nodeVisuals[button.type];
                  const hasHint = button.label.includes('(apenas um');
                  const mainLabel = hasHint ? button.label.replace(/\s*\(apenas um[^)]*\)/, '').trim() : button.label;
                  const hintLabel = hasHint ? 'apenas um no fluxo' : null;
                  return (
                    <button
                      key={button.type}
                      type="button"
                      className="w-full rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-md transition-all duration-200 overflow-hidden text-left group"
                    onClick={() => {
                      const sourceId = addPanelSourceNodeId;
                      const type = button.type;
                      const handle = addPanelSourceHandle ?? undefined;
                      const sourceNode = sourceId ? nodes.find((n) => n.id === sourceId) : null;
                      const isComTagsRouterSpecialist =
                        schemaMode?.schemaType === 'com-tags' &&
                        type === 'specialist' &&
                        sourceNode?.data?.category === 'router' &&
                        handle;
                      setAddPanelVisible(false);
                      if (isComTagsRouterSpecialist && handle) {
                        setSpecialistTagChoicePending({ sourceNodeId: sourceId!, sourceHandle: handle });
                        setAddPanelSourceNodeId(null);
                        setAddPanelSourceHandle(null);
                        return;
                      }
                      setTimeout(() => {
                        addNode(type, sourceId, handle);
                        setAddPanelSourceNodeId(null);
                        setAddPanelSourceHandle(null);
                      }, 300);
                    }}
                    >
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div
                          className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${visuals.iconBg} transition-transform group-hover:scale-105`}
                          style={{ color: visuals.handle }}
                        >
                          <span className="material-icons-outlined text-xl">{visuals.icon}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-slate-800 truncate">{mainLabel}</p>
                          {hintLabel && (
                            <p className="text-xs text-slate-500 mt-0.5">{hintLabel}</p>
                          )}
                        </div>
                        <span className="material-icons-outlined text-slate-300 group-hover:text-slate-500 text-lg flex-shrink-0">
                          add_circle_outline
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Com-tags: diálogo "O agente terá tag?" ao adicionar especialista a partir do router */}
          {specialistTagChoicePending && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setSpecialistTagChoicePending(null)}>
              <div
                className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-5 max-w-sm w-full mx-4 border border-slate-200 dark:border-slate-700"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-4">O agente terá tag?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 py-2.5 px-3 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                    onClick={() => {
                      const { sourceNodeId, sourceHandle } = specialistTagChoicePending;
                      setSpecialistTagChoicePending(null);
                      setTimeout(() => addSpecialistWithTagFromRouter(sourceNodeId, sourceHandle), 0);
                    }}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    className="flex-1 py-2.5 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
                    onClick={() => {
                      const { sourceNodeId, sourceHandle } = specialistTagChoicePending;
                      setSpecialistTagChoicePending(null);
                      setTimeout(() => addNode('specialist', sourceNodeId, sourceHandle), 0);
                    }}
                  >
                    Não
                  </button>
                </div>
              </div>
            </div>
          )}
          </NodeSettingsPanelContext.Provider>
          </AddPanelContext.Provider>
          </ConnectionTargetPickerContext.Provider>
          </DeleteSelectionContext.Provider>
          </EdgeOptionsContext.Provider>
          </EdgeDataContext.Provider>
        )}

        {/* Botões Desfazer e Salvar flutuantes */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold shadow-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            onClick={undo}
            disabled={!canUndo}
            title="Desfazer (Ctrl+Z)"
          >
            <span className="material-icons-outlined text-lg">undo</span>
            Desfazer
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={handleSaveWorkflow}
            disabled={isSaving || isLoadingDefinition || !hasUnsavedChanges}
          >
            {isSaving ? '...' : 'Salvar'}
          </button>
        </div>

        {/* Indicador de validação: bolinha no canto inferior direito; ao clicar abre popover com erros */}
        {validationResult && !validationResult.valid && (
          <div className="absolute bottom-4 right-4 z-10">
            <button
              type="button"
              onClick={() => setValidationPopoverOpen((v) => !v)}
              className="relative w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg flex items-center justify-center transition-colors"
              title="Ver problemas do workflow"
            >
              <span className="material-icons-outlined text-xl">warning</span>
              {(validationResult.errors.length + validationResult.warnings.length) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-[10px] font-bold flex items-center justify-center text-white">
                  {validationResult.errors.length + validationResult.warnings.length}
                </span>
              )}
            </button>
            {validationPopoverOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={() => setValidationPopoverOpen(false)}
                />
                <div className="absolute bottom-full right-0 mb-2 w-72 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl p-3 z-20">
                  <p className="text-xs font-semibold text-slate-500 mb-2">
                    Workflow incompleto. Corrija os erros para ativá-lo.
                  </p>
                  {validationResult.errors.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold text-rose-500 uppercase tracking-wide">Erros</p>
                      <ul className="mt-1 list-disc list-inside text-xs text-rose-600 space-y-0.5">
                        {validationResult.errors.map((error, index) => (
                          <li key={`error-${index}`}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {validationResult.warnings.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Avisos</p>
                      <ul className="mt-1 list-disc list-inside text-xs text-amber-600 space-y-0.5">
                        {validationResult.warnings.map((warning, index) => (
                          <li key={`warning-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </>
      )}
      </div>

      {/* Modal criar workflow */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => !isCreatingWorkflow && setShowCreateModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
            style={{ backgroundColor: '#FFFFFF' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Novo workflow
            </h3>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Nome do workflow
            </label>
            <input
              type="text"
              value={newWorkflowName}
              onChange={(e) => setNewWorkflowName(e.target.value)}
              placeholder="Ex.: Fluxo de triagem"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none mb-6"
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreateWorkflow()}
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => !isCreatingWorkflow && setShowCreateModal(false)}
                disabled={isCreatingWorkflow}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateWorkflow}
                disabled={isCreatingWorkflow || !newWorkflowName.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                style={{ backgroundColor: '#F07000' }}
              >
                {isCreatingWorkflow ? (
                  <>
                    <span className="material-icons-outlined animate-spin text-lg">refresh</span>
                    Criando...
                  </>
                ) : (
                  <>
                    <span className="material-icons-outlined text-lg">add</span>
                    Criar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar workflow (renomear / alterar descrição) */}
      {showEditModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => !isSavingEdit && setShowEditModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
            style={{ backgroundColor: '#FFFFFF' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Editar workflow
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Nome
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ex.: Fluxo de triagem"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Descrição
                </label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Contexto ou objetivo"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={() => !isSavingEdit && setShowEditModal(false)}
                disabled={isSavingEdit}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditModal}
                disabled={isSavingEdit || !editName.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                style={{ backgroundColor: '#F07000' }}
              >
                {isSavingEdit ? (
                  <>
                    <span className="material-icons-outlined animate-spin text-lg">refresh</span>
                    Salvando...
                  </>
                ) : (
                  'Salvar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
