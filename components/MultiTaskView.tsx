import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Loader2, Play, Plus, Save, Square, Trash2, X } from 'lucide-react';
import { getNodeList, isCapacityLimitedError } from '../services/api';
import { createApiCapacityManagers } from '../services/apiCapacity';
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

interface MultiTaskDraftCard {
  webappId: string;
  webAppInfo: WebAppInfo | null;
  nodes: NodeInfo[];
  isConnected: boolean;
  instanceType: InstanceType;
  initialBatchList: NodeInfo[][];
  initialBatchTaskName: string;
}

interface MultiTaskDraft {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  cards: MultiTaskDraftCard[];
}

const MAX_LOG_LINES = 200;
const MULTITASK_DRAFTS_STORAGE_KEY = 'rh_multitask_drafts_v1';
const DRAFT_NAME_PLACEHOLDER = '请输入草稿名称，例如：批量头像生成';

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
const cloneNodeRows = (rows?: NodeInfo[][]) => (rows || []).map(row => cloneNodes(row));

const normalizeDraftCard = (card?: Partial<MultiTaskDraftCard> | null): MultiTaskDraftCard => ({
  webappId: card?.webappId || '',
  webAppInfo: card?.webAppInfo || null,
  nodes: Array.isArray(card?.nodes) ? cloneNodes(card!.nodes as NodeInfo[]) : [],
  isConnected: !!card?.isConnected,
  instanceType: card?.instanceType || 'default',
  initialBatchList: Array.isArray(card?.initialBatchList) ? cloneNodeRows(card!.initialBatchList as NodeInfo[][]) : [],
  initialBatchTaskName: card?.initialBatchTaskName || '',
});

const normalizeDraft = (draft?: Partial<MultiTaskDraft> | null): MultiTaskDraft | null => {
  if (!draft?.id || !draft?.name) {
    return null;
  }

  return {
    id: draft.id,
    name: draft.name,
    createdAt: Number(draft.createdAt) || Date.now(),
    updatedAt: Number(draft.updatedAt) || Date.now(),
    cards: Array.isArray(draft.cards) ? draft.cards.map(card => normalizeDraftCard(card)) : [],
  };
};

