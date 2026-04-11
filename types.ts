export interface NodeInfo {
  nodeId: string;
  nodeName: string;
  fieldName: string;
  fieldValue: string;
  fieldType: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'STRING' | 'INT' | 'FLOAT' | 'LIST' | 'SWITCH' | 'BOOLEAN';
  description?: string;
  descriptionEn?: string;
  fieldData?: string | Record<string, any> | any[];
  _taskId?: string;
}

export interface ListOption {
  name: string;
  index: string;
}

export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export interface UploadData {
  fileName: string;
  fileType?: string;
  downloadUrl?: string;
  size?: string;
}

export type TaskRuntimeStatus = 'QUEUED' | 'RUNNING' | 'FAILED' | 'SUCCESS';

export interface SubmitTaskData {
  taskId: string;
  clientId?: string | null;
  netWssUrl?: string | null;
  taskStatus?: TaskRuntimeStatus | null;
  promptTips?: string;
}

export interface TaskOutput {
  fileUrl: string;
  fileType?: string;
  downloadUrl?: string;
}

export type PendingFilesMap = Record<string, File>;

export interface HistoryItem {
  id: string;
  timestamp: number;
  outputs: TaskOutput[];
  status: 'SUCCESS' | 'FAILED';
}

export interface TaskStatusData {
  status: string;
  failedReason?: {
    node_name: string;
    exception_message: string;
    traceback: string;
  };
  fileUrl?: string;
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
  node_errors: Record<string, any>;
  outputs_to_execute?: string[];
  [key: string]: any;
}

export interface Favorite {
  name: string;
  webappId: string;
  upName?: string;
  appInfo?: WebAppInfo;
  nodes?: NodeInfo[];
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
  id: string;
  apiKey: string;
  concurrency?: number;
  accountInfo?: AccountInfo | null;
  loading?: boolean;
  error?: string;
}

export interface AutoSaveConfig {
  enabled: boolean;
  directoryName: string | null;
  directoryPath?: string | null;
}

export type HomeDefaultTab = 'official' | 'excellent' | 'support';

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

export interface DecodeConfig {
  enabled: boolean;
  password: string;
  autoDecodeEnabled: boolean;
  alwaysOn: boolean;
}

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

export interface FailedTaskInfo {
  batchIndex: number;
  errorMessage: string;
  timestamp: number;
}

export type InstanceType = 'default' | 'plus';
