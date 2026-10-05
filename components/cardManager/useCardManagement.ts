import { useEffect, useState } from "react";
import {
  captureConfiguration,
  normalizeOrganization,
  type CardOrganization,
  type SavedCard,
} from "../../services/cardLibrary/model";
import { useCardLibrary } from "./useCardLibrary";
import type { useMultiTaskWorkspace } from "../multitask/useMultiTaskWorkspace";

type Editing = {
  kind: "live" | "save" | "saved";
  id: string;
  organization: CardOrganization;
};
export function useCardManagement(
  workspace: ReturnType<typeof useMultiTaskWorkspace>,
  visible: boolean,
  openTask: (id: string) => void,
) {
  const [enabled, setEnabled] = useState(visible);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editError, setEditError] = useState("");
  const library = useCardLibrary(enabled || visible);
  useEffect(() => {
    if (visible) setEnabled(true);
  }, [visible]);
  useEffect(() => {
    if (!library.ready) return;
    const ids = new Set(library.groups.map((group) => group.id));
    workspace.setCards((previous) => {
      let changed = false;
      const next = previous.map((card) => {
        const organization = normalizeOrganization(card.organization);
        if (organization.groupIds.every((id) => ids.has(id))) return card;
        changed = true;
        return {
          ...card,
          organization: {
            ...organization,
            groupIds: organization.groupIds.filter((id) => ids.has(id)),
          },
        };
      });
      return changed ? next : previous;
    });
  }, [library.ready, library.groups, workspace.setCards]);
  const edit = (kind: Editing["kind"], id: string) => {
    const card =
      kind === "saved"
        ? library.cards.find((card) => card.id === id)
        : workspace.cards.find((card) => card.id === id);
    if (!card) return;
    setEnabled(true);
    setEditError("");
    setEditing({
      kind,
      id,
      organization: normalizeOrganization(card.organization),
    });
  };
  const submit = async (update = false) => {
    if (!editing || !library.ready || library.busy) return;
    const organization = normalizeOrganization(editing.organization);
    if (editing.kind === "saved") {
      if (
        await library.mutate(() =>
          library.storage.editOrganization(editing.id, organization),
        )
      )
        setEditing(null);
      return;
    }
    const card = workspace.cards.find((card) => card.id === editing.id);
    if (!card) {
      setEditError("该任务卡片已被删除");
      return;
    }
    if (editing.kind === "live") {
      workspace.updateCard(card.id, (current) => ({
        ...current,
        organization,
      }));
      setEditing(null);
      return;
    }
    try {
      const captured = captureConfiguration(
        card,
        workspace.buildSnapshotForCard(card),
      );
      const original = update
        ? library.cards.find((saved) => saved.id === card.savedCardId)
        : undefined;
      if (update && !original) {
        setEditError("原卡片已被删除，请另存为新卡片");
        return;
      }
      const saved: SavedCard = {
        id: original?.id || crypto.randomUUID(),
        organization,
        ...captured,
        createdAt: original?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      if (await library.mutate(() => library.storage.save(saved, update))) {
        workspace.updateCard(card.id, (current) => ({
          ...current,
          organization,
          savedCardId: saved.id,
        }));
        workspace.setSessionNotice(
          captured.requiresFiles
            ? "已保存到卡片库；本地待上传文件未保存，使用时请重新选择。"
            : "已保存到卡片库",
        );
        setEditing(null);
      }
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "保存失败，请重试");
    }
  };
  const useSaved = (saved: SavedCard) => {
    const copy = structuredClone(saved);
    const id = workspace.handleCreateCard({
      ...copy.configuration,
      organization: copy.organization,
      savedCardId: saved.id,
      isConnected: copy.configuration.nodes.length > 0,
    });
    if (!copy.configuration.nodes.length)
      void workspace.handleLoadCard(id, copy.configuration.webappId);
    if (saved.requiresFiles)
      workspace.setSessionNotice(
        "此卡片有本地文件未保存，请重新选择文件后运行。",
      );
    openTask(id);
  };
  const duplicateSaved = (card: SavedCard) => {
    const copy = structuredClone(card);
    return library.mutate(() =>
      library.storage.save(
        {
          ...copy,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          organization: {
            ...copy.organization,
            title: `${copy.organization.title || copy.configuration.webAppInfo?.webappName || copy.configuration.webappId} 副本`,
          },
        },
        false,
      ),
    );
  };
  return {
    library,
    editing,
    setEditing,
    editError,
    edit,
    submit,
    useSaved,
    duplicateSaved,
  };
}
export type CardManagement = ReturnType<typeof useCardManagement>;
