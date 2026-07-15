import {
  ApiResponse,
  ApiInfo,
  ApiQueueStatus,
  InstanceType,
  NodeInfo,
  PromptTips,
  RunningHubModelPricePreview,
  RunningHubStandardModel,
  RunningHubStandardModelParam,
  SubmitTaskData,
  TaskOutput,
  TaskRuntimeStatus,
  UploadData,
  WebAppInfo,
  RunningHubRegion,
} from '../types';
import {
  getPreferredRunningHubRegion,
  getResolvedRunningHubRegion,
  getRunningHubHost,
  parseRunningHubAppInput,
  rememberRunningHubRegion,
  resolveRunningHubRegion,
} from './runningHubRegion';

export const DEFAULT_STANDARD_MODEL_REGISTRY_URL = 'https://raw.githubusercontent.com/HM-RunningHub/ComfyUI_RH_OpenAPI/main/models_registry.json';

const RH_ERROR_MESSAGES: Record<string, string> = {
  '401': 'API Key 校验失败，请检查 Key 是否正确。',
  '403': '当前接口没有访问权限，请检查账号或实例配置。',
  '435': 'Plus 实例未找到，请稍后重试或切回标准模式。',
  '803': '节点参数与应用定义不匹配，请重新加载应用参数后再试。',
  '804': '任务正在运行中，请稍候查询结果。',
  '805': '任务执行失败，请查看节点错误详情。',
  '813': '任务正在排队中，请稍候查询结果。',
  '1003': '请求过快，已触发限流，请稍后重试。',
  '1008': '上传文件过大，请压缩后重试。',
  '1501': '内容审核未通过，请调整输入内容后再试。',
};

type JsonRecord = Record<string, any>;

const buildAuthHeaders = (apiKey: string, extraHeaders: Record<string, string> = {}) => ({
  Authorization: `Bearer ${apiKey}`,
  ...extraHeaders,
});

const isWrappedApiResponse = (value: any): value is ApiResponse<any> =>
  !!value && typeof value === 'object' && 'code' in value && ('msg' in value || 'message' in value);

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

const normalizePromptTips = (promptTips: unknown): PromptTips | string | null => {
  if (!promptTips) return null;

  if (typeof promptTips === 'string') {
    try {
      return JSON.parse(promptTips) as PromptTips;
    } catch {
      return promptTips;
    }
  }

  if (typeof promptTips === 'object') {
    return promptTips as PromptTips;
  }

  return null;
};

const normalizeTaskOutput = (item: any): TaskOutput => ({
  fileUrl: item?.fileUrl || item?.url || item?.download_url || '',
  fileType: item?.fileType || item?.outputType || item?.type || undefined,
  downloadUrl: item?.download_url || item?.fileUrl || item?.url || undefined,
});

const normalizeTaskOutputs = (items: any[] | null | undefined): TaskOutput[] =>
  Array.isArray(items) ? items.map(normalizeTaskOutput).filter(item => item.fileUrl) : [];

const normalizeCover = (cover: any) => ({
  thumbnailUri: cover?.thumbnailUri || cover?.thumbnail_url || cover?.url || cover?.fileUri || '',
  uri: cover?.uri || cover?.url || cover?.fileUri || cover?.thumbnailUri || '',
});

const normalizeNodeInfo = (node: any): NodeInfo => {
  const rawFieldType = String(node?.fieldType || 'STRING').toUpperCase();
  let fieldType: NodeInfo['fieldType'];

  switch (rawFieldType) {
    case 'IMAGE':
    case 'AUDIO':
    case 'VIDEO':
    case 'STRING':
    case 'INT':
    case 'FLOAT':
    case 'LIST':
    case 'SWITCH':
    case 'BOOLEAN':
      fieldType = rawFieldType as NodeInfo['fieldType'];
      break;
    default:
      fieldType = 'STRING';
      break;
  }

  return {
    ...node,
    nodeId: String(node?.nodeId ?? ''),
    nodeName: node?.nodeName || '',
    fieldName: node?.fieldName || '',
    fieldValue: node?.fieldValue == null ? '' : String(node.fieldValue),
    fieldType,
    description: node?.description || node?.desc || '',
    descriptionEn: node?.descriptionEn || node?.description_en || undefined,
    fieldData: node?.fieldData ?? node?.field_data ?? node?.options ?? undefined,
  };
};

