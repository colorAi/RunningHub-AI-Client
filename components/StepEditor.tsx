import React, { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { NodeInfo, WebAppInfo, DecodeConfig, InstanceType, PendingFilesMap } from '../types';
import { getSwitchFieldConfig, parseListOptions } from '../utils/nodeUtils';
import { Upload, Type, List, FileImage, Play, Mic, PlayCircle, AlertCircle, Loader2, Sliders, X, UploadCloud, FileAudio, FileVideo, ChevronDown, Image as ImageIcon, Layers, Settings, Info, Lock, Zap, Maximize2 } from 'lucide-react';
import { uploadFile, buildFileUrl } from '../services/api';
import BatchSettingsModal from './BatchSettingsModal';
import AppInfoModal from './AppInfoModal';


interface StepEditorProps {
    nodes: NodeInfo[];
    apiKeys: string[];
    isConnected: boolean;
    runType: 'none' | 'single' | 'batch';
    webAppInfo?: WebAppInfo | null;
    onBack: () => void;
    onRun: (updatedNodes: NodeInfo[], batchList?: NodeInfo[][], pendingFiles?: PendingFilesMap, decodeConfig?: DecodeConfig, batchTaskName?: string, instanceType?: InstanceType) => void;
    onCancel: () => void;
    decodeConfig?: DecodeConfig;
    failedBatchIndices?: Set<number>;  // 失败任务的索引集合
    onRetryTask?: (taskNodes: NodeInfo[], originalIndex: number, pendingFiles: PendingFilesMap) => void;  // 单个任务重试回调，传递当前编辑的节点数据
    instanceType?: InstanceType;  // 新增
    onInstanceTypeChange?: (type: InstanceType) => void;  // 新增
    initialBatchList?: NodeInfo[][];
    initialBatchTaskName?: string;
    initialPendingFiles?: PendingFilesMap;
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

const EMPTY_BATCH_LIST: NodeInfo[][] = [];
const EMPTY_PENDING_FILES: PendingFilesMap = {};

const cloneNodeRows = (rows?: NodeInfo[][]) => (rows || []).map(row => row.map(node => ({ ...node })));
const clonePendingFiles = (files?: PendingFilesMap) => ({ ...(files || {}) });
const hasSameNodeStructure = (left: NodeInfo[], right: NodeInfo[]) => {
    if (left.length !== right.length) return false;

    return left.every((node, index) => {
        const other = right[index];
        return !!other
            && node.nodeId === other.nodeId
            && node.fieldName === other.fieldName
            && node.fieldType === other.fieldType;
    });
};

const StepEditor = forwardRef<StepEditorRef, StepEditorProps>(({ nodes, apiKeys, isConnected, runType, webAppInfo, onBack, onRun, onCancel, decodeConfig, failedBatchIndices = new Set(), onRetryTask, instanceType = 'default', onInstanceTypeChange, initialBatchList = EMPTY_BATCH_LIST, initialBatchTaskName = '', initialPendingFiles = EMPTY_PENDING_FILES }, ref) => {
    const editorDomId = useId().replace(/:/g, '-');
    const [localNodes, setLocalNodes] = useState<NodeInfo[]>(nodes);
    const [uploadingState, setUploadingState] = useState<Record<string, boolean>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});



    // Batch settings state
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchList, setBatchList] = useState<NodeInfo[][]>(() => cloneNodeRows(initialBatchList));
    const [pendingFiles, setPendingFiles] = useState<PendingFilesMap>(() => clonePendingFiles(initialPendingFiles));
    const [batchTaskName, setBatchTaskName] = useState<string>(initialBatchTaskName);

    // App info modal state
    const [isAppInfoModalOpen, setIsAppInfoModalOpen] = useState(false);

    // Decode settings modal state

    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [mediaPreview, setMediaPreview] = useState<{ src: string; title: string; type: 'image' | 'video' | 'audio' } | null>(null);
    // Track drag state for each node
    const [dragActive, setDragActive] = useState<Record<string, boolean>>({});
    // Track broken images (failed to load from URL)
    const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
    const [brokenVideos, setBrokenVideos] = useState<Record<string, boolean>>({});
    const [brokenAudios, setBrokenAudios] = useState<Record<string, boolean>>({});
    const previousNodesRef = useRef<NodeInfo[]>(nodes);
    const nodesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Use a ref to track current previews for cleanup
    const previewsRef = useRef(previews);

    // Sync ref with state
    useEffect(() => {
        previewsRef.current = previews;
    }, [previews]);

    // Loading state for nodes transition
    const [isNodesLoading, setIsNodesLoading] = useState(false);

    // Sync when props change (e.g. re-fetching config)
    useEffect(() => {
        // Clear any existing timeout
        if (nodesTimeoutRef.current) {
            clearTimeout(nodesTimeoutRef.current);
        }
        
        // Show loading state when nodes change
        if (nodes.length > 0 && !hasSameNodeStructure(previousNodesRef.current, nodes)) {
            setIsNodesLoading(true);
        }
        
        setLocalNodes(nodes);
        // Reset broken images on new node load
        setBrokenImages({});
        setBrokenVideos({});
        setBrokenAudios({});

        const nodeStructureChanged = !hasSameNodeStructure(previousNodesRef.current, nodes);
        previousNodesRef.current = nodes;

        // Only reset batch state when the underlying workflow schema changes.
        if (nodeStructureChanged) {
            setBatchList(cloneNodeRows(initialBatchList));
            setPendingFiles(clonePendingFiles(initialPendingFiles));
            setBatchTaskName(initialBatchTaskName);
        }
        
        // Hide loading after a short delay to allow render to complete
        nodesTimeoutRef.current = setTimeout(() => {
            setIsNodesLoading(false);
        }, 100);
        
        return () => {
            if (nodesTimeoutRef.current) {
                clearTimeout(nodesTimeoutRef.current);
            }
        };
    }, [initialBatchList, initialBatchTaskName, initialPendingFiles, nodes]);

    // Cleanup object URLs to avoid memory leaks
    useEffect(() => {
        return () => {
            Object.values(previewsRef.current).forEach(url => URL.revokeObjectURL(url as string));
        };
    }, []);

    useEffect(() => {
        if (!mediaPreview) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMediaPreview(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mediaPreview]);

    useImperativeHandle(ref, () => ({
        getSnapshot: () => ({
            nodes: localNodes.map(node => ({ ...node })),
            batchList: batchList.map(row => row.map(node => ({ ...node }))),
            pendingFiles: { ...pendingFiles },
            batchTaskName,
            instanceType,
            hasUploadingFiles: Object.values(uploadingState).some(Boolean),
            isConnected,
        })
    }), [batchList, batchTaskName, instanceType, isConnected, localNodes, pendingFiles, uploadingState]);

    const handleTextChange = (index: number, val: string) => {
        const newNodes = [...localNodes];
        newNodes[index].fieldValue = val;
        setLocalNodes(newNodes);
    };

    const handleClearFile = (index: number) => {
        const node = localNodes[index];
        const key = node.nodeId + '_' + index;

        // Clear the field value
        const newNodes = [...localNodes];
        newNodes[index].fieldValue = '';
        setLocalNodes(newNodes);

        // Clear preview if exists
        if (previews[key]) {
            URL.revokeObjectURL(previews[key]);
            setPreviews(prev => {
                const updated = { ...prev };
                delete updated[key];
                return updated;
            });
        }

        // Clear broken state
        setBrokenImages(prev => {
            const updated = { ...prev };
            delete updated[key];
            return updated;
        });
        setBrokenVideos(prev => {
            const updated = { ...prev };
            delete updated[key];
            return updated;
        });
        setBrokenAudios(prev => {
            const updated = { ...prev };
            delete updated[key];
            return updated;
        });

        // Clear any errors
        setErrors(prev => {
            const updated = { ...prev };
            delete updated[key];
            return updated;
        });
    };

    const processFile = async (index: number, file: File) => {
        const node = localNodes[index];
        const key = node.nodeId + '_' + index;

        if (previews[key]) {
            URL.revokeObjectURL(previews[key]);
        }

        // 1. Create local preview for uploaded media so it can be previewed immediately.
        const url = URL.createObjectURL(file);
        setPreviews(prev => ({ ...prev, [key]: url }));

        if (file.type.startsWith('image/')) {
            // Reset broken state for this key since we have a new valid local preview
            setBrokenImages(prev => ({ ...prev, [key]: false }));
        }
        if (file.type.startsWith('video/')) {
            setBrokenVideos(prev => ({ ...prev, [key]: false }));
        }
        if (file.type.startsWith('audio/')) {
            setBrokenAudios(prev => ({ ...prev, [key]: false }));
        }

        // 2. Start Upload
        setUploadingState(prev => ({ ...prev, [key]: true }));
        setErrors(prev => ({ ...prev, [key]: '' }));

        try {
            // Use first API key for file uploads
            const primaryApiKey = apiKeys[0] || '';
            const result = await uploadFile(primaryApiKey, file);
            const newNodes = [...localNodes];
            newNodes[index].fieldValue = result.fileName;
            setLocalNodes(newNodes);
        } catch (err: any) {
            setErrors(prev => ({ ...prev, [key]: err.message || 'Upload failed' }));
        } finally {
            setUploadingState(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleDrag = (e: React.DragEvent, index: number, active: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        const node = localNodes[index];
        const key = node.nodeId + '_' + index;
        if (dragActive[key] !== active) {
            setDragActive(prev => ({ ...prev, [key]: active }));
        }
    };

    const handleDrop = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();
        const node = localNodes[index];
        const key = node.nodeId + '_' + index;

        setDragActive(prev => ({ ...prev, [key]: false }));

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            // Basic type check
            const fileType = node.fieldType.toLowerCase();
            if (!file.type.includes(fileType) && fileType !== 'file') {
                // Strict check can be relaxed, but let's warn vaguely or just proceed
            }
            processFile(index, file);
        }
    };

    const getDisplayFileName = (value: string) => {
        if (!value) return '';
        return value.split(/[\\/]/).pop() || value;
    };

    const getNodePresentation = (node: NodeInfo) => {
        const switchConfig = getSwitchFieldConfig(node);
        const listOptions = switchConfig ? [] : parseListOptions(node);
        const effectiveType = switchConfig ? 'SWITCH' : (listOptions.length > 0 ? 'LIST' : (node.fieldType === 'BOOLEAN' ? 'SWITCH' : node.fieldType));

        return { effectiveType, listOptions, switchConfig };
    };

    const renderNodeInput = (node: NodeInfo, index: number) => {
        const key = node.nodeId + '_' + index;
        const fileInputId = `file-${editorDomId}-${key}`;
        const isUploading = uploadingState[key];
        const hasError = errors[key];
        const isDragging = dragActive[key];
        const previewUrl = previews[key];

        const { effectiveType, listOptions, switchConfig } = getNodePresentation(node);

        // Build proper image URL from filename or URL
        const getMediaSrc = (value: string) => {
            if (!value) return '';
            // Use buildFileUrl to convert filename to full URL
            return buildFileUrl(value);
        };
        const mediaSrc = previewUrl || (node.fieldValue ? getMediaSrc(node.fieldValue) : '');
        const showVideoPreview = effectiveType === 'VIDEO' && !!mediaSrc && !brokenVideos[key];
        const showAudioPreview = effectiveType === 'AUDIO' && !!mediaSrc && !brokenAudios[key];

        if (effectiveType === 'SWITCH' && switchConfig) {
            return (
                <div className="mt-2">
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] px-4 py-3 shadow-sm">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                {switchConfig.checked ? switchConfig.checkedLabel : switchConfig.uncheckedLabel}
                            </p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={switchConfig.checked}
                            onClick={() => handleTextChange(index, switchConfig.checked ? switchConfig.uncheckedValue : switchConfig.checkedValue)}
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
                                switchConfig.checked
                                    ? 'border-brand-500 bg-brand-500'
                                    : 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700'
                            }`}
                        >
                            <span
                                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                                    switchConfig.checked ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>
                </div>
            );
        }

        switch (effectiveType) {
            case 'IMAGE':
                // 只有用户新上传的图片（有 previewUrl）才显示预览
                // API 返回的已有文件名需要认证才能预览，所以直接显示友好提示
                const isDefaultImage = !previewUrl && node.fieldValue;
                const isUploadedImage = !!previewUrl;
                const showImagePreview = isUploadedImage && !brokenImages[key];
                const imageSrc = showImagePreview ? previewUrl : '';

                return (
                    <div className="mt-2">
                        <div
                            className={`
                    relative w-full rounded-xl border-2 border-dashed transition-all duration-300 ease-in-out overflow-hidden group/drop
                    ${isDragging
                                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 scale-[1.01]'
                                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0F1115]/50 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-brand-400 dark:hover:border-brand-600'
                                }
                    ${hasError ? 'border-red-400 bg-red-50 dark:bg-red-900/10' : ''}
                `}
                            onDragEnter={(e) => handleDrag(e, index, true)}
                            onDragOver={(e) => handleDrag(e, index, true)}
                            onDragLeave={(e) => handleDrag(e, index, false)}
                            onDrop={(e) => handleDrop(e, index)}
                        >
                            <input
                                type="file"
                                id={fileInputId}
                                className="hidden"
                                accept="image/*"
                                disabled={isUploading}
                                onChange={(e) => {
                                    if (e.target.files?.[0]) processFile(index, e.target.files[0]);
                                }}
                            />

                            {isUploading ? (
                                <div className="flex flex-col items-center justify-center h-[100px] animate-pulse">
                                    <Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-2" />
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">等待文件上传中...</p>
                                </div>
                            ) : showImagePreview ? (
                                <div className="relative w-full h-[100px] bg-slate-100 dark:bg-slate-950/50 flex justify-center items-center">
                                    <img
                                        src={imageSrc}
                                        alt="Preview"
                                        onError={() => setBrokenImages(prev => ({ ...prev, [key]: true }))}
                                        className="max-w-full max-h-full object-contain"
                                    />
                                    <span className="absolute left-2 top-2 z-[1] rounded-full border border-white/20 bg-slate-900/72 px-2.5 py-1 text-[10px] text-white backdrop-blur-sm">
                                        已上传图像
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setMediaPreview({ src: imageSrc, title: primaryLabel(node), type: 'image' })}
                                        className="absolute left-2 bottom-2 z-[1] flex items-center gap-1 rounded-full border border-white/20 bg-slate-900/72 px-2 py-1 text-[10px] text-white backdrop-blur-sm transition-colors hover:bg-slate-900/88"
                                    >
                                        <Maximize2 className="w-3 h-3" />
                                        查看大图
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleClearFile(index)}
                                        className="absolute right-2 bottom-2 z-[1] flex items-center gap-1 rounded-full border border-white/20 bg-red-500/80 px-2 py-1 text-[10px] text-white transition-colors hover:bg-red-600"
                                    >
                                        <X className="w-3 h-3" />
                                        清除
                                    </button>
                                    {/* Hover Overlay */}
                                    <div className="hidden absolute inset-0 bg-slate-900/45 opacity-0 group-hover/drop:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                                        <button
                                            type="button"
                                            onClick={() => setMediaPreview({ src: imageSrc, title: primaryLabel(node), type: 'image' })}
                                            className="flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white transition-colors hover:bg-white/20"
                                        >
                                            <Maximize2 className="w-3 h-3" />
                                            查看大图
                                        </button>
                                        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white">
                                            点击或拖拽替换图片
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleClearFile(index)}
                                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-white bg-red-500/80 hover:bg-red-600 rounded-full border border-white/20 transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                            清除图片
                                        </button>
                                    </div>
                                </div>
                            ) : isDefaultImage ? (
                                // 默认图像（API返回）- 显示文件信息，不尝试加载图片
                                <label
                                    htmlFor={fileInputId}
                                    className="flex flex-col items-center justify-center h-[100px] px-4 cursor-pointer"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-500 shrink-0">
                                            <FileImage className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate max-w-[180px]" title={node.fieldValue}>
                                                {getDisplayFileName(node.fieldValue)}
                                            </p>
                                            <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mt-0.5">
                                                默认图像已加载
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-xs text-brand-500 font-medium group-hover/drop:underline underline-offset-4">
                                            点击替换
                                        </span>
                                        <span className="text-slate-300">|</span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleClearFile(index);
                                            }}
                                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                            清除
                                        </button>
                                    </div>
                                </label>
                            ) : (
                                // Empty State
                                <label
                                    htmlFor={fileInputId}
                                    className="flex flex-col items-center justify-center h-[100px] px-4 cursor-pointer"
                                >
                                    <div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center mb-2 group-hover/drop:scale-110 transition-transform duration-300">
                                        <UploadCloud className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                                    </div>
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                        点击上传或拖拽图片
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">
                                        支持 JPG, PNG, WEBP
                                    </p>
                                </label>
                            )}
                        </div>
                        {hasError && (
                            <div className="flex items-center gap-1.5 mt-2 text-red-500 text-xs bg-red-50 dark:bg-red-900/10 p-2 rounded border border-red-100 dark:border-red-900/20">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{hasError}</span>
                            </div>
                        )}
                    </div>
                );

            case 'AUDIO':
            case 'VIDEO':
                return (
                    <div className="mt-2">
                        <div
                            className={`
                    relative w-full rounded-xl border-2 border-dashed transition-all duration-200 ease-in-out overflow-hidden
                    ${isDragging
                                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0F1115] hover:bg-slate-100 dark:hover:bg-slate-800'
                                }
                    ${hasError ? 'border-red-400 bg-red-50 dark:bg-red-900/10' : ''}
                `}
                            onDragEnter={(e) => handleDrag(e, index, true)}
                            onDragOver={(e) => handleDrag(e, index, true)}
                            onDragLeave={(e) => handleDrag(e, index, false)}
                            onDrop={(e) => handleDrop(e, index)}
                        >
                            <input
                                type="file"
                                id={fileInputId}
                                className="hidden"
                                accept={`${node.fieldType.toLowerCase()}/*`}
                                disabled={isUploading}
                                onChange={(e) => {
                                    if (e.target.files?.[0]) processFile(index, e.target.files[0]);
                                }}
                            />

                            {isUploading ? (
                                <div className="flex flex-col items-center justify-center h-[80px] animate-pulse">
                                    <Loader2 className="w-8 h-8 text-brand-500 animate-spin mb-2" />
                                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">等待文件上传中...</p>
                                </div>
                            ) : (
                                <>
                                    {(node.fieldValue) ? (
                                        <div className="flex flex-col">
                                            {/* 文件信息区域 - 包含操作按钮 */}
                                            <div className="flex items-center gap-3 p-3">
                                                {node.fieldType === 'AUDIO' && <FileAudio className="w-8 h-8 text-pink-500 shrink-0" />}
                                                {node.fieldType === 'VIDEO' && <FileVideo className="w-8 h-8 text-red-500 shrink-0" />}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate" title={node.fieldValue}>
                                                        {getDisplayFileName(node.fieldValue)}
                                                    </p>
                                                    <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mt-0.5">
                                                        {previewUrl ? '已上传文件' : '默认文件'}
                                                    </p>
                                                </div>
                                                {/* 操作按钮组 */}
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <label
                                                        htmlFor={fileInputId}
                                                        className="cursor-pointer text-xs text-brand-500 hover:text-brand-600 font-medium px-2 py-1 rounded hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                                                    >
                                                        更换
                                                    </label>
                                                    <span className="text-slate-300">|</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleClearFile(index)}
                                                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                                                    >
                                                        <X className="w-3 h-3" />
                                                        清除
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            {/* 播放器/预览区域 */}
                                            {node.fieldType === 'AUDIO' && (
                                                <div className="px-3 pb-3">
                                                    {showAudioPreview ? (
                                                        <div
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                            }}
                                                        >
                                                            <audio
                                                                controls
                                                                preload="metadata"
                                                                src={mediaSrc}
                                                                onError={() => setBrokenAudios(prev => ({ ...prev, [key]: true }))}
                                                                className="h-8 w-full"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                                            音频已就绪，当前无法直接试听
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {node.fieldType === 'VIDEO' && (
                                                <div className="px-3 pb-3">
                                                    {showVideoPreview ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setMediaPreview({ src: mediaSrc, title: primaryLabel(node), type: 'video' })}
                                                            className="group relative block h-[92px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
                                                        >
                                                            <video
                                                                src={mediaSrc}
                                                                muted
                                                                playsInline
                                                                preload="metadata"
                                                                onError={() => setBrokenVideos(prev => ({ ...prev, [key]: true }))}
                                                                className="h-full w-full object-cover"
                                                            />
                                                            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/28 transition-colors group-hover:bg-slate-950/38">
                                                                <span className="rounded-full border border-white/20 bg-white/15 px-3 py-1 text-[11px] text-white backdrop-blur-sm">
                                                                    点击预览视频
                                                                </span>
                                                            </div>
                                                        </button>
                                                    ) : (
                                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                                            视频已就绪，当前无法生成缩略图
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <label
                                            htmlFor={fileInputId}
                                            className="flex flex-col items-center justify-center h-[80px] cursor-pointer text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors"
                                        >
                                            <UploadCloud className="w-8 h-8 mb-1.5 opacity-50" />
                                            <p className="text-sm font-medium">点击或拖拽上传</p>
                                            <p className="text-[10px] uppercase tracking-wider opacity-70">
                                                支持 {node.fieldType} 格式
                                            </p>
                                        </label>
                                    )}
                                </>
                            )}
                        </div>
                        {hasError && (
                            <div className="flex items-center gap-1.5 mt-2 text-red-500 text-xs">
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>{hasError}</span>
                            </div>
                        )}
                    </div>
                );

            case 'LIST':
                return (
                    <div className="relative mt-2">
                        {listOptions.length > 0 ? (
                            (() => {
                                // 确保有有效的默认值
                                const currentValue = node.fieldValue || (listOptions.length > 0 ? listOptions[0].index : '');
                                // 如果当前值不在选项中，使用第一个选项
                                const isValidValue = listOptions.some(opt => opt.index === currentValue);
                                const effectiveValue = isValidValue ? currentValue : (listOptions.length > 0 ? listOptions[0].index : '');

                                return (
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                            <List className="h-4 w-4" />
                                        </div>
                                        <select
                                            value={effectiveValue}
                                            onChange={(e) => handleTextChange(index, e.target.value)}
                                            className="block w-full pl-9 pr-10 py-2.5 text-sm bg-white dark:bg-[#0F1115] border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none appearance-none text-slate-700 dark:text-slate-200 cursor-pointer hover:border-brand-400 dark:hover:border-brand-500"
                                        >
                                            {listOptions.map((opt) => (
                                                <option key={opt.index} value={opt.index} className="dark:bg-slate-900">{opt.name}</option>
                                            ))}
                                        </select>
                                        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500">
                                            <ChevronDown className="w-4 h-4" />
                                        </div>
                                    </div>
                                );
                            })()
                        ) : (
                            // 无法解析下拉选项时，回退到文本输入框，允许用户直接输入
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <List className="h-4 w-4" />
                                </div>
                                <input
                                    type="text"
                                    value={node.fieldValue}
                                    onChange={(e) => handleTextChange(index, e.target.value)}
                                    className="block w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#0F1115] border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400"
                                    placeholder="请输入参数值"
                                />
                            </div>
                        )}
                    </div>
                );

            case 'SWITCH':
                // 切换节点类型 - 提供文本输入作为回退
                return (
                    <div className="mt-2 relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Sliders className="h-4 w-4" />
                        </div>
                        <input
                            type="text"
                            value={node.fieldValue}
                            onChange={(e) => handleTextChange(index, e.target.value)}
                            className="block w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#0F1115] border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400"
                            placeholder="请输入开关值 (true/false 或其他)"
                        />
                    </div>
                );

            case 'INT':
            case 'FLOAT':
                return (
                    <div className="mt-2 relative">
                        <input
                            type="number"
                            step={node.fieldType === 'FLOAT' ? "0.01" : "1"}
                            value={node.fieldValue}
                            onChange={(e) => handleTextChange(index, e.target.value)}
                            className="block w-full px-3 py-2.5 bg-white dark:bg-[#0F1115] border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none text-sm font-mono text-slate-700 dark:text-slate-200"
                        />
                    </div>
                );

            default: // STRING and others
                return (
                    <div className="mt-2 relative">
                        {node.fieldType === 'STRING' ? (
                            <textarea
                                rows={3}
                                value={node.fieldValue}
                                onChange={(e) => handleTextChange(index, e.target.value)}
                                className="block w-full px-3 py-2 bg-white dark:bg-[#0F1115] border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none text-sm leading-relaxed text-slate-700 dark:text-slate-200 placeholder-slate-400"
                                placeholder="请输入文本..."
                            />
                        ) : (
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <Type className="h-4 w-4" />
                                </div>
                                <input
                                    type="text"
                                    value={node.fieldValue}
                                    onChange={(e) => handleTextChange(index, e.target.value)}
                                    className="block w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#0F1115] border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400"
                                />
                            </div>
                        )}
                    </div>
                );
        }
    };

    const getIcon = (node: NodeInfo, effectiveType: string) => {
        switch (effectiveType) {
            case 'IMAGE': return <ImageIcon className="w-4 h-4 text-purple-500 dark:text-purple-400" />;
            case 'AUDIO': return <Mic className="w-4 h-4 text-pink-500 dark:text-pink-400" />;
            case 'VIDEO': return <PlayCircle className="w-4 h-4 text-red-500 dark:text-red-400" />;
            case 'LIST': return <List className="w-4 h-4 text-orange-500 dark:text-orange-400" />;
            case 'SWITCH': return <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400" />;
            case 'INT':
            case 'FLOAT': return <Sliders className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />;
            default: return <Type className="w-4 h-4 text-blue-500 dark:text-blue-400" />;
        }
    };

    const primaryLabel = (node: NodeInfo) => {
        if (node.description && node.description.trim()) return node.description;
        return node.fieldName || node.nodeName;
    };

    const handleBatchRun = () => {
        if (batchList.length === 0) {
            // Fallback to normal run if no batch list
            onRun(localNodes, undefined, undefined, decodeConfig, undefined, instanceType);
            return;
        }

        onRun(localNodes, batchList, pendingFiles, decodeConfig, batchTaskName, instanceType);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <BatchSettingsModal
                isOpen={isBatchModalOpen}
                onClose={() => setIsBatchModalOpen(false)}
                nodes={localNodes}
                onSave={(newBatchList, newPendingFiles, newTaskName) => {
                    setBatchList(newBatchList);
                    setPendingFiles(newPendingFiles);
                    setBatchTaskName(newTaskName);
                }}
                initialBatchList={batchList}
                initialPendingFiles={pendingFiles}
                initialTaskName={batchTaskName}
                apiKey={apiKeys[0] || ''}
                failedIndices={failedBatchIndices}
                onRetryTask={onRetryTask}
            />
            {/* ... */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#161920] shrink-0 z-10 shadow-sm">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                        参数设置
                        <span className="text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 rounded border border-brand-100 dark:border-brand-900/50">
                            {nodes.length} 个节点
                        </span>
                    </h2>
                    <div className="flex items-center gap-2">
                        {/* PLUS 模式切换按钮 */}
                        <button
                            onClick={() => onInstanceTypeChange?.(instanceType === 'default' ? 'plus' : 'default')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                instanceType === 'plus'
                                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                            }`}
                            title={instanceType === 'plus' ? 'PLUS 模式已开启（48G）' : 'PLUS 模式已关闭（24G）'}
                        >
                            <Zap className={`w-3.5 h-3.5 ${instanceType === 'plus' ? 'animate-pulse' : ''}`} />
                            PLUS 模式
                        </button>

                        {/* App Info Button */}
                        {webAppInfo && (
                            <button
                                onClick={() => setIsAppInfoModalOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors border border-slate-200 dark:border-slate-700 text-xs font-medium"
                            >
                                <Info className="w-3.5 h-3.5" />
                                应用详情
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* App Info Modal */}
            {webAppInfo && (
                <AppInfoModal
                    isOpen={isAppInfoModalOpen}
                    onClose={() => setIsAppInfoModalOpen(false)}
                    appInfo={webAppInfo}
                />
            )}

            {mediaPreview && (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
                    onClick={() => setMediaPreview(null)}
                >
                    <div
                        className="relative max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setMediaPreview(null)}
                            className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900/75 text-white transition-colors hover:bg-slate-800"
                            aria-label="关闭预览"
                        >
                            <X className="h-5 w-5" />
                        </button>
                        <div className="border-b border-white/10 px-5 py-4 pr-16">
                            <p className="truncate text-sm font-medium text-white">{mediaPreview.title}</p>
                            <p className="mt-1 text-xs text-slate-400">按 Esc 或点击遮罩关闭</p>
                        </div>
                        <div className="flex max-h-[calc(90vh-76px)] items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(148,163,184,0.16),_transparent_70%)] p-4">
                            {mediaPreview.type === 'image' ? (
                                <img
                                    src={mediaPreview.src}
                                    alt={mediaPreview.title}
                                    className="max-h-[calc(90vh-108px)] w-auto max-w-full rounded-xl object-contain"
                                />
                            ) : mediaPreview.type === 'video' ? (
                                <video
                                    src={mediaPreview.src}
                                    controls
                                    autoPlay
                                    className="max-h-[calc(90vh-108px)] w-auto max-w-full rounded-xl bg-black"
                                />
                            ) : (
                                <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950/70 p-8 text-white shadow-2xl">
                                    <p className="mb-4 text-sm text-slate-300">音频预览</p>
                                    <audio controls autoPlay preload="metadata" src={mediaPreview.src} className="w-full" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}



            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                {!isConnected ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 py-20 text-center">
                        <AlertCircle className="w-16 h-16 mb-4 opacity-20" />
                        <h3 className="text-lg font-medium text-slate-500 dark:text-slate-400">等待连接</h3>
                        <p className="text-sm max-w-xs mt-2">请在左侧侧边栏输入您的 API Key 和应用 ID 以加载参数。</p>
                    </div>
                ) : isNodesLoading ? (
                    // Skeleton loading state
                    <div className="space-y-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={`skeleton-${i}`} className="bg-white dark:bg-[#161920] p-4 rounded-xl border border-slate-200 dark:border-slate-800/50 shadow-sm animate-pulse">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg shrink-0"></div>
                                    <div className="flex-1 h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
                                </div>
                                <div className="h-20 bg-slate-100 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700"></div>
                            </div>
                        ))}
                    </div>
                ) : localNodes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600">
                        <AlertCircle className="w-10 h-10 opacity-30 mb-2" />
                        <p className="text-sm">无可用参数</p>
                    </div>
                ) : (
                    localNodes.map((node, idx) => {
                        const { effectiveType } = getNodePresentation(node);

                        return (
                            <div key={`${node.nodeId}-${idx}`} className="group bg-white dark:bg-[#161920] p-4 rounded-xl border border-slate-200 dark:border-slate-800/50 shadow-sm hover:border-brand-300 dark:hover:border-brand-500/50 will-change-transform">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 shrink-0">
                                        {getIcon(node, effectiveType)}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">
                                            {primaryLabel(node)}
                                        </h3>
                                    </div>
                                </div>

                                <div className="pl-0 sm:pl-12">
                                    {renderNodeInput(node, idx)}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer - 运行按钮固定在底部 */}
            <div className="bg-white dark:bg-[#161920] border-t border-slate-200 dark:border-slate-800/50 p-4 shrink-0 flex gap-3">
                {/* 单独运行按钮 */}
                {runType === 'single' ? (
                    <button
                        onClick={onCancel}
                        className="flex-1 flex justify-center items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-5 rounded-lg shadow-md shadow-red-200 dark:shadow-red-900/20 transform hover:-translate-y-0.5 transition-all text-sm"
                    >
                        <X className="w-4 h-4" />
                        取消运行
                    </button>
                ) : (
                    <button
                        onClick={() => onRun(localNodes, undefined, undefined, decodeConfig, undefined, instanceType)}
                        disabled={!isConnected || Object.values(uploadingState).some(Boolean) || runType === 'batch'}
                        className="flex-1 flex justify-center items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-semibold py-3 px-5 rounded-lg shadow-md shadow-brand-200 dark:shadow-brand-900/20 transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none disabled:shadow-none text-sm"
                    >
                        <Play className="w-4 h-4 fill-current" />
                        运行
                    </button>
                )}

                {/* 批量运行按钮 */}
                {runType === 'batch' ? (
                    <button
                        onClick={onCancel}
                        className="flex-1 flex justify-center items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-5 rounded-lg shadow-md shadow-red-200 dark:shadow-red-900/20 transform hover:-translate-y-0.5 transition-all text-sm"
                    >
                        <X className="w-4 h-4" />
                        取消批量
                    </button>
                ) : (
                    <button
                        onClick={handleBatchRun}
                        disabled={!isConnected || Object.values(uploadingState).some(Boolean) || runType === 'single'}
                        className="flex-1 flex justify-center items-center gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold py-3 px-5 rounded-lg shadow-md shadow-orange-200 dark:shadow-orange-900/20 transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none disabled:shadow-none text-sm"
                    >
                        <Layers className="w-4 h-4" />
                        批量运行
                    </button>
                )}

                {/* 设置按钮 */}
                <button
                    onClick={() => setIsBatchModalOpen(true)}
                    disabled={!isConnected || runType === 'single' || runType === 'batch'}
                    className="flex items-center justify-center gap-2 px-5 py-3 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm transition-all disabled:opacity-50"
                    title="批量设置"
                >
                    <Settings className="w-4 h-4" />
                    <span>批量设置</span>
                </button>
            </div>
        </div>
    );
});

export default StepEditor;
