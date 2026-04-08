import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Play,
  Loader2,
  Zap,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { ApiKeyEntry, AutoSaveConfig, DecodeConfig, InstanceType, NodeInfo, TaskOutput, WebAppInfo } from '../../types';
import { fetchWorkflowTemplate, queryTaskResult, submitTask, uploadFile } from '../../services/api';
import { connectTaskProgress } from '../../services/taskProgress';
import { parseListOptions } from '../../utils/nodeUtils';

export interface AppNodeData {
  id: string;
  webappId: string;
  webAppInfo: WebAppInfo | null;
  nodes: NodeInfo[];
  instanceType: InstanceType;
  isLoading: boolean;
  error: string | null;
  status: 'INIT' | 'SUBMITTING' | 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'TRIGGER_RUN';
  taskId?: string;
  outputs?: TaskOutput[];
  progressMsg?: string;
  apiKeyId?: string;
}

interface AppNodeProps {
  id: string;
  x: number;
  y: number;
  data: AppNodeData;
  isSelected: boolean;
  apiKeys: ApiKeyEntry[];
  decodeConfig: DecodeConfig;
  autoSaveConfig: AutoSaveConfig;
  onUpdate: (id: string, data: Partial<AppNodeData>) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
}

const POLL_INTERVAL_MS = 4000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const parsePromptTips = (raw?: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const parseNodeErrors = (nodeErrors: Record<string, any>): string => {
  for (const [nodeId, nodeError] of Object.entries(nodeErrors || {})) {
    if (nodeError && typeof nodeError === 'object') {
      const errors = Array.isArray(nodeError.errors) ? nodeError.errors : [nodeError];
      const nodeName = nodeError.node_name || nodeError.class_type || nodeId;

      for (const err of errors) {
        const details = err?.details || err?.message || '';
        if (details.includes('API balance is insufficient') || details.includes('please recharge')) {
          return `第三方 API 余额不足: ${nodeName}`;
        }
        if (details.includes('Invalid API') || details.includes('API key')) {
          return `第三方 API Key 无效: ${nodeName}`;
        }
        if (err?.type === 'custom_validation_failed') {
          return `参数校验失败: ${nodeName}`;
        }
      }
    }
  }

  return '节点执行失败';
};

const buildNodeNameMap = (nodes: NodeInfo[]): Record<string, string> =>
  nodes.reduce<Record<string, string>>((acc, node) => {
    acc[String(node.nodeId)] = node.nodeName || node.description || node.fieldName || `#${node.nodeId}`;
    return acc;
  }, {});

const AppNode: React.FC<AppNodeProps> = ({
  id,
  x,
  y,
  data,
  isSelected,
  apiKeys,
  onUpdate,
  onDelete,
  onSelect,
  onDragStart,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(data.webappId);
  const [expandedParams, setExpandedParams] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const connectionRef = useRef<{ close: () => void } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      connectionRef.current?.close();
      connectionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    if (data.status === 'TRIGGER_RUN') {
      void handleRun();
    }
  }, [data.status]);

  useEffect(() => {
    if (data.webappId && !data.webAppInfo && !data.isLoading) {
      void handleLoadApp();
    }
  }, []);

  const selectedApiKey = data.apiKeyId ? apiKeys.find(key => key.id === data.apiKeyId)?.apiKey : apiKeys[0]?.apiKey;

  const handleLoadApp = async () => {
    if (!inputValue.trim()) return;

    onUpdate(id, { isLoading: true, error: null });
    try {
      const result = await fetchWorkflowTemplate(inputValue.trim(), selectedApiKey);
      if (!mountedRef.current) return;

      if (result.success && result.data) {
        onUpdate(id, {
          webappId: inputValue.trim(),
          webAppInfo: result.data.appInfo,
          nodes: result.data.nodes,
          isLoading: false,
          error: null,
          status: 'INIT',
          outputs: [],
          progressMsg: '应用已加载',
        });
      } else {
        onUpdate(id, {
          isLoading: false,
          error: result.error || '加载失败',
        });
      }
    } catch (error: any) {
      if (!mountedRef.current) return;
      onUpdate(id, {
        isLoading: false,
        error: error.message || '网络错误',
      });
    }
  };

  const handleParamChange = (index: number, value: string) => {
    const nextNodes = [...data.nodes];
    nextNodes[index] = { ...nextNodes[index], fieldValue: value };
    onUpdate(id, { nodes: nextNodes });
  };

  const handleFileUpload = async (index: number, file: File) => {
    if (!selectedApiKey) {
      onUpdate(id, { error: '请先配置 API Key' });
      return;
    }

    onUpdate(id, { isLoading: true, error: null });
    try {
      const result = await uploadFile(selectedApiKey, file);
      handleParamChange(index, result.fileName);
      if (mountedRef.current) {
        onUpdate(id, { isLoading: false });
      }
    } catch (error: any) {
      if (!mountedRef.current) return;
      onUpdate(id, { isLoading: false, error: error.message || '上传失败' });
    }
  };

  const handleRun = async () => {
    if (['SUBMITTING', 'QUEUED', 'RUNNING'].includes(data.status)) return;
    if (!selectedApiKey) {
      onUpdate(id, { error: '请先配置 API Key', status: 'FAILED' });
      return;
    }

    connectionRef.current?.close();
    connectionRef.current = null;

    onUpdate(id, {
      status: 'SUBMITTING',
      error: null,
      outputs: [],
      progressMsg: '正在提交任务...',
    });

    try {
      const submitResult = await submitTask(
        selectedApiKey,
        data.webappId,
        data.nodes,
        data.instanceType === 'plus' ? 'plus' : undefined,
      );

      const promptTips = parsePromptTips(submitResult.promptTips);
      if (promptTips?.node_errors && Object.keys(promptTips.node_errors).length > 0) {
        onUpdate(id, {
          status: 'FAILED',
          error: parseNodeErrors(promptTips.node_errors),
          progressMsg: '参数校验失败',
        });
        return;
      }

      const initialStatus = submitResult.taskStatus === 'RUNNING' ? 'RUNNING' : 'QUEUED';
      onUpdate(id, {
        status: initialStatus,
        taskId: submitResult.taskId,
        progressMsg: initialStatus === 'RUNNING' ? '任务运行中...' : '任务排队中...',
      });

      if (submitResult.netWssUrl) {
        connectionRef.current = connectTaskProgress(submitResult.netWssUrl, buildNodeNameMap(data.nodes), {
          onProgress: snapshot => {
            if (!mountedRef.current) return;
            const nodeText = snapshot.currentNodeName ? ` · ${snapshot.currentNodeName}` : '';
            onUpdate(id, {
              status: 'RUNNING',
              progressMsg: `执行中 ${Math.round(snapshot.overallPercent)}%${nodeText}`,
            });
          },
        });
      }

      while (mountedRef.current) {
        const result = await queryTaskResult(selectedApiKey, submitResult.taskId);

        if (result.status === 'SUCCESS') {
          connectionRef.current?.close();
          connectionRef.current = null;
          onUpdate(id, {
            status: 'SUCCESS',
            outputs: result.results,
            progressMsg: '任务完成',
          });
          return;
        }

        if (result.status === 'FAILED') {
          connectionRef.current?.close();
          connectionRef.current = null;
          onUpdate(id, {
            status: 'FAILED',
            error: result.failedReason?.exception_message || result.errorMessage || '任务失败',
            progressMsg: '任务失败',
          });
          return;
        }

        onUpdate(id, {
          status: result.status === 'RUNNING' ? 'RUNNING' : 'QUEUED',
          progressMsg: result.status === 'RUNNING' ? '任务运行中...' : '任务排队中...',
        });

        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error: any) {
      if (!mountedRef.current) return;
      connectionRef.current?.close();
      connectionRef.current = null;
      onUpdate(id, {
        status: 'FAILED',
        error: error.message || '提交失败',
        progressMsg: '任务失败',
      });
    }
  };

  const renderInput = (node: NodeInfo, index: number) => {
    const baseClass = 'w-full px-2 py-1 text-xs bg-white dark:bg-[#0F1115] border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 focus:outline-none focus:border-brand-500';
    const options = parseListOptions(node);
    const helpText = node.description || node.descriptionEn;

    if (options.length > 0) {
      const currentValue = node.fieldValue || options[0]?.index || '';
      const normalizedValue = options.some(option => option.index === currentValue) ? currentValue : options[0]?.index || '';
      return (
        <select
          value={normalizedValue}
          onChange={event => handleParamChange(index, event.target.value)}
          className={baseClass}
        >
          {options.map(option => (
            <option key={option.index} value={option.index}>
              {option.name}
            </option>
          ))}
        </select>
      );
    }

    if (['IMAGE', 'AUDIO', 'VIDEO'].includes(node.fieldType)) {
      const accept = node.fieldType === 'IMAGE' ? 'image/*' : node.fieldType === 'AUDIO' ? 'audio/*' : 'video/*';
      return (
        <div className="flex gap-1 items-center">
          <input
            type="text"
            value={node.fieldValue}
            onChange={event => handleParamChange(index, event.target.value)}
            placeholder="输入 URL 或上传文件"
            className={`${baseClass} flex-1`}
            disabled={data.isLoading}
          />
          <label className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer flex-shrink-0 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
            {data.isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : '上传'}
            <input
              type="file"
              className="hidden"
              disabled={data.isLoading}
              accept={accept}
              onChange={event => {
                if (event.target.files?.[0]) {
                  void handleFileUpload(index, event.target.files[0]);
                }
              }}
            />
          </label>
        </div>
      );
    }

    if (node.fieldType === 'SWITCH') {
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={node.fieldValue === 'true'}
            onChange={event => handleParamChange(index, event.target.checked ? 'true' : 'false')}
            className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-xs text-slate-500">启用</span>
        </label>
      );
    }

    if (node.fieldType === 'INT' || node.fieldType === 'FLOAT') {
      return (
        <input
          type="number"
          value={node.fieldValue}
          onChange={event => handleParamChange(index, event.target.value)}
          className={baseClass}
        />
      );
    }

    return (
      <>
        <input
          type="text"
          value={node.fieldValue}
          onChange={event => handleParamChange(index, event.target.value)}
          className={baseClass}
        />
        {helpText && (
          <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-1">
            {helpText}
          </p>
        )}
      </>
    );
  };

  return (
    <div
      className={`bg-white dark:bg-[#1a1d24] rounded-lg shadow-lg border-2 select-none ${isSelected ? 'border-brand-500 shadow-xl' : 'border-slate-200 dark:border-slate-700'}`}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 320,
        minHeight: 100,
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-[#161920] border-b border-slate-200 dark:border-slate-700 rounded-t-lg cursor-move"
        onMouseDown={event => {
          event.stopPropagation();
          onSelect(id);
          onDragStart(id, event);
        }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={event => setInputValue(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    setIsEditing(false);
                    void handleLoadApp();
                  } else if (event.key === 'Escape') {
                    setIsEditing(false);
                    setInputValue(data.webappId);
                  }
                }}
                onBlur={() => {
                  setIsEditing(false);
                  setInputValue(data.webappId);
                }}
                onClick={event => event.stopPropagation()}
                className="flex-1 px-2 py-0.5 text-xs bg-white dark:bg-[#0F1115] border border-slate-300 dark:border-slate-600 rounded"
                placeholder="输入应用 ID"
              />
              <button
                onClick={event => {
                  event.stopPropagation();
                  setIsEditing(false);
                  void handleLoadApp();
                }}
                disabled={data.isLoading}
                className="p-1 bg-brand-500 text-white rounded hover:bg-brand-600 disabled:opacity-50"
              >
                {data.isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              </button>
            </div>
          ) : (
            <span
              onClick={event => {
                event.stopPropagation();
                setIsEditing(true);
              }}
              className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:text-brand-500 truncate"
              title={data.webAppInfo?.webappName || data.webappId || '点击输入应用 ID'}
            >
              {data.webAppInfo?.webappName || data.webappId || '点击输入应用 ID'}
            </span>
          )}
        </div>
        <button
          onClick={event => {
            event.stopPropagation();
            onDelete(id);
          }}
          className="p-1 text-slate-400 hover:text-red-500 rounded shrink-0 ml-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {data.error && (
        <div className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800/50">
          <p className="text-xs text-red-600 dark:text-red-400">{data.error}</p>
        </div>
      )}

      {data.nodes.length > 0 && (
        <div className="px-3 py-2 max-h-64 overflow-y-auto">
          <div className="space-y-2">
            {data.nodes.map((node, index) => {
              const helpText = node.description || node.descriptionEn;
              return (
                <div key={node._taskId || `${node.nodeId}-${index}`} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">
                      {node.nodeName}
                      {node.fieldName && node.fieldName !== node.nodeName && (
                        <span className="text-slate-400 ml-1">({node.fieldName})</span>
                      )}
                    </label>
                    {helpText && (
                      <button
                        onClick={() => setExpandedParams(prev => ({ ...prev, [index]: !prev[index] }))}
                        className="text-slate-400 hover:text-slate-600 shrink-0"
                      >
                        {expandedParams[index] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                  {renderInput(node, index)}
                  {expandedParams[index] && helpText && (
                    <p className="text-xs text-slate-500 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded">
                      {helpText}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(data.status !== 'INIT' || (data.outputs && data.outputs.length > 0)) && (
        <div className="px-3 py-3 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              {['SUBMITTING', 'QUEUED', 'RUNNING'].includes(data.status) ? (
                <Loader2 className="w-3.5 h-3.5 text-brand-500 animate-spin" />
              ) : data.status === 'SUCCESS' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ) : data.status === 'FAILED' ? (
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              ) : null}
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {data.progressMsg || '准备就绪'}
              </span>
            </div>
          </div>

          {data.outputs && data.outputs.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {data.outputs.map((output, index) => (
                <div key={index} className="relative rounded overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-black/50">
                  {output.fileUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i) ? (
                    <video src={output.fileUrl} controls className="w-full max-h-40 object-contain bg-black" />
                  ) : output.fileUrl.match(/\.(mp3|wav|flac)(\?.*)?$/i) ? (
                    <audio src={output.fileUrl} controls className="w-full" />
                  ) : output.fileUrl.match(/^(http|data:image)/i) ? (
                    <a href={output.fileUrl} target="_blank" rel="noreferrer" title="新标签页查看结果">
                      <img src={output.fileUrl} alt="Output" className="w-full max-h-40 object-contain transition-transform hover:scale-105" />
                    </a>
                  ) : (
                    <div className="p-2 text-sm text-slate-700 dark:text-slate-300 break-words whitespace-pre-wrap">
                      {output.fileUrl}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {data.nodes.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <select
              value={data.apiKeyId || ''}
              onChange={event => {
                event.stopPropagation();
                onUpdate(id, { apiKeyId: event.target.value });
              }}
              onClick={event => event.stopPropagation()}
              className="px-2 py-1 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-xs text-slate-600 dark:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500 w-24 truncate"
              title="选择 API Key"
            >
              {!data.apiKeyId && apiKeys.length > 0 && (
                <option value="">{apiKeys[0].apiKey.slice(0, 8)}... (默认)</option>
              )}
              {apiKeys.map(key => (
                <option key={key.id} value={key.id}>
                  {key.apiKey.slice(0, 8)}...
                </option>
              ))}
            </select>
            <button
              onClick={event => {
                event.stopPropagation();
                onUpdate(id, { instanceType: data.instanceType === 'default' ? 'plus' : 'default' });
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                data.instanceType === 'plus'
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}
              title="切换 Plus 模式"
            >
              <Zap className="w-3 h-3" />
              <span>{data.instanceType === 'plus' ? 'Plus' : '标准'}</span>
            </button>
          </div>
          <button
            onClick={event => {
              event.stopPropagation();
              void handleRun();
            }}
            disabled={['SUBMITTING', 'QUEUED', 'RUNNING'].includes(data.status) || data.isLoading}
            className="flex items-center gap-1 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors"
          >
            {['SUBMITTING', 'QUEUED', 'RUNNING'].includes(data.status) ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            <span>{['SUBMITTING', 'QUEUED', 'RUNNING'].includes(data.status) ? '执行中' : '运行'}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default AppNode;
