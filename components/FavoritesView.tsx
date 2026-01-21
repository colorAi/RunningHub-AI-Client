import React, { useState, useRef, useEffect } from 'react';
import { Star, MousePointerClick, Heart, Play, Globe, User, RefreshCw, Loader2, Download, Upload, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { Favorite, NodeInfo, WebAppInfo } from '../types';
import { getNodeList } from '../services/api';

interface FavoritesViewProps {
    favorites: Favorite[];
    onSelectApp: (favorite: Favorite) => void;
    apiKeys: string[];
    onUpdateFavorites: (favorites: Favorite[]) => void;
}

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl border animate-in zoom-in-95 fade-in duration-200 ${type === 'success'
            ? 'bg-emerald-50/95 backdrop-blur text-emerald-900 border-emerald-200 dark:bg-emerald-950/90 dark:text-emerald-100 dark:border-emerald-800'
            : 'bg-red-50/95 backdrop-blur text-red-900 border-red-200 dark:bg-red-950/90 dark:text-red-100 dark:border-red-800'
            }`}>
            {type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
            <span className="text-sm font-medium">{message}</span>
            <button onClick={onClose} className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors">
                <X className="w-4 h-4 opacity-50" />
            </button>
        </div>
    );
};

const FavoritesView: React.FC<FavoritesViewProps> = ({ favorites, onSelectApp, apiKeys, onUpdateFavorites }) => {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    };

    const handleSyncFavorites = async () => {
        if (apiKeys.length === 0) {
            showToast("请先在个人中心配置有效的 API Key", 'error');
            return;
        }

        setIsSyncing(true);
        setSyncProgress(0);

        const total = favorites.length;
        let completed = 0;
        const updatedFavorites = [...favorites];
        const limit = 3;

        for (let i = 0; i < total; i += limit) {
            const batchIndices = updatedFavorites.slice(i, i + limit).map((_, idx) => i + idx);

            await Promise.all(batchIndices.map(async (index) => {
                if (index >= updatedFavorites.length) return;
                const fav = updatedFavorites[index];
                try {
                    const result = await getNodeList(apiKeys[0], fav.webappId);
                    if (result.appInfo) {
                        updatedFavorites[index] = {
                            ...fav,
                            appInfo: result.appInfo,
                            nodes: result.nodes // Sync valid nodes
                        };
                    }
                } catch (e) {
                    console.error(`Failed to sync favorite ${fav.webappId}`);
                }
            }));

            completed += batchIndices.length;
            setSyncProgress(Math.floor((completed / total) * 100));
        }

        onUpdateFavorites(updatedFavorites);
        setIsSyncing(false);
        showToast("收藏同步完成", 'success');
    };

    const handleExportFavorites = () => {
        try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(favorites, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `favorites_backup_${new Date().toISOString().split('T')[0]}.json`);
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            showToast("导出成功", 'success');
        } catch (e) {
            showToast("导出失败", 'error');
        }
    };

    const handleImportFavorites = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const importedFavorites = JSON.parse(content) as Favorite[];

                if (!Array.isArray(importedFavorites)) {
                    showToast('文件格式错误：必须是收藏列表', 'error');
                    return;
                }

                // Merge strategy: Add only if webappId doesn't exist
                const currentIds = new Set(favorites.map(f => f.webappId));
                const newFavorites = importedFavorites.filter(f => !currentIds.has(f.webappId));

                if (newFavorites.length === 0) {
                    showToast('未发现新的收藏项', 'success'); // Using success style for info
                    return;
                }

                const updatedFavorites = [...favorites, ...newFavorites];
                onUpdateFavorites(updatedFavorites);
                showToast(`成功导入 ${newFavorites.length} 个新收藏`, 'success');
            } catch (error) {
                console.error('Import error:', error);
                showToast('导入失败，请检查文件格式', 'error');
            }
        };
        reader.readAsText(file);
        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="flex-1 bg-slate-50 dark:bg-[#0F1115] p-6 overflow-auto relative">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <div className="flex items-center justify-between mb-6 border-b border-slate-200 dark:border-slate-800 pb-2">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
                    我的收藏
                </h2>

                <div className="flex items-center gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImportFavorites}
                        className="hidden"
                        accept=".json"
                    />

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        title="导入收藏"
                    >
                        <Upload className="w-3.5 h-3.5" />
                        <span>导入</span>
                    </button>

                    <button
                        onClick={handleExportFavorites}
                        className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        title="导出收藏"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>导出</span>
                    </button>

                    <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1"></div>

                    <button
                        onClick={handleSyncFavorites}
                        disabled={isSyncing}
                        className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors disabled:opacity-50"
                    >
                        {isSyncing ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>更新中 {syncProgress}%</span>
                            </>
                        ) : (
                            <>
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>更新信息</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {favorites.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 pb-10">
                    {favorites.map((fav) => {
                        const info = fav.appInfo;

                        return (
                            <div
                                key={fav.webappId}
                                className="group relative flex flex-col bg-white dark:bg-[#1a1d24] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-brand-300 dark:hover:border-brand-700 transition-all duration-300 overflow-hidden"
                            >
                                {/* Card Image Area - 3:4 Aspect Ratio */}
                                <div className="relative aspect-[3/4] bg-slate-100 dark:bg-[#252830] overflow-hidden">
                                    {info?.covers?.[0]?.thumbnailUri ? (
                                        <img
                                            src={info.covers[0].thumbnailUri}
                                            alt={fav.name}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                                            <Globe className="w-8 h-8 opacity-20" />
                                        </div>
                                    )}

                                    {/* UP Badge (Top Left) */}
                                    {fav.upName && (
                                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-md flex items-center gap-1 z-10">
                                            <User className="w-2.5 h-2.5 text-brand-400" />
                                            <span className="text-[10px] font-medium text-white/90">{fav.upName}</span>
                                        </div>
                                    )}

                                    {/* Overlay Gradient */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />

                                    {/* Instant Use Button (Hover) */}
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <button
                                            onClick={() => onSelectApp(fav)}
                                            className="flex items-center gap-1 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg transform scale-90 group-hover:scale-100 transition-transform"
                                        >
                                            <Play className="w-3.5 h-3.5 fill-current" />
                                            立即使用
                                        </button>
                                    </div>

                                    {/* Info Overlay (Bottom) */}
                                    <div className="absolute bottom-0 left-0 right-0 p-3 pt-8 bg-gradient-to-t from-black/90 to-transparent flex flex-col gap-1">
                                        <h4
                                            className="font-bold text-white text-xs line-clamp-2 leading-relaxed"
                                            title={fav.name}
                                        >
                                            {fav.name}
                                        </h4>

                                        <div className="flex items-center justify-between text-[10px] text-slate-300">
                                            {info ? (
                                                <>
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex items-center gap-0.5" title="使用次数">
                                                            <MousePointerClick className="w-3 h-3 text-brand-400" />
                                                            {info.statisticsInfo?.useCount || 0}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex items-center gap-0.5" title="喜欢">
                                                            <Heart className="w-3 h-3 text-red-400" />
                                                            {info.statisticsInfo?.likeCount || 0}
                                                        </span>
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="text-white/50 italic text-[9px]">
                                                    ID: {fav.webappId}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600">
                    <Star className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg">暂无收藏</p>
                    <p className="text-sm mt-2">在首页点击卡片右上角的星星即可收藏</p>
                </div>
            )}
        </div>
    );
};

export default FavoritesView;
