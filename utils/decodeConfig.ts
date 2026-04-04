import { DecodeConfig } from '../types';

export const DEFAULT_DECODE_CONFIG: DecodeConfig = {
  enabled: false,
  password: '',
  autoDecodeEnabled: false,
  alwaysOn: false,
};

export const normalizeDecodeConfig = (config?: Partial<DecodeConfig> | null): DecodeConfig => ({
  enabled: !!config?.enabled,
  password: typeof config?.password === 'string' ? config.password : '',
  autoDecodeEnabled: !!config?.autoDecodeEnabled,
  alwaysOn: !!config?.alwaysOn,
});

export const isDecodeFeatureEnabled = (config: DecodeConfig): boolean =>
  !!config.alwaysOn || !!config.enabled;

export const shouldAutoDecodeOutputs = (config: DecodeConfig): boolean =>
  !!config.alwaysOn || (!!config.enabled && !!config.autoDecodeEnabled);
