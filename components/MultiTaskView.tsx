import React, { useMemo, useRef, useState } from 'react';
import { Layers, Loader2, Play, Plus, Square, X } from 'lucide-react';
import { getNodeList } from '../services/api';
import { executeWorkflowTask, TaskCancelledError, TaskUsageStats } from '../services/taskExecutor';
import MultiTaskCard, { MultiTaskCardData, MultiTaskCardRunState } from './multitask/MultiTaskCard';
import { StepEditorRef, StepEditorSnapshot } from './StepEditor';
import { ApiKeyEntry, AutoSaveConfig, DecodeConfig, Favorite, InstanceType, NodeInfo, PendingFilesMap, RecentApp, WebAppInfo } from '../types';

interface MultiTaskViewProps {
  apiKeys: ApiKeyEntry[];
  decodeConfig: DecodeConfig;
  autoSaveConfig: AutoSaveConfig;
  recentApps: RecentApp[];
  favorites: Favorite[];
}

interface RunUnit {
  cardId: string;
  unitIndex: number;
  totalUnits: number;
  webappId: string;
  nodes: NodeInfo[];
  pendingFiles: PendingFilesMap;
  batchTaskName: string;
  instanceType: InstanceType;
}

interface SessionState {
  id: string;
  runningCardIds: Set<string>;
  cancelled: boolean;
  cancelledCards: Set<string>;
  connections: Map<string, Set<() => void>>;
}

const MAX_LOG_LINES = 200;

const createEmptyRunState = (): MultiTaskCardRunState => ({
  mode: 'single',
  status: 'idle',
  totalUnits: 0,
  completedUnits: 0,
  failedUnits: 0,
  activeUnits: 0,
  progressPercent: 0,
  progressText: '等待运行',
  currentTaskId: null,
  taskIds: [],
  logs: [],
  outputs: [],
  error: null,
  failedBatchIndices: new Set<number>(),
  usage: {
    coins: 0,
    thirdParty: 0,
    taskTime: 0,
  },
});

const cloneNodes = (nodes: NodeInfo[]) => nodes.map(node => ({ ...node }));

const createCard = (partial?: Partial<MultiTaskCardData>): MultiTaskCardData => ({
  id: partial?.id || crypto.randomUUID(),
  webappId: partial?.webappId || '',
  webAppInfo: partial?.webAppInfo || null,
  nodes: partial?.nodes ? cloneNodes(partial.nodes) : [],
  isConnected: partial?.isConnected || false,
  loading: partial?.loading || false,
  loadError: partial?.loadError || null,
  instanceType: partial?.instanceType || 'default',
  run: partial?.run ? {
    ...partial.run,
    logs: [...partial.run.logs],
    outputs: [...partial.run.outputs],
    taskIds: [...partial.run.taskIds],
    failedBatchIndices: new Set(partial.run.failedBatchIndices),
    usage: { ...partial.run.usage },
  } : createEmptyRunState(),
});

const timestampLog = (message: string) => `[${new Date().toLocaleTimeString()}] ${message}`;

const mergeUsage = (left: TaskUsageStats, right?: TaskUsageStats) => ({
  coins: left.coins + (right?.coins || 0),
  thirdParty: left.thirdParty + (right?.thirdParty || 0),
  taskTime: left.taskTime + (right?.taskTime || 0),
});

