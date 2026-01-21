import React, { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { submitTask, queryTaskOutputs, getAccountInfo, uploadFile } from '../services/api';
import { NodeInfo, TaskOutput, PromptTips, ApiKeyConfig, DecodeConfig, FailedTaskInfo } from '../types';
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, Terminal, Activity, Layers, FolderOpen, Coins } from 'lucide-react';
import { saveMultipleFiles, getDirectoryName } from '../services/autoSaveService';
import { PendingFilesMap } from './BatchSettingsModal';
import { decodeDuckImage } from '../utils/duckDecoder';

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
}

export interface StepRunningRef {
  cancelWithSummary: () => void;
}

const StepRunning = forwardRef<StepRunningRef, StepRunningProps>(({ apiConfigs, webappId, nodes, batchList, pendingFiles, autoSaveEnabled, decodeConfig, batchTaskName, onComplete, onBack, onBatchComplete, onBatchCancel }, ref) => {
  const [status, setStatus] = useState<'INIT' | 'SUBMITTING' | 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED'>('INIT');
  const [logs, setLogs] = useState<string[]>([]);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Batch state
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [startCoins, setStartCoins] = useState<number | null>(null);
  const [coinsConsumed, setCoinsConsumed] = useState<number | null>(null);
  const [savedFilesCount, setSavedFilesCount] = useState(0);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const hasStartedRef = useRef<boolean>(false); // Prevent React StrictMode double execution
  // 不再限制客户端超时，完全依赖服务端任务状态

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  // Auto-decode outputs if decode config is enabled
  const processOutputsWithDecode = async (outputs: TaskOutput[], logTag: string = ''): Promise<{ decodedOutputs: TaskOutput[], decodedCount: number }> => {
    if (!decodeConfig.enabled || !decodeConfig.autoDecodeEnabled) {
      return { decodedOutputs: outputs, decodedCount: 0 };
    }

    const decodedOutputs: TaskOutput[] = [];
    let decodedCount = 0;

    for (const output of outputs) {
      const url = output.fileUrl;
      // Only try to decode image files
      if (/\.(jpg|jpeg|png|webp)$/i.test(url)) {
        try {
          addLog(`${logTag}🔍 尝试解码: ${url.split('/').pop()}`);
          const result = await decodeDuckImage(url, decodeConfig.password);
          if (result.success && result.data) {
            // Create blob URL for decoded content
            const decodedUrl = URL.createObjectURL(result.data);
            decodedOutputs.push({
              fileUrl: decodedUrl,
              fileType: result.extension || 'png' // Store decoded extension
            });
            decodedCount++;
            addLog(`${logTag}🔓 解码成功! 格式: ${result.extension}`);
          } else if (result.error === 'PASSWORD_REQUIRED') {
            addLog(`${logTag}⚠️ 解码需要密码`);
            decodedOutputs.push(output);
          } else if (result.error === 'WRONG_PASSWORD') {
            addLog(`${logTag}⚠️ 密码错误`);
            decodedOutputs.push(output);
          } else if (result.error === 'NOT_DUCK_IMAGE') {
            addLog(`${logTag}ℹ️ 非小黄鸭图像，跳过`);
            decodedOutputs.push(output);
          } else {
            addLog(`${logTag}⚠️ 解码失败: ${result.error || result.errorMessage || '未知错误'}`);
            decodedOutputs.push(output);
          }
        } catch (e: any) {
          addLog(`${logTag}❌ 解码异常: ${e.message || e}`);
          decodedOutputs.push(output);
        }
      } else {
        decodedOutputs.push(output);
      }
    }

    return { decodedOutputs, decodedCount };
  };

  // 解析节点错误，返回友好的错误信息
  const parseNodeErrors = (nodeErrors: Record<string, any>): { message: string; tip: string } => {
    // 遍历所有节点错误，查找常见错误模式
    for (const [nodeId, nodeError] of Object.entries(nodeErrors)) {
      // 检查是否是对象数组格式（新格式）
      if (nodeError && typeof nodeError === 'object') {
        const errors = nodeError.errors || [nodeError];

        for (const err of errors) {
          const details = err.details || err.message || '';
          const className = nodeError.class_type || '';
          const nodeName = nodeError.node_name || '';

          // 第三方 API 余额不足
          if (details.includes('API balance is insufficient') ||
            details.includes('balance is insufficient') ||
            details.includes('please recharge')) {
            return {
              message: '第三方 API 余额不足',
              tip: `当前工作流 / AI 应用涉及第三方 API 调用，采用按次计费模式。\n由于您的钱包余额不足，请先前往 RunningHub 官网完成充值后再继续使用。\n\n涉及节点: ${nodeName || className || nodeId}`
            };
          }

          // API Key 无效
          if (details.includes('Invalid API') || details.includes('API key')) {
            return {
              message: '第三方 API 密钥无效',
              tip: `节点 ${nodeName || nodeId} 的 API 密钥配置有误，请检查密钥是否正确。`
            };
          }

          // 自定义验证失败
          if (err.type === 'custom_validation_failed') {
            return {
              message: '节点参数验证失败',
              tip: `节点 ${nodeName || nodeId} 的参数验证未通过。\n详情: ${details}`
            };
          }
        }
      }
    }

    // 默认返回原始 JSON（格式化展示）
    return {
      message: '节点错误',
      tip: JSON.stringify(nodeErrors, null, 2)
    };
  };

  useEffect(() => {
    // Prevent double execution in React StrictMode
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    let active = true;
    const isBatch = !!batchList && batchList.length > 0;
    const totalTasks = isBatch ? batchList.length : 1;
    setBatchTotal(totalTasks);

    // Primary API key for account info queries
    // Use the first available key
    const primaryApiKey = apiConfigs[0]?.apiKey || '';

    // Shared state for concurrent execution
    let nextTaskIndex = 0;
    let completedCount = 0;
    let failedCountLocal = 0;
    const failedTasksLocal: FailedTaskInfo[] = []; // 记录失败任务详情
    const initialCoinsMap: Record<string, number> = {};
    const taskLock = { locked: false }; // Simple lock for getting next task

    // Record initial RH coins for batch tasks (all API keys)
    if (isBatch) {
      // Fetch initial coins for all unique keys in parallel
      const uniqueKeys = Array.from(new Set(apiConfigs.map(c => c.apiKey).filter(k => k)));
      Promise.all(uniqueKeys.map(async (key: string) => {
        try {
          const info = await getAccountInfo(key);
          initialCoinsMap[key] = parseFloat(info.remainCoins);
        } catch (err: any) {
          addLog(`⚠️ 无法获取账户信息 (${key.slice(0, 8)}...): ${err.message}`);
        }
      })).then(() => {
        // Log total or just first one
        if (primaryApiKey && initialCoinsMap[primaryApiKey] !== undefined) {
          setStartCoins(initialCoinsMap[primaryApiKey]);
          addLog(`💰 初始余额 (API1): ${initialCoinsMap[primaryApiKey].toFixed(2)} RH币`);
        }
        if (apiConfigs.length > 1 || apiConfigs.some(c => c.concurrency > 1)) {
          const totalWorkers = apiConfigs.reduce((acc, c) => acc + (c.concurrency || 1), 0);
          addLog(`🚀 使用 ${apiConfigs.length} 个 API (共 ${totalWorkers} 并发) 执行任务`);
        }
      });
    }

    // Get next task index atomically
    const getNextTaskIndex = (): number | null => {
      if (taskLock.locked) return null;
      taskLock.locked = true;
      const idx = nextTaskIndex < totalTasks ? nextTaskIndex++ : null;
      taskLock.locked = false;
      return idx;
    };

    // Check if all tasks are done and finalize
    const checkAllDone = () => {
      if (completedCount + failedCountLocal >= totalTasks) {
        setStatus('SUCCESS');
        setFailedCount(failedCountLocal);

        const successCount = totalTasks - failedCountLocal;
        const dirName = getDirectoryName();
        const summaryLogs: string[] = [];

        summaryLogs.push(`✅ 所有批量任务完成！`);

        if (autoSaveEnabled && dirName) {
          summaryLogs.push(`📁 成功保存 ${successCount} 个文件到目录: ${dirName}`);
          if (failedCountLocal > 0) {
            summaryLogs.push(`⚠️ ${failedCountLocal} 个任务失败`);
          }
        } else {
          summaryLogs.push(`📊 成功: ${successCount} 个, 失败: ${failedCountLocal} 个`);
        }

        // Query final RH coins then call onBatchComplete
        // Query final RH coins for all keys and calculate total consumption
        const uniqueKeys = Array.from(new Set(apiConfigs.map(c => c.apiKey).filter(k => k)));
        Promise.all(uniqueKeys.map(async (key: string) => {
          try {
            const info = await getAccountInfo(key);
            return { key, final: parseFloat(info.remainCoins) };
          } catch (e) {
            return { key, final: null };
          }
        })).then((results) => {
          let totalConsumed = 0;
          let validCount = 0;

          results.forEach(({ key, final }, index) => {
            if (final !== null && initialCoinsMap[key] !== undefined) {
              const start = initialCoinsMap[key];
              const consumed = Math.max(0, start - final); // Prevent negative consumption if recharge happened
              totalConsumed += consumed;
              validCount++;

              const apiTag = apiConfigs.length > 1 ? `[API(${key.slice(-4)})]` : '';
              summaryLogs.push(`💰 ${apiTag}消耗: ${consumed.toFixed(2)} | 剩余: ${final.toFixed(2)}`);
            }
          });

          if (validCount === 0) {
            summaryLogs.push(`⚠️ 无法计算消耗 (获取账户信息失败)`);
          }

          onBatchComplete(summaryLogs, failedTasksLocal);
        });
      }
    };

    // Worker function for each API key
    const runWorker = async (apiKey: string, workerId: string) => {
      // If multiple keys, show which one. If high concurrency, show worker ID maybe?
      // Keeping it simple to avoid log clutter: [API1] or similar
      const workerTag = apiConfigs.length > 1 ? `[${workerId}]` : '';

      while (active) {
        // Get next task
        const taskIndex = getNextTaskIndex();
        if (taskIndex === null) {
          // No more tasks
          return;
        }

        const taskNodes = batchList![taskIndex];
        addLog(`${workerTag} 🔄 开始任务 ${taskIndex + 1}/${totalTasks}`);

        try {
          // 0. Upload pending files for this batch before submitting
          let nodesToSubmit = taskNodes;
          if (pendingFiles && Object.keys(pendingFiles).length > 0) {
            const filesToUpload: { nodeId: string; fieldName: string; file: File }[] = [];
            for (const [key, file] of Object.entries(pendingFiles) as [string, File][]) {
              const [batchIdx, nodeId, fieldName] = key.split('|');
              if (parseInt(batchIdx) === taskIndex) {
                filesToUpload.push({ nodeId, fieldName, file });
              }
            }

            if (filesToUpload.length > 0) {
              addLog(`${workerTag} 📤 上传 ${filesToUpload.length} 个文件...`);
              nodesToSubmit = JSON.parse(JSON.stringify(taskNodes));

              for (const { nodeId, fieldName, file } of filesToUpload) {
                try {
                  const result = await uploadFile(apiKey, file);
                  const nodeIndex = nodesToSubmit.findIndex(n => String(n.nodeId) === String(nodeId) && (n.fieldName || '') === fieldName);
                  if (nodeIndex !== -1) {
                    nodesToSubmit[nodeIndex].fieldValue = result.fileName;
                  }
                } catch (uploadErr: any) {
                  throw new Error(`文件上传失败: ${file.name}`);
                }
              }
            }
          }

          // 1. Submit Task
          setStatus('RUNNING');
          const submitRes = await submitTask(apiKey, webappId, nodesToSubmit);

          if (!active) return;

          const taskId = submitRes.taskId;
          addLog(`${workerTag} 📝 任务 ${taskIndex + 1} 已提交 (${taskId.substring(0, 8)}...)`);

          // Check for immediate node errors
          if (submitRes.promptTips) {
            try {
              const promptTips: PromptTips = JSON.parse(submitRes.promptTips);
              if (promptTips.node_errors && Object.keys(promptTips.node_errors).length > 0) {
                const { message } = parseNodeErrors(promptTips.node_errors);
                throw new Error(message);
              }
            } catch (e: any) {
              if (e.message !== 'Unexpected') throw e;
            }
          }

          // 2. Poll Status until complete
          let taskComplete = false;

          while (!taskComplete && active) {
            try {
              const res = await queryTaskOutputs(apiKey, taskId);

              if (res.code === 0 && res.data && res.data.length > 0) {
                // Task Success
                taskComplete = true;
                completedCount++;
                setCurrentBatchIndex(completedCount + failedCountLocal);
                addLog(`${workerTag} 🎉 任务 ${taskIndex + 1} 完成！`);

                // Background save (with optional decode)
                if (autoSaveEnabled) {
                  try {
                    const { decodedOutputs, decodedCount } = await processOutputsWithDecode(res.data, workerTag + ' ');
                    // Pass file info with extensions for proper blob URL saving
                    const filesToSave = decodedOutputs.map((o, idx) => {
                      // Generate custom filename if batchTaskName is provided
                      let filename: string | undefined = undefined;
                      let sequential = false;
                      if (batchTaskName) {
                        // Base name format: TaskName_T001
                        // autoSaveService will append _00001.ext, _00002.ext etc. sequentially
                        filename = `${batchTaskName}_T${String(taskIndex + 1).padStart(3, '0')}`;
                        sequential = true;
                      }
                      return {
                        url: o.fileUrl,
                        extension: o.fileType,
                        filename,
                        sequential
                      };
                    });
                    const savedCount = await saveMultipleFiles(filesToSave);
                    setSavedFilesCount(prev => prev + savedCount);
                    if (decodedCount > 0) {
                      addLog(`${workerTag} 📁 保存 ${savedCount} 个文件 (${decodedCount} 个已解码)`);
                    }
                  } catch (e: any) {
                    addLog(`${workerTag} ⚠️ 保存失败: ${e.message}`);
                  }
                }
              } else if (res.code === 804 || res.code === 813) {
                // 804: APIKEY_TASK_IS_RUNNING (运行中)
                // 813: APIKEY_TASK_IS_QUEUED (排队中)
                // Still running or queued, wait and poll again
                await new Promise(resolve => setTimeout(resolve, 3000));
              } else if (res.code === 805) {
                // 805: APIKEY_TASK_STATUS_ERROR (任务失败，包括执行错误)
                const reason = res.data?.failedReason;
                const msg = reason ? `${reason.node_name || 'Node'}: ${reason.exception_message || 'Error'}` : (res.msg || '任务执行失败');
                throw new Error(msg);
              } else {
                // 其他非0错误码 (安审失败、参数错误等) - 视为任务失败
                const failedReason = res.data?.failedReason;
                let msg = res.msg || `任务失败 (code: ${res.code})`;
                if (failedReason?.exception_message) {
                  msg = failedReason.exception_message;
                }
                throw new Error(msg);
              }
            } catch (err: any) {
              // 如果是我们主动抛出的错误，向上传递
              if (err.message && !err.message.includes('fetch')) {
                throw err;
              }
              // 网络错误等，重试
              addLog(`${workerTag} ⚠️ 轮询出错，3秒后重试: ${err.message}`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }

          // Check if all done
          checkAllDone();

        } catch (err: any) {
          if (!active) return;

          failedCountLocal++;
          // 记录失败任务详情
          failedTasksLocal.push({
            batchIndex: taskIndex,
            errorMessage: err.message || '未知错误',
            timestamp: Date.now()
          });
          setFailedCount(failedCountLocal);
          setCurrentBatchIndex(completedCount + failedCountLocal);
          addLog(`${workerTag} ❌ 任务 ${taskIndex + 1} 失败: ${err.message}`);

          // Check if all done
          checkAllDone();
        }

        // Small delay before picking up next task
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    };

    // Single task execution (non-batch)
    const runSingleTask = async (taskNodes: NodeInfo[]) => {
      const apiKey = primaryApiKey;
      if (!apiKey) {
        addLog(`❌ 无可用的 API Key`);
        setStatus('FAILED');
        setErrorDetails('没有有效的 API Key');
        return;
      }

      try {
        setStatus('SUBMITTING');
        addLog('开始提交任务，请等待...');

        const submitRes = await submitTask(apiKey, webappId, taskNodes);

        if (!active) return;

        const taskId = submitRes.taskId;
        addLog(`📌 提交任务返回: Success`);
        addLog(`📝 taskId: ${taskId}`);

        // Check for immediate node errors
        if (submitRes.promptTips) {
          try {
            const promptTips: PromptTips = JSON.parse(submitRes.promptTips);
            if (promptTips.node_errors && Object.keys(promptTips.node_errors).length > 0) {
              const { message, tip } = parseNodeErrors(promptTips.node_errors);
              addLog(`⚠️ ${message}`);
              setErrorDetails(`❌ ${message}\n\n${tip}`);
              setStatus('FAILED');
              return;
            } else {
              addLog(`✅ 无节点错误，任务提交成功。`);
            }
          } catch (e) {
            console.warn("Could not parse promptTips", e);
          }
        }

        // Poll Status
        startTimeRef.current = Date.now();
        setStatus('QUEUED');

        const poll = async () => {
          if (!active) return;

          // 不再限制客户端超时，持续轮询直到服务端返回成功或失败

          try {
            const res = await queryTaskOutputs(apiKey, taskId);

            if (res.code === 0 && res.data && res.data.length > 0) {
              setStatus('SUCCESS');
              addLog('🎉 生成结果完成！');

              // Auto-decode if enabled
              if (decodeConfig.enabled && decodeConfig.autoDecodeEnabled) {
                addLog('🔓 正在解码...');
                const { decodedOutputs, decodedCount } = await processOutputsWithDecode(res.data, '');
                if (decodedCount > 0) {
                  addLog(`✅ 已解码 ${decodedCount} 个文件`);
                }
                onComplete(decodedOutputs, taskId);
              } else {
                onComplete(res.data, taskId);
              }
              return;
            } else if (res.code === 805) {
              const reason = res.data?.failedReason;
              const msg = reason ? `${reason.node_name || 'Node'}: ${reason.exception_message || 'Error'}` : '未知错误';
              setStatus('FAILED');
              setErrorDetails(msg);
              addLog(`❌ 任务失败！ ${msg}`);
              return;
            } else if (res.code === 804) {
              if (status !== 'RUNNING') setStatus('RUNNING');
              addLog('⏳ 任务运行中...');
            } else if (res.code === 813) {
              addLog('⏳ 任务排队中...');
            }

            pollingRef.current = setTimeout(poll, 5000);
          } catch (err: any) {
            addLog(`❌ 轮询错误: ${err.message}`);
            pollingRef.current = setTimeout(poll, 5000);
          }
        };

        poll();

      } catch (err: any) {
        if (!active) return;
        setStatus('FAILED');
        setErrorDetails(err.message || '未知错误');
        addLog(`❌ 提交任务失败: ${err.message}`);
      }
    };

    // Start execution
    if (isBatch) {
      // Start workers for each API key in parallel
      // Start workers for each API key in parallel based on concurrency config
      let workerCount = 0;

      apiConfigs.forEach((config, configIndex) => {
        const concurrency = config.concurrency || 1;
        const apiKey = config.apiKey;
        if (!apiKey) return;

        for (let i = 0; i < concurrency; i++) {
          // Create a unique worker ID for logs
          workerCount++;
          const workerId = apiConfigs.length > 1 ? `API${configIndex + 1}-${i + 1}` : `Worker-${i + 1}`;
          // Don't spawn more workers than total tasks (optimization)
          // Actually, let's just spawn them, they will exit immediately if no task index available
          // But to avoid too many "Start worker" logs if we have 999 concurrency for 10 tasks...
          // checking against workerCount might not be enough since we don't know if tasks are done.
          // But we can check if workerCount > totalTasks?
          // No, because tasks are pulled from a shared queue.
          // Let's spawn them all but maybe limit the initial log spam?
          // Proceed with spawning.
          runWorker(apiKey, workerId);
        }
      });

      addLog(`🏁 已启动 ${workerCount} 个并发工作线程`);
    } else {
      runSingleTask(nodes);
    }

    return () => {
      active = false;
      hasStartedRef.current = false;
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle cancel for batch tasks - generate summary before cancelling
  const handleBatchCancel = async () => {
    const isBatch = !!batchList && batchList.length > 0;
    if (!isBatch || !onBatchCancel) {
      onBack();
      return;
    }

    const summaryLogs: string[] = [];
    summaryLogs.push(`⚠️ 批量任务已被取消`);
    summaryLogs.push(`📊 已完成: ${currentBatchIndex} / ${batchTotal} 个任务`);

    const dirName = getDirectoryName();
    if (autoSaveEnabled && dirName && savedFilesCount > 0) {
      summaryLogs.push(`📁 已保存 ${savedFilesCount} 个文件到: ${dirName}`);
    }

    // Query final RH coins
    const primaryApiKey = apiConfigs[0]?.apiKey || '';
    try {
      const info = await getAccountInfo(primaryApiKey);
      const finalCoins = parseFloat(info.remainCoins);
      if (startCoins !== null) {
        const consumed = startCoins - finalCoins;
        summaryLogs.push(`💰 已消耗: ${consumed.toFixed(2)} RH币 (剩余: ${finalCoins.toFixed(2)} RH币)`);
      }
    } catch (e) {
      // ignore error
    }

    onBatchCancel(summaryLogs, []); // 取消时传递空数组，因为失败信息可能不完整
  };

  // Expose cancel method via ref for parent component
  useImperativeHandle(ref, () => ({
    cancelWithSummary: handleBatchCancel
  }));

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0F1115]/50">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#161920]">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-white">
          <Activity className="w-5 h-5 text-brand-500 animate-pulse" />
          {batchTotal > 1 ? `批量任务执行中 (${currentBatchIndex}/${batchTotal})` : '任务执行中'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
        {/* Status Icon */}
        <div className="my-8 relative">
          {status === 'SUBMITTING' && <Loader2 className="w-16 h-16 text-brand-500 animate-spin" />}
          {(status === 'QUEUED' || status === 'RUNNING' || status === 'INIT') && (
            <div className="relative">
              <div className="absolute inset-0 bg-brand-100 dark:bg-brand-900/40 rounded-full animate-ping opacity-75"></div>
              <div className="relative bg-white dark:bg-slate-800 rounded-full p-2">
                <Clock className={`w-12 h-12 ${status === 'RUNNING' ? 'text-emerald-500' : 'text-brand-500'} animate-pulse`} />
              </div>
            </div>
          )}
          {status === 'FAILED' && <XCircle className="w-16 h-16 text-red-500" />}
          {status === 'SUCCESS' && <CheckCircle2 className="w-16 h-16 text-emerald-500" />}
        </div>

        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
          {status === 'SUBMITTING' && '提交中'}
          {status === 'QUEUED' && '排队中'}
          {status === 'RUNNING' && '生成中'}
          {status === 'FAILED' && '任务失败'}
          {status === 'SUCCESS' && '生成完成'}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center px-4">
          {status === 'QUEUED' && '正在等待资源分配...'}
          {status === 'RUNNING' && 'AI 正在处理您的请求...'}
          {status === 'FAILED' && '请检查错误日志'}
          {status === 'SUCCESS' && '任务已成功完成，结果如下'}
        </p>

        {batchTotal > 1 && (
          <div className="mt-6 w-full max-w-xs">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>进度</span>
              <span>{Math.round((currentBatchIndex / batchTotal) * 100)}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-brand-500 h-full transition-all duration-500"
                style={{ width: `${(currentBatchIndex / batchTotal) * 100}%` }}
              ></div>
            </div>
            <div className="text-xs text-slate-400 mt-1 text-center">
              {currentBatchIndex} / {batchTotal} 任务
              {failedCount > 0 && <span className="text-red-400 ml-2">({failedCount} 失败)</span>}
            </div>
          </div>
        )}

        {errorDetails && (
          <div className="mt-6 w-full bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-xs font-bold mb-1">
              <AlertTriangle className="w-4 h-4" /> 错误
            </div>
            <pre className="text-[10px] text-red-600 dark:text-red-300 font-mono whitespace-pre-wrap break-all">
              {errorDetails}
            </pre>
          </div>
        )}
      </div>

      {/* Logs Console */}
      <div className="h-48 border-t border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#161920] flex flex-col">
        <div className="bg-slate-50 dark:bg-slate-800/30 px-4 py-2 border-b border-slate-200 dark:border-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-3 h-3 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Log Output</span>
          </div>
        </div>
        <div className="flex-1 bg-slate-900 dark:bg-black p-3 font-mono text-[10px] text-slate-300 dark:text-slate-400 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i} className="mb-1 truncate hover:text-white transition-colors border-b border-transparent hover:border-slate-800">
              {log}
            </div>
          ))}
          <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
        </div>
      </div>



      {(status === 'FAILED' || (status === 'SUCCESS' && batchTotal > 1)) && (
        <div className="p-4 bg-white dark:bg-[#161920] border-t border-slate-200 dark:border-slate-800/50">
          <button
            onClick={onBack}
            className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold transition-colors text-sm"
          >
            {status === 'FAILED' ? '重置状态' : '返回编辑'}
          </button>
        </div>
      )}
    </div>
  );
});

export default StepRunning;
