import React, { useContext, useMemo, useCallback, useState, useRef } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useReactFlow,
  useStore,
  type EdgeProps,
} from '@xyflow/react';
import type {
  WorkflowEdgePathType,
  WorkflowEdgeStrokeStyle,
  WorkflowEdgeStrokeWidth,
} from '../../services/workflow.service';
import { EdgeDataContext } from './WorkflowEdgeContext';

export type ExcalidrawEdgeData = {
  pathType?: WorkflowEdgePathType;
  strokeStyle?: WorkflowEdgeStrokeStyle;
  strokeWidth?: WorkflowEdgeStrokeWidth;
  label?: string;
  labelPosition?: number;
  sourceOffset?: number;
  targetOffset?: number;
  /** Offset do segmento do meio (0 = centro, positivo = direita/baixo) */
  stepOffset?: number;
  /** Exibir seta na ponta (alvo). Padrão: true */
  showArrow?: boolean;
  // Mantido para compatibilidade, mas não usado na nova lógica
  pathPoints?: Array<{ x: number; y: number }>;
  pathOffsetX?: number;
  pathOffsetY?: number;
};

const STROKE_WIDTH_MAP: Record<WorkflowEdgeStrokeWidth, number> = {
  thin: 2,
  medium: 3,
  thick: 4,
};

const EDGE_SOURCE_INSET = 6;
const EDGE_TARGET_INSET = 22;
const SEGMENT_HANDLE_RADIUS = 4;

function insetPoint(
  x: number,
  y: number,
  position: Position,
  inset: number
): { x: number; y: number } {
  switch (position) {
    case Position.Top:
      return { x, y: y + inset };
    case Position.Bottom:
      return { x, y: y - inset };
    case Position.Left:
      return { x: x + inset, y };
    case Position.Right:
      return { x: x - inset, y };
    default:
      return { x, y };
  }
}

function applyOffset(
  x: number,
  y: number,
  position: Position,
  offset: number
): { x: number; y: number } {
  if (position === Position.Left || position === Position.Right) {
    return { x, y: y + offset };
  }
  return { x: x + offset, y };
}

/**
 * Gera uma path ortogonal (step) com 3 segmentos.
 * O segmento do meio pode ser deslocado pelo stepOffset.
 */
function buildOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  stepOffset: number
): {
  path: string;
  waypoints: { x: number; y: number }[];
  midSegmentIsHorizontal: boolean;
} {
  const isSourceVertical =
    sourcePosition === Position.Top || sourcePosition === Position.Bottom;
  const isTargetVertical =
    targetPosition === Position.Top || targetPosition === Position.Bottom;

  let waypoints: { x: number; y: number }[];
  let midSegmentIsHorizontal: boolean;

  if (isSourceVertical && isTargetVertical) {
    // Ambos verticais: source → horizontal → vertical → horizontal → target
    // Simplificado: source → vertical → horizontal → target
    const midY = (sourceY + targetY) / 2 + stepOffset;
    waypoints = [
      { x: sourceX, y: sourceY },
      { x: sourceX, y: midY },
      { x: targetX, y: midY },
      { x: targetX, y: targetY },
    ];
    midSegmentIsHorizontal = true;
  } else if (!isSourceVertical && !isTargetVertical) {
    // Ambos horizontais: similar
    const midX = (sourceX + targetX) / 2 + stepOffset;
    waypoints = [
      { x: sourceX, y: sourceY },
      { x: midX, y: sourceY },
      { x: midX, y: targetY },
      { x: targetX, y: targetY },
    ];
    midSegmentIsHorizontal = false;
  } else if (isSourceVertical && !isTargetVertical) {
    // Source vertical, target horizontal
    waypoints = [
      { x: sourceX, y: sourceY },
      { x: sourceX, y: targetY + stepOffset },
      { x: targetX, y: targetY + stepOffset },
      { x: targetX, y: targetY },
    ];
    midSegmentIsHorizontal = true;
  } else {
    // Source horizontal, target vertical
    waypoints = [
      { x: sourceX, y: sourceY },
      { x: targetX + stepOffset, y: sourceY },
      { x: targetX + stepOffset, y: targetY },
      { x: targetX, y: targetY },
    ];
    midSegmentIsHorizontal = false;
  }

  // Construir path SVG com cantos arredondados
  const radius = 8;
  const segments: string[] = [`M ${waypoints[0].x} ${waypoints[0].y}`];

  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];

    if (next && i < waypoints.length - 1) {
      // Calcular canto arredondado
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      const r = Math.min(radius, len1 / 2, len2 / 2);

      if (r > 0.5) {
        const t1 = 1 - r / len1;
        const cornerStart = {
          x: prev.x + dx1 * t1,
          y: prev.y + dy1 * t1,
        };
        const t2 = r / len2;
        const cornerEnd = {
          x: curr.x + dx2 * t2,
          y: curr.y + dy2 * t2,
        };
        segments.push(`L ${cornerStart.x} ${cornerStart.y}`);
        segments.push(`Q ${curr.x} ${curr.y} ${cornerEnd.x} ${cornerEnd.y}`);
      } else {
        segments.push(`L ${curr.x} ${curr.y}`);
      }
    } else {
      segments.push(`L ${curr.x} ${curr.y}`);
    }
  }

  return {
    path: segments.join(' '),
    waypoints,
    midSegmentIsHorizontal,
  };
}

