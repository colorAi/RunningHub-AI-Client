import { saveMultipleFiles } from './autoSaveService';
import { connectTaskProgress, TaskProgressSnapshot } from './taskProgress';
import { queryTaskResult, submitTask, uploadFile } from './api';
import { decodeDuckImage, isLikelyDuckCarrierImage } from '../utils/duckDecoder';
import { DecodeConfig, InstanceType, NodeInfo, PendingFilesMap, PromptTips, TaskOutput } from '../types';
import { shouldAutoDecodeOutputs } from '../utils/decodeConfig';

const DEFAULT_POLL_INTERVAL_MS = 3500;
const REALTIME_POLL_INTERVAL_MS = 5000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class TaskCancelledError extends Error {
  constructor(message = '任务已停止追踪') {
    super(message);
    this.name = 'TaskCancelledError';
  }
}

export interface TaskUsageStats {
  coins: number;
  thirdParty: number;
  taskTime: number;
}

export interface ExecuteTaskCallbacks {
  onLog?: (message: string) => void;
  onProgress?: (snapshot: TaskProgressSnapshot) => void;
  onStatusChange?: (status: 'SUBMITTING' | 'QUEUED' | 'RUNNING') => void;
}

export interface ExecuteTaskControl {
  isCancelled?: () => boolean;
  registerConnection?: (connection: { close: () => void } | null) => () => void;
  pollOffsetMs?: number;
}

export interface ExecuteTaskRequest {
  apiKey: string;
  webappId: string;
  taskNodes: NodeInfo[];
  pendingFiles?: PendingFilesMap;
  taskIndex?: number;
  instanceType?: InstanceType;
  decodeConfig: DecodeConfig;
  autoSaveEnabled: boolean;
  batchTaskName?: string;
  taskLabel?: string;
  callbacks?: ExecuteTaskCallbacks;
  control?: ExecuteTaskControl;
}

export interface ExecuteTaskResult {
  outputs: TaskOutput[];
  taskId: string;
  usage?: TaskUsageStats;
  decodedCount: number;
  savedCount: number;
}

const parsePromptTips = (raw?: string | PromptTips | null): PromptTips | null => {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as PromptTips;
    } catch {
      return null;
    }
  }
  return raw;
};

const buildNodeNameMap = (taskNodes: NodeInfo[]): Record<string, string> =>
  taskNodes.reduce<Record<string, string>>((acc, node) => {
    acc[String(node.nodeId)] = node.nodeName || node.description || node.fieldName || `#${node.nodeId}`;
    return acc;
  }, {});

const parseNodeErrors = (nodeErrors: Record<string, any>): { message: string; details: string } => {
  for (const [nodeId, nodeError] of Object.entries(nodeErrors || {})) {
    if (nodeError && typeof nodeError === 'object') {
      const errors = Array.isArray(nodeError.errors) ? nodeError.errors : [nodeError];
      const nodeName = nodeError.node_name || nodeError.class_type || nodeId;

      for (const err of errors) {
        const details = err?.details || err?.message || '';

        if (details.includes('API balance is insufficient') || details.includes('please recharge')) {
          return {
            message: '第三方 API 余额不足',
            details: `节点 ${nodeName} 依赖的第三方服务余额不足，请先充值后重试。\n${details}`.trim(),
          };
        }

        if (details.includes('Invalid API') || details.includes('API key')) {
          return {
            message: '第三方 API Key 无效',
            details: `节点 ${nodeName} 的第三方密钥无效，请检查节点配置。\n${details}`.trim(),
          };
        }

        if (err?.type === 'custom_validation_failed') {
          return {
            message: '节点参数校验失败',
            details: `节点 ${nodeName} 的参数未通过校验。\n${details}`.trim(),
          };
        }
      }
    }
  }

  return {
    message: '节点执行失败',
    details: JSON.stringify(nodeErrors, null, 2),
  };
};

const extractTaskError = (params: {
  errorCode?: string | null;
  errorMessage?: string | null;
  failedReason?: { node_name?: string; exception_message?: string } | null;
  promptTips?: PromptTips | string | null;
}): string => {
  const promptTips = parsePromptTips(params.promptTips);
  if (promptTips?.node_errors && Object.keys(promptTips.node_errors).length > 0) {
    const parsed = parseNodeErrors(promptTips.node_errors);
    return `${parsed.message}\n\n${parsed.details}`;
  }

  if (params.failedReason?.exception_message) {
    const prefix = params.failedReason.node_name ? `${params.failedReason.node_name}: ` : '';
    return `${prefix}${params.failedReason.exception_message}`;
  }

  const codePrefix = params.errorCode ? `[${params.errorCode}] ` : '';
  return `${codePrefix}${params.errorMessage || '任务执行失败'}`;
};

