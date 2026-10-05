import { useEffect, useMemo, useRef, useState } from 'react';
import { getNodeList } from '../../services/api';
import { normalizeApiConfigs } from '../../services/apiCapacity';
import type { MultiTaskCardData } from './cardTypes';
import type { StepEditorRef, StepEditorSnapshot } from '../StepEditor';
import type { ApiKeyEntry, NodeInfo, WebAppInfo } from '../../types';
import { parseRunningHubAppInput } from '../../services/runningHubRegion';
import { MultiTaskDraft, MultiTaskDraftCard, SessionState, DRAFT_NAME_PLACEHOLDER, MULTITASK_DRAFTS_STORAGE_KEY, MAX_LOG_LINES, normalizeDraft, createCard, cloneNodes, cloneNodeRows, timestampLog, createEmptyRunState } from './workspaceModel';

export function useMultiTaskWorkspace(apiKeys: ApiKeyEntry[]) {
  const [cards, setCards] = useState<MultiTaskCardData[]>(() => [createCard()]);
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const draftReadFailed = useRef(false);
  const [drafts, setDrafts] = useState<MultiTaskDraft[]>(() => {
    try {
      const raw = localStorage.getItem(MULTITASK_DRAFTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new Error('Invalid draft storage');
      return Array.isArray(parsed)
        ? parsed
            .map(item => normalizeDraft(item))
            .filter((item): item is MultiTaskDraft => !!item)
            .sort((left, right) => right.updatedAt - left.updatedAt)
        : [];
    } catch {
      draftReadFailed.current = true;
      return [];
    }
  });
  const [isSaveDraftModalOpen, setIsSaveDraftModalOpen] = useState(false);
  const [draftNameInput, setDraftNameInput] = useState('');
  const [draftModalError, setDraftModalError] = useState<string | null>(null);
  const [confirmOverwriteDraftId, setConfirmOverwriteDraftId] = useState<string | null>(null);
  const [draftPendingDelete, setDraftPendingDelete] = useState<MultiTaskDraft | null>(null);

  const loadTokens = useRef(new Map<string, symbol>());
  const mounted = useRef(true);
  const editorRefs = useRef<Record<string, StepEditorRef | null>>({});
  const manualSnapshotsRef = useRef<Record<string, StepEditorSnapshot | undefined>>({});
  const sessionRef = useRef<SessionState | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      // Preserve tokens across StrictMode's setup/cleanup replay; ignore actual unmount results.
      mounted.current = false;
      const session = sessionRef.current;
      if (!session) return;
      session.cancelled = true;
      session.wake?.();
      session.connections.forEach(closers => closers.forEach(close => close()));
    };
  }, []);

  const persistedDrafts = useRef(drafts);
  useEffect(() => {
    // Reading/normalizing legacy drafts must not rewrite the migration source.
    if (draftReadFailed.current || persistedDrafts.current === drafts) return;
    try {
      localStorage.setItem(MULTITASK_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
      persistedDrafts.current = drafts;
    } catch { setSessionNotice('草稿未能保存，请检查存储空间后重试。'); }
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
      normalizeApiConfigs(apiKeys.map(entry => ({
        apiKey: entry.apiKey,
        concurrency: entry.concurrency || 1,
      }))),
    [apiKeys],
  );

  const totalConfiguredSlots = useMemo(
    () => apiConfigs.reduce((sum, config) => sum + config.concurrency, 0),
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
    const snapshot = editorRefs.current[card.id]?.getSnapshot() || manualSnapshotsRef.current[card.id];
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
      organization: card.organization,
      webappId: card.webappId,
      webAppInfo: card.webAppInfo,
      nodes: cloneNodes(snapshot.nodes),
      isConnected: card.isConnected,
      instanceType: snapshot.instanceType,
      runOptions: { retainSeconds: card.runOptions?.retainSeconds },
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
    if (draftReadFailed.current) {
      setDraftModalError('原草稿读取失败，已保留原数据。请恢复存储后重新打开页面。');
      return;
    }
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
      organization: item.organization,
      webappId: item.webappId,
      webAppInfo: item.webAppInfo,
      nodes: item.nodes,
      isConnected: item.isConnected,
      instanceType: item.instanceType,
      runOptions: { ...item.runOptions },
      initialBatchList: item.initialBatchList,
      initialBatchTaskName: item.initialBatchTaskName,
    }));

    if (draftCards.length === 0) {
      setSessionNotice(`\u8349\u7a3f\u300c${draft.name}\u300d\u6ca1\u6709\u53ef\u6062\u590d\u7684\u5361\u7247\u3002`);
      return;
    }

    loadTokens.current.clear();
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
    setCards(prev => prev.some(card => card.id === nextCard.id) ? prev : [...prev, nextCard]);
    setShowAppPicker(false);
    return nextCard.id;
  };

  const handleCreateCardFromPreset = (preset: { id?: string; webappId: string; nodes?: NodeInfo[]; appInfo?: WebAppInfo | null; name?: string }) => {
    const cardId = handleCreateCard({
      id: preset.id,
      webappId: preset.webappId,
      webAppInfo: preset.appInfo || null,
      nodes: preset.nodes || [],
      isConnected: !!preset.nodes?.length,
    });

    if (!preset.nodes?.length && preset.webappId) {
      void handleLoadCard(cardId, preset.webappId);
    }
    return cardId;
  };

  const handleRemoveCard = (cardId: string) => {
    if (sessionRef.current?.runningCardIds.has(cardId)) return;
    loadTokens.current.delete(cardId);
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
      organization: sourceCard.organization,
      savedCardId: sourceCard.savedCardId,
      webappId: sourceCard.webappId,
      webAppInfo: sourceCard.webAppInfo,
      nodes: snapshot?.nodes || sourceCard.nodes,
      isConnected: sourceCard.isConnected,
      instanceType: snapshot?.instanceType || sourceCard.instanceType,
      runOptions: { ...sourceCard.runOptions },
      initialBatchList: snapshot?.batchList || sourceCard.initialBatchList,
      initialBatchTaskName: snapshot?.batchTaskName || sourceCard.initialBatchTaskName,
    });
  };

  const handleWebappIdChange = (cardId: string, value: string) => {
    loadTokens.current.delete(cardId);
    updateCard(cardId, card => ({
      ...card,
      webappId: value,
      loading: false,
      isConnected: false,
      nodes: [],
      webAppInfo: null,
      initialBatchList: [],
      initialBatchTaskName: '',
      loadError: null,
    }));
  };

  const handleLoadCard = async (cardId: string, forcedId?: string) => {
    if (sessionRef.current?.runningCardIds.has(cardId)) return;
    const targetCard = cards.find(card => card.id === cardId);
    const rawWebappId = (forcedId ?? targetCard?.webappId ?? '').trim();
    const normalizedWebappId = parseRunningHubAppInput(rawWebappId).appId;
    const primaryApiKey = validApiKeys[0] || '';
    const token = Symbol('card-load');
    loadTokens.current.set(cardId, token);
    const isCurrent = () => mounted.current && loadTokens.current.get(cardId) === token;

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
      const result = await getNodeList(primaryApiKey, rawWebappId);
      if (!isCurrent()) return;
      updateCard(cardId, card => !isCurrent() ? card : ({
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
      if (!isCurrent()) return;
      updateCard(cardId, card => !isCurrent() ? card : ({
        ...card,
        loading: false,
        loadError: error.message || '加载应用失败',
      }));
    }
  };

  return { cards, setCards, showAppPicker, setShowAppPicker, sessionActive, setSessionActive, sessionNotice, setSessionNotice, drafts, setDrafts, isSaveDraftModalOpen, setIsSaveDraftModalOpen, draftNameInput, setDraftNameInput, draftModalError, setDraftModalError, confirmOverwriteDraftId, setConfirmOverwriteDraftId, draftPendingDelete, setDraftPendingDelete, editorRefs, manualSnapshotsRef, sessionRef, apiConfigs, totalConfiguredSlots, validApiKeys, isPlaceholderCard, buildSnapshotForCard, createDraftCardFromCard, updateCard, appendCardLog, openSaveDraftModal, handleSaveDraft, handleLoadDraft, openDeleteDraftModal, handleConfirmDeleteDraft, handleCreateCard, handleCreateCardFromPreset, handleRemoveCard, handleDuplicateCard, handleWebappIdChange, handleLoadCard };
}
