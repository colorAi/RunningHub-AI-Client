import type { MultiTaskCardData, MultiTaskCardRunState } from './cardTypes';
import type { InstanceType, NodeInfo, PendingFilesMap, WebAppInfo, WorkflowRunOptions } from '../../types';
import { normalizeOrganization } from '../../services/cardLibrary/model';
import type { CardOrganization } from '../../services/cardLibrary/model';
import type { TaskUsageStats } from '../../services/taskExecutor';
export interface RunUnit {
  runId: string;
  cardId: string;
  unitIndex: number;
  totalUnits: number;
  webappId: string;
  nodes: NodeInfo[];
  pendingFiles: PendingFilesMap;
  batchTaskName: string;
  instanceType: InstanceType;
  runOptions?: WorkflowRunOptions;
}

export interface SessionState {
  id: string;
  runningCardIds: Set<string>;
  cancelled: boolean;
  cancelledCards: Set<string>;
  connections: Map<string, Set<() => void>>;
  pendingUnits: RunUnit[];
  remainingUnits: Map<string, number>;
  wake?: () => void;
}

export interface MultiTaskDraftCard {
  organization?: CardOrganization;
  webappId: string;
  webAppInfo: WebAppInfo | null;
  nodes: NodeInfo[];
  isConnected: boolean;
  instanceType: InstanceType;
  runOptions?: WorkflowRunOptions;
  initialBatchList: NodeInfo[][];
  initialBatchTaskName: string;
}

export interface MultiTaskDraft {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  cards: MultiTaskDraftCard[];
}

export const MAX_LOG_LINES = 200;
export const MULTITASK_DRAFTS_STORAGE_KEY = 'rh_multitask_drafts_v1';
export const DRAFT_NAME_PLACEHOLDER = '请输入草稿名称，例如：批量头像生成';

export const createEmptyRunState = (): MultiTaskCardRunState => ({
  mode: 'single',
  status: 'idle',
  totalUnits: 0,
  completedUnits: 0,
  failedUnits: 0,
  activeUnits: 0,
  progressPercent: 0,
  progressText: '等待运行',
  currentTaskId: null,
  taskIds: [],
  logs: [],
  outputs: [],
  error: null,
  failedBatchIndices: new Set<number>(),
  usage: {
    coins: 0,
    thirdParty: 0,
    taskTime: 0,
  },
});

export const cloneNodes = (nodes: NodeInfo[]) => structuredClone(nodes);
export const cloneNodeRows = (rows?: NodeInfo[][]) => (rows || []).map(row => cloneNodes(row));

export const normalizeDraftCard = (card?: Partial<MultiTaskDraftCard> | null): MultiTaskDraftCard => ({
  organization: normalizeOrganization(card?.organization),
  webappId: card?.webappId || '',
  webAppInfo: card?.webAppInfo || null,
  nodes: Array.isArray(card?.nodes) ? cloneNodes(card!.nodes as NodeInfo[]) : [],
  isConnected: !!card?.isConnected,
  instanceType: card?.instanceType || 'default',
  runOptions: { retainSeconds: card?.runOptions?.retainSeconds },
  initialBatchList: Array.isArray(card?.initialBatchList) ? cloneNodeRows(card!.initialBatchList as NodeInfo[][]) : [],
  initialBatchTaskName: card?.initialBatchTaskName || '',
});

export const normalizeDraft = (draft?: Partial<MultiTaskDraft> | null): MultiTaskDraft | null => {
  if (!draft?.id || !draft?.name) {
    return null;
  }

  return {
    id: draft.id,
    name: draft.name,
    createdAt: Number(draft.createdAt) || Date.now(),
    updatedAt: Number(draft.updatedAt) || Date.now(),
    cards: Array.isArray(draft.cards) ? draft.cards.map(card => normalizeDraftCard(card)) : [],
  };
};

export const createCard = (partial?: Partial<MultiTaskCardData>): MultiTaskCardData => ({
  id: partial?.id || crypto.randomUUID(),
  organization: normalizeOrganization(partial?.organization),
  savedCardId: partial?.savedCardId,
  webappId: partial?.webappId || '',
  webAppInfo: partial?.webAppInfo || null,
  nodes: partial?.nodes ? cloneNodes(partial.nodes) : [],
  isConnected: partial?.isConnected || false,
  loading: partial?.loading || false,
  loadError: partial?.loadError || null,
  instanceType: partial?.instanceType || 'default',
  runOptions: { ...partial?.runOptions },
  initialBatchList: partial?.initialBatchList ? cloneNodeRows(partial.initialBatchList) : [],
  initialBatchTaskName: partial?.initialBatchTaskName || '',
  run: partial?.run ? {
    ...partial.run,
    logs: [...partial.run.logs],
    outputs: [...partial.run.outputs],
    taskIds: [...partial.run.taskIds],
    failedBatchIndices: new Set(partial.run.failedBatchIndices),
    usage: { ...partial.run.usage },
  } : createEmptyRunState(),
});

export const timestampLog = (message: string) => `[${new Date().toLocaleTimeString()}] ${message}`;

export const mergeUsage = (left: TaskUsageStats, right?: TaskUsageStats) => ({
  coins: left.coins + (right?.coins || 0),
  thirdParty: left.thirdParty + (right?.thirdParty || 0),
  taskTime: left.taskTime + (right?.taskTime || 0),
});
