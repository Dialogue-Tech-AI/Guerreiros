import React, { createContext } from 'react';
import type { Edge } from '@xyflow/react';

type EdgeDataContextValue = {
  edges: Edge[];
  onEdgeDataUpdate?: (edgeId: string, dataUpdate: Record<string, unknown>) => void;
};

export const EdgeDataContext = createContext<EdgeDataContextValue>({ edges: [] });
