import React, { useState, useEffect } from 'react';
import { NodeInfo, TaskOutput, HistoryItem, AutoSaveConfig } from './types';
import StepConfig from './components/StepConfig';
import StepEditor from './components/StepEditor';
import StepRunning from './components/StepRunning';
import StepResult from './components/StepResult';
import { initAutoSave, saveMultipleFiles } from './services/autoSaveService';


const App: React.FC = () => {
  // State
  const [apiKey, setApiKey] = useState('');
  const [webappId, setWebappId] = useState('');
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [batchList, setBatchList] = useState<NodeInfo[][] | undefined>(undefined);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Status flags
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // Auto-save config
  const [autoSaveConfig, setAutoSaveConfig] = useState<AutoSaveConfig>({
    enabled: false,
    directoryName: null
  });

  // 始终使用深色模式
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Initialize auto-save on mount
  useEffect(() => {
    const init = async () => {
      const dirName = await initAutoSave();
      if (dirName) {
        const savedEnabled = localStorage.getItem('rh_auto_save_enabled') === 'true';
        setAutoSaveConfig({
          enabled: savedEnabled,
          directoryName: dirName
        });
      }
    };
    init();
  }, []);

  // Handlers
  const handleConfigComplete = (key: string, id: string, fetchedNodes: NodeInfo[]) => {
    setApiKey(key);
    setWebappId(id);
    setNodes(fetchedNodes);
    setIsConnected(true);
    // Don't clear history on reconnect, let it persist for session
    setIsRunning(false);
  };

  const handleRunTask = (updatedNodes: NodeInfo[], batch?: NodeInfo[][]) => {
    setNodes(updatedNodes);
    setBatchList(batch);
    setIsRunning(true);
  };

  const handleTaskComplete = async (outputs: TaskOutput[], taskId: string) => {
    const newItem: HistoryItem = {
      id: taskId,
      timestamp: Date.now(),
      outputs,
      status: 'SUCCESS'
    };
    setHistory(prev => [newItem, ...prev]);
    setIsRunning(false);

    // Auto-save files if enabled
    if (autoSaveConfig.enabled && outputs.length > 0) {
      try {
        const urls = outputs.map(o => o.fileUrl);
        const savedCount = await saveMultipleFiles(urls);
        console.log(`[AutoSave] Saved ${savedCount}/${urls.length} files`);
      } catch (e) {
        console.error('[AutoSave] Failed to auto-save:', e);
      }
    }
  };

  const handleResetRunning = () => {
    setIsRunning(false);
  };

  return (
    <div className="h-screen flex flex-col text-slate-800 dark:text-slate-100 font-sans selection:bg-brand-100 selection:text-brand-700 dark:selection:bg-brand-900 dark:selection:text-brand-200 transition-colors duration-300 overflow-hidden bg-slate-100 dark:bg-[#0F1115]">
      {/* Header */}
      <header className="bg-white dark:bg-[#0F1115] border-b border-slate-200 dark:border-slate-800/50 h-14 flex items-center justify-between pr-4 shrink-0 z-20 shadow-sm">
        <div className="flex items-center h-full gap-3">
          <img src="/RH.png" alt="RunningHub" className="h-14 w-auto" />
          <span className="text-xl font-bold text-slate-800 dark:text-white tracking-wide">AI应用客户端</span>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>RH 应用客户端 开源项目</span>
          <span className="text-slate-600">|</span>
          <span>由</span>
          <a
            href="https://space.bilibili.com/527601196?spm_id_from=333.40164.0.0"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-400 hover:text-brand-300 hover:underline transition-colors"
          >
            哔站 HooTooH
          </a>
          <span>制作</span>
          <span className="text-slate-600">|</span>
          <a
            href="https://www.runninghub.cn/?inviteCode=rh-v1123"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300 hover:underline transition-colors"
          >
            点击这里注册送1000RH币
          </a>
          <span className="text-slate-600">|</span>
          <span>QQ交流群 543917943</span>
        </div>

      </header>

      {/* Main 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* Column 1: Configuration (Sidebar) - Fixed width */}
        <div className="w-[320px] bg-white dark:bg-[#161920] border-r border-slate-200 dark:border-slate-800/50 flex flex-col shrink-0 z-10 transition-colors duration-300">
          <StepConfig
            onNext={handleConfigComplete}
            initialApiKey={apiKey}
            initialWebappId={webappId}
            autoSaveConfig={autoSaveConfig}
            onAutoSaveChange={setAutoSaveConfig}
          />
        </div>

        {/* Column 2: Parameters (Center Editor) - Wider fixed width */}
        <div className="w-[450px] bg-slate-50/50 dark:bg-[#0F1115] border-r border-slate-200 dark:border-slate-800/50 flex flex-col shrink-0 relative transition-colors duration-300">
          <StepEditor
            nodes={nodes}
            apiKey={apiKey}
            isConnected={isConnected}
            onBack={() => { }}
            onRun={handleRunTask}
          />
        </div>

        {/* Column 3: History & Status (Right Panel) - Wider fluid width */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#161920] transition-colors duration-300">
          {isRunning ? (
            <StepRunning
              apiKey={apiKey}
              webappId={webappId}
              nodes={nodes}
              batchList={batchList}
              onComplete={handleTaskComplete}
              onBack={handleResetRunning}
            />
          ) : (
            <StepResult
              history={history}
              onClear={() => setHistory([])}
            />
          )}
        </div>

      </div>

      {/* Footer */}
      <footer className="h-8 border-t border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#161920] flex items-center justify-center text-[10px] text-slate-400 shrink-0">
        © {new Date().getFullYear()} RunningHub Client
      </footer>
    </div>
  );
};

export default App;