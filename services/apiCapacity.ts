import { ApiKeyConfig } from '../types';
import { getAccountInfo } from './api';

const PROBE_TTL_MS = 2500;

export interface ApiCapacitySnapshot {
  apiKey: string;
  configuredSlots: number;
  localInFlight: number;
  externalInFlight: number;
  remoteInFlight: number;
  availableSlots: number;
  currentTaskCountsRaw: string | null;
}

export const parseCurrentTaskCounts = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  const raw = String(value ?? '').trim();
  if (!raw) {
    return 0;
  }

  const match = raw.match(/\d+/);
  return match ? Math.max(0, parseInt(match[0], 10) || 0) : 0;
};

export class ApiCapacityManager {
  readonly apiKey: string;
  readonly configuredSlots: number;
  readonly index: number;

  private localInFlight = 0;
  private externalInFlight = 0;
  private remoteInFlight = 0;
  private currentTaskCountsRaw: string | null = null;
  private lastProbeAt = 0;
  private probePromise: Promise<ApiCapacitySnapshot> | null = null;

  constructor(config: ApiKeyConfig, index: number) {
    this.apiKey = config.apiKey.trim();
    this.configuredSlots = Math.max(1, config.concurrency || 1);
    this.index = index;
  }

  getSnapshot(): ApiCapacitySnapshot {
    return {
      apiKey: this.apiKey,
      configuredSlots: this.configuredSlots,
      localInFlight: this.localInFlight,
      externalInFlight: this.externalInFlight,
      remoteInFlight: this.remoteInFlight,
      availableSlots: Math.max(0, this.configuredSlots - this.localInFlight - this.externalInFlight),
      currentTaskCountsRaw: this.currentTaskCountsRaw,
    };
  }

  async probe(force = false): Promise<ApiCapacitySnapshot> {
    const now = Date.now();
    if (!force && !this.probePromise && now - this.lastProbeAt < PROBE_TTL_MS) {
      return this.getSnapshot();
    }

    if (this.probePromise) {
      return this.probePromise;
    }

    this.probePromise = (async () => {
      try {
        const accountInfo = await getAccountInfo(this.apiKey);
        const remoteInFlight = parseCurrentTaskCounts(accountInfo.currentTaskCounts);

        this.remoteInFlight = remoteInFlight;
        this.currentTaskCountsRaw = accountInfo.currentTaskCounts ?? null;
        this.externalInFlight = Math.max(0, remoteInFlight - this.localInFlight);
        this.lastProbeAt = Date.now();

        return this.getSnapshot();
      } finally {
        this.probePromise = null;
      }
    })();

    return this.probePromise;
  }

  reserveSlot(): boolean {
    if (this.getSnapshot().availableSlots <= 0) {
      return false;
    }

    this.localInFlight += 1;
    return true;
  }

  releaseSlot(): void {
    this.localInFlight = Math.max(0, this.localInFlight - 1);
  }

  markProbeStale(): void {
    this.lastProbeAt = 0;
  }
}

export const createApiCapacityManagers = (apiConfigs: ApiKeyConfig[]): ApiCapacityManager[] =>
  apiConfigs
    .filter(config => config.apiKey.trim())
    .map((config, index) => new ApiCapacityManager(config, index));
