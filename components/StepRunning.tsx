import React, { useEffect, useState, useRef } from 'react';
import { submitTask, queryTaskOutputs } from '../services/api';
import { NodeInfo, TaskOutput, PromptTips } from '../types';
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, Terminal, Activity, Layers } from 'lucide-react';

interface StepRunningProps {
  apiKey: string;
  webappId: string;
  nodes: NodeInfo[];
  batchList?: NodeInfo[][];
  onComplete: (outputs: TaskOutput[], taskId: string) => void;
  onBack: () => void;
}

const StepRunning: React.FC<StepRunningProps> = ({ apiKey, webappId, nodes, batchList, onComplete, onBack }) => {
  const [status, setStatus] = useState<'INIT' | 'SUBMITTING' | 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED'>('INIT');
  const [logs, setLogs] = useState<string[]>([]);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  
  // Batch state
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const batchResultsRef = useRef<TaskOutput[]>([]);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const TIMEOUT_MS = 600 * 1000; // 10 minutes

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  useEffect(() => {
    let active = true;
    const isBatch = !!batchList && batchList.length > 0;
    const totalTasks = isBatch ? batchList.length : 1;
    setBatchTotal(totalTasks);

    const runTask = async (taskNodes: NodeInfo[], index: number) => {
        try {
            // 1. Submit Task
            setStatus('SUBMITTING');
            addLog(isBatch ? `[Batch ${index + 1}/${totalTasks}] 开始提交任务...` : '开始提交任务，请等待...');
            
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
                        const errorMsg = JSON.stringify(promptTips.node_errors, null, 2);
                        addLog(`⚠️ 节点错误信息如下:`);
                        addLog(errorMsg);
                        setErrorDetails(errorMsg);
                        setStatus('FAILED');
                        return;
                    } else {
                        addLog(`✅ 无节点错误，任务提交成功。`);
                    }
                } catch (e) {
                    console.warn("Could not parse promptTips", e);
                    addLog(`⚠️ 无法解析 promptTips`);
                }
            }

            // 2. Poll Status
            startTimeRef.current = Date.now();
            setStatus('QUEUED');

            const poll = async () => {
                if (!active) return;

                // Timeout Check
                if (Date.now() - startTimeRef.current > TIMEOUT_MS) {
                    setStatus('FAILED');
                    setErrorDetails("运行超时");
                    addLog("⏰ 等待超时（超过10分钟），任务未完成。");
                    return;
                }

                try {
                    const res = await queryTaskOutputs(apiKey, taskId);

                    if (res.code === 0 && res.data && res.data.length > 0) {
                        // Task Success
                        addLog(isBatch ? `🎉 Batch ${index + 1}/${totalTasks} 完成！` : '🎉 生成结果完成！');
                        
                        if (isBatch) {
                            // Accumulate results
                            batchResultsRef.current = [...batchResultsRef.current, ...res.data];
                            
                            // Check if more batches
                            if (index + 1 < totalTasks) {
                                setCurrentBatchIndex(index + 1);
                                // Trigger next task
                                // Small delay to be safe
                                setTimeout(() => {
                                    if(active) runTask(batchList[index + 1], index + 1);
                                }, 1000);
                            } else {
                                // All done
                                setStatus('SUCCESS');
                                addLog('✅ 所有批量任务完成！');
                                onComplete(batchResultsRef.current, taskId); 
                            }
                        } else {
                            setStatus('SUCCESS');
                            addLog('✅ 任务完成！');
                            onComplete(res.data, taskId);
                        }
                        return;
                    } else if (res.code === 805) {
                        setStatus('FAILED');
                        const reason = res.data?.failedReason;
                        let msg = "未知错误";
                        if (reason) {
                            msg = `${reason.node_name || 'Node'}: ${reason.exception_message || 'Error'}`;
                        }
                        setErrorDetails(msg);
                        addLog(`❌ 任务失败！ ${msg}`);
                        if (reason?.traceback) {
                            addLog(`Traceback: ${reason.traceback.substring(0, 100)}...`);
                        }
                        return;
                    } else if (res.code === 804) {
                        if (status !== 'RUNNING') setStatus('RUNNING');
                        addLog('⏳ 任务运行中...');
                    } else if (res.code === 813) {
                        addLog('⏳ 任务排队中...');
                    } else {
                        // addLog(`⚠️ 未知状态 (${res.code})`);
                    }

                    // Schedule next poll
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
            setErrorDetails(err.message);
            addLog(`❌ 提交任务失败: ${err.message}`);
        }
    };

    // Start first task
    if (isBatch) {
        runTask(batchList[0], 0);
    } else {
        runTask(nodes, 0);
    }

    return () => {
      active = false;
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0F1115]/50">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#161920]">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-white">
          <Activity className="w-5 h-5 text-brand-500 animate-pulse" />
          {batchTotal > 1 ? `批量任务执行中 (${currentBatchIndex + 1}/${batchTotal})` : '任务执行中'}
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
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>进度</span>
                    <span>{Math.round(((currentBatchIndex) / batchTotal) * 100)}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div 
                        className="bg-brand-500 h-full transition-all duration-500"
                        style={{ width: `${((currentBatchIndex) / batchTotal) * 100}%` }}
                    ></div>
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

      {status === 'FAILED' && (
        <div className="p-4 bg-white dark:bg-[#161920] border-t border-slate-200 dark:border-slate-800/50">
          <button
            onClick={onBack}
            className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold transition-colors text-sm"
          >
            重置状态
          </button>
        </div>
      )}
    </div>
  );
};

export default StepRunning;
