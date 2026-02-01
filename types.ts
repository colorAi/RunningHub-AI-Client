export interface NodeInfo {
  nodeId: string;
  nodeName: string;
  fieldName: string;
  fieldValue: string;
  fieldType: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'STRING' | 'INT' | 'FLOAT' | 'LIST' | 'SWITCH';
  description?: string;
  fieldData?: string; // Often contains options for LIST types (sometimes JSON string, sometimes comma separated)
  _taskId?: string; // Unique identifier for batch task rows (used as React key)
}

export interface ListOption {
  name: string;   // Display text
  index: string;  // Value
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
  // Rich data for UI
  upName?: string;
  appInfo?: WebAppInfo;
  nodes?: NodeInfo[]; // Saved parameters for instant load
}

export interface AccountInfo {
  remainCoins: string;
  currentTaskCounts: string;
  remainMoney: string | null;
  currency: string | null;
  apiType: string;
}

export interface ApiKeyConfig {
  apiKey: string;
  concurrency: number;
}

export interface ApiKeyEntry {
  id: string;                    // Unique identifier for React key
  apiKey: string;                // The actual API key value
  concurrency?: number;          // Max concurrent tasks for this key
  accountInfo?: AccountInfo | null;  // Fetched account info
  loading?: boolean;             // Loading state for this specific key
  error?: string;                // Error message for this specific key
}

export interface AutoSaveConfig {
  enabled: boolean;
  directoryName: string | null;
}

export interface WebAppInfo {
  webappName: string;
  description: string;
  descriptionEn?: string;
  covers?: { thumbnailUri: string; uri: string }[];
  tags?: { id: string; name: string; nameEn: string }[];
  statisticsInfo?: {
    likeCount: string;
    useCount: string;
    collectCount: string;
    downloadCount: string;
  };
}

// Duck decode configuration
export interface DecodeConfig {
  enabled: boolean;           // Enable decode for current app
  password: string;           // Decode password (empty if not needed)
  autoDecodeEnabled: boolean; // Auto-decode on task completion
}

// Duck decode result
export interface DecodeResult {
  success: boolean;
  data?: Blob;
  extension?: string;
  error?: 'PASSWORD_REQUIRED' | 'WRONG_PASSWORD' | 'NOT_DUCK_IMAGE' | 'DECODE_FAILED';
  errorMessage?: string;
}

export interface RecentApp {
  id: string;
  name: string;
  timestamp: number;
}

// 批量任务失败信息
export interface FailedTaskInfo {
  batchIndex: number;      // 在批量列表中的索引 (0-based)
  errorMessage: string;    // 错误信息
  timestamp: number;       // 失败时间
}

// InstanceType - 机器实例类型
export type InstanceType = 'default' | 'plus';