import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, Loader2, Play, RefreshCw, Square, Trash2 } from 'lucide-react';
import StepEditor, { StepEditorRef } from '../StepEditor';
import { DecodeConfig, InstanceType, NodeInfo, PendingFilesMap, TaskOutput, WebAppInfo } from '../../types';

export type MultiTaskCardStatus = 'idle' | 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

export interface MultiTaskUsageStats {
  coins: number;
  thirdParty: number;
  taskTime: number;
}

export interface MultiTaskCardRunState {
  mode: 'single' | 'batch';
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
  id: string;
  webappId: string;
  webAppInfo: WebAppInfo | null;
  nodes: NodeInfo[];
  isConnected: boolean;
  loading: boolean;
  loadError: string | null;
  instanceType: InstanceType;
  run: MultiTaskCardRunState;
}

interface MultiTaskCardProps {
  card: MultiTaskCardData;
  apiKeys: string[];
  decodeConfig: DecodeConfig;
  editorRef: React.Ref<StepEditorRef>;
  isLocked: boolean;
  onWebappIdChange: (cardId: string, value: string) => void;
  onLoad: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onDuplicate: (cardId: string) => void;
  onRun: (cardId: string, updatedNodes: NodeInfo[], batchList?: NodeInfo[][], pendingFiles?: PendingFilesMap, decodeConfig?: DecodeConfig, batchTaskName?: string, instanceType?: InstanceType) => void;
  onCancel: (cardId: string) => void;
  onInstanceTypeChange: (cardId: string, nextType: InstanceType) => void;
}

