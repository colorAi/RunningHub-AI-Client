import { useCallback, useEffect, useRef, useState } from "react";
import { createCardLibraryStorage } from "../../services/cardLibrary/storage";
import type { LibraryData } from "../../services/cardLibrary/model";
import { MULTITASK_DRAFTS_STORAGE_KEY } from "../multitask/workspaceModel";

export function useCardLibrary(enabled: boolean) {
  const [storage] = useState(() => createCardLibraryStorage());
  const [data, setData] = useState<LibraryData>({ groups: [], cards: [] });
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  const queue = useRef(Promise.resolve());
  const channel = useRef<BroadcastChannel | null>(null);
  const reload = useCallback(async () => {
    const version = ++epoch.current;
    setLoading(true);
    try {
      const next = await storage.load(() => {
        const parsed: unknown = JSON.parse(
          localStorage.getItem(MULTITASK_DRAFTS_STORAGE_KEY) || "[]",
        );
        if (!Array.isArray(parsed)) throw new Error("旧草稿格式异常");
        return parsed;
      });
      if (version !== epoch.current) return;
      setData(next);
      setReady(true);
      setError("");
    } catch (error) {
      if (version === epoch.current)
        setError(error instanceof Error ? error.message : "卡片库读取失败");
    } finally {
      if (version === epoch.current) setLoading(false);
    }
  }, [storage]);
  useEffect(() => {
    if (!enabled) return;
    void reload();
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("rh_card_library_v1");
      channel.current.onmessage = () => {
        void reload();
      };
    }
    const focus = () => {
      void reload();
    };
    window.addEventListener("focus", focus);
    return () => {
      ++epoch.current;
      channel.current?.close();
      channel.current = null;
      window.removeEventListener("focus", focus);
    };
  }, [enabled, reload]);
  const mutate = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    let success = false;
    const next = queue.current.then(async () => {
      try {
        await action();
        success = true;
        await reload();
        channel.current?.postMessage("changed");
      } catch (error) {
        setError(error instanceof Error ? error.message : "保存失败，请重试");
      }
    });
    queue.current = next;
    await next;
    if (queue.current === next) setBusy(false);
    return success;
  };
  return { ...data, ready, loading, busy, error, reload, mutate, storage };
}
export type CardLibrary = ReturnType<typeof useCardLibrary>;
