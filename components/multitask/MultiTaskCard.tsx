import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Trash2
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { InstanceType, NodeInfo, PendingFilesMap, TaskOutput, WebAppInfo, WorkflowRunOptions } from '../../types';
import StepEditor, { StepEditorRef } from '../StepEditor';
import MultiTaskCardDownload from './MultiTaskCardDownload';
import type { DirectoryHandle } from '../../services/fileSystem';
import MultiTaskOutputs from './MultiTaskOutputs';

import type { MultiTaskCardData, MultiTaskCardStatus } from './cardTypes';

interface MultiTaskCardProps {
  onManage?: () => void;
  onSaveToLibrary?: () => void;
  groupNames?: string[];
  directory: DirectoryHandle | null;
  onDirectoryChange: (directory: DirectoryHandle) => void;
  onHistory: () => void;
  card: MultiTaskCardData;
  apiKeys: string[];
  editorRef: React.Ref<StepEditorRef>;
  isBusy: boolean;
  onRunOptionsChange: (cardId: string, options: WorkflowRunOptions) => void;
  onWebappIdChange: (cardId: string, value: string) => void;
  onLoad: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onDuplicate: (cardId: string) => void;
  onRun: (cardId: string, updatedNodes: NodeInfo[], batchList?: NodeInfo[][], pendingFiles?: PendingFilesMap, batchTaskName?: string, instanceType?: InstanceType) => void;
  onCancel: (cardId: string) => void;
  onInstanceTypeChange: (cardId: string, nextType: InstanceType) => void;
}


const WEBAPP_ID_PLACEHOLDER = '请输入 WebApp ID，或粘贴应用详情页链接';