const normalizeModelParam = (record: JsonRecord): RunningHubStandardModelParam | null => {
  const fieldKey = String(record.fieldKey ?? record.key ?? record.fieldName ?? '').trim();
  if (!fieldKey) {
    return null;
  }

  const rawType = String(record.type ?? record.fieldType ?? 'STRING').toUpperCase();
  const type = (['IMAGE', 'AUDIO', 'VIDEO', 'STRING', 'INT', 'FLOAT', 'LIST', 'SWITCH', 'BOOLEAN'].includes(rawType)
    ? rawType
    : 'STRING') as NodeInfo['fieldType'];
  const maxInputNum = Number(record.maxInputNum ?? record.maxCount);

  return {
    fieldKey,
    type,
    required: record.required === true,
    label: typeof record.label === 'string' ? record.label : undefined,
    description: typeof record.description === 'string' ? record.description : undefined,
    descriptionEn: typeof record.descriptionEn === 'string' ? record.descriptionEn : undefined,
    defaultValue: record.defaultValue ?? record.default,
    options: Array.isArray(record.options) ? record.options : undefined,
    multipleInputs: record.multipleInputs === true || record.multiple === true,
    maxInputNum: Number.isFinite(maxInputNum) ? maxInputNum : undefined,
  };
};

const normalizeStandardModel = (record: JsonRecord): RunningHubStandardModel | null => {
  const endpoint = String(record.endpoint ?? '').trim().replace(/^\/+/, '');
  if (!endpoint) {
    return null;
  }

  return {
    className: String(record.class_name ?? record.className ?? endpoint).trim(),
    displayName: String(record.display_name ?? record.displayName ?? record.name_cn ?? endpoint).trim(),
    nameCn: typeof record.name_cn === 'string' ? record.name_cn : undefined,
    nameEn: typeof record.name_en === 'string' ? record.name_en : undefined,
    endpoint,
    outputType: String(record.output_type ?? record.outputType ?? 'file').toLowerCase() as RunningHubStandardModel['outputType'],
    category: typeof record.category === 'string' ? record.category : undefined,
    params: Array.isArray(record.params)
      ? record.params
        .map((item: any) => normalizeModelParam(item as JsonRecord))
        .filter((item: RunningHubStandardModelParam | null): item is RunningHubStandardModelParam => Boolean(item))
      : [],
  };
};

export const standardModelToNodes = (model: RunningHubStandardModel): NodeInfo[] =>
  model.params.map(param => ({
    nodeId: 'model',
    nodeName: param.label || param.fieldKey,
    fieldName: param.fieldKey,
    fieldValue: param.defaultValue == null ? '' : String(param.defaultValue),
    fieldType: param.type,
    description: param.description || param.label,
    descriptionEn: param.descriptionEn,
    fieldData: param.options,
    required: param.required,
    multipleInputs: param.multipleInputs,
    maxInputNum: param.maxInputNum,
  }));

const normalizeWebAppInfo = (data: any): WebAppInfo | null => {
  if (!data?.webappName) {
    return null;
  }

  return {
    webappName: data.webappName,
    description: data.description || '',
    descriptionEn: data.descriptionEn || undefined,
    covers: Array.isArray(data.covers) ? data.covers.map(normalizeCover) : undefined,
    tags: data.tags,
    statisticsInfo: data.statisticsInfo,
  };
};

const normalizeLegacyQueryStatus = (code: number): TaskRuntimeStatus => {
  if (code === 0) return 'SUCCESS';
  if (code === 804) return 'RUNNING';
  if (code === 813) return 'QUEUED';
  return 'FAILED';
};

const createRunningHubError = (code?: string | number | null, fallbackMessage?: string | null) => {
  const error = new Error(getRunningHubErrorMessage(code, fallbackMessage)) as Error & { code?: string };
  if (code != null && String(code).trim()) {
    error.code = String(code);
  }
  return error;
};