const MultiTaskView: React.FC<MultiTaskViewProps> = ({
  apiKeys,
  decodeConfig,
  autoSaveConfig,
  recentApps,
  favorites,
}) => {
  const [cards, setCards] = useState<MultiTaskCardData[]>(() => [createCard()]);
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const editorRefs = useRef<Record<string, StepEditorRef | null>>({});
  const manualSnapshotsRef = useRef<Record<string, StepEditorSnapshot | undefined>>({});
  const sessionRef = useRef<SessionState | null>(null);

  const apiSlots = useMemo(
    () =>
      apiKeys
        .filter(entry => entry.apiKey.trim())
        .flatMap(entry =>
          Array.from(
            { length: Math.max(1, entry.concurrency || 1) },
            () => entry.apiKey.trim(),
          ),
        ),
    [apiKeys],
  );

  const validApiKeys = useMemo(() => apiKeys.map(entry => entry.apiKey).filter(key => key.trim()), [apiKeys]);

  const updateCard = (cardId: string, updater: (card: MultiTaskCardData) => MultiTaskCardData) => {
    setCards(prev => prev.map(card => (card.id === cardId ? updater(card) : card)));
  };

  const appendCardLog = (cardId: string, message: string) => {
    updateCard(cardId, card => ({
      ...card,
      run: {
        ...card.run,
        logs: [...card.run.logs, timestampLog(message)].slice(-MAX_LOG_LINES),
      },
    }));
  };

  const handleCreateCard = (partial?: Partial<MultiTaskCardData>) => {
    const nextCard = createCard(partial);
    setCards(prev => [...prev, nextCard]);
    setShowAppPicker(false);
    return nextCard.id;
  };

  const handleCreateCardFromPreset = async (preset: { webappId: string; nodes?: NodeInfo[]; appInfo?: WebAppInfo | null; name?: string }) => {
    const cardId = handleCreateCard({
      webappId: preset.webappId,
      webAppInfo: preset.appInfo || null,
      nodes: preset.nodes || [],
      isConnected: !!preset.nodes?.length,
    });

    if (!preset.nodes?.length && preset.webappId) {
      await handleLoadCard(cardId, preset.webappId);
    }
  };

  const handleRemoveCard = (cardId: string) => {
    if (cards.length === 1) {
      setCards([createCard()]);
      return;
    }

    delete editorRefs.current[cardId];
    delete manualSnapshotsRef.current[cardId];
    setCards(prev => prev.filter(card => card.id !== cardId));
  };

  const handleDuplicateCard = (cardId: string) => {
    const sourceCard = cards.find(card => card.id === cardId);
    if (!sourceCard) return;

    const snapshot = editorRefs.current[cardId]?.getSnapshot();
    handleCreateCard({
      webappId: sourceCard.webappId,
      webAppInfo: sourceCard.webAppInfo,
      nodes: snapshot?.nodes || sourceCard.nodes,
      isConnected: sourceCard.isConnected,
      instanceType: snapshot?.instanceType || sourceCard.instanceType,
    });
  };

  const handleWebappIdChange = (cardId: string, value: string) => {
    updateCard(cardId, card => ({
      ...card,
      webappId: value,
      loadError: null,
    }));
  };

  const handleLoadCard = async (cardId: string, forcedId?: string) => {
    const targetCard = cards.find(card => card.id === cardId);
    const rawWebappId = (forcedId ?? targetCard?.webappId ?? '').trim();
    const urlMatch = rawWebappId.match(/\/ai-detail\/(\d+)/);
    const normalizedWebappId = urlMatch ? urlMatch[1] : rawWebappId;
    const primaryApiKey = validApiKeys[0] || '';

    if (!primaryApiKey || !normalizedWebappId) {
      updateCard(cardId, card => ({
        ...card,
        loading: false,
        loadError: '请先配置 API Key 并填写 WebApp ID',
      }));
      return;
    }

    updateCard(cardId, card => ({
      ...card,
      loading: true,
      loadError: null,
      webappId: normalizedWebappId,
    }));

    try {
      const result = await getNodeList(primaryApiKey, normalizedWebappId);
      updateCard(cardId, card => ({
        ...card,
        webappId: normalizedWebappId,
        webAppInfo: result.appInfo,
        nodes: result.nodes,
        isConnected: true,
        loading: false,
        loadError: null,
        run: createEmptyRunState(),
      }));
    } catch (error: any) {
      updateCard(cardId, card => ({
        ...card,
        loading: false,
        loadError: error.message || '加载应用失败',
      }));
    }
  };

  const isCardCancelled = (session: SessionState, cardId: string) => session.cancelled || session.cancelledCards.has(cardId);

  const registerCardConnection = (session: SessionState, cardId: string, connection: { close: () => void } | null) => {
    if (!connection) return () => {};

    let closers = session.connections.get(cardId);
    if (!closers) {
      closers = new Set();
      session.connections.set(cardId, closers);
    }

    const closer = () => connection.close();
    closers.add(closer);

    return () => {
      closer();
      closers?.delete(closer);
    };
  };

  const stopTrackingCard = (cardId: string) => {
    const session = sessionRef.current;
    if (!session) return;

    session.cancelledCards.add(cardId);
    session.connections.get(cardId)?.forEach(close => close());

    updateCard(cardId, card => ({
      ...card,
      run: {
        ...card.run,
        status: 'cancelled',
        progressText: '已停止追踪，服务端已提交的任务可能仍在运行',
        activeUnits: 0,
      },
    }));
  };

  const stopAllTracking = () => {
    const session = sessionRef.current;
    if (!session) return;

    session.cancelled = true;
    session.connections.forEach(closers => closers.forEach(close => close()));
    setSessionNotice('已停止当前调度的追踪，服务端已提交的任务可能仍在运行。');

    setCards(prev =>
      prev.map(card =>
        session.runningCardIds.has(card.id)
          ? {
              ...card,
              run: {
                ...card.run,
                status: 'cancelled',
                progressText: '已停止追踪，服务端已提交的任务可能仍在运行',
                activeUnits: 0,
              },
            }
          : card,
      ),
    );
  };

  const buildUnitsFromSnapshot = (card: MultiTaskCardData, snapshot: StepEditorSnapshot): RunUnit[] => {
    const batchList = snapshot.batchList.length > 0 ? snapshot.batchList.map(cloneNodes) : [];
    const nodes = cloneNodes(snapshot.nodes);
    const totalUnits = batchList.length > 0 ? batchList.length : 1;
    const taskGroups = batchList.length > 0 ? batchList : [nodes];

    return taskGroups.map((group, index) => ({
      cardId: card.id,
      unitIndex: index,
      totalUnits,
      webappId: card.webappId,
      nodes: cloneNodes(group),
      pendingFiles: { ...snapshot.pendingFiles },
      batchTaskName: snapshot.batchTaskName,
      instanceType: snapshot.instanceType,
    }));
  };

  const collectRunnableCards = (cardIds?: string[]) => {
    const targetIds = new Set(cardIds ?? cards.map(card => card.id));
    const runnable: { card: MultiTaskCardData; snapshot: StepEditorSnapshot }[] = [];

    cards.forEach(card => {
      if (!targetIds.has(card.id)) return;

      const snapshot = manualSnapshotsRef.current[card.id] || editorRefs.current[card.id]?.getSnapshot();
      if (!snapshot) return;
      if (!card.isConnected || !card.webappId.trim() || snapshot.nodes.length === 0) return;
      if (snapshot.hasUploadingFiles) {
        appendCardLog(card.id, '仍有文件上传中，已跳过本次调度');
        return;
      }

      runnable.push({ card, snapshot });
    });

    return runnable;
  };

  const startScheduler = async (targetCardIds?: string[]) => {
    if (sessionRef.current) {
      setSessionNotice('已有调度正在运行，请等待当前调度结束后再启动新的任务。');
      return;
    }

    if (apiSlots.length === 0) {
      setSessionNotice('当前没有可用的 API Key，无法启动多任务调度。');
      return;
    }

    const runnableCards = collectRunnableCards(targetCardIds);
    if (runnableCards.length === 0) {
      setSessionNotice('没有可运行的卡片，请先加载应用并确认参数。');
      return;
    }

    const units = runnableCards.flatMap(({ card, snapshot }) => buildUnitsFromSnapshot(card, snapshot));
    if (units.length === 0) {
      setSessionNotice('当前卡片没有可执行的任务单元。');
      return;
    }

    runnableCards.forEach(({ card }) => {
      delete manualSnapshotsRef.current[card.id];
    });

    const session: SessionState = {
      id: crypto.randomUUID(),
      runningCardIds: new Set(runnableCards.map(item => item.card.id)),
      cancelled: false,
      cancelledCards: new Set(),
      connections: new Map(),
    };

    sessionRef.current = session;
    setSessionActive(true);
    setSessionNotice(null);

    const cardRunConfig = new Map(
      runnableCards.map(({ card, snapshot }) => [
        card.id,
        {
          snapshot,
          totalUnits: snapshot.batchList.length > 0 ? snapshot.batchList.length : 1,
        },
      ]),
    );

    setCards(prev =>
      prev.map(card => {
        const config = cardRunConfig.get(card.id);
        if (!config) return card;

        return {
          ...card,
          nodes: cloneNodes(config.snapshot.nodes),
          instanceType: config.snapshot.instanceType,
          run: {
            ...createEmptyRunState(),
            mode: config.totalUnits > 1 ? 'batch' : 'single',
            status: 'queued',
            totalUnits: config.totalUnits,
            progressText: config.totalUnits > 1 ? '等待批量调度' : '等待调度',
            logs: [timestampLog(`已加入调度队列，并发槽位 ${apiSlots.length}`)],
          },
        };
      }),
    );

    let nextUnitIndex = 0;
    const getNextUnit = () => {
      if (nextUnitIndex >= units.length) return null;
      const current = units[nextUnitIndex];
      nextUnitIndex += 1;
      return current;
    };

    const worker = async (apiKey: string, workerIndex: number) => {
      while (true) {
        if (session.cancelled) return;

        const unit = getNextUnit();
        if (!unit) return;

        if (isCardCancelled(session, unit.cardId)) {
          continue;
        }

        updateCard(unit.cardId, card => ({
          ...card,
          run: {
            ...card.run,
            status: 'running',
            activeUnits: card.run.activeUnits + 1,
            progressText: unit.totalUnits > 1 ? `批量任务 ${unit.unitIndex + 1}/${unit.totalUnits} 执行中` : '任务执行中',
          },
        }));

        appendCardLog(unit.cardId, `调度到并发槽位 ${workerIndex + 1}`);

        try {
          const result = await executeWorkflowTask({
            apiKey,
            webappId: unit.webappId,
            taskNodes: unit.nodes,
            pendingFiles: unit.pendingFiles,
            taskIndex: unit.unitIndex,
            instanceType: unit.instanceType,
            decodeConfig,
            autoSaveEnabled: autoSaveConfig.enabled,
            batchTaskName: unit.batchTaskName,
            taskLabel: unit.totalUnits > 1 ? `任务 ${unit.unitIndex + 1}/${unit.totalUnits}` : `卡片 ${unit.cardId.slice(0, 6)}`,
            callbacks: {
              onLog: message => appendCardLog(unit.cardId, message),
              onProgress: snapshot => {
                updateCard(unit.cardId, card => ({
                  ...card,
                  run: {
                    ...card.run,
                    status: 'running',
                    progressPercent: Math.round(snapshot.overallPercent),
                    progressText: snapshot.currentNodeName
                      ? `当前节点: ${snapshot.currentNodeName}`
                      : card.run.progressText,
                  },
                }));
              },
              onStatusChange: status => {
                updateCard(unit.cardId, card => ({
                  ...card,
                  run: {
                    ...card.run,
                    status: status === 'RUNNING' ? 'running' : 'queued',
                    progressText:
                      status === 'SUBMITTING'
                        ? '正在提交任务'
                        : status === 'RUNNING'
                          ? '任务运行中'
                          : '任务排队中',
                  },
                }));
              },
            },
            control: {
              isCancelled: () => isCardCancelled(session, unit.cardId),
              registerConnection: connection => registerCardConnection(session, unit.cardId, connection),
              pollOffsetMs: workerIndex * 250,
            },
          });

          updateCard(unit.cardId, card => {
            const completedUnits = card.run.completedUnits + 1;
            const activeUnits = Math.max(0, card.run.activeUnits - 1);
            const totalProcessed = completedUnits + card.run.failedUnits;
            const isFinished = totalProcessed >= card.run.totalUnits;

            return {
              ...card,
              run: {
                ...card.run,
                status: isFinished ? (card.run.failedUnits > 0 ? 'failed' : 'success') : 'running',
                completedUnits,
                activeUnits,
                currentTaskId: result.taskId,
                taskIds: [...card.run.taskIds, result.taskId],
                outputs: [...card.run.outputs, ...result.outputs],
                usage: mergeUsage(card.run.usage, result.usage),
                progressPercent: isFinished ? 100 : card.run.progressPercent,
                progressText: isFinished
                  ? (card.run.failedUnits > 0 ? '部分任务失败' : '全部任务完成')
                  : `已完成 ${completedUnits}/${card.run.totalUnits}`,
              },
            };
          });
        } catch (error: any) {
          if (error instanceof TaskCancelledError) {
            updateCard(unit.cardId, card => ({
              ...card,
              run: {
                ...card.run,
                status: 'cancelled',
                activeUnits: Math.max(0, card.run.activeUnits - 1),
                progressText: '已停止追踪，服务端已提交的任务可能仍在运行',
              },
            }));
            continue;
          }

          updateCard(unit.cardId, card => {
            const failedUnits = card.run.failedUnits + 1;
            const activeUnits = Math.max(0, card.run.activeUnits - 1);
            const totalProcessed = failedUnits + card.run.completedUnits;
            const isFinished = totalProcessed >= card.run.totalUnits;
            const failedBatchIndices = new Set(card.run.failedBatchIndices);
            failedBatchIndices.add(unit.unitIndex);

            return {
              ...card,
              run: {
                ...card.run,
                status: isFinished ? 'failed' : 'running',
                failedUnits,
                activeUnits,
                error: error.message || '任务执行失败',
                failedBatchIndices,
                progressText: isFinished ? '任务执行结束，存在失败项' : `存在失败项，已完成 ${totalProcessed}/${card.run.totalUnits}`,
              },
            };
          });

          appendCardLog(unit.cardId, `失败: ${error.message || error}`);
        }
      }
    };

    try {
      await Promise.all(apiSlots.map((apiKey, index) => worker(apiKey, index)));
    } finally {
      session.connections.forEach(closers => closers.forEach(close => close()));
      sessionRef.current = null;
      setSessionActive(false);
    }
  };

  const handleRunCard = async (
    cardId: string,
    updatedNodes: NodeInfo[],
    batchList?: NodeInfo[][],
    pendingFiles?: PendingFilesMap,
    _nextDecodeConfig?: DecodeConfig,
    batchTaskName?: string,
    instanceType?: InstanceType,
  ) => {
    if (sessionRef.current) {
      setSessionNotice('当前已有调度在运行，请等待结束后再启动新的卡片任务。');
      return;
    }

    const targetCard = cards.find(card => card.id === cardId);
    const nextInstanceType = instanceType || targetCard?.instanceType || 'default';

    updateCard(cardId, card => ({
      ...card,
      nodes: cloneNodes(updatedNodes),
      instanceType: nextInstanceType,
    }));

    const snapshot: StepEditorSnapshot = {
      nodes: cloneNodes(updatedNodes),
      batchList: batchList ? batchList.map(cloneNodes) : [],
      pendingFiles: { ...(pendingFiles || {}) },
      batchTaskName: batchTaskName || '',
      instanceType: nextInstanceType,
      hasUploadingFiles: false,
      isConnected: true,
    };

    manualSnapshotsRef.current[cardId] = snapshot;

    await startScheduler([cardId]);
  };

  const handleRunAll = async () => {
    await startScheduler();
  };

  const pageLockedCardIds = sessionRef.current?.runningCardIds || new Set<string>();

  return (
    <div className="flex h-full w-full flex-col bg-slate-50 dark:bg-[#0F1115]">
      <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-[#161920]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-brand-500" />
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">多任务模式</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              每张卡片都是一个完整任务工作区，统一按 API 并发能力调度执行。当前并发槽位 {apiSlots.length}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAppPicker(prev => !prev)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-500 dark:border-slate-700 dark:bg-[#1a1d24] dark:text-slate-300"
            >
              <Plus className="h-4 w-4" />
              新建卡片
            </button>

            {sessionActive ? (
              <button
                onClick={stopAllTracking}
                className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600"
              >
                <Square className="h-4 w-4" />
                停止追踪
              </button>
            ) : (
              <button
                onClick={handleRunAll}
                disabled={cards.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play className="h-4 w-4" />
                全部运行
              </button>
            )}
          </div>
        </div>

        {showAppPicker && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-[#0F1115]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">快速创建卡片</h3>
              <button
                onClick={() => setShowAppPicker(false)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">空白卡片</div>
                <button
                  onClick={() => handleCreateCard()}
                  className="w-full rounded-xl border border-dashed border-brand-300 bg-white px-4 py-3 text-sm font-medium text-brand-600 transition hover:bg-brand-50 dark:border-brand-800 dark:bg-[#161920] dark:text-brand-300"
                >
                  创建空白卡片
                </button>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">收藏应用</div>
                <div className="max-h-44 space-y-2 overflow-y-auto">
                  {favorites.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-400 dark:border-slate-800 dark:bg-[#161920]">
                      暂无收藏
                    </div>
                  ) : (
                    favorites.map(item => (
                      <button
                        key={`fav-${item.webappId}`}
                        onClick={() => handleCreateCardFromPreset({ webappId: item.webappId, nodes: item.nodes, appInfo: item.appInfo, name: item.name })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:text-brand-500 dark:border-slate-800 dark:bg-[#161920] dark:text-slate-200"
                      >
                        {item.appInfo?.webappName || item.name || item.webappId}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">最近使用</div>
                <div className="max-h-44 space-y-2 overflow-y-auto">
                  {recentApps.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-400 dark:border-slate-800 dark:bg-[#161920]">
                      暂无记录
                    </div>
                  ) : (
                    recentApps.map(item => (
                      <button
                        key={`recent-${item.id}`}
                        onClick={() => handleCreateCardFromPreset({ webappId: item.id, name: item.name })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:text-brand-500 dark:border-slate-800 dark:bg-[#161920] dark:text-slate-200"
                      >
                        {item.name || item.id}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {sessionNotice && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
            {sessionNotice}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {cards.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center dark:border-slate-700 dark:bg-[#161920]">
              <Layers className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-4 text-base font-medium text-slate-600 dark:text-slate-300">还没有任务卡片</p>
              <p className="mt-2 text-sm text-slate-400">先创建一个卡片，多任务调度会根据 API 并发能力自动并行。</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 2xl:grid-cols-3">
            {cards.map(card => (
              <MultiTaskCard
                key={card.id}
                card={card}
                apiKeys={validApiKeys}
                decodeConfig={decodeConfig}
                editorRef={ref => {
                  editorRefs.current[card.id] = ref;
                }}
                isLocked={sessionActive && !pageLockedCardIds.has(card.id)}
                onWebappIdChange={handleWebappIdChange}
                onLoad={handleLoadCard}
                onRemove={handleRemoveCard}
                onDuplicate={handleDuplicateCard}
                onRun={handleRunCard}
                onCancel={stopTrackingCard}
                onInstanceTypeChange={(cardId, nextType) => {
                  updateCard(cardId, current => ({
                    ...current,
                    instanceType: nextType,
                  }));
                }}
              />
            ))}
          </div>
        )}
      </div>

      {sessionActive && (
        <div className="border-t border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-[#161920]">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
            调度进行中，按并发槽位 {apiSlots.length} 自动分配卡片任务与轮询。
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiTaskView;
