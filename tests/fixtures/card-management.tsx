import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "../../services/i18n";
import { createCardLibraryStorage } from "../../services/cardLibrary/storage";
import { storageCases } from "./card-library-storage";
import { useMultiTaskWorkspace } from "../../components/multitask/useMultiTaskWorkspace";
import { useCardManagement } from "../../components/cardManager/useCardManagement";
import { useRunHistory } from "../../components/multitask/history/useRunHistory";

const report = document.getElementById("report")!;
const check = (ok: unknown, text: string) => {
  if (!ok) throw Error(text);
  report.textContent += `PASS ${text}\n`;
};
async function until(condition: () => boolean, label: string) {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw Error(`timeout: ${label}`);
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 50));
const visible = (node: Element) =>
  !!(node as HTMLElement).getClientRects().length;
const buttons = (scope: ParentNode = document) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button")].filter(visible);
function click(text: string, scope: ParentNode = document) {
  const button = buttons(scope).find(
    (b) => b.textContent?.trim() === text && !b.disabled,
  );
  if (!button) throw Error(`missing button ${text}`);
  button.click();
}
function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
    element,
    value,
  );
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
const modal = () => document.querySelector<HTMLDialogElement>("dialog[open]")!;
const manager = () =>
  document.querySelector<HTMLElement>('section[aria-label="卡片管理"]')!;
const tiles = () => [
  ...(manager()?.querySelectorAll<HTMLElement>("article") || []),
];
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
const node = {
  nodeId: "1",
  nodeName: "提示词",
  fieldName: "prompt",
  fieldType: "STRING" as const,
  fieldValue: "旧参数",
};
const oldDrafts = [
  {
    id: "fixture-draft",
    name: "旧草稿组",
    createdAt: 1,
    updatedAt: 2,
    cards: [
      {
        webappId: "101",
        webAppInfo: { webappName: "语音应用", description: "", covers: [] },
        nodes: [node],
        instanceType: "default",
        initialBatchList: [],
      },
      {
        webappId: "101",
        webAppInfo: {
          webappName: "同应用其他配置",
          description: "",
          covers: [
            {
              thumbnailUri: "http://127.0.0.1:5185/missing-cover.png",
              uri: "",
            },
          ],
        },
        nodes: [{ ...node, fieldValue: "其他参数" }],
        initialBatchList: [],
      },
    ],
  },
];
let submissions = 0;

let w: ReturnType<typeof useMultiTaskWorkspace>;
let management: ReturnType<typeof useCardManagement>;
let history: ReturnType<typeof useRunHistory>;
let toggle: (value: boolean) => void;
function StateCases() {
  const [active, setActive] = useState(true);
  toggle = setActive;
  w = useMultiTaskWorkspace([]);
  history = useRunHistory();
  management = useCardManagement(w, active, () => {});
  return <div>{active ? "manager" : "workspace"}</div>;
}

