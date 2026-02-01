import React, { useState, useEffect } from 'react';
import { Key, X, Plus, Trash2, Check, RefreshCw, Loader2, Coins, User, Save, FolderOpen, Building2 } from 'lucide-react';
import { ApiKeyEntry, ApiKeyConfig, AutoSaveConfig, AccountInfo } from '../types';
import { selectDirectory, clearDirectory, isFileSystemAccessSupported, checkDirectoryAccess } from '../services/autoSaveService';
import { getAccountInfo } from '../services/api';

const STORAGE_KEY_SHARED_API = 'rh_shared_api_key';
const STORAGE_KEY_SAVE_API = 'rh_save_api_enabled';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKeys: ApiKeyEntry[];
  onUpdateApiKeys: (keys: ApiKeyEntry[], saveToStorage?: boolean) => void;
  autoSaveConfig: AutoSaveConfig;
  onUpdateAutoSave: (config: AutoSaveConfig) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiKeys,
  onUpdateApiKeys,
  autoSaveConfig,
  onUpdateAutoSave,
}) => {
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const [autoSaveSupported] = useState(isFileSystemAccessSupported());
  const [permissionExpired, setPermissionExpired] = useState(false);

  // Internal state for sharedApiKey and saveApiKeyEnabled
  const [sharedApiKey, setSharedApiKey] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_SHARED_API) || '';
  });
  const [saveApiKeyEnabled, setSaveApiKeyEnabled] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_SAVE_API) === 'true';
  });

  // Persist sharedApiKey to localStorage when changed
  useEffect(() => {
    if (sharedApiKey) {
      localStorage.setItem(STORAGE_KEY_SHARED_API, sharedApiKey);
    } else {
      localStorage.removeItem(STORAGE_KEY_SHARED_API);
    }
  }, [sharedApiKey]);

  // 检查自动保存目录权限
  useEffect(() => {
    const checkPermission = async () => {
      if (autoSaveConfig.enabled && autoSaveConfig.directoryName) {
        const hasAccess = await checkDirectoryAccess();
        if (!hasAccess) {
          setPermissionExpired(true);
        } else {
          setPermissionExpired(false);
        }
      } else {
        setPermissionExpired(false);
      }
    };
    checkPermission();
  }, [autoSaveConfig]);

  const handleSaveApiKeyToggle = (enabled: boolean) => {
    setSaveApiKeyEnabled(enabled);
    localStorage.setItem(STORAGE_KEY_SAVE_API, enabled.toString());
    
    // 如果取消勾选，立即清除 localStorage 中的 API Keys
    if (!enabled) {
      localStorage.removeItem('rh_api_keys_v2');
      // 同时清空当前的 API Keys 输入框
      onUpdateApiKeys([{ id: crypto.randomUUID(), apiKey: '', concurrency: 1 }], false);
    }
  };

  if (!isOpen) return null;

  // Local handlers that wrap the prop handlers or perform local actions
  const handleAddApiKey = () => {
    onUpdateApiKeys([...apiKeys, { id: crypto.randomUUID(), apiKey: '', concurrency: 1 }], saveApiKeyEnabled);
  };

  const handleRemoveApiKey = (id: string) => {
    if (apiKeys.length <= 1) return;
    onUpdateApiKeys(apiKeys.filter(entry => entry.id !== id), saveApiKeyEnabled);
  };

  const handleApiKeyChange = (id: string, value: string) => {
    onUpdateApiKeys(apiKeys.map(entry =>
      entry.id === id ? { ...entry, apiKey: value } : entry
    ), saveApiKeyEnabled);
  };

  const handleConcurrencyChange = (id: string, value: string) => {
    const numVal = parseInt(value);
    if (isNaN(numVal) || numVal < 1) return;
    const finalVal = Math.min(numVal, 999);
    onUpdateApiKeys(apiKeys.map(entry =>
      entry.id === id ? { ...entry, concurrency: finalVal } : entry
    ), saveApiKeyEnabled);
  };

  const handleSelectDirectory = async () => {
    setIsSelectingDirectory(true);
    try {
      const dirName = await selectDirectory();
      if (dirName) {
        onUpdateAutoSave({ ...autoSaveConfig, enabled: true, directoryName: dirName });
        setPermissionExpired(false);
      }
    } catch (e: any) {
      console.error('Directory selection failed:', e);
    } finally {
      setIsSelectingDirectory(false);
    }
  };

  const handleClearDirectory = async () => {
    await clearDirectory();
    onUpdateAutoSave({ enabled: false, directoryName: null });
  };

  const fetchAllAccountInfo = async () => {
    const validKeys = apiKeys.filter(entry => entry.apiKey.trim());
    if (validKeys.length === 0) return;

    setLoadingAccount(true);
    try {
      const updatedKeys = await Promise.all(
        apiKeys.map(async (entry) => {
          if (!entry.apiKey.trim()) {
            return { ...entry, accountInfo: null, error: 'API Key 为空' };
          }
          try {
            const info = await getAccountInfo(entry.apiKey);
            return { ...entry, accountInfo: info, error: undefined };
          } catch (err: any) {
            return { ...entry, accountInfo: null, error: err.message || '获取失败' };
          }
        })
      );
      onUpdateApiKeys(updatedKeys, saveApiKeyEnabled);
    } finally {
      setLoadingAccount(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-[#1a1d24] rounded-xl shadow-2xl w-[1000px] max-w-[95vw] max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/50 flex items-center justify-between shrink-0">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <User className="w-6 h-6 text-brand-500" />
            个人中心
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors bg-slate-100 dark:bg-slate-800 p-1.5 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">

          {/* Main Content Grid */}
          <div className="grid grid-cols-12 gap-8">

            {/* Left Column: Config Inputs */}
            <div className="col-span-12 lg:col-span-5 space-y-8">

              {/* Enterprise API Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
                  <Building2 className="w-5 h-5" />
                  <h4 className="text-sm font-bold uppercase tracking-wider">企业级 - 共享API <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded ml-1">尚未支持</span></h4>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-500">
                    <Key className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    value={sharedApiKey}
                    onChange={(e) => setSharedApiKey(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 text-sm bg-brand-50/50 dark:bg-brand-900/10 border-2 border-brand-100 dark:border-brand-800/50 rounded-xl focus:ring-4 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-mono"
                    placeholder="输入企业共享 Key..."
                  />
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-800/50"></div>

              {/* Consumer API Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <User className="w-5 h-5" />
                    <h4 className="text-sm font-bold uppercase tracking-wider">消费级 - 会员API</h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddApiKey}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-brand-500 hover:text-white text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors border border-slate-200 dark:border-slate-700 hover:border-brand-500"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加 KEY
                  </button>
                </div>

                <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                  {apiKeys.map((entry, index) => (
                    <div key={entry.id} className="flex items-center gap-3 group">
                      <span className="text-xs font-mono text-slate-400 w-5 shrink-0 text-center">{index + 1}</span>
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-hover:text-brand-500 transition-colors">
                          <Key className="h-3.5 w-3.5" />
                        </div>
                        <input
                          type="password"
                          value={entry.apiKey}
                          onChange={(e) => handleApiKeyChange(entry.id, e.target.value)}
                          className="block w-full pl-9 pr-2 py-2.5 text-xs bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-mono"
                          placeholder="sk-..."
                        />
                      </div>

                      <div className="flex items-center gap-1 bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-700 rounded-lg px-2 h-[38px] shrink-0" title="并发数 (1-999)">
                        <span className="text-[10px] text-slate-400 font-bold">x</span>
                        <input
                          type="number"
                          min="1"
                          max="999"
                          value={entry.concurrency || 1}
                          onChange={(e) => handleConcurrencyChange(entry.id, e.target.value)}
                          className="w-10 h-full text-xs bg-transparent border-none outline-none text-center text-slate-800 dark:text-slate-100 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-mono"
                        />
                      </div>

                      {apiKeys.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveApiKey(entry.id)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                          title="删除此 API"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${saveApiKeyEnabled
                        ? 'bg-brand-600 border-brand-600'
                        : 'bg-slate-50 dark:bg-[#0F1115] border-slate-300 dark:border-slate-600'
                        }`}
                      onClick={() => handleSaveApiKeyToggle(!saveApiKeyEnabled)}
                    >
                      {saveApiKeyEnabled && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      本地保存 API Key
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={fetchAllAccountInfo}
                    disabled={loadingAccount || apiKeys.filter(k => k.apiKey.trim()).length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loadingAccount ? (
                      <Loader2 className="animate-spin w-3.5 h-3.5" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    刷新余额
                  </button>
                </div>
              </div>

            </div>

            {/* Right Column: Account Info & Auto Save */}
            <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
              {/* Account Info Card */}
              <div className="flex-1 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-[#13151b] dark:to-[#161920] rounded-2xl border border-slate-200 dark:border-slate-800/50 p-1">
                <div className="bg-white dark:bg-[#161920] rounded-xl h-full flex flex-col overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-800/20">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <Coins className="w-4 h-4 text-amber-500" />
                      账户概览
                    </h4>
                  </div>

                  <div className="p-0 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/30">
                        <tr className="border-b border-slate-100 dark:border-slate-800/50">
                          <th className="text-left py-3 px-4 font-semibold text-slate-500 dark:text-slate-400">API</th>
                          <th className="text-right py-3 px-4 font-semibold text-slate-500 dark:text-slate-400">RH币</th>
                          <th className="text-right py-3 px-4 font-semibold text-slate-500 dark:text-slate-400">余额</th>
                          <th className="text-center py-3 px-4 font-semibold text-slate-500 dark:text-slate-400">任务</th>
                          <th className="text-center py-3 px-4 font-semibold text-slate-500 dark:text-slate-400">类型</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/30">
                        {apiKeys.map((entry, index) => (
                          <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                            <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                              KEY {index + 1}
                            </td>
                            {entry.error ? (
                              <td colSpan={4} className="py-3 px-4 text-center text-red-500 dark:text-red-400">
                                {entry.error}
                              </td>
                            ) : entry.accountInfo ? (
                              <>
                                <td className="py-3 px-4 text-right font-bold text-amber-600 dark:text-amber-400 font-mono text-sm">
                                  {entry.accountInfo.remainCoins}
                                </td>
                                <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-mono">
                                  {entry.accountInfo.remainMoney
                                    ? `${entry.accountInfo.currency || ''} ${entry.accountInfo.remainMoney}`
                                    : '-'}
                                </td>
                                <td className="py-3 px-4 text-center text-slate-700 dark:text-slate-300 font-mono">
                                  {entry.accountInfo.currentTaskCounts}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md text-[10px] font-medium border border-slate-200 dark:border-slate-700">
                                    {entry.accountInfo.apiType}
                                  </span>
                                </td>
                              </>
                            ) : (
                              <td colSpan={4} className="py-3 px-4 text-center text-slate-400 dark:text-slate-500 italic">
                                {entry.apiKey.trim() ? '点击刷新查看' : '-'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {apiKeys.length === 0 && (
                      <div className="p-8 text-center">
                        <p className="text-slate-400 dark:text-slate-500 text-xs">请先添加左侧 API Key</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Auto Save Card */}
              <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800/50 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Save className="w-4 h-4 text-brand-500" />
                    自动保存结果
                  </h4>
                  <button
                    type="button"
                    onClick={() => onUpdateAutoSave({ ...autoSaveConfig, enabled: !autoSaveConfig.enabled })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-[#1a1d24] ${autoSaveConfig.enabled ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoSaveConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </button>
                </div>

                {!autoSaveSupported ? (
                  <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-900/20">
                    ⚠️ 您的浏览器不支持文件系统访问 API，无法使用自动保存功能。
                  </div>
                ) : (
                  <>
                    {permissionExpired && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-900/20 mb-3">
                        ⚠️ 自动保存目录的访问权限已过期，请重新选择目录以继续使用自动保存功能。
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSelectDirectory}
                        disabled={isSelectingDirectory}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs rounded-lg transition-colors shadow-sm"
                      >
                        {isSelectingDirectory ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FolderOpen className="w-3.5 h-3.5" />
                        )}
                        {autoSaveConfig.directoryName ? '重新选择目录' : '选择目录'}
                      </button>

                      <div className="flex-1 min-w-0 flex items-center gap-2 bg-white dark:bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700/50">
                        {autoSaveConfig.directoryName ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 truncate flex-1 font-mono">
                            {autoSaveConfig.directoryName}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">未选择保存目录...</span>
                        )}

                        {autoSaveConfig.directoryName && (
                          <button
                            type="button"
                            onClick={handleClearDirectory}
                            className="text-slate-400 hover:text-red-500 transition-colors p-1"
                            title="清除目录"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-8 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg shadow-lg shadow-brand-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            保存并关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
