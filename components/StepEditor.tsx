import React, { useState, useEffect, useRef } from 'react';
import { NodeInfo, WebAppInfo, DecodeConfig } from '../types';
import { parseListOptions } from '../utils/nodeUtils';
import { Upload, Type, List, FileImage, Play, Mic, PlayCircle, AlertCircle, Loader2, Sliders, X, UploadCloud, FileAudio, FileVideo, ChevronDown, Image as ImageIcon, Layers, Settings, Info, Lock } from 'lucide-react';
import { uploadFile, buildFileUrl } from '../services/api';
import BatchSettingsModal, { PendingFilesMap } from './BatchSettingsModal';
import AppInfoModal from './AppInfoModal';


interface StepEditorProps {
    nodes: NodeInfo[];
    apiKeys: string[];
    isConnected: boolean;
    runType: 'none' | 'single' | 'batch';
    webAppInfo?: WebAppInfo | null;
    onBack: () => void;
    onRun: (updatedNodes: NodeInfo[], batchList?: NodeInfo[][], pendingFiles?: PendingFilesMap, decodeConfig?: DecodeConfig, batchTaskName?: string) => void;
    onCancel: () => void;
    decodeConfig?: DecodeConfig;
    failedBatchIndices?: Set<number>;  // 失败任务的索引集合
    onRetryTask?: (taskNodes: NodeInfo[], originalIndex: number, pendingFiles: PendingFilesMap) => void;  // 单个任务重试回调，传递当前编辑的节点数据
}