export const getRunningHubErrorMessage = (code?: string | number | null, fallbackMessage?: string | null): string => {
  const normalizedCode = code == null ? '' : String(code);
  if (normalizedCode && RH_ERROR_MESSAGES[normalizedCode]) {
    return RH_ERROR_MESSAGES[normalizedCode];
  }
  if (fallbackMessage && String(fallbackMessage).trim()) {
    return String(fallbackMessage).trim();
  }
  return '请求失败，请稍后重试。';
};

export const isCapacityLimitedError = (error: unknown): boolean => {
  const code = String((error as { code?: string | number } | null)?.code ?? '').trim();
  if (code === '421' || code === '1003' || code === '1520') {
    return true;
  }

  const message = String((error as { message?: string } | null)?.message ?? '').toLowerCase();
  return message.includes('concurrency limit')
    || message.includes('rate limit')
    || message.includes('并发')
    || message.includes('限流');
};

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const buildFileUrl = (value: string, apiKey?: string): string => {
  if (!value) return '';
  if (/^(https?:\/\/|data:)/i.test(value)) return value;
  return `${getRunningHubHost(getResolvedRunningHubRegion(apiKey))}/task/openapi/view/${value}`;
};

export interface GetNodeListResult {
  nodes: NodeInfo[];
  appInfo: WebAppInfo | null;
}

