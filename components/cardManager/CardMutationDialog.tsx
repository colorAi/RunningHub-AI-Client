import React, { useState } from "react";
import type { CardGroup } from "../../services/cardLibrary/model";
import type { CardLibrary } from "./useCardLibrary";
import type { useMultiTaskWorkspace } from "../multitask/useMultiTaskWorkspace";
import ManagerDialog, { controlClass } from "./ManagerDialog";

export type CardMutation =
  | { kind: "group"; group?: CardGroup }
  | {
      kind: "deleteGroup" | "deleteCard" | "deleteLive";
      id: string;
      name: string;
    };
export default function CardMutationDialog({
  dialog,
  library,
  workspace,
  onClose,
}: {
  dialog: CardMutation;
  library: CardLibrary;
  workspace: ReturnType<typeof useMultiTaskWorkspace>;
  onClose: () => void;
}) {
  const [groupName, setGroupName] = useState(
    dialog.kind === "group" ? dialog.group?.name || "" : "",
  );
  const [localError, setLocalError] = useState("");
  const submitDialog = async () => {
    let result = false;
    if (dialog.kind === "group") {
      if (!groupName.trim()) {
        setLocalError("请输入分组名称");
        return;
      }
      result = await library.mutate(() =>
        library.storage.saveGroup(
          {
            id: dialog.group?.id || crypto.randomUUID(),
            name: groupName.trim(),
          },
          !!dialog.group,
        ),
      );
    } else if (dialog.kind === "deleteGroup") {
      result = await library.mutate(() =>
        library.storage.removeGroup(dialog.id),
      );
    } else if (dialog.kind === "deleteCard")
      result = await library.mutate(() =>
        library.storage.removeCard(dialog.id),
      );
    else {
      if (workspace.sessionRef.current?.runningCardIds.has(dialog.id)) {
        setLocalError("运行中的卡片不能删除，请先停止追踪");
        return;
      }
      workspace.handleRemoveCard(dialog.id);
      result = true;
    }
    if (result) onClose();
  };
  return (
    <ManagerDialog
      title={
        dialog.kind === "group"
          ? dialog.group
            ? "重命名分组"
            : "新建分组"
          : "确认删除"
      }
      busy={library.busy}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitDialog();
        }}
      >
        {dialog.kind === "group" ? (
          <label className="block text-sm">
            分组名称
            <input
              autoFocus
              className={`${controlClass} mt-2 w-full`}
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
            />
          </label>
        ) : (
          <p>
            删除“{dialog.name}”？
            {dialog.kind === "deleteGroup"
              ? "仅移除分组关系，卡片仍保留。"
              : dialog.kind === "deleteCard"
                ? "已有任务和运行历史仍保留。"
                : "运行历史仍保留。"}
          </p>
        )}
        {(localError || library.error) && (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {localError || library.error}
          </p>
        )}
        <button
          className={`${controlClass} mt-5 !bg-brand-500 !text-white`}
          disabled={library.busy}
        >
          {library.busy
            ? "处理中…"
            : dialog.kind === "group"
              ? "保存分组"
              : "确认删除"}
        </button>
      </form>
    </ManagerDialog>
  );
}
