import { saveMultipleFiles } from './autoSaveService';
import { buildFileUrl, uploadFile, uploadMediaV2 } from './api';
import {
  SkillCapability,
  SkillCatalog,
  SkillParamDefinition,
  SkillRunOutput,
  SkillTaskResult,
  SkillRunUsage,
  TaskRuntimeStatus,
} from '../types';

const API_HOST = 'https://www.runninghub.cn';
const DEFAULT_POLL_INTERVAL_MS = 4000;
const CATALOG_URL = new URL('../RH_Skills/runninghub/data/capabilities.json', import.meta.url).href;
const MEDIA_TYPES = new Set(['IMAGE', 'VIDEO', 'AUDIO']);

type SkillFieldValue = string | number | boolean | string[] | undefined;
type SkillValues = Record<string, SkillFieldValue>;
type SkillFiles = Record<string, File[]>;

interface WrappedResponse<T> {
  code: number;
  msg?: string;
  message?: string;
  data: T;
}

let catalogPromise: Promise<SkillCatalog> | null = null;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isWrappedResponse = <T,>(value: any): value is WrappedResponse<T> =>
  !!value && typeof value === 'object' && 'code' in value && 'data' in value;

const normalizeTaskStatus = (status: any): TaskRuntimeStatus => {
  switch (String(status || '').toUpperCase()) {
    case 'SUCCESS':
      return 'SUCCESS';
    case 'FAILED':
      return 'FAILED';
    case 'RUNNING':
      return 'RUNNING';
    case 'QUEUED':
    case 'PENDING':
    default:
      return 'QUEUED';
  }
};

const toDisplayName = (capability: SkillCapability) =>
  capability.name_cn || capability.name_en || capability.endpoint;

const splitLines = (value: string) =>
  value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);

const normalizeUrls = (value: SkillFieldValue, multiple?: boolean): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  if (multiple) {
    return splitLines(value);
  }

  return value.trim() ? [value.trim()] : [];
};

const getDefaultValue = (param: SkillParamDefinition): SkillFieldValue => {
  if (param.default !== undefined) {
    return param.default;
  }

  if (param.type === 'BOOLEAN') {
    return false;
  }

  if (param.type === 'LIST') {
    return param.options?.[0] || '';
  }

  if (param.multiple) {
    return [];
  }

  return '';
};

const coercePrimitiveValue = (param: SkillParamDefinition, value: SkillFieldValue) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (param.type === 'BOOLEAN') {
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
  }

  if (param.type === 'INT') {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : value;
  }

  if (param.type === 'FLOAT') {
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : value;
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return value;
};

const normalizeOutput = (item: any): SkillRunOutput | null => {
  const fileUrl = item?.fileUrl || item?.url || item?.outputUrl || item?.download_url || '';
  const text = item?.text || item?.content || item?.output || item?.message || '';

  if (fileUrl) {
    return {
      kind: 'file',
      fileUrl,
      downloadUrl: item?.download_url || fileUrl,
      fileType: item?.fileType || item?.outputType || item?.type || undefined,
    };
  }

  if (text) {
    return {
      kind: 'text',
      text: String(text),
    };
  }

  return null;
};

const normalizeOutputs = (items: any[] | null | undefined): SkillRunOutput[] =>
  Array.isArray(items) ? items.map(normalizeOutput).filter((item): item is SkillRunOutput => !!item) : [];

const uploadSkillMedia = async (apiKey: string, file: File): Promise<string> => {
  try {
    const result = await uploadMediaV2(apiKey, file);
    return result.downloadUrl || buildFileUrl(result.fileName);
  } catch {
    const fallback = await uploadFile(apiKey, file);
    return fallback.downloadUrl || buildFileUrl(fallback.fileName);
  }
};

const resolveMediaValue = async (
  apiKey: string,
  param: SkillParamDefinition,
  value: SkillFieldValue,
  files: File[] | undefined,
  onLog?: (message: string) => void,
): Promise<string | string[] | undefined> => {
  const typedUrls = normalizeUrls(value, param.multiple);
  const uploadedUrls: string[] = [];

  if (files?.length) {
    for (const file of files) {
      onLog?.(`上传素材 ${file.name}`);
      uploadedUrls.push(await uploadSkillMedia(apiKey, file));
    }
  }

  const merged = param.multiple
    ? [...typedUrls, ...uploadedUrls]
    : uploadedUrls.length > 0
      ? [uploadedUrls[0]]
      : typedUrls.slice(0, 1);

  if (merged.length === 0) {
    return undefined;
  }

  if (param.multiple) {
    return param.maxCount ? merged.slice(0, param.maxCount) : merged;
  }

  return merged[0];
};

