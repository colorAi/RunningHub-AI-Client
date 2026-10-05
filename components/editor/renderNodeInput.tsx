import { AlertCircle, ChevronDown, FileAudio, FileImage, FileVideo, List, Loader2, Maximize2, Sliders, Type, UploadCloud, X } from 'lucide-react';
import { buildFileUrl } from '../../services/api';
import { NodeInfo } from '../../types';
import { primaryLabel } from './nodePresentation';

import type { useStepEditor } from './useStepEditor';

type FieldState = Pick<ReturnType<typeof useStepEditor>, 'editorDomId' | 'uploadingState' | 'errors' | 'previews' | 'setMediaPreview' | 'dragActive' | 'brokenImages' | 'setBrokenImages' | 'brokenVideos' | 'setBrokenVideos' | 'brokenAudios' | 'setBrokenAudios' | 'primaryApiKey' | 'handleTextChange' | 'handleClearFile' | 'processFile' | 'handleDrag' | 'handleDrop' | 'getDisplayFileName' | 'getNodePresentation'>;

export function createNodeInputRenderer({ editorDomId, uploadingState, errors, previews, setMediaPreview, dragActive, brokenImages, setBrokenImages, brokenVideos, setBrokenVideos, brokenAudios, setBrokenAudios, primaryApiKey, handleTextChange, handleClearFile, processFile, handleDrag, handleDrop, getDisplayFileName, getNodePresentation }: FieldState) {
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
            return buildFileUrl(value, primaryApiKey);
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
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${switchConfig.checked
                                    ? 'border-brand-500 bg-brand-500'
                                    : 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700'
                                }`}
                        >
                            <span
                                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${switchConfig.checked ? 'translate-x-6' : 'translate-x-1'
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

    return renderNodeInput;
}
