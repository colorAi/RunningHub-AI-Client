import type { ApiKeyEntry, AutoSaveConfig, HomeDefaultTab } from '../types';

export const STORAGE_KEY_API_KEYS = 'rh_api_keys_v2';
export const STORAGE_KEY_ENTERPRISE_API = 'rh_enterprise_api_v1';
export const STORAGE_KEY_AUTOSAVE = 'rh_autosave_config';
export const STORAGE_KEY_FAVORITES = 'rh_favorites';
export const STORAGE_KEY_RECENT = 'rh_recent_apps';
export const STORAGE_KEY_STARTUP_VIEW = 'rh_startup_view';
export const STORAGE_KEY_HOME_DEFAULT_TAB = 'rh_home_default_tab';

export type AppView = 'home' | 'workspace' | 'multitask' | 'cards' | 'tools';
export type StartupView = Exclude<AppView, 'tools' | 'cards'>;

export const normalizeAutoSaveConfig = (config?: Partial<AutoSaveConfig> | null): AutoSaveConfig => ({
  enabled: !!config?.enabled && !!(config?.directoryName || config?.directoryPath),
  directoryName: config?.directoryName || null,
  directoryPath: config?.directoryPath || null,
});

export const createEmptyApiKeyEntry = (): ApiKeyEntry => ({
  id: crypto.randomUUID(),
  apiKey: '',
  concurrency: 1,
});

export const normalizeApiKeyEntry = (entry?: Partial<ApiKeyEntry> | null): ApiKeyEntry => {
  const normalizedConcurrency = Number(entry?.concurrency);

  return {
    id: entry?.id || crypto.randomUUID(),
    apiKey: typeof entry?.apiKey === 'string' ? entry.apiKey : '',
    concurrency: Number.isFinite(normalizedConcurrency) && normalizedConcurrency > 0
      ? Math.floor(normalizedConcurrency)
      : 1,
    accountInfo: entry?.accountInfo ?? null,
    apiInfo: entry?.apiInfo ?? null,
    loading: entry?.loading,
    error: entry?.error,
  };
};

export const normalizeApiKeys = (entries?: Partial<ApiKeyEntry>[] | null): ApiKeyEntry[] => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [createEmptyApiKeyEntry()];
  }

  const normalized = entries.map(entry => normalizeApiKeyEntry(entry));
  return normalized.length > 0 ? normalized : [createEmptyApiKeyEntry()];
};

export const normalizeStartupView = (value?: string | null): StartupView => {
  if (value === 'workspace' || value === 'multitask') {
    return value;
  }

  return 'home';
};

export const normalizeHomeDefaultTab = (value?: string | null): HomeDefaultTab => {
  if (value === 'official' || value === 'support') {
    return value;
  }

  return 'support';
};
