import React, { useState, useEffect, useId, useRef } from 'react';
import { NodeInfo, PendingFilesMap } from '../types';
import { getSwitchFieldConfig, parseListOptions } from '../utils/nodeUtils';
import { X, Plus, Trash2, Save, Copy, AlertCircle, UploadCloud, Loader2, FileAudio, FileVideo, FileImage, FileText, FolderOpen, Images, RefreshCw } from 'lucide-react';
import { uploadFile } from '../services/api';

interface BatchSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    nodes: NodeInfo[];
    onSave: (batchList: NodeInfo[][], pendingFiles: PendingFilesMap, taskName: string) => void;
    initialBatchList: NodeInfo[][];
    initialPendingFiles?: PendingFilesMap;
    initialTaskName?: string;
    apiKey: string;
    failedIndices?: Set<number>;  // 失败任务的索引集合
    onRetryTask?: (taskNodes: NodeInfo[], originalIndex: number, pendingFiles: PendingFilesMap) => void;  // 单个任务重试回调，传递当前编辑的节点数据
}

const BatchSettingsModal: React.FC<BatchSettingsModalProps> = ({
    isOpen,
    onClose,
    nodes,
    onSave,
    initialBatchList,
    initialPendingFiles = {},
    initialTaskName = '',
    apiKey,
    failedIndices = new Set(),
    onRetryTask
}) => {
    const modalDomId = useId().replace(/:/g, '-');
    const [batchList, setBatchList] = useState<NodeInfo[][]>(initialBatchList);
    const [taskName, setTaskName] = useState(initialTaskName);
    const [uploadingState, setUploadingState] = useState<Record<string, boolean>>({});
    const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
    const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const [pendingFiles, setPendingFiles] = useState<PendingFilesMap>({});
    const [selectedImageNodeId, setSelectedImageNodeId] = useState<string>('');
    const [selectedAudioNodeId, setSelectedAudioNodeId] = useState<string>('');
    const [selectedVideoNodeId, setSelectedVideoNodeId] = useState<string>('');
    const [selectedTextNodeId, setSelectedTextNodeId] = useState<string>('');
    const localPreviewsRef = useRef<Record<string, string>>({});

    const revokePreviewMap = (previewMap: Record<string, string>) => {
        Object.values(previewMap).forEach((url: string) => URL.revokeObjectURL(url));
    };

    const buildPreviewMapFromPendingFiles = (files: PendingFilesMap) => {
        const previews: Record<string, string> = {};

        Object.entries(files).forEach(([key, file]) => {
            if (file?.type?.startsWith('image/')) {
                previews[key] = URL.createObjectURL(file);
            }
        });

        return previews;
    };

    useEffect(() => {
        localPreviewsRef.current = localPreviews;
    }, [localPreviews]);

    useEffect(() => {
        if (isOpen && nodes && nodes.length > 0) {
            // If initial list is empty, start with one copy of current nodes
            if (initialBatchList.length > 0) {
                // Add unique IDs to existing batch tasks if they don't have one
                const listWithIds = initialBatchList.map((row, idx) => {
                    const existingTaskId = row[0]?._taskId;
                    if (existingTaskId) {
                        // Already has a task ID, keep it
                        return row;
                    }
                    // Generate new unique ID for this row
                    const taskId = `task-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`;
                    return row.map(node => ({ ...node, _taskId: taskId }));
                });
                setBatchList(listWithIds);
            } else {
                // Create first row with unique ID
                const taskId = `task-${Date.now()}-0-${Math.random().toString(36).substr(2, 9)}`;
                const newRow = JSON.parse(JSON.stringify(nodes)).map(node => ({ ...node, _taskId: taskId }));
                setBatchList([newRow]);
            }
            setPendingFiles({ ...initialPendingFiles });
            setLocalPreviews(prev => {
                revokePreviewMap(prev);
                return buildPreviewMapFromPendingFiles(initialPendingFiles);
            });
            setTaskName(initialTaskName);
        }
    }, [initialBatchList, initialPendingFiles, initialTaskName, isOpen, nodes]);

    // Sync fieldData from nodes to batchList when nodes are updated (e.g., dropdown options fetched)
    // This ensures batch settings have access to the latest dropdown options
    useEffect(() => {
        if (!nodes || nodes.length === 0 || batchList.length === 0) return;

        // Create a map of nodeId + fieldName -> latest fieldData from nodes
        // We use a composite key because multiple nodes in the list can share the same nodeId (belong to same ComfyUI node)
        // but have different fieldNames.
        const fieldDataMap = new Map<string, any>();
        nodes.forEach(node => {
            if (node.fieldData) {
                const key = `${node.nodeId}|${node.fieldName}`;
                fieldDataMap.set(key, node.fieldData);
            }
        });

        // Only update if there's new fieldData to sync
        if (fieldDataMap.size === 0) return;

        // Check if any batch node needs fieldData update
        let needsUpdate = false;
        for (const row of batchList) {
            for (const node of row) {
                const key = `${node.nodeId}|${node.fieldName}`;
                const latestFieldData = fieldDataMap.get(key);
                if (latestFieldData && node.fieldData !== latestFieldData) {
                    needsUpdate = true;
                    break;
                }
            }
            if (needsUpdate) break;
        }

        if (!needsUpdate) return;

        // Update batchList with synced fieldData (preserve fieldValue)
        setBatchList(prevBatchList =>
            prevBatchList.map(row =>
                row.map(node => {
                    const key = `${node.nodeId}|${node.fieldName}`;
                    const latestFieldData = fieldDataMap.get(key);
                    if (latestFieldData && node.fieldData !== latestFieldData) {
                        return { ...node, fieldData: latestFieldData };
                    }
                    return node;
                })
            )
        );
    }, [nodes, batchList]);

    // Cleanup previews
    useEffect(() => {
        return () => {
            revokePreviewMap(localPreviewsRef.current);
        };
    }, []);

    // Auto-dismiss toast after 3 seconds
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // Initialize selected image node - MUST be before conditional return
    // Reset when nodes change (e.g., switching applications)
    useEffect(() => {
        if (!nodes || nodes.length === 0) {
            setSelectedImageNodeId('');
            return;
        }
        const imageNodes = nodes.filter(n =>
            n.fieldType === 'IMAGE' ||
            n.description === '图像' ||
            n.fieldName === 'image'
        );
        if (imageNodes.length > 0) {
            // Always reset to first image node when nodes change
            setSelectedImageNodeId(`${imageNodes[0].nodeId}|${imageNodes[0].fieldName || ''}`);
        } else {
            setSelectedImageNodeId('');
        }
    }, [nodes]);

    // Initialize selected audio node - Reset when nodes change
    useEffect(() => {
        if (!nodes || nodes.length === 0) {
            setSelectedAudioNodeId('');
            return;
        }
        const audioNodes = nodes.filter(n =>
            n.fieldType === 'AUDIO' ||
            n.description === '音频' ||
            n.fieldName === 'audio' ||
            n.fieldName === 'audioUrl'
        );
        if (audioNodes.length > 0) {
            setSelectedAudioNodeId(`${audioNodes[0].nodeId}|${audioNodes[0].fieldName || ''}`);
        } else {
            setSelectedAudioNodeId('');
        }
    }, [nodes]);

    // Initialize selected video node - Reset when nodes change
    useEffect(() => {
        if (!nodes || nodes.length === 0) {
            setSelectedVideoNodeId('');
            return;
        }
        const videoNodes = nodes.filter(n =>
            n.fieldType === 'VIDEO' ||
            n.description === '视频' ||
            n.fieldName === 'video'
        );
        if (videoNodes.length > 0) {
            setSelectedVideoNodeId(`${videoNodes[0].nodeId}|${videoNodes[0].fieldName || ''}`);
        } else {
            setSelectedVideoNodeId('');
        }
    }, [nodes]);

    // Initialize selected text node - Reset when nodes change
    useEffect(() => {
        if (!nodes || nodes.length === 0) {
            setSelectedTextNodeId('');
            return;
        }
        const textNodes = nodes.filter(n => n.fieldType === 'STRING');
        if (textNodes.length > 0) {
            setSelectedTextNodeId(`${textNodes[0].nodeId}|${textNodes[0].fieldName || ''}`);
        } else {
            setSelectedTextNodeId('');
        }
    }, [nodes]);

    if (!isOpen) return null;

    const handleAddRow = () => {
        // Deep copy current nodes to create a new row
        const newRow = JSON.parse(JSON.stringify(nodes));
        // Generate unique ID for this batch task
        const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // Add _taskId to each node in the row (they all share the same task ID)
        const newRowWithId = newRow.map(node => ({ ...node, _taskId: taskId }));
        setBatchList(prev => [...prev, newRowWithId]);
    };

    const handleRemoveRow = (index: number) => {
        // Get the task ID of the row being deleted
        const taskId = batchList[index]?.[0]?._taskId;
        
        setBatchList(prev => prev.filter((_, i) => i !== index));
        
        // Also clean up pendingFiles and localPreviews for this task
        if (taskId) {
            setPendingFiles(prev => {
                const newPendingFiles = { ...prev };
                // Remove all entries that start with this taskId
                Object.keys(newPendingFiles).forEach(key => {
                    if (key.startsWith(`${taskId}|`)) {
                        delete newPendingFiles[key];
                    }
                });
                return newPendingFiles;
            });
            
            setLocalPreviews(prev => {
                const newPreviews = { ...prev };
                // Remove all entries that start with this taskId
                Object.keys(newPreviews).forEach(key => {
                    if (key.startsWith(`${taskId}|`)) {
                        URL.revokeObjectURL(newPreviews[key]);
                        delete newPreviews[key];
                    }
                });
                return newPreviews;
            });
        }
    };

    const handleFieldChange = (batchIndex: number, nodeId: string, fieldName: string, value: string) => {
        setBatchList(prev => {
            const newList = [...prev];
            const row = [...newList[batchIndex]];
            const nodeIndex = row.findIndex(n => n.nodeId === nodeId && n.fieldName === fieldName);
            if (nodeIndex !== -1) {
                row[nodeIndex] = { ...row[nodeIndex], fieldValue: value };
                newList[batchIndex] = row;
            }
            return newList;
        });
    };

    const handleFileUpload = async (batchIndex: number, nodeId: string, fieldName: string, file: File) => {
        // Use taskId if available, fallback to batchIndex for backward compatibility
        const taskId = batchList[batchIndex]?.[0]?._taskId || `task-${batchIndex}`;
        const key = `${taskId}|${nodeId}|${fieldName}`;

        // Create local preview immediately
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setLocalPreviews(prev => ({ ...prev, [key]: url }));
        }

        setUploadingState(prev => ({ ...prev, [key]: true }));

        try {
            const result = await uploadFile(apiKey, file);
            handleFieldChange(batchIndex, nodeId, fieldName, result.fileName);
        } catch (err: any) {
            console.error("Upload failed", err);
            // Optionally handle error state here
        } finally {
            setUploadingState(prev => ({ ...prev, [key]: false }));
        }
    };

    // Get all IMAGE type nodes (LoadImage nodes)
    const getImageNodes = () => nodes.filter(n =>
        n.fieldType === 'IMAGE' ||
        n.description === '图像' ||
        n.fieldName === 'image'
    );

    // Get all AUDIO type nodes
    const getAudioNodes = () => nodes.filter(n =>
        n.fieldType === 'AUDIO' ||
        n.description === '音频' ||
        n.fieldName === 'audio' ||
        n.fieldName === 'audioUrl'
    );

    // Get all VIDEO type nodes (LoadVideo nodes)
    const getVideoNodes = () => nodes.filter(n =>
        n.fieldType === 'VIDEO' ||
        n.description === '视频' ||
        n.fieldName === 'video'
    );

    // Get all TEXT/STRING type nodes
    const getTextNodes = () => nodes.filter(n => n.fieldType === 'STRING');

    const applyBatchImages = (imageFiles: { name: string; file: File }[], sourceLabel: string) => {
        const imageNodes = getImageNodes();
        if (imageNodes.length === 0) {
            setToast({ type: 'error', message: '未找到图像加载节点（LoadImage）' });
            return;
        }

        const targetKey = selectedImageNodeId || `${imageNodes[0].nodeId}|${imageNodes[0].fieldName || ''}`;
        const [targetNodeId, targetFieldName] = targetKey.split('|');
        const existingRows = batchList.length;

        let finalBatchList: NodeInfo[][];
        const newPendingFiles: PendingFilesMap = { ...pendingFiles };
        const newPreviews: Record<string, string> = { ...localPreviews };

        const findNodeIndex = (rowNodes: NodeInfo[]) => {
            if (targetFieldName && targetFieldName !== '' && targetFieldName !== 'undefined') {
                return rowNodes.findIndex(n => String(n.nodeId) === String(targetNodeId) && n.fieldName === targetFieldName);
            }
            return rowNodes.findIndex(n => String(n.nodeId) === String(targetNodeId));
        };

        if (existingRows > 0) {
            finalBatchList = [...batchList];

            imageFiles.forEach((imgFile, index) => {
                let taskId;
                if (index < existingRows) {
                    const rowNodes = [...finalBatchList[index]];
                    taskId = rowNodes[0]?._taskId;
                    const nodeIndex = findNodeIndex(rowNodes);
                    if (nodeIndex !== -1) {
                        rowNodes[nodeIndex] = { ...rowNodes[nodeIndex], fieldValue: imgFile.name };
                        finalBatchList[index] = rowNodes;
                    }
                } else {
                    const newRowNodes: NodeInfo[] = JSON.parse(JSON.stringify(nodes));
                    taskId = `task-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                    newRowNodes.forEach(node => node._taskId = taskId);
                    const nodeIndex = findNodeIndex(newRowNodes);
                    if (nodeIndex !== -1) {
                        newRowNodes[nodeIndex].fieldValue = imgFile.name;
                    }
                    finalBatchList.push(newRowNodes);
                }

                const fieldName = targetFieldName || (finalBatchList[index] && findNodeIndex(finalBatchList[index]) !== -1 ? finalBatchList[index][findNodeIndex(finalBatchList[index])].fieldName : 'image');
                const key = `${taskId}|${targetNodeId}|${fieldName}`;
                newPendingFiles[key] = imgFile.file;
                newPreviews[key] = URL.createObjectURL(imgFile.file);
            });
        } else {
            finalBatchList = [];
            imageFiles.forEach((imgFile, index) => {
                const rowNodes: NodeInfo[] = JSON.parse(JSON.stringify(nodes));
                const taskId = `task-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                rowNodes.forEach(node => node._taskId = taskId);
                const nodeIndex = findNodeIndex(rowNodes);
                let fieldName = 'image';
                if (nodeIndex !== -1) {
                    rowNodes[nodeIndex].fieldValue = imgFile.name;
                    fieldName = rowNodes[nodeIndex].fieldName;
                }
                finalBatchList.push(rowNodes);

                const key = `${taskId}|${targetNodeId}|${fieldName}`;
                newPendingFiles[key] = imgFile.file;
                newPreviews[key] = URL.createObjectURL(imgFile.file);
            });
        }

        setBatchList(finalBatchList);
        setPendingFiles(newPendingFiles);
        setLocalPreviews(newPreviews);

        console.log('[BatchImport] Summary:', {
            sourceLabel,
            targetKey,
            targetNodeId,
            targetFieldName,
            imageFilesCount: imageFiles.length,
            existingRows,
            finalRows: finalBatchList.length,
            pendingFilesKeys: Object.keys(newPendingFiles),
            previewKeys: Object.keys(newPreviews)
        });

        setToast({ type: 'success', message: `成功从${sourceLabel}导入 ${imageFiles.length} 张图片到 ${existingRows > 0 ? '现有' : '新建'}任务！` });
    };

    // Batch Image Import from folder
    const handleBatchImageImport = async () => {
        try {
            const imageNodes = getImageNodes();
            if (imageNodes.length === 0) {
                setToast({ type: 'error', message: '未找到图像加载节点（LoadImage）' });
                return;
            }

            const dirHandle = await (window as any).showDirectoryPicker();
            const imageFiles: { name: string; file: File }[] = [];
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.jfif'];

            const getFilesRecursively = async (entry: any) => {
                if (entry.kind === 'file') {
                    const name = entry.name.toLowerCase();
                    if (imageExtensions.some(ext => name.endsWith(ext))) {
                        const file = await entry.getFile();
                        imageFiles.push({ name: entry.name, file });
                    }
                } else if (entry.kind === 'directory') {
                    for await (const handle of entry.values()) {
                        await getFilesRecursively(handle);
                    }
                }
            };

            for await (const entry of dirHandle.values()) {
                await getFilesRecursively(entry);
            }

            if (imageFiles.length === 0) {
                setToast({ type: 'error', message: '文件夹中没有找到图片文件' });
                return;
            }

            imageFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
            applyBatchImages(imageFiles, '文件夹');
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error('Failed to import images:', e);
                setToast({ type: 'error', message: '导入图片失败: ' + e.message });
            }
        }
    };

    // Batch Image Import from selected files, preserving selection order
    const handleBatchImageFileSelect = async () => {
        try {
            const imageNodes = getImageNodes();
            if (imageNodes.length === 0) {
                setToast({ type: 'error', message: '未找到图像加载节点（LoadImage）' });
                return;
            }

            const fileHandles = await (window as any).showOpenFilePicker({
                types: [{
                    description: 'Image Files',
                    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.jfif'] }
                }],
                multiple: true,
                excludeAcceptAllOption: false,
            });

            const imageFiles = await Promise.all(
                fileHandles.map(async (handle: any) => {
                    const file = await handle.getFile();
                    return { name: file.name, file };
                })
            );

            if (imageFiles.length === 0) {
                setToast({ type: 'error', message: '未选择图片文件' });
                return;
            }

            applyBatchImages(imageFiles, '所选文件');
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error('Failed to select images:', e);
                setToast({ type: 'error', message: '选择图片失败: ' + e.message });
            }
        }
    };

    // Batch Video Import from folder
    const handleBatchVideoImport = async () => {
        try {
            const videoNodes = getVideoNodes();
            if (videoNodes.length === 0) {
                setToast({ type: 'error', message: '未找到视频加载节点（LoadVideo）' });
                return;
            }

            const targetKey = selectedVideoNodeId || `${videoNodes[0].nodeId}|${videoNodes[0].fieldName || ''}`;
            const [targetNodeId, targetFieldName] = targetKey.split('|');

            // Use File System Access API to pick a directory
            const dirHandle = await (window as any).showDirectoryPicker();

            // Collect all video files recursively
            const videoFiles: { name: string; file: File }[] = [];
            const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v'];

            const getFilesRecursively = async (entry: any) => {
                if (entry.kind === 'file') {
                    const name = entry.name.toLowerCase();
                    if (videoExtensions.some(ext => name.endsWith(ext))) {
                        const file = await entry.getFile();
                        videoFiles.push({ name: entry.name, file });
                    }
                } else if (entry.kind === 'directory') {
                    for await (const handle of entry.values()) {
                        await getFilesRecursively(handle);
                    }
                }
            };

            for await (const entry of dirHandle.values()) {
                await getFilesRecursively(entry);
            }

            if (videoFiles.length === 0) {
                setToast({ type: 'error', message: '文件夹中没有找到视频文件' });
                return;
            }

            // Sort by filename
            videoFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));

            const existingRows = batchList.length;

            let finalBatchList: NodeInfo[][];
            const newPendingFiles: PendingFilesMap = { ...pendingFiles };
            const newPreviews: Record<string, string> = { ...localPreviews };

            const findNodeIndex = (rowNodes: NodeInfo[]) => {
                if (targetFieldName && targetFieldName !== '' && targetFieldName !== 'undefined') {
                    return rowNodes.findIndex(n => String(n.nodeId) === String(targetNodeId) && n.fieldName === targetFieldName);
                }
                return rowNodes.findIndex(n => String(n.nodeId) === String(targetNodeId));
            };

            if (existingRows > 0) {
                finalBatchList = [...batchList];

                videoFiles.forEach((vidFile, index) => {
                    let taskId;
                    if (index < existingRows) {
                        const rowNodes = [...finalBatchList[index]];
                        taskId = rowNodes[0]?._taskId;
                        const nodeIndex = findNodeIndex(rowNodes);
                        if (nodeIndex !== -1) {
                            rowNodes[nodeIndex] = { ...rowNodes[nodeIndex], fieldValue: vidFile.name };
                            finalBatchList[index] = rowNodes;
                        }
                    } else {
                        const newRowNodes: NodeInfo[] = JSON.parse(JSON.stringify(nodes));
                        // Generate unique ID for new row
                        taskId = `task-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                        newRowNodes.forEach(node => node._taskId = taskId);
                        const nodeIndex = findNodeIndex(newRowNodes);
                        if (nodeIndex !== -1) {
                            newRowNodes[nodeIndex].fieldValue = vidFile.name;
                        }
                        finalBatchList.push(newRowNodes);
                    }

                    const fieldName = targetFieldName || (finalBatchList[index] && findNodeIndex(finalBatchList[index]) !== -1 ? finalBatchList[index][findNodeIndex(finalBatchList[index])].fieldName : 'video');
                    const key = `${taskId}|${targetNodeId}|${fieldName}`;
                    newPendingFiles[key] = vidFile.file;
                    // No preview URL for videos (too heavy), just store as pending
                });
            } else {
                finalBatchList = [];
                videoFiles.forEach((vidFile, index) => {
                    const rowNodes: NodeInfo[] = JSON.parse(JSON.stringify(nodes));
                    // Generate unique ID for new row
                    const taskId = `task-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                    rowNodes.forEach(node => node._taskId = taskId);
                    const nodeIndex = findNodeIndex(rowNodes);
                    let fieldName = 'video';
                    if (nodeIndex !== -1) {
                        rowNodes[nodeIndex].fieldValue = vidFile.name;
                        fieldName = rowNodes[nodeIndex].fieldName;
                    }
                    finalBatchList.push(rowNodes);

                    const key = `${taskId}|${targetNodeId}|${fieldName}`;
                    newPendingFiles[key] = vidFile.file;
                });
            }

            setBatchList(finalBatchList);
            setPendingFiles(newPendingFiles);
            setLocalPreviews(newPreviews);

            console.log('[BatchVideoImport] Summary:', {
                targetKey,
                targetNodeId,
                targetFieldName,
                videoFilesCount: videoFiles.length,
                existingRows,
                finalRows: finalBatchList.length,
                pendingFilesKeys: Object.keys(newPendingFiles)
            });

            setToast({ type: 'success', message: `成功导入 ${videoFiles.length} 个视频到 ${existingRows > 0 ? '现有' : '新建'}任务！` });

        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error('Failed to import videos:', e);
                setToast({ type: 'error', message: '导入视频失败: ' + e.message });
            }
        }
    };

    const handleSave = () => {
        onSave(batchList, pendingFiles, taskName);
        onClose();
    };

    // Handle close without save - clear all cached data
    const handleClose = () => {
        // Revoke all local preview URLs to prevent memory leaks
        revokePreviewMap(localPreviews);
        // Reset to initial state
        setBatchList(initialBatchList.length > 0 ? initialBatchList : []);
        setPendingFiles({ ...initialPendingFiles });
        setLocalPreviews({});
        onClose();
    };

    // Batch Audio Import from folder
    const handleBatchAudioImport = async () => {
        try {
            const audioNodes = getAudioNodes();
            if (audioNodes.length === 0) {
                setToast({ type: 'error', message: '未找到音频加载节点' });
                return;
            }

            const targetKey = selectedAudioNodeId || `${audioNodes[0].nodeId}|${audioNodes[0].fieldName || ''}`;
            const [targetNodeId, targetFieldName] = targetKey.split('|');

            const dirHandle = await (window as any).showDirectoryPicker();

            const audioFiles: { name: string; file: File }[] = [];
            const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma'];

            const getFilesRecursively = async (entry: any) => {
                if (entry.kind === 'file') {
                    const name = entry.name.toLowerCase();
                    if (audioExtensions.some(ext => name.endsWith(ext))) {
                        const file = await entry.getFile();
                        audioFiles.push({ name: entry.name, file });
                    }
                } else if (entry.kind === 'directory') {
                    for await (const handle of entry.values()) {
                        await getFilesRecursively(handle);
                    }
                }
            };

            for await (const entry of dirHandle.values()) {
                await getFilesRecursively(entry);
            }

            if (audioFiles.length === 0) {
                setToast({ type: 'error', message: '文件夹中没有找到音频文件' });
                return;
            }

            audioFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));

            const existingRows = batchList.length;

            let finalBatchList: NodeInfo[][];
            const newPendingFiles: PendingFilesMap = { ...pendingFiles };
            const newPreviews: Record<string, string> = { ...localPreviews };

            const findNodeIndex = (rowNodes: NodeInfo[]) => {
                if (targetFieldName && targetFieldName !== '' && targetFieldName !== 'undefined') {
                    return rowNodes.findIndex(n => String(n.nodeId) === String(targetNodeId) && n.fieldName === targetFieldName);
                }
                return rowNodes.findIndex(n => String(n.nodeId) === String(targetNodeId));
            };

            if (existingRows > 0) {
                finalBatchList = [...batchList];

                audioFiles.forEach((audioFile, index) => {
                    let taskId;
                    if (index < existingRows) {
                        const rowNodes = [...finalBatchList[index]];
                        taskId = rowNodes[0]?._taskId;
                        const nodeIndex = findNodeIndex(rowNodes);
                        if (nodeIndex !== -1) {
                            rowNodes[nodeIndex] = { ...rowNodes[nodeIndex], fieldValue: audioFile.name };
                            finalBatchList[index] = rowNodes;
                        }
                    } else {
                        const newRowNodes: NodeInfo[] = JSON.parse(JSON.stringify(nodes));
                        taskId = `task-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                        newRowNodes.forEach(node => node._taskId = taskId);
                        const nodeIndex = findNodeIndex(newRowNodes);
                        if (nodeIndex !== -1) {
                            newRowNodes[nodeIndex].fieldValue = audioFile.name;
                        }
                        finalBatchList.push(newRowNodes);
                    }

                    const fieldName = targetFieldName || (finalBatchList[index] && findNodeIndex(finalBatchList[index]) !== -1 ? finalBatchList[index][findNodeIndex(finalBatchList[index])].fieldName : 'audio');
                    const key = `${taskId}|${targetNodeId}|${fieldName}`;
                    newPendingFiles[key] = audioFile.file;
                });
            } else {
                finalBatchList = [];
                audioFiles.forEach((audioFile, index) => {
                    const rowNodes: NodeInfo[] = JSON.parse(JSON.stringify(nodes));
                    const taskId = `task-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                    rowNodes.forEach(node => node._taskId = taskId);
                    const nodeIndex = findNodeIndex(rowNodes);
                    let fieldName = 'audio';
                    if (nodeIndex !== -1) {
                        rowNodes[nodeIndex].fieldValue = audioFile.name;
                        fieldName = rowNodes[nodeIndex].fieldName;
                    }
                    finalBatchList.push(rowNodes);

                    const key = `${taskId}|${targetNodeId}|${fieldName}`;
                    newPendingFiles[key] = audioFile.file;
                });
            }

            setBatchList(finalBatchList);
            setPendingFiles(newPendingFiles);
            setLocalPreviews(newPreviews);

            console.log('[BatchAudioImport] Summary:', {
                targetKey,
                targetNodeId,
                targetFieldName,
                audioFilesCount: audioFiles.length,
                existingRows,
                finalRows: finalBatchList.length,
                pendingFilesKeys: Object.keys(newPendingFiles)
            });

            setToast({ type: 'success', message: `成功导入 ${audioFiles.length} 个音频到 ${existingRows > 0 ? '现有' : '新建'}任务！` });

        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error('Failed to import audio:', e);
                setToast({ type: 'error', message: '导入音频失败: ' + e.message });
            }
        }
    };

    // Document List Mode: Import prompts from TXT file
    const handleDocumentListMode = async () => {
        try {
            const textNodes = getTextNodes();
            if (textNodes.length === 0) {
                setToast({ type: 'error', message: '未找到文本输入节点' });
                return;
            }

            const targetKey = selectedTextNodeId || `${textNodes[0].nodeId}|${textNodes[0].fieldName || ''}`;
            const [targetNodeId, targetFieldName] = targetKey.split('|');

            // Use File System Access API to pick a .txt file
            const [fileHandle] = await (window as any).showOpenFilePicker({
                types: [{
                    description: 'Text Files',
                    accept: { 'text/plain': ['.txt'] }
                }],
                multiple: false
            });

            const file = await fileHandle.getFile();
            const content = await file.text();

            // Parse by single newline (each line = one prompt)
            const lines = content.split(/\r?\n/).filter((line: string) => line.trim());

            if (lines.length === 0) {
                setToast({ type: 'error', message: '文档中没有找到有效的文本内容' });
                return;
            }

            // Find the target node index using selected node
            const findNodeIndex = (rowNodes: NodeInfo[]) => {
                if (targetFieldName && targetFieldName !== '' && targetFieldName !== 'undefined') {
                    return rowNodes.findIndex(n => String(n.nodeId) === String(targetNodeId) && n.fieldName === targetFieldName);
                }
                return rowNodes.findIndex(n => String(n.nodeId) === String(targetNodeId));
            };

            // Smart merge logic: if batchList already has rows, update existing rows' target node
            // instead of replacing everything (preserves other node values)
            const existingRows = batchList.length;

            let finalBatchList: NodeInfo[][];

            if (existingRows > 0) {
                // Update existing rows with new text for target node
                finalBatchList = [...batchList];

                lines.forEach((line: string, index: number) => {
                    if (index < existingRows) {
                        // Update existing row - preserve other nodes, only update target
                        const rowNodes = [...finalBatchList[index]];
                        const nodeIndex = findNodeIndex(rowNodes);
                        if (nodeIndex !== -1) {
                            rowNodes[nodeIndex] = { ...rowNodes[nodeIndex], fieldValue: line.trim() };
                            finalBatchList[index] = rowNodes;
                        }
                    } else {
                        // Add new row for extra lines
                        const newRowNodes: NodeInfo[] = JSON.parse(JSON.stringify(nodes));
                        // Generate unique ID for new row
                        const taskId = `task-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                        newRowNodes.forEach(node => node._taskId = taskId);
                        const nodeIndex = findNodeIndex(newRowNodes);
                        if (nodeIndex !== -1) {
                            newRowNodes[nodeIndex].fieldValue = line.trim();
                        }
                        finalBatchList.push(newRowNodes);
                    }
                });
            } else {
                // No existing rows, create new ones
                finalBatchList = lines.map((line: string, index: number) => {
                    const rowNodes: NodeInfo[] = JSON.parse(JSON.stringify(nodes));
                    // Generate unique ID for new row
                    const taskId = `task-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                    rowNodes.forEach(node => node._taskId = taskId);
                    const nodeIndex = findNodeIndex(rowNodes);
                    if (nodeIndex !== -1) {
                        rowNodes[nodeIndex].fieldValue = line.trim();
                    }
                    return rowNodes;
                });
            }

            setBatchList(finalBatchList);

            // Find the target node name for display
            const targetNode = textNodes.find(n => `${n.nodeId}|${n.fieldName || ''}` === targetKey);
            const nodeName = targetNode?.nodeName || targetNode?.fieldName || '文本节点';
            setToast({ type: 'success', message: `成功导入 ${lines.length} 条文本到 ${nodeName}${existingRows > 0 ? '（已合并到现有任务）' : ''}！` });

        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error('Failed to read document:', e);
                setToast({ type: 'error', message: '读取文档失败: ' + e.message });
            }
        }
    };

    const looksLikeUrl = (s: string) => /^(https?:\/\/|data:)/i.test(s);

    // Helper to render simplified input based on type
    const renderBatchInput = (node: NodeInfo, batchIndex: number) => {
        const handleChange = (val: string) => handleFieldChange(batchIndex, node.nodeId, node.fieldName, val);
        // Use taskId if available, fallback to batchIndex for backward compatibility
        const taskId = node._taskId || `task-${batchIndex}`;
        const key = `${taskId}|${node.nodeId}|${node.fieldName || ''}`; // SAFE FIELD NAME
        const fileInputId = `file-${modalDomId}-${key}`;
        const isUploading = uploadingState[key];

        // 1. Media Types (Image, Audio, Video) - Mini Drop Zone
        if (['IMAGE', 'AUDIO', 'VIDEO'].includes(node.fieldType)) {
            const isImage = node.fieldType === 'IMAGE';
            const previewUrl = localPreviews[key];
            const showPreview = isImage && (previewUrl || (node.fieldValue && looksLikeUrl(node.fieldValue)));

            return (
                <div className="relative w-[160px] h-[60px] group">
                    <input
                        type="file"
                        id={fileInputId}
                        className="hidden"
                        accept={`${node.fieldType.toLowerCase()}/*`}
                        disabled={isUploading}
                        onChange={(e) => {
                            if (e.target.files?.[0]) handleFileUpload(batchIndex, node.nodeId, node.fieldName, e.target.files[0]);
                        }}
                    />
                    <label
                        htmlFor={fileInputId}
                        className={`
                            flex items-center justify-center w-full h-full rounded-lg border-2 border-dashed cursor-pointer transition-all overflow-hidden px-2 gap-2
                            ${isUploading
                                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                                : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0F1115] hover:border-brand-400 dark:hover:border-brand-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }
                        `}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (e.dataTransfer.files?.[0]) handleFileUpload(batchIndex, node.nodeId, node.fieldName, e.dataTransfer.files[0]);
                        }}
                    >
                        {isUploading ? (
                            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                        ) : showPreview ? (
                            <div className="relative w-full h-full flex items-center gap-2">
                                <img
                                    src={previewUrl || node.fieldValue}
                                    alt="Preview"
                                    className="h-full w-auto max-w-[50px] object-cover rounded"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] truncate text-slate-600 dark:text-slate-300">
                                        {node.fieldValue || '已选择图片'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <UploadCloud className="w-5 h-5 text-slate-400 shrink-0" />
                                <div className="flex-1 min-w-0 text-left">
                                    {node.fieldValue ? (
                                        <p className="text-[10px] truncate text-slate-600 dark:text-slate-300" title={node.fieldValue}>{node.fieldValue}</p>
                                    ) : (
                                        <p className="text-[10px] text-slate-400">上传{node.fieldType}</p>
                                    )}
                                </div>
                            </>
                        )}
                    </label>
                </div>
            );
        }

        // 2. Prompt / Text Area - All STRING types use textarea
        if (node.fieldType === 'STRING') {
            return (
                <textarea
                    value={node.fieldValue}
                    onChange={(e) => handleChange(e.target.value)}
                    style={{ width: '400px', height: '50px' }}
                    className="px-3 py-2 text-xs bg-slate-50 dark:bg-[#0F1115] border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-brand-500 outline-none resize-none leading-relaxed"
                    placeholder="输入文本..."
                />
            );
        }

        // 3. Numbers - Small
        if (node.fieldType === 'INT' || node.fieldType === 'FLOAT') {
            return (
                <input
                    type="number"
                    step={node.fieldType === 'FLOAT' ? "0.01" : "1"}
                    value={node.fieldValue}
                    onChange={(e) => handleChange(e.target.value)}
                    className="w-[70px] px-2 py-1.5 text-xs bg-slate-50 dark:bg-[#0F1115] border border-slate-300 dark:border-slate-700 rounded focus:ring-1 focus:ring-brand-500 outline-none text-center font-mono"
                />
            );
        }

        const switchConfig = getSwitchFieldConfig(node);
        if (switchConfig) {
            return (
                <button
                    type="button"
                    onClick={() => handleChange(switchConfig.checked ? switchConfig.uncheckedValue : switchConfig.checkedValue)}
                    className={`w-[140px] h-[36px] px-3 rounded-lg border text-xs transition-all flex items-center justify-between ${
                        switchConfig.checked
                            ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/20 dark:text-brand-300'
                            : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-300'
                    }`}
                    title={`${switchConfig.uncheckedLabel} / ${switchConfig.checkedLabel}`}
                >
                    <span className="truncate">{switchConfig.checked ? switchConfig.checkedLabel : switchConfig.uncheckedLabel}</span>
                    <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        switchConfig.checked ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-600'
                    }`}>
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                            switchConfig.checked ? 'translate-x-4' : 'translate-x-0.5'
                        }`} />
                    </span>
                </button>
            );
        }

        // 4. List / Select - Auto-detect based on fieldData availability
        const options = parseListOptions(node);
        if (options.length > 0) {
            return (
                <select
                    value={node.fieldValue}
                    onChange={(e) => handleChange(e.target.value)}
                    className="w-[120px] px-2 py-1.5 text-xs bg-slate-50 dark:bg-[#0F1115] border border-slate-300 dark:border-slate-700 rounded focus:ring-1 focus:ring-brand-500 outline-none text-slate-700 dark:text-slate-200"
                >
                    {!node.fieldValue && <option value="" disabled>请选择</option>}
                    {options.map((opt, i) => (
                        <option key={opt.index} value={opt.index} className="bg-white dark:bg-slate-800">{opt.name}</option>
                    ))}
                </select>
            );
        }

        // Default text input
        return (
            <input
                type="text"
                value={node.fieldValue}
                onChange={(e) => handleChange(e.target.value)}
                className="w-[140px] px-2 py-1.5 text-xs bg-slate-50 dark:bg-[#0F1115] border border-slate-300 dark:border-slate-700 rounded focus:ring-1 focus:ring-brand-500 outline-none"
                placeholder={node.fieldType}
                title={node.fieldValue}
            />
        );
    };

    // Helper to sort nodes: Media -> Prompts -> Others -> Numbers
    const sortNodes = (nodes: NodeInfo[]) => {
        return [...nodes].sort((a, b) => {
            const getScore = (n: NodeInfo) => {
                if (['IMAGE', 'AUDIO', 'VIDEO'].includes(n.fieldType)) return 1;
                if (n.fieldType === 'STRING' && (n.nodeName.toLowerCase().includes('prompt') || n.description?.includes('文本') || n.fieldName?.includes('prompt'))) return 2;
                if (n.fieldType === 'INT' || n.fieldType === 'FLOAT') return 4;
                return 3;
            };
            return getScore(a) - getScore(b);
        });
    };

    const renderBatchActionGroup = ({
        nodes,
        value,
        onChange,
        title,
        actionTitle,
        actionLabel,
        actionIcon,
        actionClassName,
        onAction,
        fallbackLabel,
        secondaryActionLabel,
        secondaryActionTitle,
        secondaryActionIcon,
        secondaryActionClassName,
        onSecondaryAction,
        horizontalActions,
    }: {
        nodes: NodeInfo[];
        value: string;
        onChange: (value: string) => void;
        title: string;
        actionTitle: string;
        actionLabel: string;
        actionIcon: React.ReactNode;
        actionClassName: string;
        onAction: () => void;
        fallbackLabel: string;
        secondaryActionLabel?: string;
        secondaryActionTitle?: string;
        secondaryActionIcon?: React.ReactNode;
        secondaryActionClassName?: string;
        onSecondaryAction?: () => void;
        horizontalActions?: boolean;
    }) => {
        if (nodes.length === 0) return null;

        return (
            <div className="flex w-[188px] shrink-0 flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-[#0F1115]">
                <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">目标节点</span>
                    <select
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={nodes.length === 1}
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        title={title}
                    >
                        {nodes.map(node => (
                            <option
                                key={`${node.nodeId}|${node.fieldName || ''}`}
                                value={`${node.nodeId}|${node.fieldName || ''}`}
                                className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                            >
                                {node.nodeName || node.fieldName || fallbackLabel} (#{node.nodeId})
                            </option>
                        ))}
                    </select>
                </div>
                <div className={`flex gap-1.5 ${horizontalActions ? 'flex-row' : 'flex-col'}`}>
                    <button
                        onClick={onAction}
                        className={`flex h-9 items-center justify-center rounded-lg border font-medium transition-colors ${onSecondaryAction && horizontalActions ? 'flex-1 min-w-0 gap-1 px-2 text-xs whitespace-nowrap' : 'gap-2 px-3 text-sm'} ${actionClassName}`}
                        title={actionTitle}
                    >
                        {actionIcon}
                        <span className="truncate">{actionLabel}</span>
                    </button>
                    {onSecondaryAction && secondaryActionLabel && secondaryActionTitle && secondaryActionClassName && (
                        <button
                            onClick={onSecondaryAction}
                            className={`flex h-9 items-center justify-center rounded-lg border font-medium transition-colors ${horizontalActions ? 'flex-1 min-w-0 gap-1 px-2 text-xs whitespace-nowrap' : 'gap-2 px-3 text-sm'} ${secondaryActionClassName}`}
                            title={secondaryActionTitle}
                        >
                            {secondaryActionIcon}
                            <span className="truncate">{secondaryActionLabel}</span>
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 md:p-3">
            <div className="bg-white dark:bg-[#161920] rounded-xl shadow-2xl w-[98vw] h-[92vh] max-w-[1800px] flex flex-col border border-slate-200 dark:border-slate-800">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white">批量运行设置</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            添加多组参数配置，系统将按顺序依次执行任务。
                        </p>
                    </div>
                    <button onClick={handleClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 dark:bg-[#0F1115]/50">
                    <div className="flex flex-col gap-4">
                        {batchList.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                                <Copy className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-sm font-medium">暂无批量配置</p>
                                <p className="text-xs mt-2 opacity-70">点击下方“添加配置”按钮，复制当前参数开始设置</p>
                            </div>
                        ) : (
                            batchList.map((rowNodes, batchIndex) => {
                                const isFailed = failedIndices.has(batchIndex);
                                // Use _taskId as key for stable rendering, fallback to batchIndex
                                const taskId = rowNodes[0]?._taskId || `task-${batchIndex}`;
                                return (
                                    <div key={taskId} className={`bg-white dark:bg-[#161920] rounded-lg border shadow-sm overflow-hidden flex flex-col shrink-0 ${isFailed ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-800'}`}>
                                        {/* Card Header */}
                                        <div className={`flex items-center justify-between px-3 py-2 border-b ${isFailed ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}`}>
                                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${isFailed ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'}`}>
                                                    {batchIndex + 1}
                                                </span>
                                                任务配置 #{batchIndex + 1}
                                                {isFailed && (
                                                    <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
                                                        失败
                                                    </span>
                                                )}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                {/* 重试按钮 - 所有任务都有 */}
                                                {onRetryTask && (
                                                    <button
                                                        onClick={() => onRetryTask(batchList[batchIndex], batchIndex, pendingFiles)} // 传递当前编辑的数据
                                                        className={`transition-colors p-1 rounded ${isFailed ? 'text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30' : 'text-slate-400 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                                        title="运行此任务"
                                                    >
                                                        <RefreshCw className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleRemoveRow(batchIndex)}
                                                    className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                                                    title="删除此配置"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Card Content - Horizontal Scroll */}
                                        <div className="p-3 overflow-x-auto">
                                            <div className="flex gap-3 min-w-max items-start">
                                                {rowNodes.map((node, nodeIdx) => (
                                                    <div key={`${batchIndex}-${node.nodeId}-${node.fieldName || nodeIdx}`} className="flex flex-col gap-1.5 w-auto">
                                                        <label
                                                            className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate max-w-[140px]"
                                                            title={node.description || node.nodeName || node.fieldName}
                                                        >
                                                            {node.description || node.nodeName || node.fieldName || `参数 ${nodeIdx + 1}`}
                                                        </label>
                                                        {renderBatchInput(node, batchIndex)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-start gap-4 bg-white dark:bg-[#161920] shrink-0">
                    <div className="flex flex-wrap items-start gap-2">
                        <div className="flex w-[120px] shrink-0 flex-col gap-2">
                            <button
                                onClick={handleAddRow}
                                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 rounded-lg transition-colors border border-brand-200 dark:border-brand-800/50"
                            >
                                <Plus className="w-4 h-4" />
                                添加配置
                            </button>
                            <button
                                onClick={() => {
                                    setBatchList([]);
                                    setPendingFiles({});
                                    setLocalPreviews({});  // Also clear previews
                                }}
                                disabled={batchList.length === 0}
                                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors border border-red-200 dark:border-red-800/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="清空所有配置"
                            >
                                <Trash2 className="w-4 h-4" />
                                清空
                            </button>
                        </div>
                        {renderBatchActionGroup({
                            nodes: getTextNodes(),
                            value: selectedTextNodeId,
                            onChange: setSelectedTextNodeId,
                            title: '选择批量导入文本的目标节点',
                            actionTitle: '从TXT文件导入提示词，每行为一个任务',
                            actionLabel: '导入文档',
                            actionIcon: <FileText className="w-4 h-4" />,
                            actionClassName: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800/50',
                            onAction: handleDocumentListMode,
                            fallbackLabel: 'Text',
                        })}
                        {renderBatchActionGroup({
                            nodes: getImageNodes(),
                            value: selectedImageNodeId,
                            onChange: setSelectedImageNodeId,
                            title: '选择批量传图的目标节点',
                            actionTitle: '从文件夹批量导入图片',
                            actionLabel: '文件夹',
                            actionIcon: <FolderOpen className="w-4 h-4" />,
                            actionClassName: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 border-blue-200 dark:border-blue-800/50',
                            onAction: handleBatchImageImport,
                            fallbackLabel: 'Image',
                            secondaryActionLabel: '多选',
                            secondaryActionTitle: '按选择顺序批量导入图片',
                            secondaryActionIcon: <Images className="w-4 h-4" />,
                            secondaryActionClassName: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40 border-sky-200 dark:border-sky-800/50',
                            onSecondaryAction: handleBatchImageFileSelect,
                            horizontalActions: true,
                        })}
                        {renderBatchActionGroup({
                            nodes: getAudioNodes(),
                            value: selectedAudioNodeId,
                            onChange: setSelectedAudioNodeId,
                            title: '选择批量传音频的目标节点',
                            actionTitle: '从文件夹批量导入音频',
                            actionLabel: '批量传音频',
                            actionIcon: <FileAudio className="w-4 h-4" />,
                            actionClassName: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 border-amber-200 dark:border-amber-800/50',
                            onAction: handleBatchAudioImport,
                            fallbackLabel: 'Audio',
                        })}
                        {renderBatchActionGroup({
                            nodes: getVideoNodes(),
                            value: selectedVideoNodeId,
                            onChange: setSelectedVideoNodeId,
                            title: '选择批量传视频的目标节点',
                            actionTitle: '从文件夹批量导入视频',
                            actionLabel: '批量传视频',
                            actionIcon: <FolderOpen className="w-4 h-4" />,
                            actionClassName: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 border-purple-200 dark:border-purple-800/50',
                            onAction: handleBatchVideoImport,
                            fallbackLabel: 'Video',
                        })}
                    </div>

                    <div className="flex w-[180px] shrink-0 flex-col items-stretch gap-2">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">任务名</span>
                            <input
                                type="text"
                                value={taskName}
                                onChange={(e) => setTaskName(e.target.value)}
                                placeholder="ABC"
                                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#0F1115] border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-brand-500 outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400"
                                title="设置文件名后缀，例如：ABC_Task_001.png"
                            />
                        </div>
                        <button
                            onClick={handleSave}
                            className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg shadow-sm transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            保存设置 ({batchList.length})
                        </button>
                    </div>
                </div>

                {/* Toast Notification */}
                {toast && (
                    <div
                        className={`absolute top-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium animate-pulse ${toast.type === 'success' ? 'bg-emerald-500 text-white' :
                            toast.type === 'error' ? 'bg-red-500 text-white' :
                                'bg-blue-500 text-white'
                            }`}
                        onClick={() => setToast(null)}
                    >
                        {toast.type === 'success' && <span>✓</span>}
                        {toast.type === 'error' && <span>✕</span>}
                        {toast.type === 'info' && <span>ℹ</span>}
                        {toast.message}
                        <button
                            onClick={() => setToast(null)}
                            className="ml-2 opacity-70 hover:opacity-100"
                        >
                            ×
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BatchSettingsModal;
