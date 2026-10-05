import type { SessionState } from './workspaceModel';
export const isCardCancelled = (session: SessionState, cardId: string) => session.cancelled || session.cancelledCards.has(cardId);

export const registerCardConnection = (session: SessionState, cardId: string, connection: { close: () => void } | null) => {
    if (!connection) return () => {};

    let closers = session.connections.get(cardId);
    if (!closers) {
      closers = new Set();
      session.connections.set(cardId, closers);
    }

    const closer = () => connection.close();
    closers.add(closer);

    return () => {
      closer();
      closers?.delete(closer);
    };
  };
