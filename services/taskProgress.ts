export interface TaskProgressSnapshot {
  overallPercent: number;
  currentNodeId: string | null;
  currentNodeName: string | null;
  currentNodePercent: number;
  completedNodeIds: string[];
  cachedNodeIds: string[];
  rawType: string;
}

interface TaskProgressCallbacks {
  onOpen?: () => void;
  onProgress?: (snapshot: TaskProgressSnapshot) => void;
  onError?: (error: Event) => void;
  onClose?: () => void;
}

interface TaskProgressConnection {
  close: () => void;
}

const toPercent = (value: number, max: number): number => {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
};

export const connectTaskProgress = (
  wssUrl: string,
  nodeNameMap: Record<string, string>,
  callbacks: TaskProgressCallbacks = {},
): TaskProgressConnection => {
  const socket = new WebSocket(wssUrl);

  let currentNodeId: string | null = null;
  let currentValue = 0;
  let currentMax = 0;
  const completedNodeIds = new Set<string>();
  const cachedNodeIds = new Set<string>();
  const totalNodes = Math.max(Object.keys(nodeNameMap).length, 1);

  const emit = (rawType: string) => {
    const currentNodePercent = toPercent(currentValue, currentMax);
    const completedCount = completedNodeIds.size + (currentNodeId ? currentNodePercent / 100 : 0);

    callbacks.onProgress?.({
      overallPercent: Math.max(0, Math.min(100, (completedCount / totalNodes) * 100)),
      currentNodeId,
      currentNodeName: currentNodeId ? (nodeNameMap[currentNodeId] || currentNodeId) : null,
      currentNodePercent,
      completedNodeIds: [...completedNodeIds],
      cachedNodeIds: [...cachedNodeIds],
      rawType,
    });
  };

  socket.onopen = () => callbacks.onOpen?.();

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data));
      const rawType = String(payload?.type || '');
      const data = payload?.data || {};

      if (rawType === 'progress') {
        currentNodeId = data.node ? String(data.node) : currentNodeId;
        currentValue = Number(data.value || 0);
        currentMax = Number(data.max || 0);
        emit(rawType);
        return;
      }

      if (rawType === 'executing') {
        const nextNodeId = data.node ? String(data.node) : null;
        if (currentNodeId && currentNodeId !== nextNodeId) {
          completedNodeIds.add(currentNodeId);
        }
        currentNodeId = nextNodeId;
        currentValue = 0;
        currentMax = 0;
        emit(rawType);
        return;
      }

      if (rawType === 'execution_cached') {
        const nodes = Array.isArray(data.nodes) ? data.nodes : [];
        nodes.forEach((nodeId: unknown) => {
          const normalizedNodeId = String(nodeId || '');
          if (normalizedNodeId) {
            cachedNodeIds.add(normalizedNodeId);
            completedNodeIds.add(normalizedNodeId);
          }
        });
        emit(rawType);
        return;
      }

      if (rawType === 'execution_success') {
        if (currentNodeId) {
          completedNodeIds.add(currentNodeId);
        }
        currentNodeId = null;
        currentValue = 0;
        currentMax = 0;
        emit(rawType);
      }
    } catch {
      // Ignore malformed progress events and rely on polling as source of truth.
    }
  };

  socket.onerror = (error) => callbacks.onError?.(error);
  socket.onclose = () => callbacks.onClose?.();

  return {
    close: () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    },
  };
};
