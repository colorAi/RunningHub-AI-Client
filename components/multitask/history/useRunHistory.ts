import { useEffect, useState, useSyncExternalStore } from 'react';
import type { DirectoryHandle } from '../../../services/fileSystem';
import { RunHistoryController } from '../../../services/runHistory/controller';

export function useRunHistory() {
  const [controller] = useState(() => new RunHistoryController());
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [directories, setDirectories] = useState<Record<string, DirectoryHandle>>({});
  const [filterCard, setFilterCard] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const release = controller.claimOwnership();
    void controller.load();
    return () => { controller.stopAll(); void controller.flush().finally(release); };
  }, [controller]);
  const setDirectory = (cardId: string, directory: DirectoryHandle) => {
    setDirectories(previous => ({ ...previous, [cardId]: directory }));
  };
  return { controller, snapshot, directories, setDirectory, filterCard, setFilterCard };
}
