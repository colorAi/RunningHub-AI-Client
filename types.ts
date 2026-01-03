export interface NodeInfo {
  nodeId: string;
  nodeName: string;
  fieldName: string;
  fieldValue: string;
  fieldType: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'STRING' | 'INT' | 'FLOAT' | 'LIST' | 'SWITCH';
  description?: string;
  fieldData?: string; // Often contains options for LIST types (sometimes JSON string, sometimes comma separated)
}

export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export interface UploadData {
  fileName: string;
  fileType: string;
}

export interface SubmitTaskData {
  taskId: string;
  promptTips?: string; // JSON string containing node_errors
}

export interface TaskOutput {
  fileUrl: string;
  fileType?: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  outputs: TaskOutput[];
  status: 'SUCCESS' | 'FAILED';
}

export interface TaskStatusData {
  status: string; // Not explicitly in API, but inferred from logic
  failedReason?: {
    node_name: string;
    exception_message: string;
    traceback: string;
  };
  fileUrl?: string; // Present when finished in some endpoints
}

export enum AppStep {
  CONFIG = 0,
  EDITOR = 1,
  RUNNING = 2,
  RESULT = 3,
}

export interface PromptTips {
  result: boolean;
  error: string | null;
  node_errors: Record<string, string>;
}

export interface Favorite {
  name: string;
  webappId: string;
}

export interface AccountInfo {
  remainCoins: string;
  currentTaskCounts: string;
  remainMoney: string | null;
  currency: string | null;
  apiType: string;
}

export interface AutoSaveConfig {
  enabled: boolean;
  directoryName: string | null;
}