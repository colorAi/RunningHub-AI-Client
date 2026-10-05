import React from "react";
import ManagerDialog, { controlClass } from "./ManagerDialog";
import OrganizationEditor from "./OrganizationEditor";
import type { CardManagement } from "./useCardManagement";
import type { MultiTaskCardData } from "../multitask/cardTypes";
import { uniqueNames } from "../../services/cardLibrary/model";

export default function CardManagementDialog({
  management: m,
  cards,
}: {
  management: CardManagement;
  cards: MultiTaskCardData[];
}) {
  if (!m.editing) return null;
  const { editing, library } = m;
  const source = cards.find((card) => card.id === editing.id);
  const suggestions = uniqueNames([
    ...library.cards.flatMap((card) => card.organization.tags),
    ...cards.flatMap((card) => card.organization?.tags || []),
  ]);
  const error = m.editError || library.error;
  return (
    <ManagerDialog
      title={editing.kind === "save" ? "保存到卡片库" : "编辑卡片分类"}
      busy={library.busy}
      onClose={() => m.setEditing(null)}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void m.submit(false);
        }}
      >
        <fieldset disabled={library.busy || !library.ready}>
          <OrganizationEditor
            value={editing.organization}
            onChange={(organization) =>
              m.setEditing({ ...editing, organization })
            }
            groups={library.groups}
            suggestions={suggestions}
          />
        </fieldset>
        {editing.kind === "save" && (
          <p className="mt-4 text-sm text-slate-500">
            保存应用及参数配置。本地待上传文件需要重新选择；新任务需单独设置下载目录。
          </p>
        )}
        {editing.kind === "saved" && (
          <p className="mt-4 text-sm text-slate-500">
            如需修改参数，请使用此卡片，在任务编辑器调整后点击“更新已保存卡片”。
          </p>
        )}
        {!library.ready && !error && <p role="status">正在加载卡片库…</p>}
        {error && (
          <div role="alert" className="mt-3 text-sm text-red-500">
            {error}{" "}
            <button
              type="button"
              onClick={() => void library.reload()}
              className="underline"
            >
              重新读取
            </button>
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {editing.kind === "save" && source?.savedCardId && (
            <button
              type="button"
              className={controlClass}
              disabled={library.busy || !library.ready}
              onClick={() => void m.submit(true)}
            >
              更新已保存卡片
            </button>
          )}
          <button
            className={`${controlClass} !bg-brand-500 !text-white`}
            disabled={library.busy || !library.ready}
          >
            {library.busy
              ? "保存中…"
              : editing.kind === "save" && source?.savedCardId
                ? "另存为新卡片"
                : "保存"}
          </button>
        </div>
      </form>
    </ManagerDialog>
  );
}