export const getNodeList = async (apiKey: string, webappId: string): Promise<GetNodeListResult> => {
  const parsedInput = parseRunningHubAppInput(webappId);
  const region = await resolveRunningHubRegion(apiKey, parsedInput.region);
  const url = `${getRunningHubHost(region)}/api/webapp/apiCallDemo?apiKey=${encodeURIComponent(apiKey)}&webappId=${encodeURIComponent(parsedInput.appId)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...buildAuthHeaders(apiKey),
    },
  });

  const json = await handleResponse<ApiResponse<any>>(response);

  if (json.code !== 0 || !json.data?.nodeInfoList) {
    throw new Error(getRunningHubErrorMessage(json.code, json.msg || 'Failed to fetch node list'));
  }

  rememberRunningHubRegion(apiKey, region);

  return {
    nodes: json.data.nodeInfoList.map(normalizeNodeInfo),
    appInfo: normalizeWebAppInfo(json.data),
  };
};

export const fetchWorkflowTemplate = async (
  webappId: string,
  apiKey?: string,
): Promise<{ success: boolean; data?: GetNodeListResult; error?: string }> => {
  try {
    let key = apiKey || '';
    if (!key) {
      try {
        const storedStr = localStorage.getItem('rh_api_keys_v2');
        if (storedStr) {
          const keys = JSON.parse(storedStr);
          if (Array.isArray(keys) && keys.length > 0) {
            key = keys[0].apiKey || '';
          }
        }
      } catch {
        // ignore localStorage parse issues
      }
    }

    if (!key) {
      return { success: false, error: '请先配置 API Key' };
    }

    const result = await getNodeList(key, webappId);
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || '获取工作流失败' };
  }
};

export const uploadMediaV2 = async (apiKey: string, file: File): Promise<UploadData> => {
  const region = await resolveRunningHubRegion(apiKey);
  const url = `${getRunningHubHost(region)}/openapi/v2/media/upload/binary`;
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  const json = await handleResponse<any>(response);

  if (json.code !== 0) {
    throw createRunningHubError(json.code, json.message || json.msg || 'Upload failed');
  }

  return {
    fileName: json.data?.fileName || '',
    fileType: json.data?.type || file.type || undefined,
    downloadUrl: json.data?.download_url || undefined,
    size: json.data?.size || undefined,
  };
};

const legacyUploadFile = async (apiKey: string, file: File): Promise<UploadData> => {
  const region = await resolveRunningHubRegion(apiKey);
  const url = `${getRunningHubHost(region)}/task/openapi/upload`;
  const formData = new FormData();
  formData.append('apiKey', apiKey);
  formData.append('fileType', 'input');
  formData.append('file', file);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  const json = await handleResponse<ApiResponse<UploadData>>(response);

  if (json.code !== 0) {
    throw createRunningHubError(json.code, json.msg || 'Upload failed');
  }

  return {
    fileName: json.data?.fileName || '',
    fileType: json.data?.fileType || file.type || undefined,
  };
};

export const uploadFile = async (apiKey: string, file: File): Promise<UploadData> => {
  try {
    return await uploadMediaV2(apiKey, file);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (/HTTP Error: 404|HTTP Error: 405|HTTP Error: 500|Failed to fetch/i.test(message)) {
      return legacyUploadFile(apiKey, file);
    }
    throw error;
  }
};

export const submitTask = async (
  apiKey: string,
  webappId: string,
  nodeInfoList: NodeInfo[],
  instanceType?: InstanceType,
): Promise<SubmitTaskData> => {
  const parsedInput = parseRunningHubAppInput(webappId);
  const region = await resolveRunningHubRegion(apiKey, parsedInput.region);
  const url = `${getRunningHubHost(region)}/task/openapi/ai-app/run`;
  const payload = {
    webappId: parsedInput.appId,
    apiKey,
    nodeInfoList,
    ...(instanceType && { instanceType }),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(apiKey),
    },
    body: JSON.stringify(payload),
  });

  const json = await handleResponse<ApiResponse<any>>(response);

  if (json.code !== 0) {
    throw createRunningHubError(json.code, json.msg || 'Submission failed');
  }

  return {
    taskId: String(json.data?.taskId || ''),
    clientId: json.data?.clientId || null,
    netWssUrl: json.data?.netWssUrl || null,
    taskStatus: json.data?.taskStatus ? normalizeTaskStatus(json.data.taskStatus) : null,
    promptTips:
      typeof json.data?.promptTips === 'string'
        ? json.data.promptTips
        : json.data?.promptTips
          ? JSON.stringify(json.data.promptTips)
          : undefined,
  };
};

export interface QueryTaskResultV2 {
  taskId: string;
  status: TaskRuntimeStatus;
  errorCode: string | null;
  errorMessage: string | null;
  results: TaskOutput[];
  clientId: string | null;
  promptTips: PromptTips | string | null;
  failedReason?: {
    node_name: string;
    exception_message: string;
    traceback: string;
  };
  usage?: {
    thirdPartyConsumeMoney: string;
    consumeMoney: string;
    consumeCoins: string;
    taskCostTime: string;
  };
}

export interface TaskOutputData {
  fileUrl: string;
  fileType: string;
  taskCostTime: string;
  nodeId: string;
  thirdPartyConsumeMoney: string | null;
  consumeMoney: string | null;
  consumeCoins: string;
}

export interface QueryTaskResponse extends ApiResponse<TaskOutput[] | any> {
  usage?: {
    thirdPartyConsumeMoney: string;
    consumeMoney: string;
    consumeCoins: string;
    taskCostTime: string;
  };
  status?: TaskRuntimeStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  clientId?: string | null;
  promptTips?: PromptTips | string | null;
}

export const queryTaskResultV2 = async (apiKey: string, taskId: string): Promise<QueryTaskResultV2> => {
  const region = await resolveRunningHubRegion(apiKey);
  const url = `${getRunningHubHost(region)}/openapi/v2/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(apiKey),
    },
    body: JSON.stringify({ taskId }),
  });

  const json = await handleResponse<any>(response);
  const body = isWrappedApiResponse(json) ? json.data : json;

  if (!body || !body.taskId) {
    throw new Error('Invalid v2 query response');
  }

  return {
    taskId: String(body.taskId),
    status: normalizeTaskStatus(body.status),
    errorCode: body.errorCode == null || body.errorCode === '' ? null : String(body.errorCode),
    errorMessage: body.errorMessage == null || body.errorMessage === '' ? null : String(body.errorMessage),
    results: normalizeTaskOutputs(body.results),
    clientId: body.clientId == null || body.clientId === '' ? null : String(body.clientId),
    promptTips: normalizePromptTips(body.promptTips),
  };
};

