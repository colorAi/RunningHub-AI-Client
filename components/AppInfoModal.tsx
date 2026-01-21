import React from 'react';
import { X, Eye, Heart, Download, Star, Tag } from 'lucide-react';
import { WebAppInfo } from '../types';

interface AppInfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    appInfo: WebAppInfo;
}

const AppInfoModal: React.FC<AppInfoModalProps> = ({ isOpen, onClose, appInfo }) => {
    if (!isOpen) return null;

    // Strip HTML tags for plain text display (simple version)
    const stripHtml = (html: string) => {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-[#1a1d24] rounded-xl shadow-2xl w-[600px] max-w-[95vw] max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-800/50 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Eye className="w-5 h-5 text-brand-500" />
                        应用详情
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto max-h-[calc(85vh-120px)]">
                    {/* Cover Image - 方形区域，等比缩放 */}
                    {appInfo.covers && appInfo.covers.length > 0 && (
                        <div className="mb-4 flex justify-center">
                            <div className="w-80 h-80 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center">
                                <img
                                    src={appInfo.covers[0].uri || appInfo.covers[0].thumbnailUri}
                                    alt="App Cover"
                                    className="max-w-full max-h-full object-contain"
                                />
                            </div>
                        </div>
                    )}

                    {/* App Name */}
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-3 text-center">
                        {appInfo.webappName}
                    </h2>

                    {/* Statistics */}
                    {appInfo.statisticsInfo && (
                        <div className="flex flex-wrap justify-center gap-3 mb-4">
                            <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
                                <Eye className="w-4 h-4" />
                                <span>使用 {appInfo.statisticsInfo.useCount}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
                                <Heart className="w-4 h-4 text-red-400" />
                                <span>喜欢 {appInfo.statisticsInfo.likeCount}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
                                <Star className="w-4 h-4 text-amber-400" />
                                <span>收藏 {appInfo.statisticsInfo.collectCount}</span>
                            </div>
                        </div>
                    )}

                    {/* Tags */}
                    {appInfo.tags && appInfo.tags.length > 0 && (
                        <div className="mb-4">
                            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                标签
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {appInfo.tags.map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="px-2.5 py-1 text-xs bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 rounded-full border border-brand-100 dark:border-brand-800/50"
                                    >
                                        {tag.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Description - 固定高度可滚动 */}
                    {appInfo.description && (
                        <div>
                            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                                应用介绍
                            </h4>
                            <div
                                className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 max-h-24 overflow-y-auto"
                                dangerouslySetInnerHTML={{ __html: appInfo.description }}
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-800/50 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm rounded-lg transition-colors"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AppInfoModal;