const ensureNotCancelled = (control?: ExecuteTaskControl) => {
  if (control?.isCancelled?.()) {
    throw new TaskCancelledError();
  }
};

const processOutputsWithDecode = async (
  outputs: TaskOutput[],
  decodeConfig: DecodeConfig,
  onLog?: (message: string) => void,
  logPrefix = '',
): Promise<{ decodedOutputs: TaskOutput[]; decodedCount: number }> => {
  if (!shouldAutoDecodeOutputs(decodeConfig)) {
    return { decodedOutputs: outputs, decodedCount: 0 };
  }

  const decodedOutputs: TaskOutput[] = [];
  let decodedCount = 0;

  for (const output of outputs) {
    const url = output.fileUrl;
    if (!isLikelyDuckCarrierImage(url, output.fileType)) {
      decodedOutputs.push(output);
      continue;
    }

    try {
      onLog?.(`${logPrefix}尝试解码 ${url.split('/').pop() || url}`);
      const result = await decodeDuckImage(url, decodeConfig.password);
      if (result.success && result.data) {
        decodedOutputs.push({
          fileUrl: URL.createObjectURL(result.data),
          fileType: result.extension || output.fileType || 'png',
        });
        decodedCount += 1;
        onLog?.(`${logPrefix}${url.split('/').pop() || url} 已解码为 ${result.extension || output.fileType || 'bin'}`);
      } else {
        if (result.error === 'PASSWORD_REQUIRED') {
          onLog?.(`${logPrefix}${url.split('/').pop() || url} 需要解码密码，已跳过`);
        } else if (result.error === 'WRONG_PASSWORD') {
          onLog?.(`${logPrefix}${url.split('/').pop() || url} 解码密码错误，已跳过`);
        } else if (result.error === 'NOT_DUCK_IMAGE') {
          onLog?.(`${logPrefix}${url.split('/').pop() || url} 不是小黄鸭加密图，已跳过`);
        } else if (result.error) {
          onLog?.(`${logPrefix}${url.split('/').pop() || url} 解码失败: ${result.errorMessage || result.error}`);
        }
        decodedOutputs.push(output);
      }
    } catch (error: any) {
      onLog?.(`${logPrefix}解码失败: ${error.message || error}`);
      decodedOutputs.push(output);
    }
  }

  return { decodedOutputs, decodedCount };
};

const saveOutputs = async (
  outputs: TaskOutput[],
  autoSaveEnabled: boolean,
  taskIndex: number | undefined,
  batchTaskName: string | undefined,
  onLog?: (message: string) => void,
  logPrefix = '',
): Promise<number> => {
  if (!autoSaveEnabled || outputs.length === 0) return 0;

  const filesToSave = outputs.map(output => {
    let filename: string | undefined;
    let sequential = false;

    if (typeof taskIndex === 'number' && batchTaskName) {
      filename = `${batchTaskName}_T${String(taskIndex + 1).padStart(3, '0')}`;
      sequential = true;
    }

    return {
      url: output.fileUrl,
      extension: output.fileType,
      filename,
      sequential,
    };
  });

  try {
    const savedCount = await saveMultipleFiles(filesToSave);
    if (savedCount > 0) {
      onLog?.(`${logPrefix}已自动保存 ${savedCount} 个结果文件`);
    }
    return savedCount;
  } catch (error: any) {
    onLog?.(`${logPrefix}自动保存失败: ${error.message || error}`);
    return 0;
  }
};

const uploadPendingFilesForTask = async (
  apiKey: string,
  taskNodes: NodeInfo[],
  pendingFiles: PendingFilesMap | undefined,
  taskIndex = 0,
  onLog?: (message: string) => void,
  logPrefix = '',
): Promise<NodeInfo[]> => {
  if (!pendingFiles || Object.keys(pendingFiles).length === 0) {
    return taskNodes.map(node => ({ ...node }));
  }

  const currentTaskId = taskNodes[0]?._taskId || `task-${taskIndex}`;
  const filesToUpload: { nodeId: string; fieldName: string; file: File }[] = [];

  for (const [key, file] of Object.entries(pendingFiles) as [string, File][]) {
    const [taskId, nodeId, fieldName] = key.split('|');
    if (taskId === currentTaskId || taskId === `task-${taskIndex}`) {
      filesToUpload.push({ nodeId, fieldName, file });
    }
  }

  if (filesToUpload.length === 0) {
    return taskNodes.map(node => ({ ...node }));
  }

  onLog?.(`${logPrefix}上传 ${filesToUpload.length} 个输入文件`);
  const clonedNodes = taskNodes.map(node => ({ ...node }));

  for (const { nodeId, fieldName, file } of filesToUpload) {
    const result = await uploadFile(apiKey, file);
    const targetIndex = clonedNodes.findIndex(node => String(node.nodeId) === String(nodeId) && (node.fieldName || '') === fieldName);
    if (targetIndex !== -1) {
      clonedNodes[targetIndex].fieldValue = result.fileName;
    }
  }

  return clonedNodes;
};

