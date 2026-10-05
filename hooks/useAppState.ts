import React, { useEffect, useRef, useState } from 'react';
import type { StepRunningRef } from '../components/StepRunning';
import { NodeInfo, TaskOutput, WebAppInfo, ApiKeyEntry, AutoSaveConfig, Favorite, HistoryItem, RecentApp, FailedTaskInfo, InstanceType, HomeDefaultTab, StandardModelConfig } from '../types';
import { saveMultipleFiles, getDirectoryName, initAutoSave, checkDirectoryAccess, getCurrentDirectoryPath } from '../services/autoSaveService';
import { useLanguage } from '../services/i18n';
import { useTaskCardRequests } from './useTaskCardRequests';
import { STORAGE_KEY_API_KEYS, STORAGE_KEY_ENTERPRISE_API, STORAGE_KEY_AUTOSAVE, STORAGE_KEY_FAVORITES, STORAGE_KEY_RECENT, STORAGE_KEY_STARTUP_VIEW, STORAGE_KEY_HOME_DEFAULT_TAB, AppView, StartupView, normalizeAutoSaveConfig, createEmptyApiKeyEntry, normalizeApiKeyEntry, normalizeApiKeys, normalizeStartupView, normalizeHomeDefaultTab } from './appSettings';

export function useAppState() {
  const { language, toggleLanguage, text } = useLanguage();
  // Global View State
  const [startupView, setStartupView] = useState<StartupView>(() => {
    try {
      return normalizeStartupView(localStorage.getItem(STORAGE_KEY_STARTUP_VIEW));
    } catch {
      return 'home';
    }
  });
  const [homeDefaultTab, setHomeDefaultTab] = useState<HomeDefaultTab>(() => {
    try {
      return normalizeHomeDefaultTab(localStorage.getItem(STORAGE_KEY_HOME_DEFAULT_TAB));
    } catch {
      return 'support';
    }
  });
  const [currentView, setCurrentView] = useState<AppView>(() => {
    try {
      return normalizeStartupView(localStorage.getItem(STORAGE_KEY_STARTUP_VIEW));
    } catch {
      return 'home';
    }
  });
  const [homeViewResetToken, setHomeViewResetToken] = useState(0);
  const cardRequests = useTaskCardRequests();

  // State
  const [webappId, setWebappId] = useState('');
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_API_KEYS);
      const parsed = saved ? JSON.parse(saved) : [];
      return normalizeApiKeys(parsed);
    } catch { return [createEmptyApiKeyEntry()]; }
  });
  const [enterpriseApi, setEnterpriseApi] = useState<ApiKeyEntry>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ENTERPRISE_API);
      return normalizeApiKeyEntry(saved ? JSON.parse(saved) : null);
    } catch {
      return createEmptyApiKeyEntry();
    }
  });

  const [isConnected, setIsConnected] = useState(false);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [webAppInfo, setWebAppInfo] = useState<WebAppInfo | null>(null);
  const [standardModelConfig, setStandardModelConfig] = useState<StandardModelConfig>({
    endpoint: '',
    modelName: null,
    category: null,
    outputType: null,
  });

  useEffect(() => {
    const normalizedKeys = normalizeApiKeys(apiKeys);
    const needsNormalization = apiKeys.length !== normalizedKeys.length
      || apiKeys.some((entry, index) => {
        const normalizedEntry = normalizedKeys[index];
        return !normalizedEntry
          || entry.id !== normalizedEntry.id
          || entry.apiKey !== normalizedEntry.apiKey
          || (entry.concurrency || 1) !== normalizedEntry.concurrency
          || (entry.accountInfo ?? null) !== (normalizedEntry.accountInfo ?? null)
          || (entry.apiInfo ?? null) !== (normalizedEntry.apiInfo ?? null)
          || entry.loading !== normalizedEntry.loading
          || entry.error !== normalizedEntry.error;
      });

    if (!needsNormalization) {
      return;
    }

    setApiKeys(normalizedKeys);

    if (localStorage.getItem(STORAGE_KEY_API_KEYS)) {
      localStorage.setItem(STORAGE_KEY_API_KEYS, JSON.stringify(normalizedKeys));
    }
  }, []);

  const [runType, setRunType] = useState<'none' | 'single' | 'batch' | 'result'>('none');
  const [instanceType, setInstanceType] = useState<InstanceType>('default');
  const [activeBatchList, setActiveBatchList] = useState<NodeInfo[][] | undefined>(undefined);
  const [activePendingFiles, setActivePendingFiles] = useState<any>(undefined);
  const [batchResult, setBatchResult] = useState<{ logs: string[]; failedTasks: FailedTaskInfo[] } | null>(null);
  const [failedBatchIndices, setFailedBatchIndices] = useState<Set<number>>(new Set());

  // Recent Apps
  const [recentApps, setRecentApps] = useState<RecentApp[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RECENT);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // AutoSave Config
  const [autoSaveConfig, setAutoSaveConfig] = useState<AutoSaveConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AUTOSAVE);
      if (saved) {
        return normalizeAutoSaveConfig(JSON.parse(saved));
        // 只有当目录名存在时才启用自动保存
      }
      return normalizeAutoSaveConfig();
    } catch {
      return normalizeAutoSaveConfig();
    }
  });

  // Favorites
  const [favorites, setFavorites] = useState<Favorite[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FAVORITES);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsMode, setTermsMode] = useState<'first-time' | 'about'>('first-time');

  const stepRunningRef = useRef<StepRunningRef>(null);
  const persistAutoSaveConfig = (config: AutoSaveConfig) => {
    const normalized = normalizeAutoSaveConfig(config);
    setAutoSaveConfig(normalized);
    localStorage.setItem(STORAGE_KEY_AUTOSAVE, JSON.stringify(normalized));
  };

  useEffect(() => {
    // Force Dark Mode by default
    document.documentElement.classList.add('dark');

    const agreed = localStorage.getItem('rh_terms_agreed');
    if (!agreed) {
      setTermsMode('first-time');
      setShowTermsModal(true);
    }

    if (!autoSaveConfig.enabled && !autoSaveConfig.directoryPath && !autoSaveConfig.directoryName) {
      return;
    }

    // Initialize auto-save on mount
    const init = async () => {
      const dirName = await initAutoSave(autoSaveConfig.directoryPath);
      if (dirName) {
        // 成功恢复目录访问权限
        const restoredPath = getCurrentDirectoryPath();
        persistAutoSaveConfig({
          enabled: autoSaveConfig.directoryName || autoSaveConfig.directoryPath ? autoSaveConfig.enabled : true,
          directoryName: dirName,
          directoryPath: restoredPath
        });
      } else {
        // 无法恢复权限，禁用自动保存并清除无效配置
        persistAutoSaveConfig({
          ...autoSaveConfig,
          enabled: false
        });
        // 清除 localStorage 中的无效配置
        console.log('[AutoSave] Unable to restore directory access for this launch');
      }
    };

    const timer = window.setTimeout(() => {
      void init();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const apiKeysList = apiKeys.map(k => k.apiKey).filter(key => key && key.trim());
  const enterpriseApiKeyList = enterpriseApi.apiKey.trim() ? [enterpriseApi.apiKey.trim()] : [];

  const addToRecent = (id: string, name: string) => {
    setRecentApps(prev => {
      const newApp: RecentApp = {
        id,
        name,
        timestamp: Date.now()
      };
      const filtered = prev.filter(app => app.id !== id);
      const updated = [newApp, ...filtered].slice(0, 11); // Keep 11 to show 10 after filter/slice or just slice 10
      // actually slice 10 is fine
      const final = updated.slice(0, 10);
      localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(final));
      return final;
    });
  };

  const handleConfigComplete = (newModelConfig: StandardModelConfig, newNodes: NodeInfo[]) => {
    setStandardModelConfig(newModelConfig);
    setWebappId(newModelConfig.endpoint);
    setNodes(newNodes);
    setWebAppInfo(null);
    setIsConnected(true);
  };

  const [batchTaskName, setBatchTaskName] = useState<string>('');

  // ...

  const handleRun = (updatedNodes: NodeInfo[], batchList?: NodeInfo[][], pendingFiles?: any, taskName?: string, instanceTypeParam?: InstanceType) => {
    setNodes(updatedNodes);
    if (instanceTypeParam) {
      setInstanceType(instanceTypeParam);
    }
    if (
      currentView === 'workspace'
      && standardModelConfig.endpoint
      && runType === 'single'
      && (!batchList || batchList.length === 0)
      && stepRunningRef.current
    ) {
      stepRunningRef.current.submitAdditionalTask(updatedNodes);
      setBatchTaskName('');
      return;
    }
    if (batchList && batchList.length > 0) {
      setActiveBatchList(batchList);
      setActivePendingFiles(pendingFiles);
      setRunType('batch');
      setBatchTaskName(taskName || '');
    } else {
      setActiveBatchList(undefined);
      setActivePendingFiles(undefined);
      setRunType('single');
      setBatchTaskName('');
    }
  };

  // ...

  const handleComplete = async (outputs: TaskOutput[], taskId: string) => {
    // Create history item
    const newItem: HistoryItem = {
      id: taskId,
      timestamp: Date.now(),
      outputs,
      status: 'SUCCESS'
    };
    setHistory(prev => [newItem, ...prev]);

    if (currentView === 'workspace' && standardModelConfig.endpoint) {
      return;
    }

    // Switch to result view
    setRunType('result');
  };

  const handleBatchComplete = (summaryLogs: string[], failedTasks: FailedTaskInfo[]) => {
    setRunType('result'); // Switch to result view after batch too
    setBatchResult({ logs: summaryLogs, failedTasks });
    // 更新失败任务索引集合，用于在批量设置中显示
    setFailedBatchIndices(new Set(failedTasks.map(t => t.batchIndex)));

    // Play completion sound if enabled
    try {
      const enabled = localStorage.getItem('rh_batch_reminder_enabled') === 'true';
      const audioFile = localStorage.getItem('rh_batch_reminder_audio');
      if (enabled && audioFile) {
        const audio = new Audio(`/audio/${audioFile}`);
        audio.play().catch(e => console.error("Failed to play audio:", e));
      }
    } catch (e) {
      console.error("Error playing completion sound:", e);
    }
  };

  const handleUpdateFavorites = (updatedFavs: Favorite[]) => {
    setFavorites(updatedFavs);
    localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(updatedFavs));
  };

  const handleUpdateApiKeys = (newKeys: ApiKeyEntry[], saveToStorage: boolean = true) => {
    const normalizedKeys = normalizeApiKeys(newKeys);
    setApiKeys(normalizedKeys);
    if (saveToStorage) {
      localStorage.setItem(STORAGE_KEY_API_KEYS, JSON.stringify(normalizedKeys));
    } else {
      // 如果不保存，则清除 localStorage 中已保存的 API Keys
      localStorage.removeItem(STORAGE_KEY_API_KEYS);
    }
  };

  const handleUpdateEnterpriseApi = (newKey: ApiKeyEntry, saveToStorage: boolean = true) => {
    const normalizedKey = normalizeApiKeyEntry(newKey);
    setEnterpriseApi(normalizedKey);
    if (saveToStorage) {
      localStorage.setItem(STORAGE_KEY_ENTERPRISE_API, JSON.stringify(normalizedKey));
    } else {
      localStorage.removeItem(STORAGE_KEY_ENTERPRISE_API);
    }
  };

  const handleUpdateAutoSave = (config: AutoSaveConfig) => {
    persistAutoSaveConfig(config);
  };

  const handleUpdateStartupView = (view: StartupView) => {
    setStartupView(view);
    localStorage.setItem(STORAGE_KEY_STARTUP_VIEW, view);
  };

  const handleUpdateHomeDefaultTab = (tab: HomeDefaultTab) => {
    setHomeDefaultTab(tab);
    localStorage.setItem(STORAGE_KEY_HOME_DEFAULT_TAB, tab);
  };

  const handleSwitchView = (view: AppView) => {
    if (view === 'home') {
      setHomeViewResetToken(prev => prev + 1);
    }
    setCurrentView(view);
  };

  const handleToggleFavorite = (app: Favorite) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.webappId === app.webappId);
      let newFavs;
      if (exists) {
        newFavs = prev.filter(f => f.webappId !== app.webappId);
      } else {
        newFavs = [...prev, app];
      }
      localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(newFavs));
      return newFavs;
    });
  };

  const handleSelectApp = (appId: string) => {
    if (cardRequests.enqueue(appId)) setCurrentView('multitask');
  };

  const handleSelectFavorite = (fav: Favorite) => {
    setWebappId(fav.webappId);
    if (fav.nodes && fav.appInfo) {
      setNodes(fav.nodes);
      setWebAppInfo(fav.appInfo);
      setIsConnected(true);
      addToRecent(fav.webappId, fav.appInfo.webappName);
    }
    setCurrentView('workspace');
  };

  const handleCancelRun = () => {
    // 调用 StepRunning 的取消方法
    if (stepRunningRef.current) {
      stepRunningRef.current.cancelWithSummary();
    }
  };

  const handleAgreeTerms = () => {
    localStorage.setItem('rh_terms_agreed', 'true');
    setShowTermsModal(false);
  };

  const handleOpenAbout = (e: React.MouseEvent) => {
    e.preventDefault();
    setTermsMode('about');
    setShowTermsModal(true);
  };

  return {
    language,
    toggleLanguage,
    text,
    startupView,
    homeDefaultTab,
    currentView,
    homeViewResetToken,
    cardRequests,
    webappId,
    apiKeys,
    enterpriseApi,
    isConnected,
    nodes,
    webAppInfo,
    standardModelConfig,
    runType,
    setRunType,
    instanceType,
    setInstanceType,
    activeBatchList,
    setActiveBatchList,
    activePendingFiles,
    setActivePendingFiles,
    batchResult,
    setBatchResult,
    failedBatchIndices,
    recentApps,
    history,
    setHistory,
    autoSaveConfig,
    favorites,
    showSettings,
    setShowSettings,
    showTermsModal,
    setShowTermsModal,
    termsMode,
    stepRunningRef,
    apiKeysList,
    enterpriseApiKeyList,
    handleConfigComplete,
    batchTaskName,
    handleRun,
    handleComplete,
    handleBatchComplete,
    handleUpdateFavorites,
    handleUpdateApiKeys,
    handleUpdateEnterpriseApi,
    handleUpdateAutoSave,
    handleUpdateStartupView,
    handleUpdateHomeDefaultTab,
    handleSwitchView,
    handleToggleFavorite,
    handleSelectApp,
    handleSelectFavorite,
    handleCancelRun,
    handleAgreeTerms,
    handleOpenAbout,
  };
}
