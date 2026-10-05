import { useAppState } from './hooks/useAppState';
import type { AppView } from './hooks/appSettings';
import React, { Suspense, lazy } from 'react';
import { Home, Briefcase, Settings, User, Layers, Languages } from 'lucide-react';
import SettingsModal from './components/SettingsModal';
import Footer from './components/Footer';
import TermsModal from './components/TermsModal';

const HomeView = lazy(() => import('./components/HomeView'));
const StepConfig = lazy(() => import('./components/StepConfig'));
const StepEditor = lazy(() => import('./components/StepEditor'));
const StepRunning = lazy(() => import('./components/StepRunning'));
const WorkspacePanel = lazy(() => import('./components/WorkspacePanel'));
const MultiTaskView = lazy(() => import('./components/MultiTaskView'));
const ToolsView = lazy(() => import('./components/ToolsView'));

const viewLoadingFallback = (
  <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-[#0F1115] text-sm text-slate-500 dark:text-slate-400">
    正在加载界面...
  </div>
);

function App() {
  const {
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
  } = useAppState();
  const tabs: { id: AppView; label: string; icon: React.FC<any> }[] = [
    { id: 'home', label: text('首页', 'Home'), icon: Home },
    { id: 'workspace', label: text('标准模型 API', 'Model API'), icon: Briefcase },
    { id: 'cards', label: text('卡片管理', 'Card Manager'), icon: Layers },
    { id: 'multitask', label: text('多任务模式', 'Multi-task'), icon: Layers },
    { id: 'tools', label: text('设置', 'Settings'), icon: Settings },
  ];

  return (
    <div className="h-screen flex flex-col text-slate-800 dark:text-slate-100 font-sans selection:bg-brand-100 selection:text-brand-700 dark:selection:bg-brand-900 dark:selection:text-brand-200 transition-colors duration-300 overflow-hidden bg-slate-100 dark:bg-[#0F1115]">
      {/* Header */}
      <header className="bg-white dark:bg-[#0F1115] border-b border-slate-200 dark:border-slate-800/50 min-h-14 flex flex-col items-stretch justify-between gap-2 py-2 pr-2 md:h-14 md:flex-row md:items-center md:gap-0 md:py-0 md:pr-4 shrink-0 z-20 shadow-sm">
        <div className="flex min-w-0 shrink-0 items-center h-10 md:h-full gap-2">
          <img src="/r.png" alt="RunningHub" className="h-10 w-auto ml-2" />
          <span className="truncate text-sm md:hidden xl:inline xl:text-xl font-bold text-slate-800 dark:text-white tracking-wide">{text('RH客户端( H 版 ) v1.6.6', 'RH Client (H Edition) v1.6.6')}</span>
          <button
            onClick={handleOpenAbout}
            className="ml-2 px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full transition-colors"
          >
            免责声明
          </button>
        </div>

        <div className="flex min-w-0 shrink-0 md:shrink items-center min-h-9 gap-2 overflow-x-auto md:gap-4">
          {/* Navigation Tabs */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={toggleLanguage}
              data-i18n-ignore="true"
              aria-label={language === 'zh' ? 'Switch to English' : '切换到中文'}
              title={language === 'zh' ? 'Switch to English' : '切换到中文'}
              className="mr-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-brand-600 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-brand-400"
            >
              <Languages className="h-4 w-4" />
              <span>{language === 'zh' ? 'EN' : '中文'}</span>
            </button>
            {tabs.map((tab) => {
              const isActive = currentView === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleSwitchView(tab.id)}
                  className={`relative flex shrink-0 whitespace-nowrap items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${isActive
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
            className="flex shrink-0 whitespace-nowrap items-center gap-2 px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors text-sm"
          >
            <User className="w-4 h-4" />
            <span>{text('个人中心', 'Account')}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <Suspense fallback={viewLoadingFallback}>
        <div className="flex-1 flex overflow-hidden">

          <div className={`flex-1 overflow-hidden ${currentView === 'home' ? 'flex' : 'hidden'}`}>
            {currentView === 'home' && (
              <HomeView
                onSelectApp={handleSelectApp}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                defaultTab={homeDefaultTab}
                resetToken={homeViewResetToken}
              />
            )}
          </div>

          <div className={`flex-1 overflow-hidden ${currentView === 'tools' ? 'flex' : 'hidden'}`}>
            {currentView === 'tools' && (
              <ToolsView
                autoSaveConfig={autoSaveConfig}
                onUpdateAutoSave={handleUpdateAutoSave}
                startupView={startupView}
                onUpdateStartupView={handleUpdateStartupView}
                homeDefaultTab={homeDefaultTab}
                onUpdateHomeDefaultTab={handleUpdateHomeDefaultTab}
              />
            )}
          </div>

          <div className={`flex-1 overflow-hidden ${currentView === 'multitask' || currentView === 'cards' ? 'flex' : 'hidden'}`}>
            <MultiTaskView
              cardRequests={cardRequests.requests}
              onCardRequestsHandled={cardRequests.acknowledge}
              active={currentView === 'multitask'}
              managementActive={currentView === 'cards'}
              onShowWorkspace={() => handleSwitchView('multitask')}
              apiKeys={apiKeys}
              autoSaveConfig={autoSaveConfig}
              recentApps={recentApps}
              favorites={favorites}
            />
          </div>

          {/* Workspace View */}
          <div className={`flex-1 flex overflow-hidden ${currentView === 'workspace' ? 'flex' : 'hidden'}`}>
            {currentView === 'workspace' && (
              <>
                {/* Column 1: Configuration (Sidebar) - Fixed width */}
                <div className="w-[320px] bg-white dark:bg-[#161920] border-r border-slate-200 dark:border-slate-800/50 flex flex-col shrink-0 z-10 transition-colors duration-300">
                  <StepConfig
                    onNext={handleConfigComplete}
                    initialWebappId={webappId}
                    enterpriseApi={enterpriseApi}
                    onOpenSettings={() => setShowSettings(true)}
                    autoSaveConfig={autoSaveConfig}
                    onAutoSaveChange={handleUpdateAutoSave}
                  />
                </div>

                {/* Column 2: Parameters (Center Editor) - Wider fixed width */}
                <div className="w-[450px] bg-slate-50/50 dark:bg-[#0F1115] border-r border-slate-200 dark:border-slate-800/50 flex flex-col shrink-0 relative transition-colors duration-300">
                  <StepEditor
                    nodes={nodes}
                    apiKeys={enterpriseApiKeyList}
                    isConnected={isConnected}
                    runType={runType}
                    webAppInfo={webAppInfo}
                    onBack={() => { }}
                    onRun={handleRun}
                    onCancel={handleCancelRun}
                    mode="standard"
                    standardModelConfig={standardModelConfig}
                    failedBatchIndices={failedBatchIndices}
                    instanceType={instanceType}
                    onInstanceTypeChange={setInstanceType}
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
                      apiConfigs={enterpriseApi.apiKey.trim() ? [{ apiKey: enterpriseApi.apiKey.trim(), concurrency: enterpriseApi.concurrency || 1 }] : []}
                      webappId={webappId}
                      standardModelConfig={standardModelConfig}
                      nodes={nodes}
                      batchList={activeBatchList}
                      pendingFiles={activePendingFiles}
                      autoSaveEnabled={autoSaveConfig.enabled}
                      batchTaskName={batchTaskName}
                      instanceType={instanceType}
                      onComplete={handleComplete}
                      onBack={() => setRunType('none')}
                      onBatchComplete={handleBatchComplete}
                      onBatchCancel={handleBatchComplete}
                    />
                  ) : (
                    <WorkspacePanel
                      history={history}
                      favorites={favorites}
                      apiKeys={apiKeysList}
                      onClearHistory={() => setHistory([])}
                      onUpdateFavorites={handleUpdateFavorites}
                      onSelectFavorite={handleSelectFavorite}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </Suspense>

      <Footer />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        apiKeys={apiKeys}
        enterpriseApi={enterpriseApi}
        onUpdateApiKeys={handleUpdateApiKeys}
        onUpdateEnterpriseApi={handleUpdateEnterpriseApi}
        autoSaveConfig={autoSaveConfig}
        onUpdateAutoSave={handleUpdateAutoSave}
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

    </div>
  );
}

export default App;
