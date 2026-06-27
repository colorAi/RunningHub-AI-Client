import React, { useEffect, useState } from 'react';
import { Check, Coins, Key, Loader2, Plus, RefreshCw, Save, Trash2, User, X } from 'lucide-react';
import { ApiInfo, ApiKeyEntry, AutoSaveConfig } from '../types';
import { getApiInfo } from '../services/api';

const STORAGE_KEY_SAVE_API = 'rh_save_api_enabled';

const createEmptyApiKeyEntry = (): ApiKeyEntry => ({
  id: crypto.randomUUID(),
  apiKey: '',
  concurrency: 1,
  accountInfo: null,
  apiInfo: null,
});

const ensureEntry = (entry?: ApiKeyEntry | null): ApiKeyEntry => ({
  ...createEmptyApiKeyEntry(),
  ...(entry || {}),
  concurrency: Math.max(1, Number(entry?.concurrency) || 1),
  accountInfo: entry?.accountInfo ?? null,
  apiInfo: entry?.apiInfo ?? null,
});

const ensureApiEntries = (entries: ApiKeyEntry[]): ApiKeyEntry[] => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [createEmptyApiKeyEntry()];
  }
  return entries.map(ensureEntry);
};

const maskApiKey = (apiKey: string) => {
  const trimmed = apiKey.trim();
  if (!trimmed) return '未填写 API Key';
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
};

const formatApiType = (apiType?: string | null) => {
  const normalized = String(apiType || '').trim().toUpperCase();
  const typeMap: Record<string, string> = {
    CONSUMER: '消费级',
    PERSONAL: '消费级',
    NORMAL: '消费级',
    ENTERPRISE: '企业',
    SHARED: '共享',
    ENTERPRISE_SHARED: '企业共享',
    ENTERPRISE_SHARE: '企业共享',
    CORP_SHARED: '企业共享',
    CORPORATE_SHARED: '企业共享',
  };
  return typeMap[normalized] || apiType || '-';
};

const getConcurrencyFromInfo = (info?: ApiInfo | null) =>
  Math.max(1, Number(info?.queue?.concurrentLimit) || 1);

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKeys: ApiKeyEntry[];
  enterpriseApi: ApiKeyEntry;
  onUpdateApiKeys: (keys: ApiKeyEntry[], saveToStorage?: boolean) => void;
  onUpdateEnterpriseApi: (key: ApiKeyEntry, saveToStorage?: boolean) => void;
  autoSaveConfig: AutoSaveConfig;
  onUpdateAutoSave: (config: AutoSaveConfig) => void;
}