const createCard = (partial?: Partial<MultiTaskCardData>): MultiTaskCardData => ({
  id: partial?.id || crypto.randomUUID(),
  webappId: partial?.webappId || '',
  webAppInfo: partial?.webAppInfo || null,
  nodes: partial?.nodes ? cloneNodes(partial.nodes) : [],
  isConnected: partial?.isConnected || false,
  loading: partial?.loading || false,
  loadError: partial?.loadError || null,
  instanceType: partial?.instanceType || 'default',
  initialBatchList: partial?.initialBatchList ? cloneNodeRows(partial.initialBatchList) : [],
  initialBatchTaskName: partial?.initialBatchTaskName || '',
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
  const [drafts, setDrafts] = useState<MultiTaskDraft[]>(() => {
    try {
      const raw = localStorage.getItem(MULTITASK_DRAFTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed
            .map(item => normalizeDraft(item))
            .filter((item): item is MultiTaskDraft => !!item)
            .sort((left, right) => right.updatedAt - left.updatedAt)
        : [];
    } catch {
      return [];
    }
  });
  const [isSaveDraftModalOpen, setIsSaveDraftModalOpen] = useState(false);
  const [draftNameInput, setDraftNameInput] = useState('');
  const [draftModalError, setDraftModalError] = useState<string | null>(null);
  const [confirmOverwriteDraftId, setConfirmOverwriteDraftId] = useState<string | null>(null);
  const [draftPendingDelete, setDraftPendingDelete] = useState<MultiTaskDraft | null>(null);

  const editorRefs = useRef<Record<string, StepEditorRef | null>>({});
  const manualSnapshotsRef = useRef<Record<string, StepEditorSnapshot | undefined>>({});
  const sessionRef = useRef<SessionState | null>(null);

  useEffect(() => {
    localStorage.setItem(MULTITASK_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  }, [drafts]);

  useEffect(() => {
    if (!sessionNotice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSessionNotice(current => (current === sessionNotice ? null : current));
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [sessionNotice]);

  const apiConfigs = useMemo(
    () =>
      apiKeys
        .filter(entry => entry.apiKey.trim())
        .map(entry => ({
          apiKey: entry.apiKey.trim(),
          concurrency: Math.max(1, entry.concurrency || 1),
        })),
    [apiKeys],
  );

  const totalConfiguredSlots = useMemo(
    () => apiConfigs.reduce((sum, config) => sum + config.concurrency, 0),
    [apiConfigs],
  );

  const apiSlots = useMemo(
    () =>
      apiConfigs.flatMap(config =>
        Array.from({ length: config.concurrency }, () => config.apiKey),
      ),
    [apiConfigs],
  );

  const validApiKeys = useMemo(() => apiKeys.map(entry => entry.apiKey).filter(key => key.trim()), [apiKeys]);

  const isPlaceholderCard = (card: MultiTaskCardData) =>
    !card.webappId.trim()
    && !card.isConnected
    && card.nodes.length === 0
    && card.run.status === 'idle'
    && card.run.logs.length === 0
    && card.run.outputs.length === 0;

  const buildSnapshotForCard = (card: MultiTaskCardData): StepEditorSnapshot => {
    const snapshot = manualSnapshotsRef.current[card.id] || editorRefs.current[card.id]?.getSnapshot();
    if (snapshot) {
      return {
        ...snapshot,
        nodes: cloneNodes(snapshot.nodes),
        batchList: cloneNodeRows(snapshot.batchList),
        pendingFiles: { ...snapshot.pendingFiles },
      };
    }

    return {
      nodes: cloneNodes(card.nodes),
      batchList: cloneNodeRows(card.initialBatchList),
      pendingFiles: {},
      batchTaskName: card.initialBatchTaskName || '',
      instanceType: card.instanceType,
      hasUploadingFiles: false,
      isConnected: card.isConnected,
    };
  };

  const createDraftCardFromCard = (card: MultiTaskCardData): MultiTaskDraftCard => {
    const snapshot = buildSnapshotForCard(card);
    return {
      webappId: card.webappId,
      webAppInfo: card.webAppInfo,
      nodes: cloneNodes(snapshot.nodes),
      isConnected: card.isConnected,
      instanceType: snapshot.instanceType,
      initialBatchList: cloneNodeRows(snapshot.batchList),
      initialBatchTaskName: snapshot.batchTaskName,
    };
  };

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

  const openSaveDraftModal = () => {
    const draftSourceCards = cards.filter(card => !isPlaceholderCard(card) || card.webappId.trim() || card.nodes.length > 0);

    if (draftSourceCards.length === 0) {
      setSessionNotice('\u5f53\u524d\u6ca1\u6709\u53ef\u4fdd\u5b58\u7684\u5361\u7247\u8349\u7a3f\u3002');
      return;
    }

    setDraftNameInput('');
    setDraftModalError(null);
    setConfirmOverwriteDraftId(null);
    setIsSaveDraftModalOpen(true);
  };

  const handleSaveDraft = () => {
    const draftSourceCards = cards.filter(card => !isPlaceholderCard(card) || card.webappId.trim() || card.nodes.length > 0);
    const normalizedName = draftNameInput.trim();
    if (!normalizedName) {
      setDraftModalError('\u8bf7\u8f93\u5165\u8349\u7a3f\u540d\u79f0');
      return;
    }

    const existingDraft = drafts.find(item => item.name === normalizedName);
    if (existingDraft && confirmOverwriteDraftId !== existingDraft.id) {
      setConfirmOverwriteDraftId(existingDraft.id);
      setDraftModalError(`\u8349\u7a3f\u300c${normalizedName}\u300d\u5df2\u5b58\u5728\uff0c\u518d\u70b9\u4e00\u6b21\u5c06\u8986\u76d6\u3002`);
      return;
    }

    const nextDraft: MultiTaskDraft = {
      id: existingDraft?.id || crypto.randomUUID(),
      name: normalizedName,
      createdAt: existingDraft?.createdAt || Date.now(),
      updatedAt: Date.now(),
      cards: draftSourceCards.map(card => createDraftCardFromCard(card)),
    };

    setDrafts(prev => [nextDraft, ...prev.filter(item => item.id !== nextDraft.id)].sort((left, right) => right.updatedAt - left.updatedAt));
    setIsSaveDraftModalOpen(false);
    setDraftNameInput('');
    setDraftModalError(null);
    setConfirmOverwriteDraftId(null);
    setSessionNotice(`\u5df2\u4fdd\u5b58\u8349\u7a3f\u300c${normalizedName}\u300d`);
  };

  const handleLoadDraft = (draft: MultiTaskDraft) => {
    if (sessionRef.current) {
      setSessionNotice('\u5f53\u524d\u6709\u4efb\u52a1\u6b63\u5728\u8c03\u5ea6\uff0c\u8bf7\u7b49\u5f85\u7ed3\u675f\u540e\u518d\u52a0\u8f7d\u8349\u7a3f\u3002');
      return;
    }

    const draftCards = draft.cards.map(item => createCard({
      webappId: item.webappId,
      webAppInfo: item.webAppInfo,
      nodes: item.nodes,
      isConnected: item.isConnected,
      instanceType: item.instanceType,
      initialBatchList: item.initialBatchList,
      initialBatchTaskName: item.initialBatchTaskName,
    }));

    if (draftCards.length === 0) {
      setSessionNotice(`\u8349\u7a3f\u300c${draft.name}\u300d\u6ca1\u6709\u53ef\u6062\u590d\u7684\u5361\u7247\u3002`);
      return;
    }

    editorRefs.current = {};
    manualSnapshotsRef.current = {};
    setCards(draftCards);
    setShowAppPicker(false);
    setSessionNotice(`\u5df2\u52a0\u8f7d\u8349\u7a3f\u300c${draft.name}\u300d`);
  };

  const openDeleteDraftModal = (draftId: string) => {
    const targetDraft = drafts.find(item => item.id === draftId);
    if (!targetDraft) {
      return;
    }

    setDraftPendingDelete(targetDraft);
  };

  const handleConfirmDeleteDraft = () => {
    const targetDraft = draftPendingDelete;
    if (!targetDraft) {
      return;
    }

    setDrafts(prev => prev.filter(item => item.id !== targetDraft.id));
    setDraftPendingDelete(null);
    setSessionNotice(`\u5df2\u5220\u9664\u8349\u7a3f\u300c${targetDraft.name}\u300d`);
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
      initialBatchList: snapshot?.batchList || sourceCard.initialBatchList,
      initialBatchTaskName: snapshot?.batchTaskName || sourceCard.initialBatchTaskName,
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
        initialBatchList: [],
        initialBatchTaskName: '',
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

    if (apiConfigs.length === 0) {
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

    const capacityManagers = createApiCapacityManagers(apiConfigs);
    const pendingUnits = [...units];
    const runningTasks = new Set<Promise<void>>();
    let hasLoggedCapacityWait = false;

    try {
      while (!session.cancelled && (pendingUnits.length > 0 || runningTasks.size > 0)) {
        let launchedCount = 0;

        for (const manager of capacityManagers) {
          if (session.cancelled || pendingUnits.length === 0) {
            break;
          }

          const snapshot = await manager.probe(launchedCount === 0);
          let availableSlots = snapshot.availableSlots;

          while (!session.cancelled && availableSlots > 0 && pendingUnits.length > 0) {
            const unit = pendingUnits.shift();
            if (!unit) {
              break;
            }

            if (isCardCancelled(session, unit.cardId)) {
              continue;
            }

            if (!manager.reserveSlot()) {
              pendingUnits.unshift(unit);
              break;
            }

            availableSlots -= 1;
            launchedCount += 1;
            hasLoggedCapacityWait = false;

            updateCard(unit.cardId, card => ({
              ...card,
              run: {
                ...card.run,
                status: 'running',
                activeUnits: card.run.activeUnits + 1,
                progressText: unit.totalUnits > 1 ? `批量任务 ${unit.unitIndex + 1}/${unit.totalUnits} 执行中` : '任务执行中',
              },
            }));

            appendCardLog(unit.cardId, `调度到 API${manager.index + 1}，当前可用槽位 ${availableSlots}`);

            let taskPromise: Promise<void>;
            taskPromise = (async () => {
              try {
                const result = await executeWorkflowTask({
                  apiKey: manager.apiKey,
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
                    pollOffsetMs: manager.index * 250,
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
                  return;
                }

                if (isCapacityLimitedError(error)) {
                  pendingUnits.unshift(unit);
                  manager.markProbeStale();
                  updateCard(unit.cardId, card => ({
                    ...card,
                    run: {
                      ...card.run,
                      status: 'queued',
                      activeUnits: Math.max(0, card.run.activeUnits - 1),
                      progressText: '等待 API 空闲槽位后自动继续',
                    },
                  }));
                  appendCardLog(unit.cardId, '当前 API 并发暂时已满，已回到队列等待自动重试');
                  return;
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
              } finally {
                manager.releaseSlot();
              }
            })().finally(() => {
              runningTasks.delete(taskPromise);
            });

            runningTasks.add(taskPromise);
          }
        }

        if (session.cancelled) {
          break;
        }

        if (launchedCount > 0) {
          continue;
        }

        if (runningTasks.size > 0) {
          await Promise.race(runningTasks);
          continue;
        }

        if (pendingUnits.length > 0) {
          if (!hasLoggedCapacityWait) {
            setSessionNotice('当前 API 并发已被网页或其他任务占用，系统会在有空位时自动继续。');
            hasLoggedCapacityWait = true;
          }

          await new Promise(resolve => setTimeout(resolve, 3000));
          capacityManagers.forEach(manager => manager.markProbeStale());
        }
      }
    } finally {
      await Promise.all(runningTasks);
      session.connections.forEach(closers => closers.forEach(close => close()));
      sessionRef.current = null;
      setSessionActive(false);
    }

    return;

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
      initialBatchList: batchList ? cloneNodeRows(batchList) : [],
      initialBatchTaskName: batchTaskName || '',
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

            <button
              onClick={openSaveDraftModal}
              disabled={cards.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-[#1a1d24] dark:text-slate-300"
            >
              <Save className="h-4 w-4" />
              {'\u4fdd\u5b58\u8349\u7a3f'}
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
                <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
                  {drafts.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-400 dark:border-slate-800 dark:bg-[#161920]">
                      {'\u6682\u65e0\u8349\u7a3f'}
                    </div>
                  ) : (
                    drafts.map(draft => (
                      <div
                        key={draft.id}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-[#161920]"
                      >
                        <button
                          onClick={() => handleLoadDraft(draft)}
                          className="min-w-0 flex-1 text-left text-sm text-slate-700 transition hover:text-brand-500 dark:text-slate-200"
                        >
                          <div className="truncate font-medium">{draft.name}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {draft.cards.length} {'\u5f20\u5361\u7247'}
                          </div>
                        </button>
                        <button
                          onClick={() => openDeleteDraftModal(draft.id)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                          title="\u5220\u9664\u8349\u7a3f"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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

      {isSaveDraftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#161920]">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">
                {'\u4fdd\u5b58\u591a\u4efb\u52a1\u8349\u7a3f'}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {'\u7ed9\u5f53\u524d\u5361\u7247\u7ec4\u5408\u8d77\u4e2a\u540d\u5b57\uff0c\u65b9\u4fbf\u540e\u7eed\u5feb\u901f\u6062\u590d\u3002'}
              </p>
            </div>

            <div className="px-5 py-4">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                {'\u8349\u7a3f\u540d\u79f0'}
              </label>
              <input
                autoFocus
                value={draftNameInput}
                onChange={event => {
                  setDraftNameInput(event.target.value);
                  setDraftModalError(null);
                  setConfirmOverwriteDraftId(null);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    handleSaveDraft();
                  }
                }}
                placeholder={DRAFT_NAME_PLACEHOLDER}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-200"
              />

              {draftModalError && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                  {draftModalError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <button
                onClick={() => {
                  setIsSaveDraftModalOpen(false);
                  setDraftNameInput('');
                  setDraftModalError(null);
                  setConfirmOverwriteDraftId(null);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white"
              >
                {'\u53d6\u6d88'}
              </button>
              <button
                onClick={handleSaveDraft}
                className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
              >
                {confirmOverwriteDraftId ? '\u8986\u76d6\u4fdd\u5b58' : '\u4fdd\u5b58\u8349\u7a3f'}
              </button>
            </div>
          </div>
        </div>
      )}

      {draftPendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          onClick={() => setDraftPendingDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#161920]"
            onClick={event => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">
                确认删除草稿
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                草稿“{draftPendingDelete.name}”删除后将无法恢复，确定要继续吗？
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <button
                onClick={() => setDraftPendingDelete(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDeleteDraft}
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600"
              >
                删除草稿
              </button>
            </div>
          </div>
        </div>
      )}

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
