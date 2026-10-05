import { createPortal } from 'react-dom';
import { AlertCircle, Image as ImageIcon, Info, Layers, List, Mic, Play, PlayCircle, Settings, Sliders, Type, X, Zap } from 'lucide-react';
import { forwardRef } from 'react';
import { NodeInfo } from '../types';
import AppInfoModal from './AppInfoModal';
import BatchSettingsModal from './BatchSettingsModal';
import { primaryLabel } from './editor/nodePresentation';

import { createNodeInputRenderer } from './editor/renderNodeInput';
import type { StepEditorProps, StepEditorRef } from './editor/types';
import { useStepEditor } from './editor/useStepEditor';
export type { StepEditorRef, StepEditorSnapshot } from './editor/types';

const StepEditor = forwardRef<StepEditorRef, StepEditorProps>((props, ref) => {
    const { nodes, apiKeys, isConnected, runType, webAppInfo, onRun, onCancel, failedBatchIndices, onRetryTask, instanceType = 'default', onInstanceTypeChange, mode = 'app', scrollMode = 'internal' } = props;
    const state = useStepEditor(props, ref);
    const { localNodes, isLoadingPricePreview, isBatchModalOpen, setIsBatchModalOpen, batchList, setBatchList, pendingFiles, setPendingFiles, batchTaskName, setBatchTaskName, isAppInfoModalOpen, setIsAppInfoModalOpen, mediaPreview, setMediaPreview, hasUploadingFiles, modelPricePreviewLabel, isNodesLoading, getNodePresentation } = state;
    const renderNodeInput = createNodeInputRenderer(state);
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

    const handleBatchRun = () => {
        if (mode === 'standard') {
            onRun(localNodes, undefined, undefined, undefined, instanceType);
            return;
        }

        if (batchList.length === 0) {
            // Fallback to normal run if no batch list
            onRun(localNodes, undefined, undefined, undefined, instanceType);
            return;
        }

        onRun(localNodes, batchList, pendingFiles, batchTaskName, instanceType);
    };

    return (
        <div className={scrollMode === 'parent' ? 'flex flex-col' : 'flex flex-col h-full min-h-0 overflow-hidden'}>
            {/* Portals keep dialogs outside the card/list containment and scroll clipping. */}
            {createPortal(<>
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

            </>, document.body)}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#161920] shrink-0 z-10 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                        {mode === 'standard' ? '标准模型参数' : '参数设置'}
                        <span className="text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 rounded border border-brand-100 dark:border-brand-900/50">
                            {nodes.length} 个参数
                        </span>
                    </h2>
                    <div className="flex items-center gap-2">
                        {/* PLUS 模式切换按钮 */}
                        {mode === 'app' && <button
                            onClick={() => onInstanceTypeChange?.(instanceType === 'default' ? 'plus' : 'default')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${instanceType === 'plus'
                                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                                }`}
                            title={instanceType === 'plus' ? 'PLUS 模式已开启（48G）' : 'PLUS 模式已关闭（24G）'}
                        >
                            <Zap className={`w-3.5 h-3.5 ${instanceType === 'plus' ? 'animate-pulse' : ''}`} />
                            PLUS 模式
                        </button>}

                        {/* App Info Button */}
                        {mode === 'app' && webAppInfo && (
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

            {/* Scrollable Content */}
            <div className={`p-4 space-y-4 ${scrollMode === 'internal' ? 'flex-1 min-h-0 overflow-y-auto scroll-smooth' : ''}`}>
                {!isConnected ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 py-20 text-center">
                        <AlertCircle className="w-16 h-16 mb-4 opacity-20" />
                        <h3 className="text-lg font-medium text-slate-500 dark:text-slate-400">等待连接</h3>
                        <p className="text-sm max-w-xs mt-2">
                            {mode === 'standard' ? '请在左侧获取模型并加载参数。' : '请在左侧侧边栏输入您的 API Key 和应用 ID 以加载参数。'}
                        </p>
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
            <div className="bg-white dark:bg-[#161920] border-t border-slate-200 dark:border-slate-800/50 p-4 shrink-0 flex flex-wrap gap-3">
                {/* 单独运行按钮 */}
                {runType === 'single' && mode !== 'standard' ? (
                    <button
                        onClick={onCancel}
                        className="flex-1 flex justify-center items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-5 rounded-lg shadow-md shadow-red-200 dark:shadow-red-900/20 transform hover:-translate-y-0.5 transition-all text-sm"
                    >
                        <X className="w-4 h-4" />
                        取消运行
                    </button>
                ) : (
                    <button
                        onClick={() => onRun(localNodes, undefined, undefined, undefined, instanceType)}
                        disabled={!isConnected || hasUploadingFiles || runType === 'batch'}
                        className="flex-1 flex justify-center items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-semibold py-3 px-5 rounded-lg shadow-md shadow-brand-200 dark:shadow-brand-900/20 transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none disabled:shadow-none text-sm"
                    >
                        <Play className="w-4 h-4 fill-current" />
                        {mode === 'standard' && isLoadingPricePreview
                            ? `${runType === 'single' ? '继续提交' : '运行'} · 估价中...`
                            : mode === 'standard' && modelPricePreviewLabel
                                ? `${runType === 'single' ? '继续提交' : '运行'} · ${modelPricePreviewLabel}`
                                : mode === 'standard' && runType === 'single'
                                    ? '继续提交'
                                    : '运行'}
                    </button>
                )}

                {mode === 'app' && (
                    <>
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
                                disabled={!isConnected || hasUploadingFiles || runType === 'single'}
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
                    </>
                )}
            </div>
        </div>
    );
});

export default StepEditor;
