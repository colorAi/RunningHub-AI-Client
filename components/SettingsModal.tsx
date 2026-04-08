import React, { useEffect, useState } from 'react';
import { Check, Coins, Key, Loader2, Plus, RefreshCw, Save, Trash2, User, X } from 'lucide-react';
import { ApiKeyEntry, AutoSaveConfig } from '../types';
import { getAccountInfo } from '../services/api';

const STORAGE_KEY_SHARED_API = 'rh_shared_api_key';
const STORAGE_KEY_SAVE_API = 'rh_save_api_enabled';
const CONCURRENCY_OPTIONS = [1, 3, 5, 20] as const;

const createEmptyApiKeyEntry = (): ApiKeyEntry => ({
  id: crypto.randomUUID(),
  apiKey: '',
  concurrency: 1,
  accountInfo: null,
});

const ensureApiEntries = (entries: ApiKeyEntry[]): ApiKeyEntry[] => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [createEmptyApiKeyEntry()];
  }

  return entries.map(entry => ({
    ...entry,
    concurrency: entry.concurrency || 1,
    accountInfo: entry.accountInfo ?? null,
  }));
};

const maskApiKey = (apiKey: string) => {
  const trimmed = apiKey.trim();

  if (!trimmed) {
    return '未填写 API Key';
  }

  if (trimmed.length <= 12) {
    return trimmed;
  }

  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
};

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

  const entries = ensureApiEntries(apiKeys);
  const configuredEntries = entries.filter(entry => entry.apiKey.trim());
  const totalConcurrency = configuredEntries.reduce((sum, entry) => sum + (entry.concurrency || 1), 0);

  useEffect(() => {
    localStorage.removeItem(STORAGE_KEY_SHARED_API);
  }, []);

  const updateEntries = (updater: (currentEntries: ApiKeyEntry[]) => ApiKeyEntry[], saveToStorage = saveApiKeyEnabled) => {
    const nextEntries = ensureApiEntries(updater(entries));
    onUpdateApiKeys(nextEntries, saveToStorage);
  };

  const updateEntry = (
    entryId: string,
    updater: (entry: ApiKeyEntry) => ApiKeyEntry,
    saveToStorage = saveApiKeyEnabled,
  ) => {
    updateEntries(
      currentEntries =>
        currentEntries.map(entry =>
          entry.id === entryId
            ? updater({
                ...entry,
                concurrency: entry.concurrency || 1,
                accountInfo: entry.accountInfo ?? null,
              })
            : entry,
        ),
      saveToStorage,
    );
  };

  const handleSaveApiKeyToggle = (enabled: boolean) => {
    setSaveApiKeyEnabled(enabled);
    localStorage.setItem(STORAGE_KEY_SAVE_API, enabled.toString());

    if (!enabled) {
      localStorage.removeItem('rh_api_keys_v2');
      onUpdateApiKeys([createEmptyApiKeyEntry()], false);
    }
  };

  const handleAddEntry = () => {
    updateEntries(currentEntries => [...currentEntries, createEmptyApiKeyEntry()]);
  };

  const handleRemoveEntry = (entryId: string) => {
    updateEntries(currentEntries => {
      if (currentEntries.length <= 1) {
        return [{ ...createEmptyApiKeyEntry(), id: currentEntries[0]?.id || crypto.randomUUID() }];
      }

      return currentEntries.filter(entry => entry.id !== entryId);
    });
  };

  const handleApiKeyChange = (entryId: string, value: string) => {
    updateEntry(entryId, entry => ({
      ...entry,
      apiKey: value,
      accountInfo: value.trim() === entry.apiKey.trim() ? entry.accountInfo : null,
      error: undefined,
    }));
  };

  const handleConcurrencySelect = (entryId: string, value: typeof CONCURRENCY_OPTIONS[number]) => {
    updateEntry(entryId, entry => ({
      ...entry,
      concurrency: value,
    }));
  };

  const handleRefreshAccountInfo = async (entryId: string) => {
    const targetEntry = entries.find(entry => entry.id === entryId);

    if (!targetEntry?.apiKey.trim()) {
      return;
    }

    setLoadingAccount(true);
    updateEntry(entryId, entry => ({
      ...entry,
      loading: true,
      error: undefined,
    }));

    try {
      const accountInfo = await getAccountInfo(targetEntry.apiKey);
      updateEntry(entryId, entry => ({
        ...entry,
        accountInfo,
        loading: false,
        error: undefined,
      }));
    } catch (error: any) {
      updateEntry(entryId, entry => ({
        ...entry,
        accountInfo: null,
        loading: false,
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
        className="flex max-h-[90vh] w-[1320px] max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1a1d24]"
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
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-slate-800 dark:text-white">
                      <Key className="h-5 w-5 text-brand-500" />
                      <h4 className="text-base font-bold">API 设置</h4>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      默认保留 1 个 API 输入框，可以继续新增更多。任务会按所有 API 的并发槽位自动分配，每个 API 可单独设置并发数。
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddEntry}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
                  >
                    <Plus className="h-4 w-4" />
                    新增 API
                  </button>
                </div>

                <div className="mb-4 rounded-xl border border-dashed border-brand-200 bg-brand-50/60 px-4 py-3 dark:border-brand-900/40 dark:bg-brand-900/10">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">当前可用调度槽位</div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        已配置 API {configuredEntries.length} 个，总并发槽位 {totalConcurrency}
                      </p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-sm font-bold text-brand-600 shadow-sm dark:bg-[#0F1115] dark:text-brand-300">
                      {totalConcurrency}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {entries.map((entry, index) => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0F1115]"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-800 dark:text-white">API {index + 1}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {entry.apiKey.trim()
                              ? `${maskApiKey(entry.apiKey)} · 并发 ${entry.concurrency || 1}`
                              : '未填写，当前不会参与任务调度'}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRefreshAccountInfo(entry.id)}
                            disabled={loadingAccount || entry.loading || !entry.apiKey.trim()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            {entry.loading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            刷新余额
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveEntry(entry.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                          填写 API KEY
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                            <Key className="h-4 w-4" />
                          </div>
                          <input
                            type="password"
                            value={entry.apiKey}
                            onChange={(event) => handleApiKeyChange(entry.id, event.target.value)}
                            className="block w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-100"
                            placeholder="填写 API KEY"
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="mb-2">
                          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            API 并发数
                          </label>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {CONCURRENCY_OPTIONS.map((option) => {
                            const isActive = (entry.concurrency || 1) === option;

                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => handleConcurrencySelect(entry.id, option)}
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
                          每个 API 的并发独立生效，批量任务和多任务模式会按总槽位数调度。
                        </p>
                      </div>

                      {entry.error && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                          {entry.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
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

                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    关闭后会清空本地已保存的 API 列表
                  </span>
                </div>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-7">
              <div className="h-full rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/50 dark:bg-[#161920]">
                <div className="mb-5 flex items-center gap-2">
                  <Coins className="h-5 w-5 text-amber-500" />
                  <h4 className="text-base font-bold text-slate-800 dark:text-white">账户概览</h4>
                </div>

                {configuredEntries.length > 0 ? (
                  <div className="space-y-4">
                    {entries.map((entry, index) => (
                      <div
                        key={`account-${entry.id}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/20"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-800 dark:text-white">API {index + 1}</div>
                            <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                              {maskApiKey(entry.apiKey)}
                            </div>
                          </div>
                          <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm dark:bg-[#0F1115] dark:text-slate-300">
                            并发 {entry.concurrency || 1}
                          </div>
                        </div>

                        {entry.error ? (
                          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                            {entry.error}
                          </div>
                        ) : entry.accountInfo ? (
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#161920]">
                              <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">RH 币</div>
                              <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
                                {entry.accountInfo.remainCoins}
                              </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#161920]">
                              <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">钱包余额</div>
                              <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                {entry.accountInfo.remainMoney
                                  ? `${entry.accountInfo.currency || ''} ${entry.accountInfo.remainMoney}`
                                  : '-'}
                              </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#161920]">
                              <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">当前任务</div>
                              <div className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
                                {entry.accountInfo.currentTaskCounts}
                              </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#161920]">
                              <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">API 类型</div>
                              <div className="mt-2 text-lg font-bold text-slate-800 dark:text-slate-100">
                                {entry.accountInfo.apiType}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-8 text-center dark:border-slate-800 dark:bg-[#161920]">
                            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                              {entry.apiKey.trim()
                                ? '已填写 API Key，点击左侧“刷新余额”即可拉取该 API 的账户信息。'
                                : '这条 API 还未填写，填写后即可参与任务分发。'}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center dark:border-slate-800 dark:bg-slate-900/20">
                    <p className="max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                      先在左侧填写至少 1 个 API Key。恢复多 API 后，这里会分别展示每个 API 的账户信息和并发配置。
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