function getPathLength(pathD: string): number {
  if (typeof document === 'undefined') return 0;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathD);
  return path.getTotalLength();
}

function getPointAtPathRatio(pathD: string, t: number): { x: number; y: number } {
  if (typeof document === 'undefined') return { x: 0, y: 0 };
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathD);
  const len = path.getTotalLength();
  const pt = path.getPointAtLength(len * Math.max(0, Math.min(1, t)));
  return { x: pt.x, y: pt.y };
}

function ExcalidrawEdgeInner({
  id,
  data: dataProp,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<{ data?: ExcalidrawEdgeData }>) {
  const { edges: edgesFromParent } = useContext(EdgeDataContext);
  const edgeFromParent = edgesFromParent?.find((e) => e.id === id);
  const data = {
    ...(edgeFromParent?.data ?? dataProp ?? {}),
    ...(dataProp ?? {}),
  } as ExcalidrawEdgeData;

  const pathType = (data?.pathType ?? 'step') as WorkflowEdgePathType;
  const strokeStyle = data?.strokeStyle ?? 'solid';
  const strokeWidthKey = (data?.strokeWidth ?? 'medium') as WorkflowEdgeStrokeWidth;
  const label = data?.label ?? '';
  const labelPosition = data?.labelPosition ?? 0.5;
  const showArrow = data?.showArrow !== false;
  const stepOffset = data?.stepOffset ?? 0;
  const sourceOffset = data?.sourceOffset ?? 0;
  const targetOffset = data?.targetOffset ?? 0;

  const sourceNodeInternals = useStore((s) => s.nodeLookup.get(source));
  const targetNodeInternals = useStore((s) => s.nodeLookup.get(target));

  const { pathSource, pathTarget } = useMemo(() => {
    let sx = sourceX;
    let sy = sourceY;
    let tx = targetX;
    let ty = targetY;

    const srcBounds = sourceNodeInternals?.internals?.handleBounds?.source;
    const srcHandleId = sourceHandleId ?? null;
    const srcHandle = srcBounds?.find(
      (h) => (h.id ?? null) === srcHandleId || (srcHandleId == null && (h.id ?? null) == null)
    ) ?? (srcBounds?.length === 1 ? srcBounds[0] : null);
    if (srcHandle && sourceNodeInternals?.internals?.positionAbsolute) {
      const abs = sourceNodeInternals.internals.positionAbsolute;
      const pos = sourcePosition ?? (srcHandle.position as Position);
      switch (pos) {
        case Position.Top:    sx = abs.x + srcHandle.x + srcHandle.width / 2; sy = abs.y + srcHandle.y; break;
        case Position.Right: sx = abs.x + srcHandle.x + srcHandle.width;     sy = abs.y + srcHandle.y + srcHandle.height / 2; break;
        case Position.Bottom: sx = abs.x + srcHandle.x + srcHandle.width / 2; sy = abs.y + srcHandle.y + srcHandle.height; break;
        case Position.Left:   sx = abs.x + srcHandle.x;                       sy = abs.y + srcHandle.y + srcHandle.height / 2; break;
        default:              sx = abs.x + srcHandle.x + srcHandle.width / 2; sy = abs.y + srcHandle.y + srcHandle.height / 2;
      }
    } else {
      const adjusted = applyOffset(sourceX, sourceY, sourcePosition, sourceOffset);
      sx = adjusted.x;
      sy = adjusted.y;
    }

    const tgtBounds = targetNodeInternals?.internals?.handleBounds?.target;
    const tgtHandleId = targetHandleId ?? 'entrada';
    const tgtHandle = tgtBounds?.find((h) => String(h.id ?? 'entrada') === String(tgtHandleId))
      ?? (tgtBounds?.length === 1 ? tgtBounds[0] : null);
    if (tgtHandle && targetNodeInternals?.internals?.positionAbsolute) {
      const abs = targetNodeInternals.internals.positionAbsolute;
      const pos = targetPosition ?? (tgtHandle.position as Position);
      switch (pos) {
        case Position.Top:    tx = abs.x + tgtHandle.x + tgtHandle.width / 2; ty = abs.y + tgtHandle.y; break;
        case Position.Right:  tx = abs.x + tgtHandle.x + tgtHandle.width;     ty = abs.y + tgtHandle.y + tgtHandle.height / 2; break;
        case Position.Bottom: tx = abs.x + tgtHandle.x + tgtHandle.width / 2; ty = abs.y + tgtHandle.y + tgtHandle.height; break;
        case Position.Left:   tx = abs.x + tgtHandle.x;                       ty = abs.y + tgtHandle.y + tgtHandle.height / 2; break;
        default:              tx = abs.x + tgtHandle.x + tgtHandle.width / 2; ty = abs.y + tgtHandle.y + tgtHandle.height / 2;
      }
    } else {
      const adjusted = applyOffset(targetX, targetY, targetPosition, targetOffset);
      tx = adjusted.x;
      ty = adjusted.y;
    }

    const ps = insetPoint(sx, sy, sourcePosition, EDGE_SOURCE_INSET);
    const pt = insetPoint(tx, ty, targetPosition, EDGE_TARGET_INSET);
    return { pathSource: ps, pathTarget: pt };
  }, [
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    sourceOffset,
    targetOffset,
    sourceHandleId,
    targetHandleId,
    sourceNodeInternals,
    targetNodeInternals,
  ]);

  const pathResult = useMemo(() => {
    if (pathType === 'step') {
      const result = buildOrthogonalPath(
        pathSource.x,
        pathSource.y,
        pathTarget.x,
        pathTarget.y,
        sourcePosition,
        targetPosition,
        stepOffset
      );
      const labelPt = getPointAtPathRatio(result.path, labelPosition);
      return {
        path: result.path,
        labelX: labelPt.x,
        labelY: labelPt.y,
        waypoints: result.waypoints,
        midSegmentIsHorizontal: result.midSegmentIsHorizontal,
      };
    }

    const pathParams = {
      sourceX: pathSource.x,
      sourceY: pathSource.y,
      targetX: pathTarget.x,
      targetY: pathTarget.y,
      sourcePosition,
      targetPosition,
    };

    let path: string;
    let labelX: number;
    let labelY: number;

    if (pathType === 'straight') {
      [path, labelX, labelY] = getStraightPath(pathParams);
    } else {
      [path, labelX, labelY] = getBezierPath({
        ...pathParams,
        curvature: 0.35,
      });
    }

    return {
      path,
      labelX,
      labelY,
      waypoints: [],
      midSegmentIsHorizontal: true,
    };
  }, [
    pathSource.x,
    pathSource.y,
    pathTarget.x,
    pathTarget.y,
    sourcePosition,
    targetPosition,
    pathType,
    stepOffset,
    labelPosition,
  ]);

  const strokeWidth = STROKE_WIDTH_MAP[strokeWidthKey];
  const strokeColor = '#64748b';
  const edgeStyle = useMemo(
    () => ({
      strokeWidth,
      stroke: strokeColor,
      strokeDasharray:
        strokeStyle === 'dashed' ? `${strokeWidth * 2} ${strokeWidth}` : undefined,
      fill: 'none',
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
    }),
    [strokeWidth, strokeStyle, strokeColor]
  );

  // Bolinha só quando há duas curvas (dois ângulos de 90°); com uma curva (L) nunca aparece
  const midHandle = useMemo(() => {
    if (pathType !== 'step' || pathResult.waypoints.length < 4) return null;
    const [w0, p1, p2, w3] = pathResult.waypoints;
    const dx1 = p1.x - w0.x;
    const dy1 = p1.y - w0.y;
    const dx2 = p2.x - p1.x;
    const dy2 = p2.y - p1.y;
    const dx3 = w3.x - p2.x;
    const dy3 = w3.y - p2.y;
    const cross1 = dx1 * dy2 - dy1 * dx2;
    const cross2 = dx2 * dy3 - dy2 * dx3;
    const eps = 1e-6;
    const umaCurva = Math.abs(cross1) < eps || Math.abs(cross2) < eps;
    if (umaCurva) return null;
    const lenMid = Math.hypot(dx2, dy2);
    if (lenMid < 50) return null;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    return { midX, midY, isHorizontal: pathResult.midSegmentIsHorizontal };
  }, [pathType, pathResult.waypoints, pathResult.midSegmentIsHorizontal]);

  const { onEdgeDataUpdate } = useContext(EdgeDataContext);
  const { screenToFlowPosition } = useReactFlow();

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    startMouseY: number;
    startMouseX: number;
    origStepOffset: number;
  } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!midHandle) return;
      e.preventDefault();
      e.stopPropagation();
      dragStartRef.current = {
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        origStepOffset: stepOffset,
      };
      setIsDragging(true);
    },
    [midHandle, stepOffset]
  );

  React.useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !onEdgeDataUpdate || !midHandle) return;

      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const startFlow = screenToFlowPosition({
        x: dragStartRef.current.startMouseX,
        y: dragStartRef.current.startMouseY,
      });

      // Mover apenas na direção perpendicular ao segmento
      const delta = midHandle.isHorizontal
        ? flow.y - startFlow.y
        : flow.x - startFlow.x;

      const newStepOffset = dragStartRef.current.origStepOffset + delta;
      onEdgeDataUpdate(id, { stepOffset: newStepOffset });
    };

    const onUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, id, onEdgeDataUpdate, midHandle, screenToFlowPosition]);

  const cursor = midHandle?.isHorizontal ? 'ns-resize' : 'ew-resize';
  const maskId = `edge-handle-mask-${id}`;

  return (
    <>
      {midHandle && (
        <defs>
          <mask id={maskId}>
            <rect x="-5000" y="-5000" width="10000" height="10000" fill="white" />
            <circle
              cx={midHandle.midX}
              cy={midHandle.midY}
              r={SEGMENT_HANDLE_RADIUS + 1}
              fill="black"
            />
          </mask>
        </defs>
      )}
      <g className="nodrag nopan">
        <path
          d={pathResult.path}
          fill="none"
          stroke="transparent"
          strokeWidth={28}
          style={{ cursor: 'pointer' }}
        />
        <g mask={midHandle ? `url(#${maskId})` : undefined}>
          <BaseEdge
            id={id}
            path={pathResult.path}
            style={edgeStyle}
            interactionWidth={24}
            labelX={pathResult.labelX}
            labelY={pathResult.labelY}
          />
          {showArrow && (
            <path
              d={pathResult.path}
              fill="none"
              stroke={strokeColor}
              strokeWidth={Math.max(strokeWidth + 1.5, 4)}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="workflow-edge-flow"
            />
          )}
        </g>
        {midHandle && (
          <g className="nodrag nopan" style={{ cursor, pointerEvents: 'all' }}>
            <circle
              cx={midHandle.midX}
              cy={midHandle.midY}
              r={12}
              fill="transparent"
              onMouseDown={handleMouseDown}
            />
            <circle
              cx={midHandle.midX}
              cy={midHandle.midY}
              r={SEGMENT_HANDLE_RADIUS}
              fill="white"
              stroke={strokeColor}
              strokeWidth={1.5}
              style={{ pointerEvents: 'none' }}
            />
          </g>
        )}
      </g>
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${pathResult.labelX}px,${pathResult.labelY}px)`,
              fontSize: 12,
              pointerEvents: 'all',
              background: 'white',
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid #e2e8f0',
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export function ExcalidrawEdge(props: EdgeProps<{ data?: ExcalidrawEdgeData }>) {
  return <ExcalidrawEdgeInner {...props} />;
}
