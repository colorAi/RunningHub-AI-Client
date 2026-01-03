import React, { useState, useEffect } from 'react';
import { NodeInfo } from '../types';
import { X, Plus, Trash2, Save, Copy, AlertCircle, UploadCloud, Loader2, FileAudio, FileVideo, FileImage } from 'lucide-react';
import { uploadFile } from '../services/api';

interface BatchSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    nodes: NodeInfo[];
    onSave: (batchList: NodeInfo[][]) => void;
    initialBatchList: NodeInfo[][];
    apiKey: string;
}

const BatchSettingsModal: React.FC<BatchSettingsModalProps> = ({
    isOpen,
    onClose,
    nodes,
    onSave,
    initialBatchList,
    apiKey
}) => {
    const [batchList, setBatchList] = useState<NodeInfo[][]>(initialBatchList);
    const [uploadingState, setUploadingState] = useState<Record<string, boolean>>({});
    const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isOpen) {
            // If initial list is empty, start with one copy of current nodes
            setBatchList(initialBatchList.length > 0 ? initialBatchList : [JSON.parse(JSON.stringify(nodes))]);
        }
    }, [isOpen, initialBatchList, nodes]);

    // Cleanup previews
    useEffect(() => {
        return () => {
            Object.values(localPreviews).forEach(url => URL.revokeObjectURL(url));
        };
    }, []);

    if (!isOpen) return null;

    const handleAddRow = () => {
        // Deep copy current nodes to create a new row
        const newRow = JSON.parse(JSON.stringify(nodes));
        setBatchList(prev => [...prev, newRow]);
    };

    const handleRemoveRow = (index: number) => {
        setBatchList(prev => prev.filter((_, i) => i !== index));
    };

    const handleFieldChange = (batchIndex: number, nodeId: string, value: string) => {
        setBatchList(prev => {
            const newList = [...prev];
            const row = [...newList[batchIndex]];
            const nodeIndex = row.findIndex(n => n.nodeId === nodeId);
            if (nodeIndex !== -1) {
                row[nodeIndex] = { ...row[nodeIndex], fieldValue: value };
                newList[batchIndex] = row;
            }
            return newList;
        });
    };

    const handleFileUpload = async (batchIndex: number, nodeId: string, file: File) => {
        const key = `${batchIndex}_${nodeId}`;
        
        // Create local preview immediately
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setLocalPreviews(prev => ({ ...prev, [key]: url }));
        }

        setUploadingState(prev => ({ ...prev, [key]: true }));

        try {
            const result = await uploadFile(apiKey, file);
            handleFieldChange(batchIndex, nodeId, result.fileName);
        } catch (err: any) {
            console.error("Upload failed", err);
            // Optionally handle error state here
        } finally {
            setUploadingState(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleSave = () => {
        onSave(batchList);
        onClose();
    };

    const looksLikeUrl = (s: string) => /^(https?:\/\/|data:)/i.test(s);

    // Helper to render simplified input based on type
    const renderBatchInput = (node: NodeInfo, batchIndex: number) => {
        const handleChange = (val: string) => handleFieldChange(batchIndex, node.nodeId, val);
        const key = `${batchIndex}_${node.nodeId}`;
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
                            if (e.target.files?.[0]) handleFileUpload(batchIndex, node.nodeId, e.target.files[0]);
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
                            if (e.dataTransfer.files?.[0]) handleFileUpload(batchIndex, node.nodeId, e.dataTransfer.files[0]);
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

        // 2. Prompt / Text Area - Larger
        if (node.fieldType === 'STRING' && (
            node.nodeName.toLowerCase().includes('prompt') || 
            node.description?.includes('文本') || 
            node.description?.includes('提示词') ||
            node.fieldName?.toLowerCase().includes('prompt')
        )) {
            return (
                <textarea
                    value={node.fieldValue}
                    onChange={(e) => handleChange(e.target.value)}
                    style={{ width: '600px', height: '60px' }}
                    className="px-3 py-2 text-xs bg-slate-50 dark:bg-[#0F1115] border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-brand-500 outline-none resize-none leading-relaxed"
                    placeholder="输入提示词..."
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

        // 4. List / Select
        if (node.fieldType === 'LIST') {
             let options: string[] = [];
             try {
                 if (node.fieldData) {
                     const parsed = JSON.parse(node.fieldData);
                     if (Array.isArray(parsed)) {
                         if (parsed.length > 0 && Array.isArray(parsed[0])) {
                             options = parsed[0].map((item: any) => String(item));
                         } else {
                             options = parsed.map((item: any) => String(item));
                         }
                     }
                 }
             } catch (e) {
                 if (typeof node.fieldData === 'string' && node.fieldData.includes(',')) {
                     options = node.fieldData.split(',').map(s => s.trim()).filter(Boolean);
                 }
             }

             if (options.length > 0) {
                 return (
                     <select
                         value={node.fieldValue}
                         onChange={(e) => handleChange(e.target.value)}
                         className="w-[120px] px-2 py-1.5 text-xs bg-slate-50 dark:bg-[#0F1115] border border-slate-300 dark:border-slate-700 rounded focus:ring-1 focus:ring-brand-500 outline-none"
                     >
                         {!node.fieldValue && <option value="" disabled>请选择</option>}
                         {options.map((opt, i) => (
                             <option key={i} value={opt}>{opt}</option>
                         ))}
                     </select>
                 );
             }
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
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
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
                            batchList.map((rowNodes, batchIndex) => (
                                <div key={batchIndex} className="bg-white dark:bg-[#161920] rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col shrink-0">
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                            <span className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center text-[10px]">
                                                {batchIndex + 1}
                                            </span>
                                            任务配置 #{batchIndex + 1}
                                        </span>
                                        <button
                                            onClick={() => handleRemoveRow(batchIndex)}
                                            className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                                            title="删除此配置"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Card Content - Horizontal Scroll */}
                                    <div className="p-3 overflow-x-auto">
                                        <div className="flex gap-3 min-w-max items-start">
                                            {sortNodes(rowNodes).map((node, nodeIdx) => (
                                                <div key={`${batchIndex}-${node.nodeId}`} className="flex flex-col gap-1.5 w-auto">
                                                    <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[120px]" title={node.nodeName}>
                                                        {node.nodeName || node.fieldName}
                                                    </label>
                                                    {renderBatchInput(node, batchIndex)}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-[#161920] shrink-0">
                    <button
                        onClick={handleAddRow}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 rounded-lg transition-colors border border-brand-200 dark:border-brand-800/50"
                    >
                        <Plus className="w-4 h-4" />
                        添加配置 (复制当前)
                    </button>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
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
            </div>
        </div>
    );
};

export default BatchSettingsModal;