const statusMap: Record<MultiTaskCardStatus, { label: string; className: string }> = {
  idle: { label: '待运行', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  queued: { label: '排队中', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  running: { label: '运行中', className: 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' },
  success: { label: '已完成', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  failed: { label: '失败', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  cancelled: { label: '已停止', className: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200' },
};

const renderOutput = (output: TaskOutput, index: number) => {
  const url = output.fileUrl || output.downloadUrl || '';
  if (!url) return null;

  if (/\.(mp4|webm|mov)(\?.*)?$/i.test(url)) {
    return (
      <video
        key={`${url}-${index}`}
        src={url}
        controls
        className="w-full max-h-36 rounded-lg bg-black object-contain"
      />
    );
  }

  if (/\.(mp3|wav|flac)(\?.*)?$/i.test(url)) {
    return <audio key={`${url}-${index}`} src={url} controls className="w-full" />;
  }

  if (/^(https?:\/\/|blob:|data:image)/i.test(url)) {
    return (
      <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt="Task Output" className="w-full max-h-36 rounded-lg border border-slate-200 dark:border-slate-700 object-contain bg-slate-50 dark:bg-slate-900/40" />
      </a>
    );
  }

  return (
    <div key={`${url}-${index}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 break-all">
      {url}
    </div>
  );
};

const MultiTaskCard: React.FC<MultiTaskCardProps> = ({
  card,
  apiKeys,
  decodeConfig,
  editorRef,
  isLocked,
  onWebappIdChange,
  onLoad,
  onRemove,
  onDuplicate,
  onRun,
  onCancel,
  onInstanceTypeChange,
}) => {
  const [inputValue, setInputValue] = useState(card.webappId);

  useEffect(() => {
    setInputValue(card.webappId);
  }, [card.webappId]);

  const isRunning = card.run.status === 'queued' || card.run.status === 'running';
  const statusMeta = statusMap[card.run.status];
  const batchPercent = card.run.totalUnits > 0 ? Math.round(((card.run.completedUnits + card.run.failedUnits) / card.run.totalUnits) * 100) : 0;
  const displayOutputs = useMemo(() => card.run.outputs.slice(-4), [card.run.outputs]);
  const displayLogs = useMemo(() => card.run.logs.slice(-12), [card.run.logs]);

  return (
    <div className="relative flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#161920] min-h-[980px] overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-slate-800 dark:text-white">
                {card.webAppInfo?.webappName || card.webappId || '新任务卡片'}
              </h3>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              卡片 ID: {card.id.slice(0, 8)} | 应用 ID: {card.webappId || '未设置'}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onDuplicate(card.id)}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-500 dark:text-slate-400 dark:hover:bg-slate-800"
              title="复制卡片"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              onClick={() => onRemove(card.id)}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-400 dark:hover:bg-red-900/20"
              title="删除卡片"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={event => {
              const value = event.target.value;
              setInputValue(value);
              onWebappIdChange(card.id, value);
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                onLoad(card.id);
              }
            }}
            placeholder="输入 WebApp ID 或详情页链接"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-200"
          />
          <button
            onClick={() => onLoad(card.id)}
            disabled={card.loading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {card.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            加载
          </button>
        </div>

        {card.loadError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{card.loadError}</span>
          </div>
        )}

        {card.webAppInfo?.description && (
          <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {card.webAppInfo.description}
          </p>
        )}
      </div>

      <div className="relative flex-1 min-h-0">
        {isLocked && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 text-sm font-medium text-slate-600 backdrop-blur-sm dark:bg-black/40 dark:text-slate-200">
            调度进行中，当前卡片暂时锁定
          </div>
        )}

        <StepEditor
          ref={editorRef}
          nodes={card.nodes}
          apiKeys={apiKeys}
          isConnected={card.isConnected}
          runType={isRunning ? card.run.mode : 'none'}
          webAppInfo={card.webAppInfo}
          onBack={() => {}}
          onRun={(updatedNodes, batchList, pendingFiles, nextDecodeConfig, batchTaskName, nextInstanceType) => onRun(card.id, updatedNodes, batchList, pendingFiles, nextDecodeConfig, batchTaskName, nextInstanceType)}
          onCancel={() => onCancel(card.id)}
          decodeConfig={decodeConfig}
          failedBatchIndices={card.run.failedBatchIndices}
          instanceType={card.instanceType}
          onInstanceTypeChange={nextType => onInstanceTypeChange(card.id, nextType)}
        />
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-[#161920]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            {card.run.status === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
            ) : card.run.status === 'failed' ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : (
              <Play className="h-4 w-4 text-slate-400" />
            )}
            <span>{card.run.progressText || '等待运行'}</span>
          </div>
          {isRunning && (
            <button
              onClick={() => onCancel(card.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-red-300 hover:text-red-500 dark:border-slate-700 dark:text-slate-300"
            >
              <Square className="h-3.5 w-3.5" />
              停止
            </button>
          )}
        </div>

        {card.run.totalUnits > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>卡片进度</span>
              <span>{batchPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${batchPercent}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>完成 {card.run.completedUnits} / {card.run.totalUnits}</span>
              <span>失败 {card.run.failedUnits}</span>
            </div>
          </div>
        )}

        {card.run.progressPercent > 0 && isRunning && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>当前任务进度</span>
              <span>{card.run.progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${card.run.progressPercent}%` }} />
            </div>
          </div>
        )}

        {(card.run.usage.coins > 0 || card.run.usage.thirdParty > 0 || card.run.usage.taskTime > 0) && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
              RH 币 {card.run.usage.coins.toFixed(2)}
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
              第三方 {card.run.usage.thirdParty.toFixed(2)}
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
              用时 {card.run.usage.taskTime}s
            </div>
          </div>
        )}

        {card.run.error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs whitespace-pre-wrap text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {card.run.error}
          </div>
        )}

        {displayOutputs.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              最新结果
            </div>
            <div className="grid grid-cols-1 gap-2">
              {displayOutputs.map(renderOutput)}
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            运行日志
          </div>
          <div className="max-h-40 overflow-y-auto rounded-xl bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-300">
            {displayLogs.length === 0 ? (
              <div className="text-slate-500">暂无日志</div>
            ) : (
              displayLogs.map((log, index) => (
                <div key={`${card.id}-log-${index}`} className="mb-1 break-all">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiTaskCard;
