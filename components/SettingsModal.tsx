import React, { useEffect, useState } from 'react';
import { Check, Coins, Key, Loader2, RefreshCw, Save, User, X } from 'lucide-react';
import { ApiKeyEntry, AutoSaveConfig } from '../types';
import { getAccountInfo } from '../services/api';

const STORAGE_KEY_SHARED_API = 'rh_shared_api_key';
const STORAGE_KEY_SAVE_API = 'rh_save_api_enabled';
const CONCURRENCY_OPTIONS = [1, 3, 5, 20] as const;

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
}) => {
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [saveApiKeyEnabled, setSaveApiKeyEnabled] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_SAVE_API) === 'true';
  });

  const primaryEntry: ApiKeyEntry = apiKeys[0] ?? {
    id: 'primary-api-key',
    apiKey: '',
    concurrency: 1,
    accountInfo: null,
  };

  useEffect(() => {
    localStorage.removeItem(STORAGE_KEY_SHARED_API);
  }, []);

  const updatePrimaryEntry = (updater: (entry: ApiKeyEntry) => ApiKeyEntry, saveToStorage = saveApiKeyEnabled) => {
    const nextEntry = updater({
      ...primaryEntry,
      concurrency: primaryEntry.concurrency || 1,
    });

    onUpdateApiKeys([nextEntry], saveToStorage);
  };

  const handleSaveApiKeyToggle = (enabled: boolean) => {
    setSaveApiKeyEnabled(enabled);
    localStorage.setItem(STORAGE_KEY_SAVE_API, enabled.toString());

    if (!enabled) {
      localStorage.removeItem('rh_api_keys_v2');
      updatePrimaryEntry(
        (entry) => ({
          ...entry,
          apiKey: '',
          accountInfo: null,
          error: undefined,
        }),
        false,
      );
    }
  };

  const handleApiKeyChange = (value: string) => {
    updatePrimaryEntry((entry) => ({
      ...entry,
      apiKey: value,
      accountInfo: value.trim() === entry.apiKey.trim() ? entry.accountInfo : null,
      error: undefined,
    }));
  };

  const handleConcurrencySelect = (value: typeof CONCURRENCY_OPTIONS[number]) => {
    updatePrimaryEntry((entry) => ({
      ...entry,
      concurrency: value,
    }));
  };

  const handleRefreshAccountInfo = async () => {
    if (!primaryEntry.apiKey.trim()) {
      return;
    }

    setLoadingAccount(true);

    try {
      const accountInfo = await getAccountInfo(primaryEntry.apiKey);
      updatePrimaryEntry((entry) => ({
        ...entry,
        accountInfo,
        error: undefined,
      }));
    } catch (error: any) {
      updatePrimaryEntry((entry) => ({
        ...entry,
        accountInfo: null,
        error: error?.message || '获取账户信息失败',
      }));
    } finally {
      setLoadingAccount(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="flex max-h-[90vh] w-[840px] max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1a1d24]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800/50">
          <h3 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white">
            <User className="h-6 w-6 text-brand-500" />
            个人中心
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 p-1.5 text-slate-400 transition-colors hover:text-slate-600 dark:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800/50 dark:bg-slate-900/30">
                <div className="mb-5">
                  <div className="flex items-center gap-2 text-slate-800 dark:text-white">
                    <Key className="h-5 w-5 text-brand-500" />
                    <h4 className="text-base font-bold">API 设置</h4>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    企业 API 和会员 API 现在共用同一个 Key。填写任意可用 API Key 即可使用，企业 Key 消耗钱包，会员 Key 消耗 RH 币。
                  </p>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      填写API KEY
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                        <Key className="h-4 w-4" />
                      </div>
                      <input
                        type="password"
                        value={primaryEntry.apiKey}
                        onChange={(event) => handleApiKeyChange(event.target.value)}
                        className="block w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-100"
                        placeholder="填写API KEY"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        API 并发数
                      </label>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {CONCURRENCY_OPTIONS.map((option) => {
                        const isActive = (primaryEntry.concurrency || 1) === option;

                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => handleConcurrencySelect(option)}
                            className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                              isActive
                                ? 'border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-600 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-300 dark:hover:border-brand-700 dark:hover:text-brand-400'
                            }`}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                      用于批量任务和多任务调度时的本地并发控制。
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <label className="flex cursor-pointer items-center gap-2 select-none">
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                          saveApiKeyEnabled
                            ? 'border-brand-600 bg-brand-600'
                            : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-[#0F1115]'
                        }`}
                        onClick={() => handleSaveApiKeyToggle(!saveApiKeyEnabled)}
                      >
                        {saveApiKeyEnabled && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <span className="text-sm text-slate-600 dark:text-slate-400">本地保存 API Key</span>
                    </label>

                    <button
                      type="button"
                      onClick={handleRefreshAccountInfo}
                      disabled={loadingAccount || !primaryEntry.apiKey.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      {loadingAccount ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      刷新余额
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-7">
              <div className="h-full rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/50 dark:bg-[#161920]">
                <div className="mb-5 flex items-center gap-2">
                  <Coins className="h-5 w-5 text-amber-500" />
                  <h4 className="text-base font-bold text-slate-800 dark:text-white">账户概览</h4>
                </div>

                {primaryEntry.error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                    {primaryEntry.error}
                  </div>
                ) : primaryEntry.accountInfo ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                      <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">RH 币</div>
                      <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
                        {primaryEntry.accountInfo.remainCoins}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                      <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">钱包余额</div>
                      <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {primaryEntry.accountInfo.remainMoney
                          ? `${primaryEntry.accountInfo.currency || ''} ${primaryEntry.accountInfo.remainMoney}`
                          : '-'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                      <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">当前任务</div>
                      <div className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
                        {primaryEntry.accountInfo.currentTaskCounts}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                      <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">API 类型</div>
                      <div className="mt-2 text-lg font-bold text-slate-800 dark:text-slate-100">
                        {primaryEntry.accountInfo.apiType}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center dark:border-slate-800 dark:bg-slate-900/20">
                    <p className="max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                      {primaryEntry.apiKey.trim()
                        ? '已填写 API Key，点击“刷新余额”后可查看当前账户的 RH 币、钱包余额和任务占用情况。'
                        : '先在左侧填写 API Key，个人中心会使用这个唯一入口来读取企业或会员账户信息。'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 p-6 dark:border-slate-800/50">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-8 py-2.5 font-semibold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-700"
          >
            <Save className="h-4 w-4" />
            保存并关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
