import React, { useState, useEffect } from 'react';
import { NodeInfo } from '../types';
import { parseListOptions } from '../utils/nodeUtils';
import { X, Plus, Trash2, Save, Copy, AlertCircle, UploadCloud, Loader2, FileAudio, FileVideo, FileImage, FileText, FolderOpen, RefreshCw } from 'lucide-react';
import { uploadFile } from '../services/api';

// Map to store pending files: key = `${batchIndex}|${nodeId}|${fieldName}`, value = File
export type PendingFilesMap = Record<string, File>;

interface BatchSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    nodes: NodeInfo[];
    onSave: (batchList: NodeInfo[][], pendingFiles: PendingFilesMap, taskName: string) => void;
    initialBatchList: NodeInfo[][];
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
    initialTaskName = '',
    apiKey,
    failedIndices = new Set(),
    onRetryTask
}) => {
    const [batchList, setBatchList] = useState<NodeInfo[][]>(initialBatchList);
    const [taskName, setTaskName] = useState(initialTaskName);
    const [uploadingState, setUploadingState] = useState<Record<string, boolean>>({});
    const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
    const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const [pendingFiles, setPendingFiles] = useState<PendingFilesMap>({});
    const [selectedImageNodeId, setSelectedImageNodeId] = useState<string>('');
    const [selectedVideoNodeId, setSelectedVideoNodeId] = useState<string>('');
    const [selectedTextNodeId, setSelectedTextNodeId] = useState<string>('');

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
            setTaskName(initialTaskName);
        }
    }, [isOpen, initialBatchList, initialTaskName, nodes]);

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
            Object.values(localPreviews).forEach((url: string) => URL.revokeObjectURL(url));
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

    // Get all VIDEO type nodes (LoadVideo nodes)
    const getVideoNodes = () => nodes.filter(n =>
        n.fieldType === 'VIDEO' ||
        n.description === '视频' ||
        n.fieldName === 'video'
    );

    // Get all TEXT/STRING type nodes
    const getTextNodes = () => nodes.filter(n => n.fieldType === 'STRING');

    // Batch Image Import from folder
    const handleBatchImageImport = async () => {
        try {
            const imageNodes = getImageNodes();
            if (imageNodes.length === 0) {
                setToast({ type: 'error', message: '未找到图像加载节点（LoadImage）' });
                return;
            }

            const targetKey = selectedImageNodeId || `${imageNodes[0].nodeId}|${imageNodes[0].fieldName || ''}`;
            const [targetNodeId, targetFieldName] = targetKey.split('|');

            // Use File System Access API to pick a directory
            const dirHandle = await (window as any).showDirectoryPicker();

            // Collect all image files recursively
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

            // Sort by filename
            imageFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));

            // Smart merge logic: if batchList already has rows, update existing rows' target node
            // instead of replacing everything
            const existingRows = batchList.length;

            let finalBatchList: NodeInfo[][];
            const newPendingFiles: PendingFilesMap = { ...pendingFiles };  // Start with existing
            const newPreviews: Record<string, string> = { ...localPreviews };  // Start with existing

            const findNodeIndex = (rowNodes: NodeInfo[]) => {
                // Try exact match with fieldName if available
                if (targetFieldName && targetFieldName !== '' && targetFieldName !== 'undefined') {
                    return rowNodes.findIndex(n => String(n.nodeId) === String(targetNodeId) && n.fieldName === targetFieldName);
                }
                // Fallback to just nodeId
                return rowNodes.findIndex(n => String(n.nodeId) === String(targetNodeId));
            };

            if (existingRows > 0) {
                // Update existing rows with new images for target node
                finalBatchList = [...batchList];

                imageFiles.forEach((imgFile, index) => {
                    let taskId;
                    if (index < existingRows) {
                        // Update existing row
                        const rowNodes = [...finalBatchList[index]];
                        taskId = rowNodes[0]?._taskId;
                        const nodeIndex = findNodeIndex(rowNodes);
                        if (nodeIndex !== -1) {
                            rowNodes[nodeIndex] = { ...rowNodes[nodeIndex], fieldValue: imgFile.name };
                            finalBatchList[index] = rowNodes;
                        }
                    } else {
                        // Add new row for extra images
                        const newRowNodes: NodeInfo[] = JSON.parse(JSON.stringify(nodes));
                        // Generate unique ID for new row
                        taskId = `task-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                        newRowNodes.forEach(node => node._taskId = taskId);
                        const nodeIndex = findNodeIndex(newRowNodes);
                        if (nodeIndex !== -1) {
                            newRowNodes[nodeIndex].fieldValue = imgFile.name;
                        }
                        finalBatchList.push(newRowNodes);
                    }

                    // Store File reference and preview
                    // Use taskId as key for proper cleanup on delete
                    const fieldName = targetFieldName || (finalBatchList[index] && findNodeIndex(finalBatchList[index]) !== -1 ? finalBatchList[index][findNodeIndex(finalBatchList[index])].fieldName : 'image');
                    const key = `${taskId}|${targetNodeId}|${fieldName}`;
                    newPendingFiles[key] = imgFile.file;
                    newPreviews[key] = URL.createObjectURL(imgFile.file);
                });
            } else {
                // No existing rows, create new ones
                finalBatchList = [];
                imageFiles.forEach((imgFile, index) => {
                    const rowNodes: NodeInfo[] = JSON.parse(JSON.stringify(nodes));
                    // Generate unique ID for new row
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
                targetKey,
                targetNodeId,
                targetFieldName,
                imageFilesCount: imageFiles.length,
                existingRows,
                finalRows: finalBatchList.length,
                pendingFilesKeys: Object.keys(newPendingFiles),
                previewKeys: Object.keys(newPreviews)
            });

            setToast({ type: 'success', message: `成功导入 ${imageFiles.length} 张图片到 ${existingRows > 0 ? '现有' : '新建'}任务！` });

        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error('Failed to import images:', e);
                setToast({ type: 'error', message: '导入图片失败: ' + e.message });
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
        Object.values(localPreviews).forEach((url: string) => URL.revokeObjectURL(url));
        // Reset to initial state
        setBatchList(initialBatchList.length > 0 ? initialBatchList : []);
        setPendingFiles({});
        setLocalPreviews({});
        onClose();
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
                        id={`file-${key}`}
                        className="hidden"
                        accept={`${node.fieldType.toLowerCase()}/*`}
                        disabled={isUploading}
                        onChange={(e) => {
                            if (e.target.files?.[0]) handleFileUpload(batchIndex, node.nodeId, node.fieldName, e.target.files[0]);
                        }}
                    />
                    <label
                        htmlFor={`file-${key}`}
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

        // 4. List / Select - Auto-detect based on fieldData availability
        // This handles LIST, SWITCH with fieldData (ImpactSwitch), and select fields
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-[#161920] rounded-xl shadow-2xl w-[95vw] h-[85vh] flex flex-col border border-slate-200 dark:border-slate-800">
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
                                                        <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[120px] flex items-center gap-1" title={node.nodeName}>
                                                            <span>{node.nodeName || node.fieldName}</span>
                                                            <span className="opacity-70 font-mono">#{node.nodeId}</span>
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
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-[#161920] shrink-0">
                    <div className="flex gap-2">
                        <button
                            onClick={handleAddRow}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 rounded-lg transition-colors border border-brand-200 dark:border-brand-800/50"
                        >
                            <Plus className="w-4 h-4" />
                            添加配置
                        </button>
                        {/* Text Node Selector - Show if text nodes exist */}
                        {getTextNodes().length > 0 && (
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#0F1115] border border-slate-300 dark:border-slate-700 rounded-lg px-2">
                                <span className="text-xs text-slate-500 whitespace-nowrap">目标:</span>
                                <select
                                    value={selectedTextNodeId}
                                    onChange={(e) => setSelectedTextNodeId(e.target.value)}
                                    disabled={getTextNodes().length === 1}
                                    className="py-2 text-sm bg-transparent outline-none disabled:opacity-70 disabled:cursor-not-allowed max-w-[140px] text-slate-700 dark:text-slate-200"
                                    title="选择批量导入文本的目标节点"
                                >
                                    {getTextNodes().map(node => (
                                        <option
                                            key={`${node.nodeId}|${node.fieldName || ''}`}
                                            value={`${node.nodeId}|${node.fieldName || ''}`}
                                            className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                        >
                                            {node.nodeName || node.fieldName || 'Text'} (#{node.nodeId})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button
                            onClick={handleDocumentListMode}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-colors border border-emerald-200 dark:border-emerald-800/50"
                            title="从TXT文件导入提示词，每行为一个任务"
                        >
                            <FileText className="w-4 h-4" />
                            导入文档
                        </button>
                        {/* Batch Image Import */}
                        {/* Batch Image Import Selector - Always show if image nodes exist */}
                        {getImageNodes().length > 0 && (
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#0F1115] border border-slate-300 dark:border-slate-700 rounded-lg px-2">
                                <span className="text-xs text-slate-500 whitespace-nowrap">目标:</span>
                                <select
                                    value={selectedImageNodeId}
                                    onChange={(e) => setSelectedImageNodeId(e.target.value)}
                                    disabled={getImageNodes().length === 1}
                                    className="py-2 text-sm bg-transparent outline-none disabled:opacity-70 disabled:cursor-not-allowed max-w-[140px] text-slate-700 dark:text-slate-200"
                                    title="选择批量传图的目标节点"
                                >
                                    {getImageNodes().map(node => (
                                        <option
                                            key={`${node.nodeId}|${node.fieldName || ''}`}
                                            value={`${node.nodeId}|${node.fieldName || ''}`}
                                            className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                        >
                                            {node.nodeName || node.fieldName || 'Image'} (#{node.nodeId})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button
                            onClick={handleBatchImageImport}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors border border-blue-200 dark:border-blue-800/50"
                            title="从文件夹批量导入图片"
                        >
                            <FolderOpen className="w-4 h-4" />
                            批量传图
                        </button>
                        {/* Batch Video Import Selector - Always show if video nodes exist */}
                        {getVideoNodes().length > 0 && (
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#0F1115] border border-slate-300 dark:border-slate-700 rounded-lg px-2">
                                <span className="text-xs text-slate-500 whitespace-nowrap">目标:</span>
                                <select
                                    value={selectedVideoNodeId}
                                    onChange={(e) => setSelectedVideoNodeId(e.target.value)}
                                    disabled={getVideoNodes().length === 1}
                                    className="py-2 text-sm bg-transparent outline-none disabled:opacity-70 disabled:cursor-not-allowed max-w-[140px] text-slate-700 dark:text-slate-200"
                                    title="选择批量传视频的目标节点"
                                >
                                    {getVideoNodes().map(node => (
                                        <option
                                            key={`${node.nodeId}|${node.fieldName || ''}`}
                                            value={`${node.nodeId}|${node.fieldName || ''}`}
                                            className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                        >
                                            {node.nodeName || node.fieldName || 'Video'} (#{node.nodeId})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button
                            onClick={handleBatchVideoImport}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-lg transition-colors border border-purple-200 dark:border-purple-800/50"
                            title="从文件夹批量导入视频"
                        >
                            <FolderOpen className="w-4 h-4" />
                            批量传视频
                        </button>
                        <button
                            onClick={() => {
                                setBatchList([]);
                                setPendingFiles({});
                                setLocalPreviews({});  // Also clear previews
                            }}
                            disabled={batchList.length === 0}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors border border-red-200 dark:border-red-800/50 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="清空所有配置"
                        >
                            <Trash2 className="w-4 h-4" />
                            清空
                        </button>
                    </div>

                    <div className="flex gap-3 items-center">
                        <div className="flex items-center gap-2 mr-2">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">任务名:</span>
                            <input
                                type="text"
                                value={taskName}
                                onChange={(e) => setTaskName(e.target.value)}
                                placeholder="ABC"
                                className="w-32 px-3 py-2 text-sm bg-slate-50 dark:bg-[#0F1115] border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-brand-500 outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400"
                                title="设置文件名后缀，例如：ABC_Task_001.png"
                            />
                        </div>
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg shadow-sm transition-colors"
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
