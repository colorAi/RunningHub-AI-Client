import React, { useEffect, useMemo, useState } from "react";
import { Layers, Plus, Search } from "lucide-react";
import type { useMultiTaskWorkspace } from "../multitask/useMultiTaskWorkspace";
import {
  matchesCard,
  normalizeOrganization,
  uniqueNames,
} from "../../services/cardLibrary/model";
import type { CardManagement } from "./useCardManagement";
import { controlClass } from "./ManagerDialog";
import CardTile from "./CardTile";
import CardMutationDialog, { type CardMutation } from "./CardMutationDialog";

export default function CardManagerView({
  workspace,
  management: m,
  openTask,
}: {
  workspace: ReturnType<typeof useMultiTaskWorkspace>;
  management: CardManagement;
  openTask: (id: string) => void;
}) {
  const { library } = m;
  const [tab, setTab] = useState<"library" | "current">("library");
  const [groupId, setGroupId] = useState("all");
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [dialog, setDialog] = useState<CardMutation | null>(null);
  const suggestions = useMemo(
    () =>
      uniqueNames([
        ...library.cards.flatMap((card) => card.organization.tags),
        ...workspace.cards.flatMap((card) => card.organization?.tags || []),
      ]).sort(),
    [library.cards, workspace.cards],
  );
  const filter = (
    configuration: Parameters<typeof matchesCard>[0],
    organization: Parameters<typeof matchesCard>[1],
  ) =>
    matchesCard(
      configuration,
      normalizeOrganization(organization),
      query,
      groupId,
      tags,
    );
  const saved = library.cards
    .filter((card) => filter(card.configuration, card.organization))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const current = workspace.cards.filter((card) =>
    filter(card, card.organization),
  );
  const count = (id: string) => {
    const cards = tab === "library" ? library.cards : workspace.cards;
    return cards.filter(
      (card) =>
        id === "all" ||
        (id === "ungrouped"
          ? !card.organization?.groupIds.length
          : card.organization?.groupIds.includes(id)),
    ).length;
  };
  const groups = [
    { id: "all", name: "全部卡片" },
    { id: "ungrouped", name: "未分组" },
    ...library.groups,
  ];
  const openDialog = setDialog;
  useEffect(() => {
    if (
      library.ready &&
      groupId !== "all" &&
      groupId !== "ungrouped" &&
      !library.groups.some((group) => group.id === groupId)
    )
      setGroupId("all");
  }, [library.ready, library.groups, groupId]);
  const selectedGroup = library.groups.find((group) => group.id === groupId);
  return (
    <section
      className="flex h-full min-h-0 w-full flex-col bg-slate-50 text-slate-800 dark:bg-[#0F1115] dark:text-slate-100"
      aria-label="卡片管理"
    >
      <header className="shrink-0 border-b border-slate-200 p-4 dark:border-slate-800 sm:px-6">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Layers className="h-5 w-5 text-brand-500" />
          卡片管理
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          按用途整理应用与参数，在卡片库复用配置，或回到当前任务继续操作。
        </p>
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="tablist"
          aria-label="卡片展示范围"
          onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
              event.preventDefault();
              const next = tab === "library" ? "current" : "library";
              setTab(next);
              document.getElementById(`card-tab-${next}`)?.focus();
            }
          }}
        >
          <button
            role="tab"
            id="card-tab-library"
            aria-controls="card-manager-panel"
            tabIndex={tab === "library" ? 0 : -1}
            aria-selected={tab === "library"}
            className={`${controlClass} ${tab === "library" ? "!border-brand-500 !text-brand-600" : ""}`}
            onClick={() => setTab("library")}
          >
            我的卡片库 ({library.cards.length})
          </button>
          <button
            role="tab"
            id="card-tab-current"
            aria-controls="card-manager-panel"
            tabIndex={tab === "current" ? 0 : -1}
            aria-selected={tab === "current"}
            className={`${controlClass} ${tab === "current" ? "!border-brand-500 !text-brand-600" : ""}`}
            onClick={() => setTab("current")}
          >
            当前任务 ({workspace.cards.length})
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0" />
            <input
              aria-label="搜索卡片"
              placeholder="搜索名称、应用或 ID"
              className={`${controlClass} w-full min-w-0`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className={controlClass}
            disabled={!library.ready || library.busy}
            onClick={() => openDialog({ kind: "group" })}
          >
            <Plus className="mr-1 inline h-4 w-4" />
            新建分组
          </button>
        </div>
        {!!suggestions.length && (
          <div
            aria-label="标签筛选"
            className="mt-3 flex max-h-24 flex-wrap gap-2 overflow-y-auto"
          >
            {suggestions.map((tag) => (
              <button
                key={tag}
                aria-pressed={tags.includes(tag)}
                className={`${controlClass} !rounded-full !py-1 ${tags.includes(tag) ? "!border-brand-500 !text-brand-600" : ""}`}
                onClick={() =>
                  setTags((old) =>
                    old.includes(tag)
                      ? old.filter((item) => item !== tag)
                      : [...old, tag],
                  )
                }
              >
                {tag}
              </button>
            ))}
          </div>
        )}
        {(query || tags.length > 0 || groupId !== "all") && (
          <button
            className="mt-2 text-sm text-brand-600 underline"
            onClick={() => {
              setGroupId("all");
              setTags([]);
              setQuery("");
            }}
          >
            清空筛选
          </button>
        )}
        {library.error && (
          <div role="alert" className="mt-3 text-sm text-red-500">
            {library.error}{" "}
            <button className="underline" onClick={() => void library.reload()}>
              重试读取
            </button>
          </div>
        )}
        {library.loading && (
          <p role="status" className="mt-2 text-sm text-slate-500">
            正在读取卡片库…
          </p>
        )}
        {workspace.sessionNotice && (
          <p role="status" className="mt-2 text-sm text-brand-600">
            {workspace.sessionNotice}
          </p>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          aria-label="卡片分组"
          className="shrink-0 border-b border-slate-200 p-4 dark:border-slate-800 md:w-52 md:overflow-y-auto md:border-b-0 md:border-r"
        >
          <select
            aria-label="选择卡片组"
            className={`${controlClass} w-full md:hidden`}
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} ({count(group.id)})
              </option>
            ))}
          </select>
          <div className="hidden space-y-1 md:block">
            {groups.map((group) => (
              <button
                key={group.id}
                aria-pressed={groupId === group.id}
                className={`${controlClass} flex w-full justify-between gap-2 !text-left ${groupId === group.id ? "!border-brand-500 !text-brand-600" : "!border-transparent"}`}
                onClick={() => setGroupId(group.id)}
              >
                <span className="break-all">{group.name}</span>
                <span>{count(group.id)}</span>
              </button>
            ))}
          </div>
          {selectedGroup && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={controlClass}
                disabled={library.busy}
                onClick={() =>
                  openDialog({ kind: "group", group: selectedGroup })
                }
              >
                重命名组
              </button>
              <button
                className={controlClass}
                disabled={library.busy}
                onClick={() =>
                  openDialog({
                    kind: "deleteGroup",
                    id: selectedGroup.id,
                    name: selectedGroup.name,
                  })
                }
              >
                删除组
              </button>
            </div>
          )}
        </aside>
        <div
          role="tabpanel"
          id="card-manager-panel"
          aria-labelledby={`card-tab-${tab}`}
          aria-label={tab === "library" ? "我的卡片库" : "当前任务"}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6"
        >
          {tab === "current" && (
            <p className="mb-4 text-sm text-slate-500">
              这里显示当前会话的任务。需要以后复用的配置，请保存到卡片库。
            </p>
          )}
          {(tab === "library" ? saved : current).length === 0 &&
            !library.loading && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
                <p>没有匹配的卡片</p>
                <p className="mt-2 text-sm">
                  可清空筛选，或在“当前任务”中将常用配置保存到卡片库。
                </p>
              </div>
            )}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {tab === "library"
              ? saved.map((card) => (
                  <CardTile
                    key={card.id}
                    appId={card.configuration.webappId}
                    appInfo={card.configuration.webAppInfo}
                    organization={card.organization}
                    groups={library.groups}
                    primary="使用"
                    onPrimary={() => m.useSaved(card)}
                    status={
                      card.requiresFiles
                        ? "使用时需重新选择本地文件"
                        : undefined
                    }
                  >
                    <button
                      className={controlClass}
                      disabled={library.busy}
                      onClick={() => m.edit("saved", card.id)}
                    >
                      编辑
                    </button>
                    <button
                      className={controlClass}
                      disabled={library.busy}
                      onClick={() => void m.duplicateSaved(card)}
                    >
                      复制
                    </button>
                    <button
                      className={controlClass}
                      disabled={library.busy}
                      onClick={() =>
                        openDialog({
                          kind: "deleteCard",
                          id: card.id,
                          name:
                            card.organization.title ||
                            card.configuration.webAppInfo?.webappName ||
                            card.configuration.webappId,
                        })
                      }
                    >
                      删除
                    </button>
                  </CardTile>
                ))
              : current.map((card) => (
                  <CardTile
                    key={card.id}
                    appId={card.webappId}
                    appInfo={card.webAppInfo}
                    organization={normalizeOrganization(card.organization)}
                    groups={library.groups}
                    primary="打开卡片"
                    onPrimary={() => openTask(card.id)}
                    status={`${card.run.progressText} · ${card.run.progressPercent}%`}
                  >
                    <button
                      className={controlClass}
                      onClick={() => m.edit("live", card.id)}
                    >
                      分类
                    </button>
                    <button
                      className={controlClass}
                      disabled={!card.webappId.trim()}
                      onClick={() => m.edit("save", card.id)}
                    >
                      保存到卡片库
                    </button>
                    <button
                      className={controlClass}
                      onClick={() => workspace.handleDuplicateCard(card.id)}
                    >
                      复制
                    </button>
                    <button
                      className={controlClass}
                      disabled={
                        !!workspace.sessionRef.current?.runningCardIds.has(
                          card.id,
                        )
                      }
                      onClick={() =>
                        openDialog({
                          kind: "deleteLive",
                          id: card.id,
                          name:
                            card.organization?.title ||
                            card.webappId ||
                            "新任务卡片",
                        })
                      }
                    >
                      删除
                    </button>
                  </CardTile>
                ))}
          </div>
        </div>
      </div>
      {dialog && (
        <CardMutationDialog
          dialog={dialog}
          library={library}
          workspace={workspace}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
