import type { NodeInfo, WebAppInfo, InstanceType, PendingFilesMap, StandardModelConfig } from '../../types';

export interface StepEditorProps {
    nodes: NodeInfo[];
    apiKeys: string[];
    isConnected: boolean;
    runType: 'none' | 'single' | 'batch';
    webAppInfo?: WebAppInfo | null;
    onBack: () => void;
    onRun: (updatedNodes: NodeInfo[], batchList?: NodeInfo[][], pendingFiles?: PendingFilesMap, batchTaskName?: string, instanceType?: InstanceType) => void;
    onCancel: () => void;
    failedBatchIndices?: Set<number>;  // 失败任务的索引集合
    onRetryTask?: (taskNodes: NodeInfo[], originalIndex: number, pendingFiles: PendingFilesMap) => void;  // 单个任务重试回调，传递当前编辑的节点数据
    instanceType?: InstanceType;  // 新增
    onInstanceTypeChange?: (type: InstanceType) => void;  // 新增
    initialBatchList?: NodeInfo[][];
    initialBatchTaskName?: string;
    initialPendingFiles?: PendingFilesMap;
    mode?: 'app' | 'standard';
    // Cards own scrolling; standalone editors retain their internal scroll area.
    scrollMode?: 'internal' | 'parent';
    standardModelConfig?: StandardModelConfig;
}

export interface StepEditorSnapshot {
    nodes: NodeInfo[];
    batchList: NodeInfo[][];
    pendingFiles: PendingFilesMap;
    batchTaskName: string;
    instanceType: InstanceType;
    hasUploadingFiles: boolean;
    isConnected: boolean;
}

export interface StepEditorRef {
    getSnapshot: () => StepEditorSnapshot;
}
