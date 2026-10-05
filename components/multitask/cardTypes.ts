import type {
  InstanceType,
  NodeInfo,
  TaskOutput,
  WebAppInfo,
  WorkflowRunOptions,
} from "../../types";
import type { CardOrganization } from "../../services/cardLibrary/model";

export type MultiTaskCardStatus =
  "idle" | "queued" | "running" | "success" | "failed" | "cancelled";

export interface MultiTaskUsageStats {
  coins: number;
  thirdParty: number;
  taskTime: number;
}

export interface MultiTaskCardRunState {
  mode: "single" | "batch";
  status: MultiTaskCardStatus;
  totalUnits: number;
  completedUnits: number;
  failedUnits: number;
  activeUnits: number;
  progressPercent: number;
  progressText: string;
  currentTaskId: string | null;
  taskIds: string[];
  logs: string[];
  outputs: TaskOutput[];
  error: string | null;
  failedBatchIndices: Set<number>;
  usage: MultiTaskUsageStats;
}

export interface MultiTaskCardData {
  organization?: CardOrganization;
  savedCardId?: string;
  id: string;
  webappId: string;
  webAppInfo: WebAppInfo | null;
  nodes: NodeInfo[];
  isConnected: boolean;
  loading: boolean;
  loadError: string | null;
  instanceType: InstanceType;
  runOptions?: WorkflowRunOptions;
  initialBatchList?: NodeInfo[][];
  initialBatchTaskName?: string;
  run: MultiTaskCardRunState;
}