const AccountCards: React.FC<{ entry: ApiKeyEntry; title: string }> = ({ entry, title }) => {
  const info = entry.apiInfo;
  const account = info?.account || entry.accountInfo;
  const queue = info?.queue;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/20">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-800 dark:text-white">{title}</div>
          <div className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">{maskApiKey(entry.apiKey)}</div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-slate-500 shadow-sm dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-300">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">并发</span>
          <span>{entry.concurrency || getConcurrencyFromInfo(info)}</span>
        </div>
      </div>

      {entry.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {entry.error}
        </div>
      ) : account ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-4">
          {[
            ['RH 币', account.remainCoins, 'text-amber-600 dark:text-amber-400'],
            [`钱包余额${account.currency ? ` (${account.currency})` : ''}`, account.remainMoney || '-', 'text-emerald-600 dark:text-emerald-400'],
            ['API 类型', formatApiType(account.apiType || queue?.apiKeyType), 'text-slate-800 dark:text-slate-100'],
            ['运行 / 排队', queue ? `${queue.runningCount} / ${queue.queuedCount}` : account.currentTaskCounts, 'text-slate-800 dark:text-slate-100'],
          ].map(([label, value, color]) => (
            <div key={label} className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-[#161920]">
              <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
              <div className={`mt-1.5 truncate text-base font-bold leading-tight tracking-tight ${color}`} title={String(value)}>
                {value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center dark:border-slate-800 dark:bg-[#161920]">
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
            {entry.apiKey.trim() ? '点击“获取信息”拉取余额和并发上限。' : '这条 API 还未填写。'}
          </p>
        </div>
      )}
    </div>
  );
};

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiKeys,
  enterpriseApi,
  onUpdateApiKeys,
  onUpdateEnterpriseApi,
}) => {
  const [loadingAny, setLoadingAny] = useState(false);
  const [saveApiKeyEnabled, setSaveApiKeyEnabled] = useState(() => localStorage.getItem(STORAGE_KEY_SAVE_API) === 'true');

  const entries = ensureApiEntries(apiKeys);
  const enterpriseEntry = ensureEntry(enterpriseApi);
  const configuredEntries = entries.filter(entry => entry.apiKey.trim());
  const totalConsumerConcurrency = configuredEntries.reduce((sum, entry) => sum + (entry.concurrency || 1), 0);
  const enterpriseConcurrency = enterpriseEntry.apiKey.trim() ? enterpriseEntry.concurrency || 1 : 0;

  const updateEntries = (updater: (currentEntries: ApiKeyEntry[]) => ApiKeyEntry[], saveToStorage = saveApiKeyEnabled) => {
    onUpdateApiKeys(ensureApiEntries(updater(entries)), saveToStorage);
  };

  const updateEntry = (
    entryId: string,
    updater: (entry: ApiKeyEntry) => ApiKeyEntry,
    saveToStorage = saveApiKeyEnabled,
  ) => {
    updateEntries(
      currentEntries => currentEntries.map(entry => entry.id === entryId ? ensureEntry(updater(ensureEntry(entry))) : entry),
      saveToStorage,
    );
  };

  const handleSaveApiKeyToggle = (enabled: boolean) => {
    setSaveApiKeyEnabled(enabled);
    localStorage.setItem(STORAGE_KEY_SAVE_API, enabled.toString());
    if (!enabled) {
      localStorage.removeItem('rh_api_keys_v2');
      localStorage.removeItem('rh_enterprise_api_v1');
      onUpdateApiKeys([createEmptyApiKeyEntry()], false);
      onUpdateEnterpriseApi(createEmptyApiKeyEntry(), false);
    }
  };

  const handleRefreshEntry = async (entryId: string) => {
    const targetEntry = entries.find(entry => entry.id === entryId);
    if (!targetEntry?.apiKey.trim()) return;

    setLoadingAny(true);
    updateEntry(entryId, entry => ({ ...entry, loading: true, error: undefined }));
    try {
      const apiInfo = await getApiInfo(targetEntry.apiKey);
      updateEntry(entryId, entry => ({
        ...entry,
        concurrency: getConcurrencyFromInfo(apiInfo),
        accountInfo: apiInfo.account,
        apiInfo,
        loading: false,
        error: undefined,
      }));
    } catch (error: any) {
      updateEntry(entryId, entry => ({
        ...entry,
        accountInfo: null,
        apiInfo: null,
        loading: false,
        error: error?.message || '获取 API 信息失败',
      }));
    } finally {
      setLoadingAny(false);
    }
  };

  const handleRefreshEnterprise = async () => {
    if (!enterpriseEntry.apiKey.trim()) return;

    setLoadingAny(true);
    onUpdateEnterpriseApi({ ...enterpriseEntry, loading: true, error: undefined }, saveApiKeyEnabled);
    try {
      const apiInfo = await getApiInfo(enterpriseEntry.apiKey);
      onUpdateEnterpriseApi({
        ...enterpriseEntry,
        concurrency: getConcurrencyFromInfo(apiInfo),
        accountInfo: apiInfo.account,
        apiInfo,
        loading: false,
        error: undefined,
      }, saveApiKeyEnabled);
    } catch (error: any) {
      onUpdateEnterpriseApi({
        ...enterpriseEntry,
        accountInfo: null,
        apiInfo: null,
        loading: false,
        error: error?.message || '获取企业共享 API 信息失败',
      }, saveApiKeyEnabled);
    } finally {
      setLoadingAny(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const filledEnterprise = enterpriseEntry.apiKey.trim();
    if (filledEnterprise.length > 12 && !enterpriseEntry.apiInfo && !enterpriseEntry.loading) {
      const timer = window.setTimeout(() => void handleRefreshEnterprise(), 500);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, enterpriseEntry.apiKey]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[88vh] w-[1320px] max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1a1d24]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800/50">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid h-full grid-cols-12 items-start gap-4">
            <div className="col-span-12 min-h-0 lg:col-span-5 lg:h-full">
              <div className="flex h-full min-h-[560px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800/50 dark:bg-slate-900/30">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-slate-800 dark:text-white">
                      <Key className="h-5 w-5 text-brand-500" />
                      <h4 className="text-base font-bold">API 设置</h4>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      消费级 API 用于 AI 应用和多任务；企业共享 API 用于标准模型 API。并发数会从 RunningHub 自动获取。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateEntries(currentEntries => [...currentEntries, createEmptyApiKeyEntry()])}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600"
                  >
                    <Plus className="h-4 w-4" />
                    新增消费 API
                  </button>
                </div>

                <div className="mb-3 flex gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-dashed border-brand-200 bg-brand-50/60 px-3 py-2 dark:border-brand-900/40 dark:bg-brand-900/10">
                    <div className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">AI 应用槽位</div>
                    <div className="text-sm font-bold text-brand-600 dark:text-brand-300">{totalConsumerConcurrency}</div>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-dashed border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-900/10">
                    <div className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">标准模型槽位</div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-300">{enterpriseConcurrency}</div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  <div className="rounded-xl border border-emerald-200 bg-white p-3 shadow-sm dark:border-emerald-900/50 dark:bg-[#0F1115]">
                    <div className="mb-2.5 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-white">企业共享 API</div>
                        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                          {enterpriseEntry.apiKey.trim()
                            ? `${maskApiKey(enterpriseEntry.apiKey)} · 并发 ${enterpriseEntry.concurrency || 1}`
                            : '用于标准模型 API 模块'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRefreshEnterprise()}
                        disabled={loadingAny || enterpriseEntry.loading || !enterpriseEntry.apiKey.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-900/20 dark:text-emerald-300"
                      >
                        {enterpriseEntry.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        获取信息
                      </button>
                    </div>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                        <Key className="h-4 w-4" />
                      </div>
                      <input
                        type="password"
                        value={enterpriseEntry.apiKey}
                        onChange={(event) => onUpdateEnterpriseApi({
                          ...enterpriseEntry,
                          apiKey: event.target.value,
                          accountInfo: event.target.value.trim() === enterpriseEntry.apiKey.trim() ? enterpriseEntry.accountInfo : null,
                          apiInfo: event.target.value.trim() === enterpriseEntry.apiKey.trim() ? enterpriseEntry.apiInfo : null,
                          error: undefined,
                        }, saveApiKeyEnabled)}
                        className="block w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-100"
                        placeholder="填写企业共享 API KEY"
                      />
                    </div>
                    {enterpriseEntry.error && (
                      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                        {enterpriseEntry.error}
                      </div>
                    )}
                  </div>

                  {entries.map((entry, index) => (
                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#0F1115]">
                      <div className="mb-2.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-800 dark:text-white">消费级 API {index + 1}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {entry.apiKey.trim()
                              ? `${maskApiKey(entry.apiKey)} · 并发 ${entry.concurrency || 1}`
                              : '用于 AI 应用、多任务调度'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleRefreshEntry(entry.id)}
                            disabled={loadingAny || entry.loading || !entry.apiKey.trim()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            {entry.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            获取信息
                          </button>
                          <button
                            type="button"
                            onClick={() => updateEntries(currentEntries => (
                              currentEntries.length <= 1
                                ? [{ ...createEmptyApiKeyEntry(), id: currentEntries[0]?.id || crypto.randomUUID() }]
                                : currentEntries.filter(current => current.id !== entry.id)
                            ))}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                          <Key className="h-4 w-4" />
                        </div>
                        <input
                          type="password"
                          value={entry.apiKey}
                          onChange={(event) => updateEntry(entry.id, current => ({
                            ...current,
                            apiKey: event.target.value,
                            accountInfo: event.target.value.trim() === current.apiKey.trim() ? current.accountInfo : null,
                            apiInfo: event.target.value.trim() === current.apiKey.trim() ? current.apiInfo : null,
                            error: undefined,
                          }))}
                          className="block w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-100"
                          placeholder="填写消费级 API KEY"
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                        并发数由 RunningHub 队列接口自动获取。
                      </p>
                      {entry.error && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                          {entry.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

              </div>
            </div>

            <div className="col-span-12 lg:col-span-7">
              <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800/50 dark:bg-[#161920]">
                <div className="mb-3 flex items-center gap-2">
                  <Coins className="h-5 w-5 text-amber-500" />
                  <h4 className="text-base font-bold text-slate-800 dark:text-white">账户概览</h4>
                </div>

                <div className="space-y-3">
                  <AccountCards entry={enterpriseEntry} title="企业共享 API" />
                  {entries.map((entry, index) => (
                    <AccountCards key={`account-${entry.id}`} entry={entry} title={`消费级 API ${index + 1}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-6 py-4 dark:border-slate-800/50">
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
            <span className="hidden text-xs text-slate-400 dark:text-slate-500 sm:inline">关闭后清空本地已保存 API</span>
          </label>
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