export const executeWorkflowTask = async ({
  apiKey,
  webappId,
  taskNodes,
  pendingFiles,
  taskIndex,
  instanceType,
  decodeConfig,
  autoSaveEnabled,
  batchTaskName,
  taskLabel = '',
  callbacks,
  control,
}: ExecuteTaskRequest): Promise<ExecuteTaskResult> => {
  ensureNotCancelled(control);
  const logPrefix = taskLabel ? `${taskLabel}: ` : '';

  const nodesToSubmit = await uploadPendingFilesForTask(apiKey, taskNodes, pendingFiles, taskIndex, callbacks?.onLog, logPrefix);
  ensureNotCancelled(control);

  callbacks?.onStatusChange?.('SUBMITTING');
  callbacks?.onLog?.(`${logPrefix}提交任务`);

  const submitResult = await submitTask(apiKey, webappId, nodesToSubmit, instanceType);
  const submitPromptTips = parsePromptTips(submitResult.promptTips);
  if (submitPromptTips?.node_errors && Object.keys(submitPromptTips.node_errors).length > 0) {
    const parsed = parseNodeErrors(submitPromptTips.node_errors);
    throw new Error(`${parsed.message}\n\n${parsed.details}`);
  }

  const initialStatus = submitResult.taskStatus === 'RUNNING' ? 'RUNNING' : 'QUEUED';
  callbacks?.onStatusChange?.(initialStatus);
  callbacks?.onLog?.(`${logPrefix}任务已提交 ${submitResult.taskId}`);

  let stopProgressMonitor = () => {};
  if (submitResult.netWssUrl) {
    const connection = connectTaskProgress(submitResult.netWssUrl, buildNodeNameMap(nodesToSubmit), {
      onProgress: snapshot => callbacks?.onProgress?.(snapshot),
    });
    stopProgressMonitor = control?.registerConnection ? control.registerConnection(connection) : () => connection.close();
  }

  const pollIntervalMs = (submitResult.netWssUrl ? REALTIME_POLL_INTERVAL_MS : DEFAULT_POLL_INTERVAL_MS) + (control?.pollOffsetMs || 0);
  let lastStatus = initialStatus;

  try {
    while (true) {
      ensureNotCancelled(control);
      const result = await queryTaskResult(apiKey, submitResult.taskId);
      ensureNotCancelled(control);

      if (result.status === 'SUCCESS') {
        const usage = result.usage
          ? {
              coins: parseFloat(result.usage.consumeCoins) || 0,
              thirdParty: parseFloat(result.usage.thirdPartyConsumeMoney) || 0,
              taskTime: parseInt(result.usage.taskCostTime, 10) || 0,
            }
          : undefined;

        callbacks?.onLog?.(`${logPrefix}任务完成`);
        const { decodedOutputs, decodedCount } = await processOutputsWithDecode(result.results, decodeConfig, callbacks?.onLog, logPrefix);
        const savedCount = await saveOutputs(decodedOutputs, autoSaveEnabled, taskIndex, batchTaskName, callbacks?.onLog, logPrefix);

        return {
          outputs: decodedOutputs,
          taskId: submitResult.taskId,
          usage,
          decodedCount,
          savedCount,
        };
      }

      if (result.status === 'FAILED') {
        throw new Error(extractTaskError({
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          failedReason: result.failedReason,
          promptTips: result.promptTips || submitPromptTips,
        }));
      }

      const nextStatus = result.status === 'RUNNING' ? 'RUNNING' : 'QUEUED';
      callbacks?.onStatusChange?.(nextStatus);
      if (nextStatus !== lastStatus) {
        callbacks?.onLog?.(`${logPrefix}${nextStatus === 'RUNNING' ? '开始执行' : '进入排队'}`);
        lastStatus = nextStatus;
      }

      await sleep(pollIntervalMs);
    }
  } finally {
    stopProgressMonitor();
  }
};
