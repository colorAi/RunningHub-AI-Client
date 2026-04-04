import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CheckCircle2, Clock, AlertTriangle, Terminal, Activity, Loader2, XCircle } from 'lucide-react';
import { saveMultipleFiles, getDirectoryName } from '../services/autoSaveService';
import { connectTaskProgress, TaskProgressSnapshot } from '../services/taskProgress';
import { queryTaskResult, submitTask, uploadFile } from '../services/api';
import { ApiKeyConfig, DecodeConfig, FailedTaskInfo, InstanceType, NodeInfo, PendingFilesMap, PromptTips, TaskOutput } from '../types';
import { decodeDuckImage } from '../utils/duckDecoder';
import { shouldAutoDecodeOutputs } from '../utils/decodeConfig';

interface StepRunningProps {
  apiConfigs: ApiKeyConfig[];
  webappId: string;
  nodes: NodeInfo[];
  batchList?: NodeInfo[][];
  pendingFiles?: PendingFilesMap;
  autoSaveEnabled: boolean;
  decodeConfig: DecodeConfig;
  onComplete: (outputs: TaskOutput[], taskId: string) => void;
  onBack: () => void;
  onBatchComplete: (summaryLogs: string[], failedTasks: FailedTaskInfo[]) => void;
  onBatchCancel?: (summaryLogs: string[], failedTasks: FailedTaskInfo[]) => void;
  batchTaskName?: string;
  instanceType?: InstanceType;
}

export interface StepRunningRef {
  cancelWithSummary: () => void;
}

type ViewStatus = 'INIT' | 'SUBMITTING' | 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';

const POLL_INTERVAL_MS = 4000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

const statusTitleMap: Record<ViewStatus, string> = {
  INIT: '准备中',
  SUBMITTING: '提交中',
  QUEUED: '排队中',
  RUNNING: '运行中',
  SUCCESS: '执行完成',
  FAILED: '执行失败',
};

const statusDescriptionMap: Record<ViewStatus, string> = {
  INIT: '正在准备任务环境...',
  SUBMITTING: '正在提交任务到 RunningHub...',
  QUEUED: '任务已提交，等待资源分配。',
  RUNNING: '任务正在执行，结果会自动刷新。',
  SUCCESS: '任务已执行完成。',
  FAILED: '请查看下方日志和错误详情。',
};

