import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { Router } from '../../domain/entities/router.entity';
import { SpecialistAgent } from '../../domain/entities/specialist-agent.entity';
import { FunctionCallConfig } from '../../domain/entities/function-call-config.entity';
import type {
  WorkflowDefinition,
  WorkflowNodeDefinition,
  WorkflowNodeType,
} from '../../domain/entities/workflow.entity';

const MAX_DEPTH = 50;
const MAX_STEPS = 100;

/** Nós de agente roteador: mínimo e máximo de saídas obrigatórios */
const ROUTER_MIN_OUTPUTS = 2;
const ROUTER_MAX_OUTPUTS = 6;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function getNodeById(def: WorkflowDefinition, id: string): WorkflowNodeDefinition | undefined {
  return def.nodes?.find((n) => n.id === id);
}

function getOutputTargets(node: WorkflowNodeDefinition): string[] {
  return (node.outputs ?? []).map((o) => o.targetNodeId).filter(Boolean);
}

/**
 * Validate workflow graph: loops, nodes without exit, path to specialist, references.
 */
export async function validateWorkflowDefinition(
  definition: WorkflowDefinition,
  entryNodeId: string | null
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!definition?.nodes || !Array.isArray(definition.nodes)) {
    errors.push('definition.nodes é obrigatório e deve ser um array');
    return { valid: errors.length === 0, errors, warnings };
  }

  const nodeIds = new Set(definition.nodes.map((n) => n.id));
  const nodeMap = new Map(definition.nodes.map((n) => [n.id, n]));

  if (entryNodeId && !nodeIds.has(entryNodeId)) {
    errors.push(`entryNodeId "${entryNodeId}" não existe em definition.nodes`);
  }

  // References: routerId, specialistId, functionCallName
  const routerRepo = AppDataSource.getRepository(Router);
  const specialistRepo = AppDataSource.getRepository(SpecialistAgent);
  const fcConfigRepo = AppDataSource.getRepository(FunctionCallConfig);

  for (const node of definition.nodes) {
    const type = node.type as WorkflowNodeType;
    const config = node.config ?? {};

    if (type === 'router') {
      const routerId = config.routerId;
      if (!routerId) {
        errors.push(`Nó "${node.name}" (router): config.routerId é obrigatório`);
      } else {
        const exists = await routerRepo.findOne({ where: { id: routerId } });
        if (!exists) errors.push(`Nó "${node.name}" (router): routerId "${routerId}" não encontrado`);
      }
      const outputCount = (node.outputs ?? []).length;
      if (outputCount < ROUTER_MIN_OUTPUTS) {
        errors.push(
          `Nó "${node.name}" (router): deve ter no mínimo ${ROUTER_MIN_OUTPUTS} saídas (atual: ${outputCount})`
        );
      }
      if (outputCount > ROUTER_MAX_OUTPUTS) {
        errors.push(
          `Nó "${node.name}" (router): deve ter no máximo ${ROUTER_MAX_OUTPUTS} saídas (atual: ${outputCount})`
        );
      }
    } else if (type === 'specialist') {
      const specialistId = config.specialistId;
      if (!specialistId) {
        errors.push(`Nó "${node.name}" (specialist): config.specialistId é obrigatório`);
      } else {
        const exists = await specialistRepo.findOne({ where: { id: specialistId } });
        if (!exists)
          errors.push(`Nó "${node.name}" (specialist): specialistId "${specialistId}" não encontrado`);
      }
    } else if (type === 'tool') {
      const name = config.functionCallName;
      if (!name) {
        errors.push(`Nó "${node.name}" (tool): config.functionCallName é obrigatório`);
      } else {
        const exists = await fcConfigRepo.findOne({ where: { functionCallName: name } });
        if (!exists)
          errors.push(`Nó "${node.name}" (tool): functionCallName "${name}" não encontrado`);
      }
    } else if (type === 'function') {
      const handler = config.handler;
      if (!handler) {
        errors.push(`Nó "${node.name}" (function): config.handler é obrigatório`);
      }
    }
    // recebe_mensagem e envia_mensagem são nós fixos do sistema, sem validação de config
  }

  // Target node ids must exist
  for (const node of definition.nodes) {
    for (const out of node.outputs ?? []) {
      if (out.targetNodeId && !nodeIds.has(out.targetNodeId)) {
        errors.push(`Nó "${node.name}": output "${out.handle}" aponta para nó inexistente "${out.targetNodeId}"`);
      }
    }
  }

  // Nodes without exit (specialist e envia_mensagem são nós finais, não precisam de saídas)
  for (const node of definition.nodes) {
    const outputs = node.outputs ?? [];
    const hasExit = outputs.length > 0;
    const isEndNode = node.type === 'specialist' || node.type === 'envia_mensagem' || node.type === 'envia_mensagem_pronta';
    if (!hasExit && !isEndNode) {
      warnings.push(`Nó "${node.name}" (${node.type}) não tem saídas; fluxo pode terminar aqui`);
    }
  }

  // Loops: from entry, traverse with depth limit
  if (entryNodeId && nodeIds.has(entryNodeId)) {
    const visited = new Set<string>();
    const depthMap = new Map<string, number>();
    const queue: { id: string; depth: number }[] = [{ id: entryNodeId, depth: 0 }];
    let steps = 0;
    while (queue.length > 0 && steps < MAX_STEPS) {
      steps++;
      const { id, depth } = queue.shift()!;
      if (depth > MAX_DEPTH) {
        errors.push(`Profundidade máxima (${MAX_DEPTH}) excedida a partir do nó de entrada (possível loop)`);
        break;
      }
      const node = getNodeById(definition, id);
      if (!node) continue;
      const nextIds = getOutputTargets(node);
      for (const nextId of nextIds) {
        const nextDepth = depth + 1;
        const prevDepth = depthMap.get(nextId);
        if (prevDepth !== undefined && nextDepth > prevDepth) continue;
        depthMap.set(nextId, nextDepth);
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ id: nextId, depth: nextDepth });
        }
      }
    }
  }

  // Path to specialist: from entry there must be at least one path that reaches a specialist
  if (entryNodeId && nodeIds.has(entryNodeId) && errors.length === 0) {
    const reachedSpecialist = new Set<string>();
    const queue: string[] = [entryNodeId];
    const visited = new Set<string>();
    let steps = 0;
    while (queue.length > 0 && steps < MAX_STEPS) {
      steps++;
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = getNodeById(definition, id);
      if (!node) continue;
      if (node.type === 'specialist') reachedSpecialist.add(id);
      const nextIds = getOutputTargets(node);
      for (const nextId of nextIds) {
        if (!visited.has(nextId)) queue.push(nextId);
      }
    }
    if (reachedSpecialist.size === 0) {
      warnings.push('A partir do nó de entrada não há caminho até um nó do tipo specialist (resposta ao cliente)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