export const queryTaskOutputs = async (apiKey: string, taskId: string): Promise<QueryTaskResponse> => {
  const region = await resolveRunningHubRegion(apiKey);
  const url = `${getRunningHubHost(region)}/task/openapi/outputs`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(apiKey),
    },
    body: JSON.stringify({ apiKey, taskId }),
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const code = json.code;
  let responseData: TaskOutput[] | { failedReason: any } = [];
  let usage: QueryTaskResponse['usage'];

  if (code === 0 && Array.isArray(json.data) && json.data.length > 0) {
    responseData = json.data.map(normalizeTaskOutput);
    const firstItem = json.data[0] as TaskOutputData;
    usage = {
      thirdPartyConsumeMoney: firstItem.thirdPartyConsumeMoney || '0',
      consumeMoney: firstItem.consumeMoney || '0',
      consumeCoins: firstItem.consumeCoins || '0',
      taskCostTime: firstItem.taskCostTime || '0',
    };
  } else if (code === 805 && json.data?.failedReason) {
    responseData = { failedReason: json.data.failedReason };
  }

  return {
    code,
    msg: json.msg || '',
    data: responseData,
    usage,
    status: normalizeLegacyQueryStatus(code),
    errorCode: code === 0 ? null : String(code),
    errorMessage: code === 0 ? null : getRunningHubErrorMessage(code, json.msg || ''),
  };
};

export const queryTaskResult = async (apiKey: string, taskId: string): Promise<QueryTaskResultV2> => {
  try {
    const v2Result = await queryTaskResultV2(apiKey, taskId);

    if (v2Result.status === 'SUCCESS' || v2Result.status === 'FAILED') {
      try {
        const legacyResult = await queryTaskOutputs(apiKey, taskId);
        return {
          ...v2Result,
          results: v2Result.results.length > 0 ? v2Result.results : normalizeTaskOutputs(legacyResult.data as any[]),
          failedReason: legacyResult.data?.failedReason || undefined,
          usage: legacyResult.usage,
        };
      } catch {
        return v2Result;
      }
    }

    return v2Result;
  } catch {
    const legacyResult = await queryTaskOutputs(apiKey, taskId);
    return {
      taskId,
      status: legacyResult.status || 'FAILED',
      errorCode: legacyResult.errorCode || null,
      errorMessage: legacyResult.errorMessage || null,
      results: Array.isArray(legacyResult.data) ? legacyResult.data : [],
      clientId: legacyResult.clientId || null,
      promptTips: legacyResult.promptTips || null,
      failedReason: legacyResult.data?.failedReason || undefined,
      usage: legacyResult.usage,
    };
  }
};

export const getAccountInfo = async (apiKey: string, resolvedRegion?: RunningHubRegion): Promise<{
  remainCoins: string;
  currentTaskCounts: string;
  remainMoney: string | null;
  currency: string | null;
  apiType: string;
}> => {
  const region = resolvedRegion || await resolveRunningHubRegion(apiKey);
  const url = `${getRunningHubHost(region)}/uc/openapi/accountStatus`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(apiKey),
    },
    body: JSON.stringify({ apikey: apiKey }),
  });

  const json = await handleResponse<
    ApiResponse<{
      remainCoins: string;
      currentTaskCounts: string;
      remainMoney: string | null;
      currency: string | null;
      apiType: string;
    }>
  >(response);

  if (json.code !== 0) {
    throw createRunningHubError(json.code, json.msg || 'Failed to get account info');
  }

  return json.data;
};

export const getApiQueueStatus = async (apiKey: string, resolvedRegion?: RunningHubRegion): Promise<ApiQueueStatus> => {
  const region = resolvedRegion || await resolveRunningHubRegion(apiKey);
  const response = await fetch(`${getRunningHubHost(region)}/openapi/v2/queue/status`, {
    method: 'GET',
    headers: buildAuthHeaders(apiKey),
  });

  const json = await handleResponse<ApiResponse<ApiQueueStatus>>(response);

  if (json.code !== 0 || !json.data) {
    throw createRunningHubError(json.code, json.msg || 'Failed to get API queue status');
  }

  return {
    apiKeyType: json.data.apiKeyType || '',
    concurrentLimit: Math.max(1, Number(json.data.concurrentLimit) || 1),
    runningCount: String(json.data.runningCount ?? '0'),
    queuedCount: String(json.data.queuedCount ?? '0'),
    totalCurrentTasks: String(json.data.totalCurrentTasks ?? '0'),
  };
};