const StepEditor: React.FC<StepEditorProps> = ({ nodes, apiKeys, isConnected, runType, webAppInfo, onBack, onRun, onCancel, decodeConfig, failedBatchIndices = new Set(), onRetryTask }) => {
    const [localNodes, setLocalNodes] = useState<NodeInfo[]>(nodes);
    const [uploadingState, setUploadingState] = useState<Record<string, boolean>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});



    // Batch settings state
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchList, setBatchList] = useState<NodeInfo[][]>([]);
    const [pendingFiles, setPendingFiles] = useState<PendingFilesMap>({});
    const [batchTaskName, setBatchTaskName] = useState<string>('');

    // App info modal state
    const [isAppInfoModalOpen, setIsAppInfoModalOpen] = useState(false);

    // Decode settings modal state

    const [previews, setPreviews] = useState<Record<string, string>>({});
    // Track drag state for each node
    const [dragActive, setDragActive] = useState<Record<string, boolean>>({});
    // Track broken images (failed to load from URL)
    const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

    // Use a ref to track current previews for cleanup
    const previewsRef = useRef(previews);

    // Sync ref with state
    useEffect(() => {
        previewsRef.current = previews;
    }, [previews]);

    // Sync when props change (e.g. re-fetching config)
    useEffect(() => {
        setLocalNodes(nodes);
        // Reset broken images on new node load
        setBrokenImages({});
        // Reset batch list and pending files when nodes configuration changes
        setBatchList([]);
        setPendingFiles({});
        setBatchTaskName('');
    }, [nodes]);

    // Cleanup object URLs to avoid memory leaks
    useEffect(() => {
        return () => {
            Object.values(previewsRef.current).forEach(url => URL.revokeObjectURL(url as string));
        };
    }, []);

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

        // 1. Create Preview if it's an image
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setPreviews(prev => ({ ...prev, [key]: url }));
            // Reset broken state for this key since we have a new valid local preview
            setBrokenImages(prev => ({ ...prev, [key]: false }));
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

    const looksLikeUrl = (s: string) => /^(https?:\/\/|data:)/i.test(s);

    const renderNodeInput = (node: NodeInfo, index: number) => {
        const key = node.nodeId + '_' + index;
        const isUploading = uploadingState[key];
        const hasError = errors[key];
        const isDragging = dragActive[key];
        const previewUrl = previews[key];

        // Auto-detect list type based on fieldData availability
        const listOptions = parseListOptions(node);
        const effectiveType = listOptions.length > 0 ? 'LIST' : node.fieldType;

        // Build proper image URL from filename or URL
        const getImageSrc = (value: string) => {
            if (!value) return '';
            // Use buildFileUrl to convert filename to full URL
            return buildFileUrl(value);
        };

        switch (effectiveType) {
            case 'IMAGE':
                // 只有用户新上传的图片（有 previewUrl）才显示预览
                // API 返回的已有文件名需要认证才能预览，所以直接显示友好提示
                const showImage = previewUrl && !brokenImages[key];

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
                                id={`file-${key}`}
                                className="hidden"
                                accept="image/*"
                                disabled={isUploading}
                                onChange={(e) => {
                                    if (e.target.files?.[0]) processFile(index, e.target.files[0]);
                                }}
                            />

                            <label
                                htmlFor={`file-${key}`}
                                className="flex flex-col items-center justify-center cursor-pointer w-full min-h-[220px]"
                            >
                                {isUploading ? (
                                    <div className="flex flex-col items-center animate-pulse py-10">
                                        <Loader2 className="w-12 h-12 text-brand-500 animate-spin mb-4" />
                                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">等待文件上传中...</p>
                                    </div>
                                ) : showImage ? (
                                    <div className="relative w-full h-[220px] bg-slate-100 dark:bg-slate-950/50 flex justify-center items-center">
                                        <img
                                            src={previewUrl}
                                            alt="Preview"
                                            onError={() => setBrokenImages(prev => ({ ...prev, [key]: true }))}
                                            className="max-w-full max-h-full object-contain"
                                        />
                                        {/* Hover Overlay */}
                                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/drop:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-[2px]">
                                            <UploadCloud className="w-10 h-10 text-white mb-2" />
                                            <span className="text-white font-semibold text-sm px-4 py-2 bg-white/10 rounded-full border border-white/20">
                                                点击或拖拽替换图片
                                            </span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleClearFile(index);
                                                }}
                                                className="mt-3 flex items-center gap-1 px-3 py-1.5 text-xs text-white bg-red-500/80 hover:bg-red-600 rounded-full border border-white/20 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                                清除图片
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center py-8 px-4 text-center">
                                        {node.fieldValue ? (
                                            // Has filename but cannot preview
                                            <>
                                                <div className="w-16 h-16 bg-brand-50 dark:bg-brand-900/20 rounded-2xl flex items-center justify-center mb-4 text-brand-500">
                                                    <FileImage className="w-8 h-8" />
                                                </div>
                                                <div className="bg-white dark:bg-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm max-w-[90%]">
                                                    <p className="text-sm font-mono text-slate-700 dark:text-slate-200 truncate" title={node.fieldValue}>
                                                        {node.fieldValue}
                                                    </p>
                                                </div>
                                                <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-3">
                                                    ✓ 图片已就绪，可直接运行
                                                </p>
                                                <div className="flex items-center gap-3 mt-4">
                                                    <span className="text-sm text-brand-500 font-medium group-hover/drop:underline underline-offset-4">
                                                        点击替换
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleClearFile(index);
                                                        }}
                                                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-full border border-red-200 dark:border-red-800/50 transition-colors"
                                                    >
                                                        <X className="w-3 h-3" />
                                                        清除
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            // Empty State
                                            <>
                                                <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 group-hover/drop:scale-110 transition-transform duration-300">
                                                    <UploadCloud className="w-8 h-8 text-slate-500 dark:text-slate-400" />
                                                </div>
                                                <p className="text-base font-medium text-slate-700 dark:text-slate-200">
                                                    点击上传或拖拽图片
                                                </p>
                                                <p className="text-xs text-slate-400 mt-1.5 uppercase tracking-wider">
                                                    支持 JPG, PNG, WEBP
                                                </p>
                                            </>
                                        )}
                                    </div>
                                )}
                            </label>
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
                                id={`file-${key}`}
                                className="hidden"
                                accept={`${node.fieldType.toLowerCase()}/*`}
                                disabled={isUploading}
                                onChange={(e) => {
                                    if (e.target.files?.[0]) processFile(index, e.target.files[0]);
                                }}
                            />

                            <label
                                htmlFor={`file-${key}`}
                                className="flex flex-col items-center justify-center p-6 cursor-pointer w-full h-full min-h-[160px]"
                            >
                                {isUploading ? (
                                    <div className="flex flex-col items-center animate-pulse">
                                        <Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-3" />
                                        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">等待文件上传中...</p>
                                    </div>
                                ) : (
                                    <>
                                        {(node.fieldValue) ? (
                                            <div className="flex flex-col items-center text-slate-500 dark:text-slate-400">
                                                {node.fieldType === 'AUDIO' && <FileAudio className="w-12 h-12 mb-2 text-pink-500" />}
                                                {node.fieldType === 'VIDEO' && <FileVideo className="w-12 h-12 mb-2 text-red-500" />}
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">文件已就绪</p>
                                                <div className="bg-white dark:bg-slate-800 px-3 py-1 rounded border border-slate-200 dark:border-slate-700 mt-2">
                                                    <p className="text-xs font-mono text-slate-400">{node.fieldValue}</p>
                                                </div>
                                                <p className="text-xs mt-3 text-brand-500 font-medium hover:underline">更换文件</p>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors">
                                                <UploadCloud className="w-12 h-12 mb-3 opacity-50" />
                                                <p className="text-sm font-medium mb-1">点击或拖拽上传</p>
                                                <p className="text-[10px] uppercase tracking-wider opacity-70">
                                                    支持 {node.fieldType} 格式
                                                </p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </label>
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

    const secondaryLabel = (node: NodeInfo) => {
        const parts = [];
        if (node.nodeName) parts.push(node.nodeName);
        if (node.description && node.description.trim() && node.fieldName) {
            parts.push(node.fieldName);
        }
        return parts.join(' · ');
    };

    const handleBatchRun = () => {
        if (batchList.length === 0) {
            // Fallback to normal run if no batch list
            onRun(localNodes, undefined, undefined, decodeConfig);
            return;
        }

        onRun(localNodes, batchList, pendingFiles, decodeConfig, batchTaskName);
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
                        {/* Decode Settings Button */}
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



            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                {!isConnected ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 py-20 text-center">
                        <AlertCircle className="w-16 h-16 mb-4 opacity-20" />
                        <h3 className="text-lg font-medium text-slate-500 dark:text-slate-400">等待连接</h3>
                        <p className="text-sm max-w-xs mt-2">请在左侧侧边栏输入您的 API Key 和应用 ID 以加载参数。</p>
                    </div>
                ) : localNodes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600">
                        <AlertCircle className="w-10 h-10 opacity-30 mb-2" />
                        <p className="text-sm">无可用参数</p>
                    </div>
                ) : (
                    localNodes.map((node, idx) => {
                        const listOptions = parseListOptions(node);
                        const effectiveType = listOptions.length > 0 ? 'LIST' : node.fieldType;

                        return (
                            <div key={`${node.nodeId}-${idx}`} className="group bg-white dark:bg-[#161920] p-4 rounded-xl border border-slate-200 dark:border-slate-800/50 shadow-sm hover:border-brand-300 dark:hover:border-brand-500/50 transition-all duration-200">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                                            {getIcon(node, effectiveType)}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                                                {primaryLabel(node)}
                                                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                                                    #{node.nodeId}
                                                </span>
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono opacity-80">
                                                {secondaryLabel(node)}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded uppercase tracking-wider">
                                        {effectiveType}
                                    </span>
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
                        onClick={() => onRun(localNodes, undefined, undefined, decodeConfig)}
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
};

export default StepEditor;