import React, { useState, useEffect, useRef } from 'react';
import { Home, Star, Briefcase, Settings, User } from 'lucide-react';
import HomeView from './components/HomeView';
import FavoritesView from './components/FavoritesView';
import StepConfig from './components/StepConfig';
import StepEditor from './components/StepEditor';
import StepRunning, { StepRunningRef } from './components/StepRunning';
import StepResult from './components/StepResult';
import SettingsModal from './components/SettingsModal';
import ToolsView from './components/ToolsView';
import DecodeSettingsModal from './components/DecodeSettingsModal';
import Footer from './components/Footer';
import TermsModal from './components/TermsModal';
import AboutModal from './components/AboutModal';
import { NodeInfo, TaskOutput, WebAppInfo, ApiKeyEntry, AutoSaveConfig, Favorite, DecodeConfig, HistoryItem, RecentApp, FailedTaskInfo } from './types';
import { saveMultipleFiles, getDirectoryName, initAutoSave } from './services/autoSaveService';
import { PendingFilesMap } from './components/BatchSettingsModal';

const STORAGE_KEY_API_KEYS = 'rh_api_keys_v2';
const STORAGE_KEY_AUTOSAVE = 'rh_autosave_config';
const STORAGE_KEY_FAVORITES = 'rh_favorites';
const STORAGE_KEY_DECODE = 'rh_decode_config';
const STORAGE_KEY_RECENT = 'rh_recent_apps';