export const getApiInfo = async (apiKey: string): Promise<ApiInfo> => {
  const region = await resolveRunningHubRegion(apiKey);
  const [account, queue] = await Promise.all([
    getAccountInfo(apiKey, region),
    getApiQueueStatus(apiKey, region),
  ]);

  rememberRunningHubRegion(apiKey, region);

  return {
    account: {
      ...account,
      apiType: queue.apiKeyType || account.apiType,
    },
    queue,
    region,
  };
};

export const getStandardModelRegistry = async (
  registryUrl = DEFAULT_STANDARD_MODEL_REGISTRY_URL,
): Promise<RunningHubStandardModel[]> => {
  const response = await fetch(registryUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const json = await handleResponse<unknown>(response);
  if (!Array.isArray(json)) {
    throw new Error('标准模型列表返回格式无效');
  }

  return json
    .map(item => normalizeStandardModel(item as JsonRecord))
    .filter((item): item is RunningHubStandardModel => Boolean(item));
};

const coerceStandardModelPayloadValue = (node: NodeInfo): unknown => {
  const rawValue = node.fieldValue;
  if (node.fieldType === 'INT') {
    const value = Number.parseInt(rawValue, 10);
    return Number.isFinite(value) ? value : rawValue;
  }
  if (node.fieldType === 'FLOAT') {
    const value = Number.parseFloat(rawValue);
    return Number.isFinite(value) ? value : rawValue;
  }
  if (node.fieldType === 'BOOLEAN' || node.fieldType === 'SWITCH') {
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
  }
  if (node.multipleInputs && rawValue.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to raw value.
    }
  }
  return rawValue;
};

export const buildStandardModelPayload = (nodes: NodeInfo[]): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};
  nodes.forEach(node => {
    const value = node.fieldValue;
    if ((value != null && String(value).trim() !== '') || node.required) {
      payload[node.fieldName] = coerceStandardModelPayloadValue(node);
    }
  });
  return payload;
};

export const fetchStandardModelPricePreview = async (
  apiKey: string,
  endpoint: string,
  nodesOrPayload: NodeInfo[] | Record<string, unknown>,
  baseUrl?: string,
  signal?: AbortSignal,
): Promise<RunningHubModelPricePreview> => {
  const normalizedEndpoint = endpoint.trim().replace(/^\/+/, '');
  if (!normalizedEndpoint) {
    throw new Error('请先选择标准模型');
  }

  const payload = Array.isArray(nodesOrPayload)
    ? buildStandardModelPayload(nodesOrPayload)
    : nodesOrPayload;

  const resolvedBaseUrl = baseUrl || `${getRunningHubHost(await resolveRunningHubRegion(apiKey))}/openapi/v2`;
  const response = await fetch(`${resolvedBaseUrl.replace(/\/+$/, '')}/price-preview/${normalizedEndpoint}`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(apiKey),
    },
    body: JSON.stringify({
      ...payload,
      appCode: payload.appCode ?? 'runninghub_client_standard_model',
    }),
  });

  const json = await handleResponse<any>(response);
  const errorCode = json.errorCode ?? json.error_code;
  const errorMessage = json.errorMessage ?? json.error_message;

  if (errorCode || errorMessage) {
    throw createRunningHubError(errorCode, String(errorMessage || '标准模型价格预估失败'));
  }

  const estimatedPrice = Number(json.estimatedPrice ?? json.estimated_price);
  const freeLimitCount = Number(json.freeLimitCount ?? json.free_limit_count);
  const remainingFreeLimitCount = Number(json.remainingFreeLimitCount ?? json.remaining_free_limit_count);

  return {
    estimatedPrice: Number.isFinite(estimatedPrice) ? estimatedPrice : null,
    currency: typeof json.currency === 'string' ? json.currency : null,
    priceText: typeof json.priceText === 'string' ? json.priceText : null,
    priceTextEn: typeof json.priceTextEn === 'string' ? json.priceTextEn : null,
    freeLimit: json.freeLimit === true || json.free_limit === true,
    freeLimitCount: Number.isFinite(freeLimitCount) ? freeLimitCount : null,
    remainingFreeLimitCount: Number.isFinite(remainingFreeLimitCount) ? remainingFreeLimitCount : null,
    isFreeThisCall: json.isFreeThisCall === true || json.is_free_this_call === true,
  };
};

