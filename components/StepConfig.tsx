import React, { useState, useEffect } from 'react';
import { Key, Globe, Loader2, ArrowRight, Link, Settings, AlertOctagon, Star, Plus, X, User, Coins, Activity, Check, FolderOpen, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { NodeInfo, Favorite, AccountInfo, AutoSaveConfig } from '../types';
import { getNodeList, getAccountInfo } from '../services/api';
import { selectDirectory, initAutoSave, clearDirectory, isFileSystemAccessSupported, hasDirectoryAccess } from '../services/autoSaveService';

interface StepConfigProps {
  onNext: (apiKey: string, webappId: string, nodes: NodeInfo[]) => void;
  initialApiKey: string;
  initialWebappId: string;
  autoSaveConfig: AutoSaveConfig;
  onAutoSaveChange: (config: AutoSaveConfig) => void;
}

const STORAGE_KEY_API = 'rh_api_key';
const STORAGE_KEY_FAVORITES = 'rh_favorites';
const STORAGE_KEY_SAVE_API = 'rh_save_api_enabled';
const STORAGE_KEY_AUTO_SAVE = 'rh_auto_save_enabled';

const StepConfig: React.FC<StepConfigProps> = ({ onNext, initialApiKey, initialWebappId, autoSaveConfig, onAutoSaveChange }) => {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [webappId, setWebappId] = useState(initialWebappId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings and Favorites state
  const [showSettings, setShowSettings] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [newFavoriteName, setNewFavoriteName] = useState('');

  // Account info state
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Save API Key checkbox
  const [saveApiKeyEnabled, setSaveApiKeyEnabled] = useState(false);

  // Auto-save state
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const [autoSaveSupported] = useState(isFileSystemAccessSupported());

  // Load saved data from localStorage
  useEffect(() => {
    const savedApiKey = localStorage.getItem(STORAGE_KEY_API);
    const savedFavorites = localStorage.getItem(STORAGE_KEY_FAVORITES);
    const savedSaveApiEnabled = localStorage.getItem(STORAGE_KEY_SAVE_API);

    if (savedSaveApiEnabled === 'true') {
      setSaveApiKeyEnabled(true);
      if (savedApiKey && !initialApiKey) {
        setApiKey(savedApiKey);
      }
    }

    if (savedFavorites) {
      try {
        setFavorites(JSON.parse(savedFavorites));
      } catch (e) {
        console.error('Failed to parse favorites:', e);
      }
    }
  }, [initialApiKey]);

  // Handle API key change
  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    if (saveApiKeyEnabled) {
      localStorage.setItem(STORAGE_KEY_API, key);
    }
  };

  // Handle save API key checkbox toggle
  const handleSaveApiKeyToggle = (enabled: boolean) => {
    setSaveApiKeyEnabled(enabled);
    localStorage.setItem(STORAGE_KEY_SAVE_API, enabled.toString());

    if (enabled) {
      localStorage.setItem(STORAGE_KEY_API, apiKey);
    } else {
      localStorage.removeItem(STORAGE_KEY_API);
    }
  };

  // Handle modal close
  const handleCloseSettings = () => {
    // If save is disabled, clear the API key from localStorage
    if (!saveApiKeyEnabled) {
      localStorage.removeItem(STORAGE_KEY_API);
    }
    setShowSettings(false);
  };

  // Save favorites to localStorage
  const saveFavorites = (newFavorites: Favorite[]) => {
    setFavorites(newFavorites);
    localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(newFavorites));
  };

  // Fetch account info when settings modal opens
  const fetchAccountInfo = async () => {
    if (!apiKey.trim()) {
      setAccountError('请先输入 API Key');
      setAccountInfo(null);
      return;
    }

    setLoadingAccount(true);
    setAccountError(null);

    try {
      const info = await getAccountInfo(apiKey);
      setAccountInfo(info);
    } catch (err: any) {
      console.error('Failed to fetch account info:', err);
      setAccountError(err.message || '获取账户信息失败');
      setAccountInfo(null);
    } finally {
      setLoadingAccount(false);
    }
  };

  // When settings modal opens, fetch account info
  // Handle directory selection for auto-save
  const handleSelectDirectory = async () => {
    setIsSelectingDirectory(true);
    try {
      const dirName = await selectDirectory();
      if (dirName) {
        onAutoSaveChange({ ...autoSaveConfig, directoryName: dirName });
      }
    } catch (e: any) {
      console.error('Directory selection failed:', e);
      setError(e.message || '选择目录失败');
    } finally {
      setIsSelectingDirectory(false);
    }
  };

  // Handle auto-save toggle
  const handleAutoSaveToggle = (enabled: boolean) => {
    if (enabled && !autoSaveConfig.directoryName) {
      setError('请先选择保存目录');
      return;
    }
    onAutoSaveChange({ ...autoSaveConfig, enabled });
    localStorage.setItem(STORAGE_KEY_AUTO_SAVE, enabled.toString());
  };

  // Handle clear directory
  const handleClearDirectory = async () => {
    await clearDirectory();
    onAutoSaveChange({ enabled: false, directoryName: null });
    localStorage.setItem(STORAGE_KEY_AUTO_SAVE, 'false');
  };

  const handleOpenSettings = () => {
    setShowSettings(true);
    if (apiKey.trim()) {
      fetchAccountInfo();
    }
  };

  const handleAddFavorite = () => {
    const name = newFavoriteName.trim();
    const id = webappId.trim();

    if (!name || !id) {
      setError('请填写收藏名称和应用 ID');
      return;
    }

    // Check for duplicate names
    if (favorites.some(f => f.name === name)) {
      setError('收藏名称已存在');
      return;
    }

    const newFavorite: Favorite = { name, webappId: id };
    saveFavorites([...favorites, newFavorite]);
    setNewFavoriteName('');
    setError(null);
  };

  const handleLoadFavorite = (favorite: Favorite) => {
    setWebappId(favorite.webappId);
  };

  const handleRemoveFavorite = (name: string) => {
    saveFavorites(favorites.filter(f => f.name !== name));
  };

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let targetId = webappId.trim();
    const urlMatch = targetId.match(/\/ai-detail\/(\d+)/);
    if (urlMatch) {
      targetId = urlMatch[1];
    }

    try {
      if (!apiKey.trim() || !targetId) {
        throw new Error("请填写 API Key 和 ID");
      }

      if (targetId !== webappId) {
        setWebappId(targetId);
      }

      const nodes = await getNodeList(apiKey, targetId);
      onNext(apiKey, targetId, nodes);
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-5 border-b border-slate-100 dark:border-slate-800/50">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-white">
          <Settings className="w-5 h-5 text-brand-500" />
          应用配置
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          连接到 RunningHub 应用
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <form onSubmit={handleFetch} className="space-y-5">
          {/* WebApp ID Input */}
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

          {/* Add to Favorites */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">添加收藏</label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={newFavoriteName}
                onChange={(e) => setNewFavoriteName(e.target.value)}
                className="w-[200px] px-3 py-2 text-sm bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                placeholder="收藏名称"
              />
              <button
                type="button"
                onClick={handleAddFavorite}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-medium text-sm rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                收藏
              </button>
            </div>
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

          {/* Favorites Tags */}
          {favorites.length > 0 && (
            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                <Star className="inline-block w-3 h-3 mr-1" />
                我的收藏
              </label>
              <div className="flex flex-wrap gap-2">
                {favorites.map((fav) => (
                  <div
                    key={fav.name}
                    className="group flex items-center gap-1 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs rounded-full border border-amber-200 dark:border-amber-800/50 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadFavorite(fav)}
                      className="flex items-center gap-1"
                    >
                      <Star className="w-3 h-3" />
                      {fav.name}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFavorite(fav.name);
                      }}
                      className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Bottom Settings Button */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800/50">
        <button
          type="button"
          onClick={handleOpenSettings}
          className="w-full flex justify-center items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
        >
          <User className="h-4 w-4" />
          个人中心
        </button>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onMouseDown={(e) => {
            // Only close if clicking directly on the backdrop
            if (e.target === e.currentTarget) {
              handleCloseSettings();
            }
          }}
        >
          <div
            className="bg-white dark:bg-[#1a1d24] rounded-xl shadow-2xl w-[700px] max-w-[95vw] animate-in fade-in zoom-in-95 duration-200"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 dark:border-slate-800/50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <User className="w-5 h-5 text-brand-500" />
                个人中心
              </h3>
              <button
                type="button"
                onClick={handleCloseSettings}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Two-column layout */}
            <div className="p-5 flex gap-5">
              {/* Left Column: API Key & Account Info */}
              <div className="flex-1 space-y-4">
                {/* API Key Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">API Key</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Key className="h-4 w-4" />
                    </div>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      className="block w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                      placeholder="sk-..."
                    />
                  </div>

                  {/* Save API Key Checkbox */}
                  <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${saveApiKeyEnabled
                        ? 'bg-brand-600 border-brand-600'
                        : 'bg-slate-50 dark:bg-[#0F1115] border-slate-300 dark:border-slate-600'
                        }`}
                      onClick={() => handleSaveApiKeyToggle(!saveApiKeyEnabled)}
                    >
                      {saveApiKeyEnabled && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      保存 API Key 到本地
                    </span>
                  </label>
                </div>

                {/* Refresh Account Info Button */}
                <button
                  type="button"
                  onClick={fetchAccountInfo}
                  disabled={loadingAccount || !apiKey.trim()}
                  className="w-full flex justify-center items-center gap-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingAccount ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4" />
                      获取中...
                    </>
                  ) : (
                    <>
                      <Activity className="h-4 w-4" />
                      获取账户信息
                    </>
                  )}
                </button>

                {/* Account Error */}
                {accountError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg border border-red-100 dark:border-red-900/30 flex items-start gap-2">
                    <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{accountError}</span>
                  </div>
                )}

                {/* Account Info Display */}
                {accountInfo && (
                  <div className="p-4 bg-gradient-to-br from-brand-50 to-amber-50 dark:from-brand-900/20 dark:to-amber-900/20 rounded-xl border border-brand-100 dark:border-brand-800/50">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                      <Coins className="w-4 h-4 text-amber-500" />
                      账户信息
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400">RH 币余额</span>
                        <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{accountInfo.remainCoins}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400">运行中任务</span>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{accountInfo.currentTaskCounts}</span>
                      </div>
                      {accountInfo.remainMoney && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-500 dark:text-slate-400">钱包余额</span>
                          <span className="text-sm font-medium text-green-600 dark:text-green-400">
                            {accountInfo.currency} {accountInfo.remainMoney}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400">API 类型</span>
                        <span className="text-xs px-2 py-0.5 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-full">
                          {accountInfo.apiType}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Auto-Save Settings */}
              <div className="flex-1">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 h-full">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                    <Save className="w-4 h-4 text-brand-500" />
                    自动保存设置
                  </h4>

                  {!autoSaveSupported ? (
                    <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                      ⚠️ 您的浏览器不支持目录选择功能，请使用 Chrome 或 Edge 浏览器
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Directory Selection */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">保存目录</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSelectDirectory}
                            disabled={isSelectingDirectory}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium text-xs rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isSelectingDirectory ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <FolderOpen className="w-4 h-4" />
                            )}
                            选择
                          </button>

                          <div className="flex-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                            {autoSaveConfig.directoryName ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                📁 {autoSaveConfig.directoryName}
                              </span>
                            ) : (
                              <span className="text-slate-400">未选择目录</span>
                            )}
                          </div>

                          {autoSaveConfig.directoryName && (
                            <button
                              type="button"
                              onClick={handleClearDirectory}
                              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                              title="清除目录"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Enable Toggle */}
                      <div className="flex items-center justify-between py-2 px-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          启用自动保存
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAutoSaveToggle(!autoSaveConfig.enabled)}
                          disabled={!autoSaveConfig.directoryName}
                          className={`relative w-10 h-5 rounded-full transition-colors ${autoSaveConfig.enabled
                            ? 'bg-emerald-500'
                            : 'bg-slate-300 dark:bg-slate-600'
                            } ${!autoSaveConfig.directoryName ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoSaveConfig.enabled ? 'translate-x-5' : 'translate-x-0.5'
                              }`}
                          />
                        </button>
                      </div>

                      {/* Status Message */}
                      <div className={`p-3 rounded-lg text-xs ${autoSaveConfig.enabled
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}>
                        {!autoSaveConfig.directoryName
                          ? '💡 请先选择保存目录才能启用自动保存'
                          : autoSaveConfig.enabled
                            ? '✅ 已启用：生成的图片和视频将自动保存'
                            : '未启用自动保存'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800/50 flex justify-end">
              <button
                type="button"
                onClick={handleCloseSettings}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm rounded-lg transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StepConfig;