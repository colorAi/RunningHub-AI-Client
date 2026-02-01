import { ApiResponse, NodeInfo, SubmitTaskData, UploadData, TaskOutput, WebAppInfo, InstanceType } from '../types';

const API_HOST = "https://www.runninghub.cn";

// Helper to handle fetch errors
async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data;
}

/**
 * Build full URL for RunningHub file names
 */
export const buildFileUrl = (value: string): string => {
  if (!value) return '';
  // Already a full URL or data URL
  if (/^(https?:\/\/|data:)/i.test(value)) return value;
  // Convert filename to RunningHub file view URL
  return `https://www.runninghub.cn/task/openapi/view/${value}`;
};

/**
 * Get Node Info List and App Info
 */
export interface GetNodeListResult {
  nodes: NodeInfo[];
  appInfo: WebAppInfo | null;
}

export const getNodeList = async (apiKey: string, webappId: string): Promise<GetNodeListResult> => {
  const url = `${API_HOST}/api/webapp/apiCallDemo?apiKey=${apiKey}&webappId=${webappId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    }
  });

  const json: ApiResponse<any> = await handleResponse(response);

  if (json.code !== 0 || !json.data?.nodeInfoList) {
    throw new Error(json.msg || 'Failed to fetch node list');
  }

  // Normalize nodes: ensure fieldData is populated
  const nodes = json.data.nodeInfoList.map((node: any) => ({
    ...node,
    fieldData: node.fieldData || node.field_data || node.options || undefined
  }));

  // Extract app info
  const appInfo: WebAppInfo | null = json.data.webappName ? {
    webappName: json.data.webappName,
    description: json.data.description || '',
    descriptionEn: json.data.descriptionEn,
    covers: json.data.covers,
    tags: json.data.tags,
    statisticsInfo: json.data.statisticsInfo,
  } : null;

  return { nodes, appInfo };
};

/**
 * Upload File
 */
export const uploadFile = async (apiKey: string, file: File): Promise<UploadData> => {
  const url = `${API_HOST}/task/openapi/upload`;
  const formData = new FormData();
  formData.append('apiKey', apiKey);
  formData.append('fileType', 'input'); // As per python script
  formData.append('file', file);

  const response = await fetch(url, {
    method: 'POST',
    body: formData, // fetch automatically sets Content-Type to multipart/form-data with boundary
  });

  const json: ApiResponse<UploadData> = await handleResponse(response);

  if (json.code !== 0) {
    throw new Error(json.msg || 'Upload failed');
  }

  return json.data;
};

/**
 * Submit Task
 */
export const submitTask = async (
  apiKey: string,
  webappId: string,
  nodeInfoList: NodeInfo[],
  instanceType?: InstanceType
): Promise<SubmitTaskData> => {
  const url = `${API_HOST}/task/openapi/ai-app/run`;

  const payload = {
    webappId,
    apiKey,
    nodeInfoList,
    ...(instanceType && { instanceType })
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  const json: ApiResponse<SubmitTaskData> = await handleResponse(response);

  if (json.code !== 0) {
    throw new Error(json.msg || 'Submission failed');
  }

  return json.data;
};

/**
 * Query Task Outputs (Polling)
 */
export const queryTaskOutputs = async (apiKey: string, taskId: string): Promise<ApiResponse<TaskOutput[] | any>> => {
  const url = `${API_HOST}/task/openapi/outputs`;

  const payload = {
    apiKey,
    taskId
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  return await handleResponse(response);
};

/**
 * Get Account Info
 */
export const getAccountInfo = async (apiKey: string): Promise<{
  remainCoins: string;
  currentTaskCounts: string;
  remainMoney: string | null;
  currency: string | null;
  apiType: string;
}> => {
  const url = `${API_HOST}/uc/openapi/accountStatus`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': 'www.runninghub.cn',
    },
    body: JSON.stringify({ apikey: apiKey })
  });

  const json: ApiResponse<{
    remainCoins: string;
    currentTaskCounts: string;
    remainMoney: string | null;
    currency: string | null;
    apiType: string;
  }> = await handleResponse(response);

  if (json.code !== 0) {
    throw new Error(json.msg || 'Failed to get account info');
  }

  return json.data;
};

/**
 * Official App List Response Item
 */
export interface AppListItem {
  id: string;
  name: string;
  intro: string;
  covers: {
    fileUri: string;
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

/**
 * Get Official App List
 */
export const getOfficialAppList = async (page: number = 1, size: number = 50, sort: string = 'RECOMMEND', search?: string): Promise<{
  records: AppListItem[];
  total: number;
}> => {
  const url = `${API_HOST}/api/webapp/list`;

  const body: any = {
    current: page,
    size: size,
    carefullyChosen: true,
    sort: sort
  };

  if (search && search.trim()) {
    body.search = search.trim();
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });

  const json: ApiResponse<any> = await handleResponse(response);

  if (json.code !== 0) {
    throw new Error(json.msg || 'Failed to fetch app list');
  }

  return {
    records: json.data.records,
    total: parseInt(json.data.total) || 0
  };
};

/**
 * Get App Details by ID (public API, no key required)
 */
export const getAppDetailById = async (appId: string): Promise<AppListItem | null> => {
  const url = `${API_HOST}/api/webapp/list`;

  const body = {
    current: 1,
    size: 1,
    search: appId
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    const json: ApiResponse<any> = await handleResponse(response);

    if (json.code !== 0 || !json.data?.records?.length) {
      return null;
    }

    // Verify the returned app ID matches
    const app = json.data.records[0];
    if (app.id === appId) {
      return app;
    }
    return null;
  } catch {
    return null;
  }
};