async function run() {
  if (location.port !== "5185")
    throw Error("Use isolated origin 127.0.0.1:5185");
  await storageCases(oldDrafts, check);
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("rh_card_library_v1");
    request.onsuccess = () => resolve();
    request.onerror = request.onblocked = () =>
      reject(Error("fixture database busy"));
  });
  for (const [key, value] of Object.entries({
    rh_terms_agreed: "true",
    rh_startup_view: "multitask",
    rh_home_default_tab: "official",
    rh_api_keys_v2: "[]",
    rh_enterprise_api_v1: "{}",
    rh_favorites: "[]",
    rh_recent_apps: "[]",
    rh_multitask_drafts_v1: JSON.stringify(oldDrafts),
    rh_autosave_config: "{}",
  }))
    localStorage.setItem(key, value);
  const realFetch = window.fetch.bind(window);
  window.fetch = async (resource, options) => {
    const url = new URL(
      typeof resource === "string"
        ? resource
        : resource instanceof URL
          ? resource.href
          : resource.url,
      location.href,
    );
    if (url.origin === location.origin) return realFetch(resource, options);
    if (/\/run$/.test(url.pathname)) submissions++;
    if (url.pathname.endsWith("/webapp/list"))
      return json({ code: 0, data: { total: 0, records: [] } });
    throw Error(`Unexpected external request ${url.pathname}`);
  };
  (window as any).showDirectoryPicker = async () => ({
    name: "fixture-downloads",
    kind: "directory",
    requestPermission: async () => "granted",
  });
  const { default: App } = await import("../../App");
  // Mount with corrupt source first: the workspace must not replace it with [].
  localStorage.setItem("rh_multitask_drafts_v1", "{broken");
  let root = createRoot(document.getElementById("root")!);
  root.render(
    <LanguageProvider>
      <App />
    </LanguageProvider>,
  );
  await until(
    () => buttons().some((b) => b.textContent?.trim() === "卡片管理"),
    "navigation",
  );
  click("卡片管理");
  await until(
    () => !!manager()?.textContent?.includes("旧草稿读取失败"),
    "corrupt legacy source feedback",
  );
  check(
    localStorage.getItem("rh_multitask_drafts_v1") === "{broken",
    "failed source read never overwrites legacy storage",
  );
  localStorage.setItem("rh_multitask_drafts_v1", JSON.stringify(oldDrafts));
  click("重试读取");
  await until(() => tiles().length === 2, "automatic draft import");
  const retainedDrafts = JSON.parse(
    localStorage.getItem("rh_multitask_drafts_v1")!,
  );
  check(
    retainedDrafts.length === 1 &&
      retainedDrafts[0].id === oldDrafts[0].id &&
      retainedDrafts[0].cards.length === 2 &&
      retainedDrafts[0].cards[0].nodes[0].fieldValue === "旧参数",
    "legacy drafts and parameters remain available",
  );
  check(
    tiles().some((t) => t.textContent?.includes("语音应用")),
    "independent manager displays application cards",
  );
  click("新建分组");
  await tick();
  input(modal().querySelector("input")!, "日常工具");
  await tick();
  click("保存分组", modal());
  await until(
    () => !modal() && manager().textContent!.includes("日常工具"),
    "group created",
  );
  click("编辑", tiles()[0]);
  await tick();
  const groupBox = [
    ...modal().querySelectorAll<HTMLInputElement>("input[type=checkbox]"),
  ].find((c) => c.parentElement!.textContent === "日常工具")!;
  groupBox.click();
  await tick();
  const tagInput = modal().querySelector<HTMLInputElement>(
    'input[placeholder*="字幕提取"]',
  )!;
  input(tagInput, "识别");
  await tick();
  click("添加标签", modal());
  await tick();
  input(tagInput, "字幕");
  await tick();
  click("添加标签", modal());
  await tick();
  click("保存", modal());
  await until(() => !modal(), "metadata saved");
  check(
    tiles()[0].textContent!.includes("日常工具") &&
      tiles()[0].textContent!.includes("旧草稿组"),
    "same card displayed with multiple groups",
  );
  const filterTags = manager().querySelector('[aria-label="标签筛选"]')!;
  click("识别", filterTags);
  await tick();
  click("字幕", filterTags);
  await tick();
  check(tiles().length === 1, "tag filters intersect");
  input(manager().querySelector('input[aria-label="搜索卡片"]')!, "不存在");
  await tick();
  check(
    tiles().length === 0 && manager().textContent!.includes("没有匹配"),
    "search empty state",
  );
  click("清空筛选");
  await tick();
  click("使用", tiles()[0]);
  await until(
    () =>
      [...document.querySelectorAll<HTMLElement>("[data-task-card-id]")].filter(
        visible,
      ).length === 2,
    "template creates new task",
  );
  const first = [
    ...document.querySelectorAll<HTMLElement>("[data-task-card-id]"),
  ].at(-1)!;
  const firstId = first.dataset.taskCardId;
  const parameter = [
    ...first.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    ),
  ].find((e) => e.value === "旧参数")!;
  check(!!parameter, "template restores parameters");
  input(parameter, "修改但未保存");
  await tick();
  click("选择目录", first);
  await until(
    () => first.textContent!.includes("fixture-downloads"),
    "fake directory selected",
  );
  click("卡片管理");
  await tick();
  click(`当前任务 (2)`);
  await tick();
  const existingTile = tiles().find((t) =>
    t.textContent!.includes("语音应用"),
  )!;
  click("打开卡片", existingTile);
  await tick();
  check(
    document.querySelector(`[data-task-card-id="${firstId}"]`) === first &&
      parameter.value === "修改但未保存",
    "open-current preserves editor DOM and unsaved parameters",
  );
  check(
    first.textContent!.includes("fixture-downloads"),
    "navigation preserves per-card directory",
  );
  click("保存到卡片库", first);
  await tick();
  click("更新已保存卡片", modal());
  await until(() => !modal(), "template updated from latest editor");
  click("卡片管理");
  await tick();
  click("我的卡片库 (2)");
  await tick();
  click("使用", tiles()[0]);
  await tick();
  const second = [
    ...document.querySelectorAll<HTMLElement>("[data-task-card-id]"),
  ].at(-1)!;
  check(
    second.dataset.taskCardId !== firstId &&
      document.querySelectorAll("[data-task-card-id]").length === 3,
    "each use creates a fresh task",
  );
  check(
    [
      ...second.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input, textarea",
      ),
    ].some((e) => e.value === "修改但未保存"),
    "explicit update persisted current parameter value",
  );
  check(
    second.textContent!.includes("尚未设置此卡片的下载目录"),
    "template use does not copy directory permissions",
  );
  click("卡片管理");
  await tick();
  const persisted = await createCardLibraryStorage().load(() => {
    throw Error("already imported");
  });
  check(
    persisted.cards.length === 2 && persisted.groups.length === 2,
    "independent storage instance reads saved library",
  );
  root.unmount();
  root = createRoot(document.getElementById("root")!);
  root.render(
    <LanguageProvider>
      <App />
    </LanguageProvider>,
  );
  await until(
    () => buttons().some((b) => b.textContent?.trim() === "卡片管理"),
    "remount app",
  );
  click("卡片管理");
  await until(() => tiles().length === 2, "persistent library remount");
  check(
    manager().textContent!.includes("日常工具") &&
      manager().textContent!.includes("字幕"),
    "remount restores groups and tags without duplicate import",
  );
  click("复制", tiles()[0]);
  await until(() => tiles().length === 3, "duplicate saved card");
  const copied = tiles().find((tile) => tile.textContent!.includes("副本"))!;
  click("删除", copied);
  await tick();
  click("确认删除", modal());
  await until(() => tiles().length === 2 && !modal(), "delete saved copy");
  check(true, "library duplicate/delete leaves original records intact");
  const groupButton = buttons(manager().querySelector("aside")!).find(
    (button) => button.textContent!.startsWith("日常工具"),
  );
  if (groupButton) groupButton.click();
  else {
    const select = manager().querySelector<HTMLSelectElement>(
      'select[aria-label="选择卡片组"]',
    )!;
    select.value = [...select.options].find((option) =>
      option.textContent!.startsWith("日常工具"),
    )!.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  await tick();
  click("重命名组");
  await tick();
  input(modal().querySelector("input")!, "常用工具");
  await tick();
  click("保存分组", modal());
  await until(
    () => !modal() && manager().textContent!.includes("常用工具"),
    "rename group UI",
  );
  click("删除组");
  await tick();
  click("确认删除", modal());
  await until(() => !modal() && tiles().length === 2, "delete group UI");
  check(
    !manager().textContent!.includes("常用工具"),
    "deleting selected group returns to all cards without deleting templates",
  );
  root.unmount();
  root = createRoot(document.getElementById("root")!);
  root.render(
    <StrictMode>
      <StateCases />
    </StrictMode>,
  );
  await until(() => !!management?.library.ready, "strict mode hooks");
  const liveId = w.cards[0].id;
  const pendingFile = new File(["test"], "audio.wav", { type: "audio/wav" });
  const editorSnapshot = {
    nodes: [node],
    batchList: [],
    pendingFiles: { "task-0|1|audio": pendingFile },
    batchTaskName: "",
    instanceType: "default" as const,
    hasUploadingFiles: false,
    isConnected: true,
  };
  w.editorRefs.current[liveId] = { getSnapshot: () => editorSnapshot };
  w.manualSnapshotsRef.current[liveId] = {
    ...editorSnapshot,
    nodes: [{ ...node, fieldValue: "outdated last run" }],
  };
  w.updateCard(liveId, (card) => ({
    ...card,
    webappId: "101",
    run: {
      ...card.run,
      status: "running",
      currentTaskId: "test-task",
      progressPercent: 50,
    },
  }));
  const fakeDirectory = { name: "persist-dir" } as any;
  history.setDirectory(liveId, fakeDirectory);
  await tick();
  check(
    w.buildSnapshotForCard(w.cards[0]).nodes[0].fieldValue === "旧参数",
    "latest live editor wins over previous run snapshot",
  );
  toggle(false);
  await tick();
  toggle(true);
  await tick();
  management.edit("live", liveId);
  await tick();
  management.setEditing({
    ...management.editing!,
    organization: {
      title: "用途说明",
      groupIds: ["draft:fixture-draft"],
      tags: ["运行中"],
    },
  });
  await tick();
  await management.submit();
  await tick();
  check(
    w.cards[0].run.status === "running" &&
      w.cards[0].run.currentTaskId === "test-task",
    "classification while running preserves task identity and progress",
  );
  check(
    w.editorRefs.current[liveId]!.getSnapshot().pendingFiles[
      "task-0|1|audio"
    ] === pendingFile && history.directories[liveId] === fakeDirectory,
    "classification preserves local file object and directory identity",
  );
  await management.library.mutate(() =>
    management.library.storage.removeGroup("draft:fixture-draft"),
  );
  await tick();
  check(
    w.cards[0].organization!.groupIds.length === 0 &&
      w.cards[0].run.status === "running",
    "group deletion detaches running cards without interrupting them",
  );
  check(submissions === 0, "management submits no paid tasks");
  root.unmount();
  root = createRoot(document.getElementById("root")!);
  root.render(
    <LanguageProvider>
      <App />
    </LanguageProvider>,
  );
  await until(
    () => buttons().some((b) => b.textContent?.trim() === "卡片管理"),
    "final preview",
  );
  click("卡片管理");
  await until(() => tiles().length === 2, "final preview loaded");
  const navigation = buttons().find((b) => b.textContent?.trim() === "卡片管理")!;
  navigation.scrollIntoView({ block: "nearest", inline: "nearest" });
  await tick();
  const navBounds = navigation.getBoundingClientRect();
  const headerBounds = document.querySelector("header")!.getBoundingClientRect();
  check(
    navBounds.height > 0 && navBounds.top >= headerBounds.top &&
      navBounds.bottom <= headerBounds.bottom && navBounds.left >= 0 &&
      navBounds.right <= innerWidth &&
      document.elementFromPoint(navBounds.x + navBounds.width / 2, navBounds.y + navBounds.height / 2)?.closest("button") === navigation,
    "navigation remains visible and clickable at the current viewport",
  );
  document.title = "ALL PASS — card management";
  report.textContent = "ALL PASS — card management\n" + report.textContent;
}
run().catch((error) => {
  document.title = `FAIL — ${error.message}`;
  report.textContent =
    `FAIL ${error.message}\n${error.stack}\n` + report.textContent;
});
