import React, { useMemo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';

export type GhostConnectionEdgeData = {
  onConnect?: () => void;
};

const EDGE_SOURCE_INSET = 6;
const EDGE_TARGET_INSET = 22;

function GhostConnectionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<GhostConnectionEdgeData>) {
  const onConnect = data?.onConnect;

  const [path, labelX, labelY] = useMemo(
    () =>
      getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        curvature: 0.35,
      }),
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]
  );

  return (
    <>
      <g className="nodrag nopan">
        <BaseEdge
          id={id}
          path={path}
          style={{
            stroke: '#64748b',
            strokeWidth: 2,
            strokeOpacity: 0.35,
            fill: 'none',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }}
          interactionWidth={24}
        />
      </g>
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(${labelX}px,${labelY}px) translate(-50%,-50%)`,
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConnect?.();
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-slate-300 shadow-sm text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors cursor-pointer"
          >
            Conectar
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const GhostConnectionEdgeComponent = GhostConnectionEdge;
