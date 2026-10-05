import type {
  InstanceType,
  NodeInfo,
  WebAppInfo,
  WorkflowRunOptions,
} from "../../types";

export interface CardOrganization {
  title: string;
  groupIds: string[];
  tags: string[];
}
export interface CardGroup {
  id: string;
  name: string;
}
export interface CardConfiguration {
  webappId: string;
  webAppInfo: WebAppInfo | null;
  nodes: NodeInfo[];
  instanceType: InstanceType;
  runOptions: { retainSeconds?: number };
  initialBatchList: NodeInfo[][];
  initialBatchTaskName: string;
}
export interface SavedCard {
  id: string;
  organization: CardOrganization;
  configuration: CardConfiguration;
  requiresFiles: boolean;
  createdAt: number;
  updatedAt: number;
}
export interface LibraryData {
  groups: CardGroup[];
  cards: SavedCard[];
}
const record = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const string = (value: unknown) => (typeof value === "string" ? value : "");
export const uniqueNames = (values: unknown): string[] =>
  Array.isArray(values)
    ? [
        ...new Set(
          values
            .filter((value) => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ]
    : [];
export const normalizeOrganization = (value?: unknown): CardOrganization => {
  const input = record(value);
  return {
    title: string(input.title).trim(),
    groupIds: uniqueNames(input.groupIds),
    tags: uniqueNames(input.tags),
  };
};
export function safeCover(value: unknown): string {
  try {
    const url = new URL(string(value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
const transient = (value: string) =>
  /^(blob:|data:|file:|__pending)/i.test(value);
const nodeTypes = new Set([
  "IMAGE",
  "AUDIO",
  "VIDEO",
  "STRING",
  "INT",
  "FLOAT",
  "LIST",
  "SWITCH",
  "BOOLEAN",
]);
function decodeNodes(value: unknown): NodeInfo[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const n = record(item);
    if (
      !(typeof n.nodeId === "string" || typeof n.nodeId === "number") ||
      typeof n.fieldName !== "string" ||
      !nodeTypes.has(n.fieldType)
    )
      return [];
    const fieldValue =
      typeof n.fieldValue === "number" || typeof n.fieldValue === "boolean"
        ? String(n.fieldValue)
        : string(n.fieldValue);
    const node: NodeInfo = {
      nodeId: String(n.nodeId),
      nodeName: string(n.nodeName),
      fieldName: n.fieldName,
      fieldType: n.fieldType,
      fieldValue: transient(fieldValue) ? "" : fieldValue,
    };
    for (const key of ["description", "descriptionEn"] as const)
      if (typeof n[key] === "string") node[key] = n[key];
    if (n.fieldData != null) {
      // Parameter option metadata is JSON; omit File objects and other runtime objects.
      try {
        node.fieldData = JSON.parse(JSON.stringify(n.fieldData));
      } catch {
        /* Invalid optional metadata is omitted. */
      }
    }
    if (typeof n.required === "boolean") node.required = n.required;
    if (typeof n.multipleInputs === "boolean")
      node.multipleInputs = n.multipleInputs;
    if (Number.isFinite(n.maxInputNum)) node.maxInputNum = n.maxInputNum;
    return [node];
  });
}
export function decodeConfiguration(value: unknown): CardConfiguration {
  const c = record(value);
  const app = record(c.webAppInfo);
  const webAppInfo: WebAppInfo | null =
    typeof app.webappName === "string"
      ? {
          webappName: app.webappName,
          description: string(app.description),
          descriptionEn: string(app.descriptionEn),
          covers: Array.isArray(app.covers)
            ? app.covers.map((item) => ({
                thumbnailUri: safeCover(record(item).thumbnailUri),
                uri: safeCover(record(item).uri),
              }))
            : [],
        }
      : null;
  const seconds = record(c.runOptions).retainSeconds;
  return {
    webappId: string(c.webappId).trim(),
    webAppInfo,
    nodes: decodeNodes(c.nodes),
    instanceType: c.instanceType === "plus" ? "plus" : "default",
    runOptions: {
      retainSeconds:
        Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined,
    },
    initialBatchList: Array.isArray(c.initialBatchList)
      ? c.initialBatchList.map(decodeNodes)
      : [],
    initialBatchTaskName: string(c.initialBatchTaskName),
  };
}
export function decodeSavedCard(value: unknown): SavedCard | null {
  const c = record(value);
  if (!string(c.id) || !string(record(c.configuration).webappId).trim())
    return null;
  return {
    id: c.id,
    organization: normalizeOrganization(c.organization),
    configuration: decodeConfiguration(c.configuration),
    requiresFiles: c.requiresFiles === true,
    createdAt: Number(c.createdAt) || 0,
    updatedAt: Number(c.updatedAt) || 0,
  };
}
export function decodeGroup(value: unknown): CardGroup | null {
  const g = record(value);
  const name = string(g.name).trim();
  return string(g.id) && name ? { id: g.id, name } : null;
}

/** Explicit boundary: never serialize a workspace card, credentials, task IDs or file handles. */
export function captureConfiguration(
  card: {
    webappId: string;
    webAppInfo?: WebAppInfo | null;
    runOptions?: WorkflowRunOptions;
  },
  snapshot: {
    nodes?: NodeInfo[];
    batchList?: NodeInfo[][];
    pendingFiles?: Record<string, unknown>;
    hasUploadingFiles?: boolean;
    instanceType?: InstanceType;
    batchTaskName?: string;
  },
): { configuration: CardConfiguration; requiresFiles: boolean } {
  if (snapshot.hasUploadingFiles)
    throw new Error("文件正在上传，请完成后再保存");
  if (!string(card.webappId).trim()) throw new Error("请先填写应用 ID");
  let requiresFiles = false;
  const pending = record(snapshot.pendingFiles);
  const scrub = (value: unknown, index: number) => {
    const nodes: NodeInfo[] = Array.isArray(value)
      ? value.filter((node) => node && typeof node === "object")
      : [];
    return nodes.map((node) => {
      const taskId = nodes[0]?._taskId || `task-${index}`;
      const hasPending = Object.keys(pending).some((key) => {
        const [task, id, field] = key.split("|");
        return (
          (task === taskId || task === `task-${index}`) &&
          id === String(node.nodeId) &&
          field === node.fieldName
        );
      });
      if (hasPending || transient(String(node.fieldValue || ""))) {
        requiresFiles = true;
        return { ...node, fieldValue: "" };
      }
      return node;
    });
  };
  const configuration = decodeConfiguration({
    webappId: card.webappId,
    webAppInfo: card.webAppInfo,
    nodes: scrub(snapshot.nodes || [], 0),
    instanceType: snapshot.instanceType,
    runOptions: card.runOptions,
    initialBatchList: (Array.isArray(snapshot.batchList)
      ? snapshot.batchList
      : []
    ).map(scrub),
    initialBatchTaskName: snapshot.batchTaskName,
  });
  return {
    configuration,
    requiresFiles: requiresFiles || Object.keys(pending).length > 0,
  };
}
export function importDrafts(value: unknown): LibraryData {
  const result: LibraryData = { groups: [], cards: [] };
  if (!Array.isArray(value)) return result;
  for (const raw of value) {
    const draft = record(raw);
    if (
      !string(draft.id) ||
      !string(draft.name).trim() ||
      !Array.isArray(draft.cards)
    )
      continue;
    const groupId = `draft:${draft.id}`;
    result.groups.push({ id: groupId, name: draft.name.trim() });
    draft.cards.forEach((rawCard: unknown, index: number) => {
      const c = record(rawCard);
      if (!string(c.webappId).trim()) return;
      const snapshot = captureConfiguration(
        {
          webappId: c.webappId,
          webAppInfo: c.webAppInfo,
          runOptions: c.runOptions,
        },
        {
          nodes: c.nodes,
          batchList: c.initialBatchList,
          instanceType: c.instanceType,
          batchTaskName: c.initialBatchTaskName,
        },
      );
      result.cards.push({
        id: `${groupId}:${index}`,
        organization: {
          ...normalizeOrganization(c.organization),
          groupIds: [groupId],
        },
        ...snapshot,
        createdAt: Number(draft.createdAt) || Date.now(),
        updatedAt: Number(draft.updatedAt) || Date.now(),
      });
    });
  }
  return result;
}
export function matchesCard(
  configuration: Pick<CardConfiguration, "webappId" | "webAppInfo">,
  organization: CardOrganization,
  query: string,
  group: string,
  tags: string[],
) {
  const text =
    `${organization.title} ${configuration.webappId} ${configuration.webAppInfo?.webappName || ""}`.toLocaleLowerCase();
  return (
    text.includes(query.trim().toLocaleLowerCase()) &&
    (group === "all" ||
      (group === "ungrouped"
        ? organization.groupIds.length === 0
        : organization.groupIds.includes(group))) &&
    tags.every((tag) => organization.tags.includes(tag))
  );
}
