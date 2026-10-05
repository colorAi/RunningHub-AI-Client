import { useEffect, useRef, useState } from 'react';
import type { TaskCardRequest } from '../../hooks/useTaskCardRequests';
import type { useMultiTaskWorkspace } from './useMultiTaskWorkspace';

export function useRequestedCards(
  requests: TaskCardRequest[],
  acknowledge: (ids: string[]) => void,
  workspace: ReturnType<typeof useMultiTaskWorkspace>,
  active: boolean,
) {
  const consumed = useRef(new Set<string>());
  const listRef = useRef<HTMLDivElement>(null);
  const [revealCardId, setRevealCardId] = useState<string | null>(null);
  const { handleCreateCardFromPreset, cards } = workspace;

  useEffect(() => {
    if (!requests.length) { consumed.current.clear(); return; }
    for (const request of requests) {
      if (consumed.current.has(request.requestId)) continue;
      // Mark synchronously before triggering updates, including StrictMode effect replay.
      consumed.current.add(request.requestId);
      const cardId = handleCreateCardFromPreset({ id: request.requestId, webappId: request.webappId });
      setRevealCardId(cardId);
    }
    acknowledge(requests.map(request => request.requestId));
  }, [requests, acknowledge, handleCreateCardFromPreset]);

  useEffect(() => {
    if (!active || !revealCardId) return;
    const element = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-task-card-id]') || [])]
      .find(element => element.dataset.taskCardId === revealCardId);
    if (!element) return;
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    setRevealCardId(null);
  }, [active, revealCardId, cards]);
  return listRef;
}