function App() {
  // Global View State
  const [currentView, setCurrentView] = useState<'home' | 'favorites' | 'workspace' | 'tools'>('home');

  // State
  const [webappId, setWebappId] = useState('');
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_API_KEYS);
      const parsed = saved ? JSON.parse(saved) : [];
      // 确保至少有一个默认的空API输入框
      if (parsed.length === 0) {
        return [{ id: crypto.randomUUID(), apiKey: '', concurrency: 1 }];
      }
      return parsed;
    } catch { return [{ id: crypto.randomUUID(), apiKey: '', concurrency: 1 }]; }
  });

  const [isConnected, setIsConnected] = useState(false);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [webAppInfo, setWebAppInfo] = useState<WebAppInfo | null>(null);

  const [activeDecodeConfig, setActiveDecodeConfig] = useState<DecodeConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DECODE);
      return saved ? JSON.parse(saved) : { enabled: false, password: '', autoDecodeEnabled: false };
    } catch { return { enabled: false, password: '', autoDecodeEnabled: false }; }
  });

  const [runType, setRunType] = useState<'none' | 'single' | 'batch' | 'result'>('none');
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
      return saved ? JSON.parse(saved) : { enabled: true, directoryName: '' };
    } catch { return { enabled: true, directoryName: '' }; }
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
  const [isDecodeSettingsOpen, setIsDecodeSettingsOpen] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [termsMode, setTermsMode] = useState<'first-time' | 'about'>('first-time');

  const stepRunningRef = useRef<StepRunningRef>(null);

  useEffect(() => {
    // Force Dark Mode by default
    document.documentElement.classList.add('dark');

    const agreed = localStorage.getItem('rh_terms_agreed');
    if (!agreed) {
      setTermsMode('first-time');
      setShowTermsModal(true);
    }

    // Initialize auto-save on mount
    const init = async () => {
      const dirName = await initAutoSave();
      if (dirName) {
        const savedEnabled = localStorage.getItem('rh_autosave_config');
        // Note: Using the specific config key correctly
        if (savedEnabled) {
          try {
            const config = JSON.parse(savedEnabled);
            setAutoSaveConfig({
              enabled: config.enabled,
              directoryName: dirName
            });
          } catch {
            // ignore
          }
        }
      }
    };
    init();
  }, []);

  const apiKeysList = apiKeys.map(k => k.apiKey).filter(key => key && key.trim());



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

  const handleConfigComplete = (newWebappId: string, newNodes: NodeInfo[], newAppInfo: WebAppInfo | null) => {
    setWebappId(newWebappId);
    setNodes(newNodes);
    setWebAppInfo(newAppInfo);
    setIsConnected(true);

    // Update Recent Apps
    if (newAppInfo) {
      addToRecent(newWebappId, newAppInfo.webappName);
    }
  };

  const [batchTaskName, setBatchTaskName] = useState<string>('');

  // ...

  const handleRun = (updatedNodes: NodeInfo[], batchList?: NodeInfo[][], pendingFiles?: any, decodeConfig?: DecodeConfig, taskName?: string) => {
    setNodes(updatedNodes);
    if (decodeConfig) {
      setActiveDecodeConfig(decodeConfig);
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
    setApiKeys(newKeys);
    if (saveToStorage) {
      localStorage.setItem(STORAGE_KEY_API_KEYS, JSON.stringify(newKeys));
    } else {
      // 如果不保存，则清除 localStorage 中已保存的 API Keys
      localStorage.removeItem(STORAGE_KEY_API_KEYS);
    }
  };

  const handleUpdateAutoSave = (config: AutoSaveConfig) => {
    setAutoSaveConfig(config);
    localStorage.setItem(STORAGE_KEY_AUTOSAVE, JSON.stringify(config));
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

  const handleSelectApp = (appId: string, preloadedData?: { nodes: NodeInfo[], appInfo: WebAppInfo }) => {
    setWebappId(appId);
    if (preloadedData) {
      setNodes(preloadedData.nodes);
      setWebAppInfo(preloadedData.appInfo);
      setIsConnected(true);
      addToRecent(appId, preloadedData.appInfo.webappName);
    }
    setCurrentView('workspace');
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

  const handleAgreeTerms = () => {
    localStorage.setItem('rh_terms_agreed', 'true');
    setShowTermsModal(false);
  };

  const handleOpenAbout = (e: React.MouseEvent) => {
    e.preventDefault();
    setTermsMode('about');
    setShowTermsModal(true);
  };

  const tabs: { id: 'home' | 'favorites' | 'workspace' | 'tools'; label: string; icon: React.FC<any> }[] = [
    { id: 'home', label: '首页', icon: Home },
    { id: 'favorites', label: '我的收藏', icon: Star },
    { id: 'workspace', label: '工作区', icon: Briefcase },
    { id: 'tools', label: '工具箱', icon: Settings },
  ];

  const handleOpenAboutModal = () => {
    setShowAboutModal(true);
  };

  return (
    <div className="h-screen flex flex-col text-slate-800 dark:text-slate-100 font-sans selection:bg-brand-100 selection:text-brand-700 dark:selection:bg-brand-900 dark:selection:text-brand-200 transition-colors duration-300 overflow-hidden bg-slate-100 dark:bg-[#0F1115]">
      {/* Header */}
      <header className="bg-white dark:bg-[#0F1115] border-b border-slate-200 dark:border-slate-800/50 h-14 flex items-center justify-between pr-4 shrink-0 z-20 shadow-sm">
        <div className="flex items-center h-full gap-3">
          <img src="/r.png" alt="RunningHub" className="h-10 w-auto ml-2" />
          <span className="text-xl font-bold text-slate-800 dark:text-white tracking-wide">RH客户端(非官方) v1.5.5 <span className="text-xs opacity-70">beta 0121v2</span></span>
          <button
            onClick={handleOpenAbout}
            className="ml-2 px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full transition-colors"
          >
            免责声明
          </button>
          <button
            onClick={handleOpenAboutModal}
            className="ml-2 px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full transition-colors"
          >
            交流与支持
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1">
            {tabs.map((tab) => {
              const isActive = currentView === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setCurrentView(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${isActive
                    ? 'bg-slate-100 dark:bg-slate-800 text-brand-600 dark:text-brand-400 font-medium'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700"></div>

          {/* Personal Center */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors text-sm"
          >
            <User className="w-4 h-4" />
            <span>个人中心</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">

        {currentView === 'home' && (
          <HomeView
            onSelectApp={handleSelectApp}
            apiKeys={apiKeysList}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {currentView === 'favorites' && (
          <FavoritesView
            favorites={favorites}
            onSelectApp={handleSelectFavorite}
            apiKeys={apiKeysList}
            onUpdateFavorites={handleUpdateFavorites}
          />
        )}

        {currentView === 'tools' && (
          <ToolsView
            onOpenDecodeSettings={() => setIsDecodeSettingsOpen(true)}
            decodeConfig={activeDecodeConfig}
          />
        )}

        {/* Workspace View */}
        <div className={`flex-1 flex overflow-hidden ${currentView === 'workspace' ? 'flex' : 'hidden'}`}>
          {/* Column 1: Configuration (Sidebar) - Fixed width */}
          <div className="w-[320px] bg-white dark:bg-[#161920] border-r border-slate-200 dark:border-slate-800/50 flex flex-col shrink-0 z-10 transition-colors duration-300">
            <StepConfig
              onNext={handleConfigComplete}
              initialWebappId={webappId}
              apiKeys={apiKeys}
              autoSaveConfig={autoSaveConfig}
              onAutoSaveChange={handleUpdateAutoSave}
              recentApps={recentApps}
              onSelectRecent={(app) => {
                // Just update the input in StepConfig, handled locally via props if needed,
                // BUT StepConfig maintains its own webappId state.
                // We actually need to pass a way to set it, OR StepConfig will read from props.
                // StepConfig has `initialWebappId` but that's only for init.
                // We might need to force update it.
                // Actually, let's keep it simple: We just pass recentApps to StepConfig.
                // StepConfig will handle the click to fill its own input.
              }}
            />
          </div>

          {/* Column 2: Parameters (Center Editor) - Wider fixed width */}
          <div className="w-[450px] bg-slate-50/50 dark:bg-[#0F1115] border-r border-slate-200 dark:border-slate-800/50 flex flex-col shrink-0 relative transition-colors duration-300">
            <StepEditor
              nodes={nodes}
              apiKeys={apiKeysList}
              isConnected={isConnected}
              runType={runType}
              webAppInfo={webAppInfo}
              onBack={() => { }}
              onRun={handleRun}
              onCancel={() => { }}
              decodeConfig={activeDecodeConfig}
              failedBatchIndices={failedBatchIndices}
              onRetryTask={(taskNodes, originalIndex, pendingFiles) => {
                // 使用传入的 taskNodes (包含用户可能的修改)
                if (taskNodes) {
                  const singleTaskList = [taskNodes];
                  setActiveBatchList(singleTaskList);
                  // 合并临时文件
                  if (pendingFiles) {
                    setActivePendingFiles((prev: any) => ({ ...prev, ...pendingFiles }));
                  }
                  setRunType('batch');
                }
              }}
            />
          </div>

          {/* Column 3: History & Status (Right Panel) - Wider fluid width */}
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#161920] transition-colors duration-300">
            {(runType === 'single' || runType === 'batch') ? (
              <StepRunning
                ref={stepRunningRef}
                apiConfigs={apiKeys.map(k => ({ apiKey: k.apiKey, concurrency: k.concurrency || 1 }))}
                webappId={webappId}
                nodes={nodes}
                batchList={activeBatchList}
                pendingFiles={activePendingFiles}
                decodeConfig={activeDecodeConfig}
                autoSaveEnabled={autoSaveConfig.enabled}
                batchTaskName={batchTaskName}
                onComplete={handleComplete}
                onBack={() => setRunType('none')}
                onBatchComplete={handleBatchComplete}
                onBatchCancel={handleBatchComplete}
              />
            ) : (
              <StepResult
                history={history}
                decodeConfig={activeDecodeConfig}
                onClear={() => setHistory([])}
              />
            )}
          </div>
        </div>
      </div>

      <Footer />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        apiKeys={apiKeys}
        onUpdateApiKeys={handleUpdateApiKeys}
        autoSaveConfig={autoSaveConfig}
        onUpdateAutoSave={handleUpdateAutoSave}
      />

      <DecodeSettingsModal
        isOpen={isDecodeSettingsOpen}
        onClose={() => setIsDecodeSettingsOpen(false)}
        config={activeDecodeConfig}
        onSave={(config) => {
          setActiveDecodeConfig(config);
          localStorage.setItem(STORAGE_KEY_DECODE, JSON.stringify(config));
        }}
      />

      {/* Batch Result Modal */}
      {batchResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#1a1d24] rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">{batchResult.failedTasks.length > 0 ? '⚠️' : '✅'}</span>
                批量任务完成
              </h3>

              {/* Summary Logs */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-2 max-h-40 overflow-y-auto mb-4">
                {batchResult.logs.map((log, i) => (
                  <p key={i} className="text-sm text-slate-600 dark:text-slate-300">
                    {log}
                  </p>
                ))}
              </div>

              {/* Failed Tasks Section */}
              {batchResult.failedTasks.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-bold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
                    <span>❌</span>
                    以下任务失败 ({batchResult.failedTasks.length} 个)
                  </h4>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-3 max-h-32 overflow-y-auto space-y-2">
                    {batchResult.failedTasks.map((task) => (
                      <div key={task.batchIndex} className="flex items-center justify-between text-sm">
                        <span className="text-red-700 dark:text-red-300 font-medium">
                          任务 {task.batchIndex + 1}
                        </span>
                        <span className="text-red-500 dark:text-red-400 text-xs truncate max-w-[200px]" title={task.errorMessage}>
                          {task.errorMessage}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 pb-6 space-y-3">
              {/* Retry Failed Tasks Button */}
              {batchResult.failedTasks.length > 0 && activeBatchList && activeBatchList.length > 0 && (
                <button
                  onClick={() => {
                    // 提取失败任务重新提交
                    const failedIndices = batchResult.failedTasks.map(t => t.batchIndex);
                    const retryBatchList = failedIndices
                      .filter(idx => idx < activeBatchList.length)
                      .map(idx => activeBatchList[idx]);

                    if (retryBatchList.length > 0) {
                      // 关闭弹窗并重新启动批量任务
                      setBatchResult(null);
                      setActiveBatchList(retryBatchList);
                      setRunType('batch');
                    }
                  }}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <span>🔄</span>
                  重新提交失败任务 ({batchResult.failedTasks.length} 个)
                </button>
              )}

              <button
                onClick={() => setBatchResult(null)}
                className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg transition-colors"
              >
                {batchResult.failedTasks.length > 0 ? '关闭 (可在批量设置中单独重试)' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terms Modal */}
      <TermsModal
        isOpen={showTermsModal}
        mode={termsMode}
        onClose={() => setShowTermsModal(false)}
        onAgree={handleAgreeTerms}
      />

      {/* About Modal */}
      <AboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
      />

    </div>
  );
}

export default App;