const buildPayload = async (
  apiKey: string,
  capability: SkillCapability,
  values: SkillValues,
  files: SkillFiles,
  onLog?: (message: string) => void,
) => {
  const payload: Record<string, any> = {};
  const missing: string[] = [];

  for (const param of capability.params) {
    let normalizedValue: any;

    if (MEDIA_TYPES.has(param.type)) {
      normalizedValue = await resolveMediaValue(apiKey, param, values[param.key], files[param.key], onLog);
    } else {
      normalizedValue = coercePrimitiveValue(param, values[param.key]);
    }

    const hasValue = Array.isArray(normalizedValue)
      ? normalizedValue.length > 0
      : normalizedValue !== undefined && normalizedValue !== null && normalizedValue !== '';

    if (hasValue) {
      payload[param.key] = normalizedValue;
      continue;
    }

    if (param.required && param.default !== undefined) {
      payload[param.key] = param.default;
      continue;
    }

    if (param.required) {
      missing.push(param.key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`请先补全必填参数：${missing.join('、')}`);
  }

  return payload;
};

const saveSkillOutputs = async (
  outputs: SkillRunOutput[],
  capability: SkillCapability,
  enabled: boolean,
): Promise<number> => {
  if (!enabled || outputs.length === 0) {
    return 0;
  }

  const filesToSave = outputs.flatMap((output, index) => {
    if (output.kind === 'file' && output.fileUrl) {
      return [
        {
          url: output.fileUrl,
          extension: output.fileType,
          filename: `${capability.task}_${index + 1}`,
          sequential: true,
        },
      ];
    }

    if (output.kind === 'text' && output.text) {
      const blob = new Blob([output.text], { type: 'text/plain;charset=utf-8' });
      return [
        {
          url: URL.createObjectURL(blob),
          extension: 'txt',
          filename: `${capability.task}_${index + 1}`,
          sequential: true,
        },
      ];
    }

    return [];
  });

  const savedCount = await saveMultipleFiles(filesToSave);

  for (const item of filesToSave) {
    if (item.url.startsWith('blob:')) {
      URL.revokeObjectURL(item.url);
    }
  }

  return savedCount;
};

const querySkillTask = async (apiKey: string, taskId: string): Promise<SkillTaskResult> => {
  const response = await fetch(`${API_HOST}/openapi/v2/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ taskId }),
  });

  if (!response.ok) {
    throw new Error(`查询结果失败: HTTP ${response.status}`);
  }

  const json = await response.json();
  const body = isWrappedResponse<any>(json) ? json.data : json;

  if (!body?.taskId) {
    throw new Error('查询结果失败：返回内容无效');
  }

  return {
    taskId: String(body.taskId),
    status: normalizeTaskStatus(body.status),
    errorCode: body.errorCode == null || body.errorCode === '' ? null : String(body.errorCode),
    errorMessage: body.errorMessage == null || body.errorMessage === '' ? null : String(body.errorMessage),
    outputs: normalizeOutputs(body.results),
    usage: body.usage as SkillRunUsage | undefined,
  };
};

export const loadSkillsCatalog = async (): Promise<SkillCatalog> => {
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL).then(async response => {
      if (!response.ok) {
        throw new Error('读取 skills 目录失败');
      }
      return response.json() as Promise<SkillCatalog>;
    });
  }

  return catalogPromise;
};

export const createSkillDefaults = (capability: SkillCapability): SkillValues =>
  capability.params.reduce<SkillValues>((acc, param) => {
    acc[param.key] = getDefaultValue(param);
    return acc;
  }, {});

export const createSkillTitle = (capability: SkillCapability) => toDisplayName(capability);

export const executeSkillTask = async (params: {
  apiKey: string;
  capability: SkillCapability;
  values: SkillValues;
  files: SkillFiles;
  autoSaveEnabled: boolean;
  onLog?: (message: string) => void;
  onTaskCreated?: (taskId: string) => void;
}): Promise<SkillTaskResult & { savedCount: number }> => {
  const payload = await buildPayload(
    params.apiKey,
    params.capability,
    params.values,
    params.files,
    params.onLog,
  );

  params.onLog?.(`提交技能 ${toDisplayName(params.capability)}`);

  const response = await fetch(`${API_HOST}/openapi/v2/${params.capability.endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`提交失败: HTTP ${response.status}`);
  }

  const submitResult = await response.json();
  const taskId = submitResult?.taskId ? String(submitResult.taskId) : '';

  if (!taskId) {
    throw new Error(submitResult?.message || submitResult?.msg || '提交失败，未返回 taskId');
  }

  params.onTaskCreated?.(taskId);

  let latest: SkillTaskResult = {
    taskId,
    status: normalizeTaskStatus(submitResult?.status),
    errorCode: submitResult?.errorCode == null ? null : String(submitResult.errorCode),
    errorMessage: submitResult?.errorMessage == null ? null : String(submitResult.errorMessage),
    outputs: normalizeOutputs(submitResult?.results),
    usage: submitResult?.usage as SkillRunUsage | undefined,
  };

  while (latest.status === 'QUEUED' || latest.status === 'RUNNING') {
    await sleep(DEFAULT_POLL_INTERVAL_MS);
    latest = await querySkillTask(params.apiKey, taskId);
    params.onLog?.(latest.status === 'RUNNING' ? '任务运行中...' : '任务排队中...');
  }

  if (latest.status !== 'SUCCESS') {
    throw new Error(latest.errorMessage || latest.errorCode || '技能运行失败');
  }

  const savedCount = await saveSkillOutputs(latest.outputs, params.capability, params.autoSaveEnabled);

  if (savedCount > 0) {
    params.onLog?.(`已自动保存 ${savedCount} 个结果`);
  }

  return { ...latest, savedCount };
};