const StepRunning = forwardRef<StepRunningRef, StepRunningProps>(({
  apiConfigs,
  webappId,
  nodes,
  batchList,
  pendingFiles,
  autoSaveEnabled,
  decodeConfig,
  batchTaskName,
  instanceType,
  onComplete,
  onBack,
  onBatchComplete,
  onBatchCancel,
}, ref) => {
  const [status, setStatus] = useState<ViewStatus>('INIT');
  const [logs, setLogs] = useState<string[]>([]);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [savedFilesCount, setSavedFilesCount] = useState(0);
  const [progressContext, setProgressContext] = useState<string>('');
  const [progressSnapshot, setProgressSnapshot] = useState<TaskProgressSnapshot | null>(null);

  const taskUsageMapRef = useRef<Map<number, { coins: number; thirdParty: number; taskTime: number }>>(new Map());
  const hasStartedRef = useRef(false);
  const activeConnectionsRef = useRef<Set<{ close: () => void }>>(new Set());
  const savedFilesCountRef = useRef(0);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const registerConnection = (connection: { close: () => void } | null) => {
    if (!connection) return () => {};
    activeConnectionsRef.current.add(connection);
    return () => {
      connection.close();
      activeConnectionsRef.current.delete(connection);
    };
  };

  const closeAllConnections = () => {
    activeConnectionsRef.current.forEach(connection => connection.close());
    activeConnectionsRef.current.clear();
  };

  const processOutputsWithDecode = async (
    outputs: TaskOutput[],
    logPrefix = '',
  ): Promise<{ decodedOutputs: TaskOutput[]; decodedCount: number }> => {
    if (!shouldAutoDecodeOutputs(decodeConfig)) {
      return { decodedOutputs: outputs, decodedCount: 0 };
    }

    const decodedOutputs: TaskOutput[] = [];
    let decodedCount = 0;

    for (const output of outputs) {
      const url = output.fileUrl;
      if (!/\.(jpg|jpeg|png|webp)$/i.test(url)) {
        decodedOutputs.push(output);
        continue;
      }

      try {
        addLog(`${logPrefix}尝试解码 ${url.split('/').pop() || url}`);
        const result = await decodeDuckImage(url, decodeConfig.password);
        if (result.success && result.data) {
          decodedOutputs.push({
            fileUrl: URL.createObjectURL(result.data),
            fileType: result.extension || output.fileType || 'png',
          });
          decodedCount += 1;
        } else {
          if (result.error === 'PASSWORD_REQUIRED') {
            addLog(`${logPrefix}${url.split('/').pop() || url} 需要解码密码，已跳过`);
          } else if (result.error === 'WRONG_PASSWORD') {
            addLog(`${logPrefix}${url.split('/').pop() || url} 解码密码错误，已跳过`);
          }
          decodedOutputs.push(output);
        }
      } catch (error: any) {
        addLog(`${logPrefix}解码失败: ${error.message || error}`);
        decodedOutputs.push(output);
      }
    }

    return { decodedOutputs, decodedCount };
  };

  const saveOutputs = async (
    outputs: TaskOutput[],
    taskIndex?: number,
    logPrefix = '',
  ): Promise<void> => {
    if (!autoSaveEnabled || outputs.length === 0) return;

    try {
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

      const savedCount = await saveMultipleFiles(filesToSave);
      setSavedFilesCount(prev => {
        const nextValue = prev + savedCount;
        savedFilesCountRef.current = nextValue;
        return nextValue;
      });
      if (savedCount > 0) {
        addLog(`${logPrefix}已自动保存 ${savedCount} 个文件`);
      } else {
        addLog(`${logPrefix}自动保存未成功，请检查保存目录权限`);
      }
    } catch (error: any) {
      addLog(`${logPrefix}自动保存失败: ${error.message || error}`);
    }
  };

  const uploadPendingFilesForTask = async (
    apiKey: string,
    taskNodes: NodeInfo[],
    taskIndex: number,
    logPrefix = '',
  ): Promise<NodeInfo[]> => {
    if (!pendingFiles || Object.keys(pendingFiles).length === 0) {
      return taskNodes.map(node => ({ ...node }));
    }

    const currentTaskId = taskNodes[0]?._taskId || `task-${taskIndex}`;
    const filesToUpload: { nodeId: string; fieldName: string; file: File }[] = [];

    (Object.entries(pendingFiles) as [string, File][]).forEach(([key, file]) => {
      const [taskId, nodeId, fieldName] = key.split('|');
      if (taskId === currentTaskId || taskId === `task-${taskIndex}`) {
        filesToUpload.push({ nodeId, fieldName, file });
      }
    });

    if (filesToUpload.length === 0) {
      return taskNodes.map(node => ({ ...node }));
    }

    addLog(`${logPrefix}上传 ${filesToUpload.length} 个输入文件`);
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

  const monitorTaskProgress = (
    taskNodes: NodeInfo[],
    wssUrl: string | null | undefined,
    contextLabel: string,
  ): (() => void) => {
    if (!wssUrl) {
      return () => {};
    }

    const connection = connectTaskProgress(wssUrl, buildNodeNameMap(taskNodes), {
      onOpen: () => addLog(`${contextLabel}已连接实时进度`),
      onProgress: snapshot => {
        setProgressContext(contextLabel);
        setProgressSnapshot(snapshot);
      },
      onError: () => addLog(`${contextLabel}实时进度连接异常，已继续使用轮询`),
      onClose: () => addLog(`${contextLabel}实时进度连接已关闭`),
    });

    return registerConnection(connection);
  };

  const executeTask = async (
    apiKey: string,
    taskNodes: NodeInfo[],
    contextLabel: string,
    onStatusChange?: (nextStatus: ViewStatus) => void,
  ): Promise<{ outputs: TaskOutput[]; taskId: string; usage?: { coins: number; thirdParty: number; taskTime: number } }> => {
    onStatusChange?.('SUBMITTING');
    addLog(`${contextLabel}提交任务`);

    const submitResult = await submitTask(apiKey, webappId, taskNodes, instanceType);
    const submitPromptTips = parsePromptTips(submitResult.promptTips);
    if (submitPromptTips?.node_errors && Object.keys(submitPromptTips.node_errors).length > 0) {
      const parsed = parseNodeErrors(submitPromptTips.node_errors);
      throw new Error(`${parsed.message}\n\n${parsed.details}`);
    }

    const initialStatus = submitResult.taskStatus === 'RUNNING' ? 'RUNNING' : 'QUEUED';
    onStatusChange?.(initialStatus);
    addLog(`${contextLabel}任务已提交: ${submitResult.taskId}`);

    const stopProgressMonitor = monitorTaskProgress(taskNodes, submitResult.netWssUrl, contextLabel);
    let lastStatus = initialStatus;

    try {
      while (true) {
        const result = await queryTaskResult(apiKey, submitResult.taskId);

        if (result.status === 'SUCCESS') {
          const usage = result.usage
            ? {
              coins: parseFloat(result.usage.consumeCoins) || 0,
              thirdParty: parseFloat(result.usage.thirdPartyConsumeMoney) || 0,
              taskTime: parseInt(result.usage.taskCostTime, 10) || 0,
            }
            : undefined;

          addLog(`${contextLabel}任务完成`);
          return {
            outputs: result.results,
            taskId: submitResult.taskId,
            usage,
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
        onStatusChange?.(nextStatus);
        if (nextStatus !== lastStatus) {
          addLog(`${contextLabel}${nextStatus === 'RUNNING' ? '开始执行' : '进入排队'}`);
          lastStatus = nextStatus;
        }

        await sleep(POLL_INTERVAL_MS);
      }
    } finally {
      stopProgressMonitor();
    }
  };

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    let active = true;
    const isBatch = !!batchList && batchList.length > 0;
    const totalTasks = isBatch ? batchList.length : 1;
    setBatchTotal(totalTasks);
    taskUsageMapRef.current = new Map();

    const runSingleTask = async () => {
      const apiKey = apiConfigs[0]?.apiKey || '';
      if (!apiKey) {
        setStatus('FAILED');
        setErrorDetails('没有可用的 API Key');
        return;
      }

      try {
        const result = await executeTask(apiKey, nodes, '', nextStatus => active && setStatus(nextStatus));
        if (!active) return;

        const { decodedOutputs, decodedCount } = await processOutputsWithDecode(result.outputs);
        if (decodedCount > 0) {
          addLog(`已解码 ${decodedCount} 个结果文件`);
        }

        await saveOutputs(decodedOutputs);
        setStatus('SUCCESS');
        onComplete(decodedOutputs, result.taskId);
      } catch (error: any) {
        if (!active) return;
        setStatus('FAILED');
        setErrorDetails(error.message || '任务执行失败');
        addLog(`任务失败: ${error.message || error}`);
      }
    };

    const runBatchTasks = async () => {
      let nextTaskIndex = 0;
      let completedCount = 0;
      let failedCountLocal = 0;
      const failedTasksLocal: FailedTaskInfo[] = [];

      const getNextTaskIndex = () => {
        if (nextTaskIndex >= totalTasks) return null;
        const current = nextTaskIndex;
        nextTaskIndex += 1;
        return current;
      };

      const finalizeBatch = () => {
        const successCount = totalTasks - failedCountLocal;
        const dirName = getDirectoryName();
        const summaryLogs: string[] = [`全部批量任务已结束，成功 ${successCount} 个，失败 ${failedCountLocal} 个。`];

        if (autoSaveEnabled && dirName && savedFilesCountRef.current > 0) {
          summaryLogs.push(`结果已保存到目录: ${dirName}`);
        }

        const totalUsage = { coins: 0, thirdParty: 0, taskTime: 0 };
        taskUsageMapRef.current.forEach(usage => {
          totalUsage.coins += usage.coins;
          totalUsage.thirdParty += usage.thirdParty;
          totalUsage.taskTime += usage.taskTime;
        });

        if (taskUsageMapRef.current.size > 0) {
          summaryLogs.push(`累计消耗 RH 币: ${totalUsage.coins.toFixed(2)}`);
          if (totalUsage.thirdParty > 0) {
            summaryLogs.push(`累计第三方消耗: ${totalUsage.thirdParty.toFixed(2)}`);
          }
          if (totalUsage.taskTime > 0) {
            summaryLogs.push(`累计运行时长: ${totalUsage.taskTime} 秒`);
          }
        }

        setStatus('SUCCESS');
        setFailedCount(failedCountLocal);
        onBatchComplete(summaryLogs, failedTasksLocal);
      };

      const worker = async (apiKey: string, workerLabel: string) => {
        while (active) {
          const taskIndex = getNextTaskIndex();
          if (taskIndex == null) return;

          const taskNodes = batchList![taskIndex];
          const logPrefix = `${workerLabel}任务 ${taskIndex + 1}/${totalTasks}: `;

          try {
            setStatus('RUNNING');
            const nodesToSubmit = await uploadPendingFilesForTask(apiKey, taskNodes, taskIndex, logPrefix);
            const result = await executeTask(apiKey, nodesToSubmit, logPrefix, nextStatus => active && setStatus(nextStatus === 'QUEUED' ? 'QUEUED' : 'RUNNING'));
            if (!active) return;

            if (result.usage) {
              taskUsageMapRef.current.set(taskIndex, result.usage);
            }

            const { decodedOutputs, decodedCount } = await processOutputsWithDecode(result.outputs, logPrefix);
            if (decodedCount > 0) {
              addLog(`${logPrefix}已解码 ${decodedCount} 个结果文件`);
            }

            await saveOutputs(decodedOutputs, taskIndex, logPrefix);

            completedCount += 1;
            setCurrentBatchIndex(completedCount + failedCountLocal);
            addLog(`${logPrefix}已完成`);
          } catch (error: any) {
            if (!active) return;

            failedCountLocal += 1;
            setFailedCount(failedCountLocal);
            setCurrentBatchIndex(completedCount + failedCountLocal);
            failedTasksLocal.push({
              batchIndex: taskIndex,
              errorMessage: error.message || '未知错误',
              timestamp: Date.now(),
            });
            addLog(`${logPrefix}失败: ${error.message || error}`);
          }
        }
      };

      const workers = apiConfigs
        .filter(config => config.apiKey.trim())
        .flatMap((config, configIndex) =>
          Array.from({ length: config.concurrency || 1 }, (_, workerIndex) =>
            worker(config.apiKey, apiConfigs.length > 1 ? `[API${configIndex + 1}-${workerIndex + 1}] ` : ''),
          ),
        );

      if (workers.length === 0) {
        setStatus('FAILED');
        setErrorDetails('没有可用的 API Key');
        return;
      }

      await Promise.all(workers);
      if (active) {
        finalizeBatch();
      }
    };

    if (isBatch) {
      void runBatchTasks();
    } else {
      void runSingleTask();
    }

    return () => {
      active = false;
      hasStartedRef.current = false;
      closeAllConnections();
    };
  }, []);

  const handleBatchCancel = () => {
    closeAllConnections();

    const summaryLogs: string[] = ['任务已在客户端停止跟踪，服务端已提交的任务可能仍在继续执行。'];
    if (batchTotal > 1) {
      summaryLogs.push(`当前已处理 ${currentBatchIndex}/${batchTotal} 个任务。`);
    }

    const dirName = getDirectoryName();
    if (autoSaveEnabled && dirName && savedFilesCountRef.current > 0) {
      summaryLogs.push(`已保存 ${savedFilesCountRef.current} 个文件到 ${dirName}。`);
    }

    const totalUsage = { coins: 0, thirdParty: 0, taskTime: 0 };
    taskUsageMapRef.current.forEach(usage => {
      totalUsage.coins += usage.coins;
      totalUsage.thirdParty += usage.thirdParty;
      totalUsage.taskTime += usage.taskTime;
    });

    if (taskUsageMapRef.current.size > 0) {
      summaryLogs.push(`当前已累计消耗 RH 币 ${totalUsage.coins.toFixed(2)}。`);
    }

    if (batchTotal > 1 && onBatchCancel) {
      onBatchCancel(summaryLogs, []);
    } else {
      setCancelMessage(summaryLogs.join('\n'));
      setTimeout(() => onBack(), 2500);
    }
  };

  useImperativeHandle(ref, () => ({
    cancelWithSummary: handleBatchCancel,
  }));

  const progressPercent = progressSnapshot ? Math.round(progressSnapshot.overallPercent) : 0;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0F1115]/50">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#161920]">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-white">
          <Activity className="w-5 h-5 text-brand-500 animate-pulse" />
          {batchTotal > 1 ? `批量任务执行中 (${currentBatchIndex}/${batchTotal})` : '任务执行中'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
        <div className="my-8 relative">
          {status === 'SUBMITTING' && <Loader2 className="w-16 h-16 text-brand-500 animate-spin" />}
          {(status === 'QUEUED' || status === 'RUNNING' || status === 'INIT') && (
            <div className="relative">
              <div className="absolute inset-0 bg-brand-100 dark:bg-brand-900/40 rounded-full animate-ping opacity-75" />
              <div className="relative bg-white dark:bg-slate-800 rounded-full p-2">
                <Clock className={`w-12 h-12 ${status === 'RUNNING' ? 'text-emerald-500' : 'text-brand-500'} animate-pulse`} />
              </div>
            </div>
          )}
          {status === 'FAILED' && <XCircle className="w-16 h-16 text-red-500" />}
          {status === 'SUCCESS' && <CheckCircle2 className="w-16 h-16 text-emerald-500" />}
        </div>

        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
          {statusTitleMap[status]}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center px-4">
          {statusDescriptionMap[status]}
        </p>

        {progressSnapshot && (
          <div className="mt-6 w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#161920] p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span>{progressContext || '实时进度'}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div className="bg-brand-500 h-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="mt-3 text-sm text-slate-700 dark:text-slate-200">
              {progressSnapshot.currentNodeName ? `当前节点: ${progressSnapshot.currentNodeName}` : '等待节点执行...'}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              节点进度 {Math.round(progressSnapshot.currentNodePercent)}% · 已完成 {progressSnapshot.completedNodeIds.length} 个节点
              {progressSnapshot.cachedNodeIds.length > 0 ? ` · 命中缓存 ${progressSnapshot.cachedNodeIds.length} 个` : ''}
            </div>
          </div>
        )}

        {batchTotal > 1 && (
          <div className="mt-6 w-full max-w-xs">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>批量进度</span>
              <span>{batchTotal > 0 ? Math.round((currentBatchIndex / batchTotal) * 100) : 0}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-brand-500 h-full transition-all duration-500"
                style={{ width: `${batchTotal > 0 ? (currentBatchIndex / batchTotal) * 100 : 0}%` }}
              />
            </div>
            <div className="text-xs text-slate-400 mt-1 text-center">
              {currentBatchIndex} / {batchTotal} 个任务
              {failedCount > 0 && <span className="text-red-400 ml-2">失败 {failedCount}</span>}
            </div>
          </div>
        )}

        {errorDetails && (
          <div className="mt-6 w-full bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-xs font-bold mb-1">
              <AlertTriangle className="w-4 h-4" /> 错误详情
            </div>
            <pre className="text-[10px] text-red-600 dark:text-red-300 font-mono whitespace-pre-wrap break-all">
              {errorDetails}
            </pre>
          </div>
        )}

        {cancelMessage && (
          <div className="mt-6 w-full bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-bold mb-1">
              <AlertTriangle className="w-4 h-4" /> 取消提示
            </div>
            <pre className="text-[10px] text-amber-600 dark:text-amber-300 font-mono whitespace-pre-wrap break-all">
              {cancelMessage}
            </pre>
          </div>
        )}
      </div>

      <div className="h-48 border-t border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#161920] flex flex-col">
        <div className="bg-slate-50 dark:bg-slate-800/30 px-4 py-2 border-b border-slate-200 dark:border-slate-800/50 flex items-center gap-2">
          <Terminal className="w-3 h-3 text-slate-400" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Log Output</span>
        </div>
        <div className="flex-1 bg-slate-900 dark:bg-black p-3 font-mono text-[10px] text-slate-300 dark:text-slate-400 overflow-y-auto">
          {logs.map((log, index) => (
            <div key={index} className="mb-1 truncate hover:text-white transition-colors border-b border-transparent hover:border-slate-800">
              {log}
            </div>
          ))}
          <div ref={el => el?.scrollIntoView({ behavior: 'smooth' })} />
        </div>
      </div>

      {(status === 'FAILED' || (status === 'SUCCESS' && batchTotal > 1)) && (
        <div className="p-4 bg-white dark:bg-[#161920] border-t border-slate-200 dark:border-slate-800/50">
          <button
            onClick={onBack}
            className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold transition-colors text-sm"
          >
            {status === 'FAILED' ? '返回编辑' : '查看结果'}
          </button>
        </div>
      )}
    </div>
  );
});

export default StepRunning;
