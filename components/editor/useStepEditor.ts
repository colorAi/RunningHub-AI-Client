import React, { useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { buildStandardModelPayload, fetchStandardModelPricePreview, uploadFile } from '../../services/api';
import { NodeInfo, PendingFilesMap, RunningHubModelPricePreview } from '../../types';
import { getSwitchFieldConfig, parseListOptions } from '../../utils/nodeUtils';

import type { StepEditorProps, StepEditorRef } from './types';

const EMPTY_BATCH_LIST: NodeInfo[][] = [];
const EMPTY_PENDING_FILES: PendingFilesMap = {};

const cloneNodeRows = (rows?: NodeInfo[][]) => (rows || []).map(row => row.map(node => ({ ...node })));
const clonePendingFiles = (files?: PendingFilesMap) => ({ ...(files || {}) });
const formatPricePreview = (preview: RunningHubModelPricePreview | null): string | null => {
    if (!preview) return null;
    if (preview.isFreeThisCall || preview.estimatedPrice === 0) {
        return '本次免费';
    }
    if (preview.priceText) {
        return `约 ${preview.priceText}/次`;
    }
    if (preview.estimatedPrice == null) {
        return null;
    }

    const currency = (preview.currency || 'CNY').toUpperCase();
    try {
        const formatted = new Intl.NumberFormat('zh-CN', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
        }).format(preview.estimatedPrice);
        return `约 ${formatted}/次`;
    } catch {
        const trimmedPrice = preview.estimatedPrice.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
        return `约 ${trimmedPrice} ${currency}/次`;
    }
};

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

export function useStepEditor({ nodes, apiKeys, isConnected, runType, webAppInfo, onBack, onRun, onCancel, failedBatchIndices = new Set(), onRetryTask, instanceType = 'default', onInstanceTypeChange, initialBatchList = EMPTY_BATCH_LIST, initialBatchTaskName = '', initialPendingFiles = EMPTY_PENDING_FILES, mode = 'app', standardModelConfig }: StepEditorProps, ref: React.ForwardedRef<StepEditorRef>) {
    const editorDomId = useId().replace(/:/g, '-');
    const [localNodes, setLocalNodes] = useState<NodeInfo[]>(nodes);
    const [uploadingState, setUploadingState] = useState<Record<string, boolean>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [modelPricePreview, setModelPricePreview] = useState<RunningHubModelPricePreview | null>(null);
    const [isLoadingPricePreview, setIsLoadingPricePreview] = useState(false);

    // Batch settings state
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchList, setBatchList] = useState<NodeInfo[][]>(() => cloneNodeRows(initialBatchList));
    const [pendingFiles, setPendingFiles] = useState<PendingFilesMap>(() => clonePendingFiles(initialPendingFiles));
    const [batchTaskName, setBatchTaskName] = useState<string>(initialBatchTaskName);

    // App info modal state
    const [isAppInfoModalOpen, setIsAppInfoModalOpen] = useState(false);

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
    const primaryApiKey = apiKeys[0] || '';
    const hasUploadingFiles = Object.values(uploadingState).some(Boolean);
    const standardModelEndpoint = standardModelConfig?.endpoint?.trim() || '';
    const modelPricePreviewPayload = useMemo(
        () => mode === 'standard' ? buildStandardModelPayload(localNodes) : {},
        [localNodes, mode],
    );
    const modelPricePreviewLabel = formatPricePreview(modelPricePreview);

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
            hasUploadingFiles,
            isConnected,
        })
    }), [batchList, batchTaskName, hasUploadingFiles, instanceType, isConnected, localNodes, pendingFiles]);

    useEffect(() => {
        if (mode !== 'standard' || !isConnected || !standardModelEndpoint || !primaryApiKey || hasUploadingFiles) {
            setModelPricePreview(null);
            setIsLoadingPricePreview(false);
            return;
        }

        const abortController = new AbortController();
        const timer = window.setTimeout(() => {
            setIsLoadingPricePreview(true);
            fetchStandardModelPricePreview(
                primaryApiKey,
                standardModelEndpoint,
                modelPricePreviewPayload,
                undefined,
                abortController.signal,
            )
                .then((preview) => {
                    if (!abortController.signal.aborted) {
                        setModelPricePreview(preview);
                    }
                })
                .catch((error) => {
                    if (!abortController.signal.aborted) {
                        console.warn('Failed to preview standard model price', error);
                        setModelPricePreview(null);
                    }
                })
                .finally(() => {
                    if (!abortController.signal.aborted) {
                        setIsLoadingPricePreview(false);
                    }
                });
        }, 500);

        return () => {
            window.clearTimeout(timer);
            abortController.abort();
        };
    }, [hasUploadingFiles, isConnected, mode, modelPricePreviewPayload, primaryApiKey, standardModelEndpoint]);

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

    return { editorDomId, localNodes, uploadingState, errors, isLoadingPricePreview, isBatchModalOpen, setIsBatchModalOpen, batchList, setBatchList, pendingFiles, setPendingFiles, batchTaskName, setBatchTaskName, isAppInfoModalOpen, setIsAppInfoModalOpen, previews, mediaPreview, setMediaPreview, dragActive, brokenImages, setBrokenImages, brokenVideos, setBrokenVideos, brokenAudios, setBrokenAudios, primaryApiKey, hasUploadingFiles, modelPricePreviewLabel, isNodesLoading, handleTextChange, handleClearFile, processFile, handleDrag, handleDrop, getDisplayFileName, getNodePresentation };
}