export const submitStandardModelTask = async (
  apiKey: string,
  endpoint: string,
  nodesOrPayload: NodeInfo[] | Record<string, unknown>,
  baseUrl?: string,
): Promise<SubmitTaskData> => {
  const normalizedEndpoint = endpoint.trim().replace(/^\/+/, '');
  if (!normalizedEndpoint) {
    throw new Error('请先选择标准模型');
  }

  const payload = Array.isArray(nodesOrPayload)
    ? buildStandardModelPayload(nodesOrPayload)
    : nodesOrPayload;

  const resolvedBaseUrl = baseUrl || `${getRunningHubHost(await resolveRunningHubRegion(apiKey))}/openapi/v2`;
  const response = await fetch(`${resolvedBaseUrl.replace(/\/+$/, '')}/${normalizedEndpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(apiKey),
    },
    body: JSON.stringify({
      ...payload,
      appCode: payload.appCode ?? 'runninghub_client_standard_model',
    }),
  });

  const json = await handleResponse<any>(response);
  const errorCode = json.errorCode ?? json.error_code;
  const errorMessage = json.errorMessage ?? json.error_message;

  if (errorCode || errorMessage) {
    throw createRunningHubError(errorCode, String(errorMessage || '标准模型提交失败'));
  }

  const taskId = String(json.taskId ?? json.task_id ?? '').trim();
  if (!taskId) {
    throw new Error('标准模型提交后未返回 taskId');
  }

  return {
    taskId,
    taskStatus: normalizeTaskStatus(json.status ?? json.taskStatus ?? 'QUEUED'),
  };
};

export interface AppListItem {
  id: string;
  name: string;
  intro: string;
  covers: {
    fileUri?: string;
    url?: string;
    thumbnailUri: string;
    imageWidth: number;
    imageHeight: number;
    type: string;
  }[];
  owner?: {
    id: string;
    name: string;
    avatar: string;
  };
  statisticsInfo?: {
    viewCount: number | string;
    useCount: number | string;
    likeCount: number | string;
    collectCount: number | string;
  };
}

const normalizeAppListItem = (record: JsonRecord): AppListItem => ({
  id: String(record.id || ''),
  name: String(record.name || ''),
  intro: String(record.intro || ''),
  owner: record.owner,
  statisticsInfo: record.statisticsInfo,
  covers: Array.isArray(record.covers)
    ? record.covers.map((cover: any) => ({
      ...cover,
      fileUri: cover.fileUri || cover.url || cover.thumbnailUri,
      url: cover.url || cover.fileUri || cover.thumbnailUri,
    }))
    : [],
});

export const getOfficialAppList = async (
  page: number = 1,
  size: number = 50,
  sort: string = 'RECOMMEND',
  search?: string,
): Promise<{
  records: AppListItem[];
  total: number;
}> => {
  const url = `${getRunningHubHost(getPreferredRunningHubRegion())}/api/webapp/list`;
  const body: JsonRecord = {
    current: page,
    size,
    carefullyChosen: true,
    sort,
  };

  if (search && search.trim()) {
    body.search = search.trim();
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await handleResponse<ApiResponse<any>>(response);

  if (json.code !== 0) {
    throw new Error(json.msg || 'Failed to fetch app list');
  }

  return {
    records: (json.data.records || []).map(normalizeAppListItem),
    total: parseInt(json.data.total, 10) || 0,
  };
};

export const getAppDetailById = async (appId: string): Promise<AppListItem | null> => {
  const parsedInput = parseRunningHubAppInput(appId);
  const region = parsedInput.region || getPreferredRunningHubRegion();
  const url = `${getRunningHubHost(region)}/api/webapp/list`;
  const body = {
    current: 1,
    size: 1,
    search: parsedInput.appId,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = await handleResponse<ApiResponse<any>>(response);

    if (json.code !== 0 || !json.data?.records?.length) {
      return null;
    }

    const app = normalizeAppListItem(json.data.records[0]);
    return app.id === parsedInput.appId ? app : null;
  } catch {
    return null;
  }
};
