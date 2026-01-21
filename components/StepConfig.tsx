import React, { useState } from 'react';
import { Globe, Loader2, ArrowRight, Link, Settings, AlertOctagon, Star, Plus, X, User, History } from 'lucide-react';
import { NodeInfo, Favorite, AutoSaveConfig, WebAppInfo, ApiKeyEntry, RecentApp } from '../types';
import { getNodeList } from '../services/api';
import { UP_RECOMMENDATIONS } from './recommendationsData';

interface StepConfigProps {
  onNext: (webappId: string, nodes: NodeInfo[], appInfo: WebAppInfo | null) => void;
  // Global State
  apiKeys: ApiKeyEntry[];
  favorites: Favorite[];
  onUpdateFavorites: (favorites: Favorite[]) => void;

  // Settings Trigger
  onOpenSettings: () => void;

  // Existing Props
  initialWebappId: string;
  autoSaveConfig: AutoSaveConfig;
  onAutoSaveChange: (config: AutoSaveConfig) => void;
  recentApps?: RecentApp[];
  onSelectRecent?: (app: RecentApp) => void;
}

const StepConfig: React.FC<StepConfigProps> = ({
  onNext,
  apiKeys,
  initialWebappId,
  autoSaveConfig,
  onAutoSaveChange,
  recentApps = [],
  onSelectRecent
}) => {
  const [webappId, setWebappId] = useState(initialWebappId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the first valid API key for operations that need a single key
  const getPrimaryApiKey = () => apiKeys.find(entry => entry.apiKey.trim())?.apiKey || '';

  const fetchAppDetails = async (targetId: string) => {
    setError(null);
    setLoading(true);

    const primaryKey = getPrimaryApiKey();

    try {
      if (!primaryKey || !targetId) {
        throw new Error("请填写 API Key 和 ID (在个人中心添加 API Key)");
      }

      const result = await getNodeList(primaryKey, targetId);
      // Pass result to parent
      onNext(targetId, result.nodes, result.appInfo);
    } catch (err: any) {
      console.error(err);
      let msg = err.message || "连接失败";
      if (msg.includes('user not exist')) {
        msg = "连接失败: User not exist (用户不存在)。请检查您的 API Key 是否正确，或 Key 对应的账户状态。";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fill and auto-load when initialWebappId changes (e.g. from HomeView)
  React.useEffect(() => {
    const target = initialWebappId?.trim();
    if (target && target !== webappId) {
      setWebappId(target);
      // Auto-fetch if we have an API key
      if (getPrimaryApiKey()) {
        fetchAppDetails(target);
      }
    }
  }, [initialWebappId]); // Only check initialWebappId change

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();

    let targetId = webappId.trim();
    const urlMatch = targetId.match(/\/ai-detail\/(\d+)/);
    if (urlMatch) {
      targetId = urlMatch[1];
      setWebappId(targetId);
    }

    await fetchAppDetails(targetId);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-5 border-b border-slate-100 dark:border-slate-800/50">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-white">
          <Settings className="w-5 h-5 text-brand-500" />
          应用配置
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleFetch} className="flex flex-col p-5 gap-5">
          {/* WebAPP ID Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">WebAPP ID</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Link className="h-4 w-4" />
              </div>
              <input
                type="text"
                value={webappId}
                onChange={(e) => setWebappId(e.target.value)}
                className="block w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                placeholder="ID 或 URL"
              />
            </div>
            <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
              可直接粘贴应用详情页链接
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg border border-red-100 dark:border-red-900/30 flex items-start gap-2">
              <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center items-center gap-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold py-2.5 px-4 rounded-lg transition-all text-sm shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin h-4 w-4" />
                连接中...
              </>
            ) : (
              <>
                连接并加载参数
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Recently Used Section */}
        {recentApps.length > 0 && (
          <div className="px-5 pb-5 overflow-y-auto">
            <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <History className="w-3 h-3" />
              最近使用
            </div>
            <div className="space-y-1">
              {recentApps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => setWebappId(app.id)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group flex items-center justify-between"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-slate-700 dark:text-slate-300 font-medium truncate group-hover:text-brand-600 dark:group-hover:text-brand-400">
                      {app.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono truncate opacity-70">
                      ID: {app.id}
                    </span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1 group-hover:translate-x-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StepConfig;