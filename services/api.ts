import { ApiResponse, NodeInfo, SubmitTaskData, UploadData, TaskOutput } from '../types';

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
 * Get Node Info List
 */
export const getNodeList = async (apiKey: string, webappId: string): Promise<NodeInfo[]> => {
  const url = `${API_HOST}/api/webapp/apiCallDemo?apiKey=${apiKey}&webappId=${webappId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    }
  });

  const json: ApiResponse<{ nodeInfoList: NodeInfo[] }> = await handleResponse(response);

  if (json.code !== 0 || !json.data?.nodeInfoList) {
    throw new Error(json.msg || 'Failed to fetch node list');
  }

  return json.data.nodeInfoList;
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
export const submitTask = async (apiKey: string, webappId: string, nodeInfoList: NodeInfo[]): Promise<SubmitTaskData> => {
  const url = `${API_HOST}/task/openapi/ai-app/run`;

  const payload = {
    webappId,
    apiKey,
    nodeInfoList
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