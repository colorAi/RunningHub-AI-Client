import type { RunningHubRegion, RunningHubRegionMode } from '../types';

export const RUNNING_HUB_HOSTS: Record<RunningHubRegion, string> = {
  cn: 'https://www.runninghub.cn',
  global: 'https://www.runninghub.ai',
};

export const RUNNING_HUB_REGION_MODE_STORAGE_KEY = 'rh_runninghub_region_mode';
export const RUNNING_HUB_REGION_CHANGE_EVENT = 'runninghub-region-change';

const LAST_REGION_STORAGE_KEY = 'rh_runninghub_last_region';
const resolvedApiRegions = new Map<string, RunningHubRegion>();
const pendingApiRegionResolutions = new Map<string, Promise<RunningHubRegion>>();

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Region detection still works in memory when storage is unavailable.
  }
};

const dispatchRegionChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(RUNNING_HUB_REGION_CHANGE_EVENT));
  }
};

export const getRunningHubRegionMode = (): RunningHubRegionMode => {
  const value = readStorage(RUNNING_HUB_REGION_MODE_STORAGE_KEY);
  return value === 'cn' || value === 'global' ? value : 'auto';
};

export const setRunningHubRegionMode = (mode: RunningHubRegionMode) => {
  writeStorage(RUNNING_HUB_REGION_MODE_STORAGE_KEY, mode);
  dispatchRegionChange();
};

const inferRegionFromLocale = (): RunningHubRegion => {
  try {
    const language = navigator.language.toLowerCase();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (language === 'zh-cn' || language === 'zh-sg' || timeZone === 'Asia/Shanghai') {
      return 'cn';
    }
  } catch {
    // Fall through to the global site.
  }
  return 'global';
};

export const getPreferredRunningHubRegion = (): RunningHubRegion => {
  const mode = getRunningHubRegionMode();
  if (mode !== 'auto') return mode;

  const lastRegion = readStorage(LAST_REGION_STORAGE_KEY);
  if (lastRegion === 'cn' || lastRegion === 'global') return lastRegion;
  return inferRegionFromLocale();
};

export const getRunningHubHost = (region: RunningHubRegion): string => RUNNING_HUB_HOSTS[region];

export const getOtherRunningHubRegion = (region: RunningHubRegion): RunningHubRegion =>
  region === 'cn' ? 'global' : 'cn';

export const rememberRunningHubRegion = (apiKey: string, region: RunningHubRegion) => {
  const normalizedKey = apiKey.trim();
  if (normalizedKey) resolvedApiRegions.set(normalizedKey, region);

  if (readStorage(LAST_REGION_STORAGE_KEY) !== region) {
    writeStorage(LAST_REGION_STORAGE_KEY, region);
    dispatchRegionChange();
  }
};

export const getResolvedRunningHubRegion = (apiKey?: string): RunningHubRegion => {
  const mode = getRunningHubRegionMode();
  if (mode !== 'auto') return mode;
  const normalizedKey = apiKey?.trim();
  return (normalizedKey && resolvedApiRegions.get(normalizedKey)) || getPreferredRunningHubRegion();
};

const probeApiKeyRegion = async (apiKey: string, region: RunningHubRegion): Promise<boolean> => {
  try {
    const response = await fetch(`${getRunningHubHost(region)}/openapi/v2/queue/status`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) return false;
    const json = await response.json();
    return json?.code === 0 && !!json?.data;
  } catch {
    return false;
  }
};

export const resolveRunningHubRegion = async (
  apiKey: string,
  regionHint?: RunningHubRegion,
): Promise<RunningHubRegion> => {
  const mode = getRunningHubRegionMode();
  if (mode !== 'auto') return mode;
  if (regionHint) return regionHint;

  const normalizedKey = apiKey.trim();
  if (!normalizedKey) return getPreferredRunningHubRegion();

  const cached = resolvedApiRegions.get(normalizedKey);
  if (cached) return cached;

  const pending = pendingApiRegionResolutions.get(normalizedKey);
  if (pending) return pending;

  const resolution = (async () => {
    const preferred = getPreferredRunningHubRegion();
    const other = getOtherRunningHubRegion(preferred);
    const preferredMatches = await probeApiKeyRegion(normalizedKey, preferred);
    const otherMatches = preferredMatches ? false : await probeApiKeyRegion(normalizedKey, other);

    const region = preferredMatches ? preferred : otherMatches ? other : preferred;
    if (preferredMatches || otherMatches) rememberRunningHubRegion(normalizedKey, region);
    return region;
  })();

  pendingApiRegionResolutions.set(normalizedKey, resolution);
  try {
    return await resolution;
  } finally {
    pendingApiRegionResolutions.delete(normalizedKey);
  }
};

export interface ParsedRunningHubAppInput {
  appId: string;
  region?: RunningHubRegion;
}

export const parseRunningHubAppInput = (value: string): ParsedRunningHubAppInput => {
  const trimmed = value.trim();
  if (!trimmed) return { appId: '' };

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const region = host === 'runninghub.ai' || host.endsWith('.runninghub.ai')
      ? 'global'
      : host === 'runninghub.cn' || host.endsWith('.runninghub.cn')
        ? 'cn'
        : undefined;
    if (!region) return { appId: trimmed };

    const queryId = url.searchParams.get('webappId') || url.searchParams.get('appId');
    const pathId = url.pathname.split('/').filter(Boolean).reverse().find(part => /^\d+$/.test(part));
    return { appId: (queryId || pathId || trimmed).trim(), region };
  } catch {
    return { appId: trimmed };
  }
};

export const getRunningHubRegionLabel = (region: RunningHubRegion): string =>
  region === 'cn' ? '国内站' : '海外站';