const statusMap: Record<MultiTaskCardStatus, { label: string; className: string }> = {
  idle: { label: '\u5f85\u8fd0\u884c', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  queued: { label: '\u6392\u961f\u4e2d', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  running: { label: '\u8fd0\u884c\u4e2d', className: 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' },
  success: { label: '\u5df2\u5b8c\u6210', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  failed: { label: '\u5931\u8d25', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  cancelled: { label: '\u5df2\u505c\u6b62', className: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200' },
};

const MultiTaskCard: React.FC<MultiTaskCardProps> = ({
  card,
  onManage, onSaveToLibrary, groupNames = [],
  directory, onDirectoryChange, onHistory,
  apiKeys,
  editorRef,
  isBusy,
  onRunOptionsChange,
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

  const isRunning = isBusy;
  const statusMeta = statusMap[card.run.status];
  const batchPercent = card.run.totalUnits > 0 ? Math.round(((card.run.completedUnits + card.run.failedUnits) / card.run.totalUnits) * 100) : 0;
  const displayLogs = useMemo(() => card.run.logs.slice(-12), [card.run.logs]);

  // The list establishes a size container; reserve its 24px top/bottom padding.
  return (
    <div data-task-card-id={card.id} className="relative flex h-[clamp(360px,calc(100cqh_-_48px),900px)] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#161920]">
      <div className="shrink-0 border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-slate-800 dark:text-white">
                {card.organization?.title || card.webAppInfo?.webappName || card.webappId || '\u65b0\u4efb\u52a1\u5361\u7247'}
              </h3>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
            </div>
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
              disabled={isBusy}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-400 dark:hover:bg-red-900/20"
              title="删除卡片"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {(onManage || onSaveToLibrary) && <div className="mt-2 flex max-h-24 flex-wrap items-center gap-2 overflow-y-auto text-xs">
          {onManage && <button onClick={onManage} className="rounded border border-slate-300 px-2 py-1 text-slate-600 dark:border-slate-600 dark:text-slate-300">分组与标签</button>}
          {onSaveToLibrary && <button onClick={onSaveToLibrary} disabled={!card.webappId.trim() || card.loading} className="rounded border border-brand-400 px-2 py-1 text-brand-600 disabled:opacity-50 dark:text-brand-300">保存到卡片库</button>}
          {groupNames.map(name => <span key={name} className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">{name}</span>)}
          {(card.organization?.tags || []).map(tag => <span key={tag} className="rounded-full bg-brand-100 px-2 py-1 text-brand-700 dark:bg-brand-900 dark:text-brand-100">{tag}</span>)}
        </div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500" tabIndex={0} role="region" aria-label={`${card.webAppInfo?.webappName || '任务卡片'}内容`}>
        <div className="border-b border-slate-200 px-4 pb-3 dark:border-slate-800">
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={inputValue}
              disabled={isBusy || card.loading}
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
              placeholder={WEBAPP_ID_PLACEHOLDER}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-200"
            />
            <button
              onClick={() => onLoad(card.id)}
              disabled={card.loading || isBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {card.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {'\u52a0\u8f7d'}
            </button>
          </div>

          <details className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            <summary className="cursor-pointer">应用运行选项</summary>
            <div className="mt-2 grid gap-2">
              <label className="grid gap-1">
                <span>应用访问密码（可选）</span>
                <input
                  type="password"
                  autoComplete="off"
                  disabled={isBusy}
                  value={card.runOptions?.accessPassword || ''}
                  onChange={event => onRunOptionsChange(card.id, { ...card.runOptions, accessPassword: event.target.value })}
                  placeholder="仅加密应用需要"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-200"
                />
              </label>
              <label className="grid gap-1">
                <span>实例保留时长（秒，仅企业共享）</span>
                <input
                  type="number"
                  min={10}
                  max={180}
                  step={1}
                  disabled={isBusy}
                  value={card.runOptions?.retainSeconds ?? ''}
                  onChange={event => onRunOptionsChange(card.id, { ...card.runOptions, retainSeconds: event.target.value === '' ? undefined : Number(event.target.value) })}
                  placeholder="10–180，留空使用默认值"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-200"
                />
              </label>
            </div>
          </details>

          {card.loadError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{card.loadError}</span>
            </div>
          )}
        </div>

        <div className="relative">
          <StepEditor
            ref={editorRef}
            scrollMode="parent"
            nodes={card.nodes}
            apiKeys={apiKeys}
            isConnected={card.isConnected}
            runType={isRunning ? card.run.mode : 'none'}
            webAppInfo={card.webAppInfo}
            onBack={() => { }}
            onRun={(updatedNodes, batchList, pendingFiles, batchTaskName, nextInstanceType) => onRun(card.id, updatedNodes, batchList, pendingFiles, batchTaskName, nextInstanceType)}
            onCancel={() => onCancel(card.id)}
            failedBatchIndices={card.run.failedBatchIndices}
            instanceType={card.instanceType}
            onInstanceTypeChange={nextType => onInstanceTypeChange(card.id, nextType)}
            initialBatchList={card.initialBatchList}
            initialBatchTaskName={card.initialBatchTaskName}
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
              <span>{card.run.progressText || '\u7b49\u5f85\u8fd0\u884c'}</span>
            </div>
            {isRunning && (
              <button
                onClick={() => onCancel(card.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-red-300 hover:text-red-500 dark:border-slate-700 dark:text-slate-300"
              >
                <Square className="h-3.5 w-3.5" />
                {'\u505c\u6b62'}
              </button>
            )}
          </div>

          {card.run.totalUnits > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{'\u5361\u7247\u8fdb\u5ea6'}</span>
                <span>{batchPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${batchPercent}%` }} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>{'\u5df2\u5b8c\u6210'} {card.run.completedUnits} / {card.run.totalUnits}</span>
                <span>{'\u5931\u8d25'} {card.run.failedUnits}</span>
              </div>
            </div>
          )}

          {card.run.progressPercent > 0 && isRunning && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{'\u5f53\u524d\u4efb\u52a1\u8fdb\u5ea6'}</span>
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
                RH {'\u5e01'} {card.run.usage.coins.toFixed(2)}
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                {'\u7b2c\u4e09\u65b9'} {card.run.usage.thirdParty.toFixed(2)}
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                {'\u7528\u65f6'} {card.run.usage.taskTime}s
              </div>
            </div>
          )}

          {card.run.error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs whitespace-pre-wrap text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {card.run.error}
            </div>
          )}

          <MultiTaskOutputs outputs={card.run.outputs} />

          <div className="mt-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {'\u8fd0\u884c\u65e5\u5fd7'}
            </div>
            <div tabIndex={0} aria-label="运行日志" className="max-h-40 overflow-y-auto rounded-xl bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-300">
              {displayLogs.length === 0 ? (
                <div className="text-slate-500">{'\u6682\u65e0\u65e5\u5fd7'}</div>
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
      <div className="shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#161920]">
        <button type="button" onClick={onHistory} className="mb-2 text-sm text-brand-500 hover:underline">本卡片历史</button>
        <MultiTaskCardDownload
          directory={directory || null}
          onDirectoryChange={onDirectoryChange}
          cardName={card.organization?.title || card.webAppInfo?.webappName || card.webappId || 'batch-results'}
          isBatch={card.run.mode === 'batch'}
          isRunning={isRunning}
          runStatus={card.run.status}
          outputs={card.run.outputs}
        />
      </div>

    </div>
  );
};

export default MultiTaskCard;
