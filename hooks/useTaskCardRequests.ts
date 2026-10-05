import { useCallback, useState } from 'react';

export interface TaskCardRequest {
  requestId: string;
  webappId: string;
}

/** Page-local user intents: acknowledged after creation, never replayed on refresh. */
export function useTaskCardRequests() {
  const [requests, setRequests] = useState<TaskCardRequest[]>([]);
  const enqueue = useCallback((webappId: string) => {
    const id = webappId.trim();
    if (!id) return false;
    const request = { requestId: crypto.randomUUID(), webappId: id };
    setRequests(previous => [...previous, request]);
    return true;
  }, []);
  const acknowledge = useCallback((ids: string[]) => {
    const handled = new Set(ids);
    setRequests(previous => previous.filter(request => !handled.has(request.requestId)));
  }, []);
  return { requests, enqueue, acknowledge };
}
