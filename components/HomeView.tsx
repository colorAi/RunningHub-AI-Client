import React, { useState, useMemo, useEffect } from 'react';
import { UP_RECOMMENDATIONS } from './recommendationsData';
import { Globe, RefreshCw, Heart, MousePointerClick, Star, Play, AlertCircle, Loader2, User, Search, X } from 'lucide-react';
import { NodeInfo, WebAppInfo, Favorite } from '../types';
import { getNodeList, getOfficialAppList, getAppDetailById, AppListItem } from '../services/api';

interface HomeViewProps {
    onSelectApp: (appId: string, preloadedData?: { nodes: NodeInfo[], appInfo: WebAppInfo }) => void;
    apiKeys: string[];
    favorites: Favorite[];
    onToggleFavorite: (app: Favorite) => void;
}

interface AppCache {
    [appId: string]: {
        nodes: NodeInfo[];
        appInfo: WebAppInfo | null;
        error?: string;
    };
}

const HomeView: React.FC<HomeViewProps> = ({ onSelectApp, apiKeys, favorites, onToggleFavorite }) => {
    const [activeTab, setActiveTab] = useState<'excellent' | 'official'>('excellent');

    // Cache for loaded app details
    const [appCache, setAppCache] = useState<AppCache>(() => {
        try {
            const saved = localStorage.getItem('rh_app_cache');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    });

    // Bulk refresh state
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshProgress, setRefreshProgress] = useState(0);

    // Official apps state
    const [officialApps, setOfficialApps] = useState<AppListItem[]>([]);
    const [isLoadingOfficial, setIsLoadingOfficial] = useState(false);
    const [hasLoadedOfficial, setHasLoadedOfficial] = useState(false);

    const [sortOrder, setSortOrder] = useState<string>('RECOMMEND');
    const [searchKeyword, setSearchKeyword] = useState('');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalApps, setTotalApps] = useState(0);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Auto-fetch UP recommendations covers state
    const [hasFetchedUpCovers, setHasFetchedUpCovers] = useState(false);

    // Custom alert modal state
    const [showApiKeyAlert, setShowApiKeyAlert] = useState(false);

    useEffect(() => {
        if (activeTab === 'official') {
            loadOfficialApps(true);
        }
    }, [activeTab, sortOrder]);

    // Auto-fetch covers for UP recommendations on mount
    useEffect(() => {
        if (hasFetchedUpCovers) return;

        const fetchUpCovers = async () => {
            const allIds = UP_RECOMMENDATIONS.flatMap(group => group.apps.map(app => app.id));
            // Filter out already cached apps (but include ones with errors to retry)
            const uncachedIds = allIds.filter(id => !appCache[id]?.appInfo || appCache[id]?.error);

            if (uncachedIds.length === 0) {
                setHasFetchedUpCovers(true);
                return;
            }

            // Fetch in batches of 5 to avoid overwhelming the server
            const batchSize = 5;
            for (let i = 0; i < uncachedIds.length; i += batchSize) {
                const batch = uncachedIds.slice(i, i + batchSize);
                const results = await Promise.all(batch.map(id => getAppDetailById(id)));

                setAppCache(prev => {
                    const newCache = { ...prev };
                    results.forEach((result, idx) => {
                        if (result) {
                            const appId = batch[idx];
                            newCache[appId] = {
                                nodes: [],
                                appInfo: {
                                    webappName: result.name,
                                    description: result.intro || '',
                                    covers: result.covers?.map(c => ({
                                        thumbnailUri: c.thumbnailUri,
                                        uri: c.fileUri || c.thumbnailUri
                                    })),
                                    statisticsInfo: {
                                        likeCount: String(result.statisticsInfo?.likeCount || 0),
                                        useCount: String(result.statisticsInfo?.useCount || 0),
                                        collectCount: String(result.statisticsInfo?.collectCount || 0),
                                        downloadCount: '0'
                                    }
                                }
                            };
                        }
                    });
                    localStorage.setItem('rh_app_cache', JSON.stringify(newCache));
                    return newCache;
                });
            }
            setHasFetchedUpCovers(true);
        };

        fetchUpCovers();
    }, [hasFetchedUpCovers, appCache]);

    const loadOfficialApps = async (reset = false, keywordOverride?: string) => {
        const pageToLoad = reset ? 1 : currentPage + 1;
        const currentKeyword = keywordOverride !== undefined ? keywordOverride : searchKeyword;

        if (reset) {
            setIsLoadingOfficial(true);
        } else {
            setIsLoadingMore(true);
        }

        try {
            const res = await getOfficialAppList(pageToLoad, 50, sortOrder, currentKeyword);

            if (reset) {
                setOfficialApps(res.records);
                setCurrentPage(1);
            } else {
                setOfficialApps(prev => [...prev, ...res.records]);
                setCurrentPage(pageToLoad);
            }

            setTotalApps(res.total);
            setHasLoadedOfficial(true);
        } catch (e) {
            console.error("Failed to load official apps", e);
        } finally {
            if (reset) {
                setIsLoadingOfficial(false);
            } else {
                setIsLoadingMore(false);
            }
        }
    };

    // Flatten apps for unified display
    const allApps = useMemo(() => {
        return UP_RECOMMENDATIONS.flatMap(group =>
            group.apps.map(app => ({ ...app, upName: group.name }))
        );
    }, []);

    // Fetch Logic
    const fetchAppData = async (appId: string, apiKey: string): Promise<void> => {
        try {
            const result = await getNodeList(apiKey, appId);
            setAppCache(prev => {
                const newState = {
                    ...prev,
                    [appId]: {
                        nodes: result.nodes,
                        appInfo: result.appInfo
                    }
                };
                // Persist to local storage
                localStorage.setItem('rh_app_cache', JSON.stringify(newState));
                return newState;
            });
        } catch (e: any) {
            console.error(`Failed to fetch app ${appId}:`, e);
            setAppCache(prev => {
                const newState = {
                    ...prev,
                    [appId]: {
                        nodes: [],
                        appInfo: null,
                        error: e.message || 'Details failed'
                    }
                };
                localStorage.setItem('rh_app_cache', JSON.stringify(newState));
                return newState;
            });
        }
    };

    const handleRefreshAll = async () => {
        if (apiKeys.length === 0) {
            setShowApiKeyAlert(true);
            return;
        }

        setIsRefreshing(true);
        setRefreshProgress(0);

        const total = allApps.length;
        let completed = 0;

        const batchSize = 3;
        for (let i = 0; i < total; i += batchSize) {
            const batch = allApps.slice(i, i + batchSize);
            await Promise.all(batch.map(item => fetchAppData(item.id, apiKeys[0])));
            completed += batch.length;
            setRefreshProgress(Math.floor((completed / total) * 100));
        }

        setIsRefreshing(false);
    };

    const handleInstantUse = (appId: string) => {
        const cached = appCache[appId];
        if (cached && cached.appInfo && !cached.error) {
            onSelectApp(appId, { nodes: cached.nodes, appInfo: cached.appInfo });
        } else {
            // If not cached, just go there and let it load naturally (or trigger load)
            onSelectApp(appId);
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0F1115] overflow-auto p-6">
            <div className="flex items-center justify-between mb-6 border-b border-slate-200 dark:border-slate-800 pb-2 shrink-0">
                <div className="flex gap-6">
                    <button
                        onClick={() => setActiveTab('excellent')}
                        className={`pb-2 text-sm font-semibold transition-colors border-b-2 -mb-2.5 px-1 ${activeTab === 'excellent'
                            ? 'text-brand-600 dark:text-brand-400 border-brand-600 dark:border-brand-400'
                            : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        优秀UP应用推荐
                    </button>
                    <button
                        onClick={() => setActiveTab('official')}
                        className={`pb-2 text-sm font-semibold transition-colors border-b-2 -mb-2.5 px-1 ${activeTab === 'official'
                            ? 'text-brand-600 dark:text-brand-400 border-brand-600 dark:border-brand-400'
                            : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        官方应用商城
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    {activeTab === 'official' && (
                        <>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                                    <Search className="h-3.5 w-3.5" />
                                </div>
                                <input
                                    type="text"
                                    value={searchKeyword}
                                    onChange={(e) => setSearchKeyword(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && loadOfficialApps(true)}
                                    placeholder="搜索应用..."
                                    className="block w-40 pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-1 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 group-hover:bg-slate-50 dark:group-hover:bg-slate-800"
                                />
                                {searchKeyword && (
                                    <button
                                        onClick={() => {
                                            setSearchKeyword('');
                                            loadOfficialApps(true, '');
                                        }}
                                        className="absolute inset-y-0 right-0 pr-2 flex items-center cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                            <select
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value)}
                                className="bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 rounded-lg px-2 py-1.5 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                                <option value="RECOMMEND">综合推荐</option>
                                <option value="NEWEST">最新发布</option>
                                <option value="HOTTEST">热门应用</option>
                                <option value="REPUTATION">最多好评</option>
                            </select>
                        </>
                    )}

                    <button
                        onClick={handleRefreshAll}
                        disabled={isRefreshing}
                        className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors disabled:opacity-50"
                    >
                        {isRefreshing ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>同步中 {refreshProgress}%</span>
                            </>
                        ) : (
                            <>
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>同步应用信息</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                {activeTab === 'excellent' ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 pb-10">
                        {allApps.map((app) => {
                            const cached = appCache[app.id];
                            const info = cached?.appInfo;
                            const hasError = !!cached?.error;

                            return (
                                <div
                                    key={app.id}
                                    className="group relative flex flex-col bg-white dark:bg-[#1a1d24] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-brand-300 dark:hover:border-brand-700 transition-all duration-300 overflow-hidden"
                                >
                                    {/* Card Image Area - 3:4 Aspect Ratio */}
                                    <div className="relative aspect-[3/4] bg-slate-100 dark:bg-[#252830] overflow-hidden">
                                        {info?.covers?.[0]?.thumbnailUri ? (
                                            <img
                                                src={info.covers[0].thumbnailUri}
                                                alt={app.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                                                <Globe className="w-8 h-8 opacity-20" />
                                                {hasError && <span className="text-[10px] text-red-400">加载失败</span>}
                                            </div>
                                        )}

                                        {/* UP Badge (Top Left) */}
                                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-md flex items-center gap-1 z-10">
                                            <User className="w-2.5 h-2.5 text-brand-400" />
                                            <span className="text-[10px] font-medium text-white/90">{app.upName}</span>
                                        </div>

                                        {/* Favorite Button (Top Right) */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleFavorite({
                                                    webappId: app.id,
                                                    name: app.name,
                                                    upName: app.upName,
                                                    appInfo: info || undefined,
                                                    nodes: cached?.nodes || undefined
                                                });
                                            }}
                                            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/50 transition-colors z-10 group/fav"
                                        >
                                            <Star
                                                className={`w-4 h-4 transition-colors ${favorites.some(f => f.webappId === app.id)
                                                    ? 'fill-amber-400 text-amber-400'
                                                    : 'text-white group-hover/fav:text-amber-400'
                                                    }`}
                                            />
                                        </button>

                                        {/* Overlay Gradient */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />

                                        {/* Instant Use Button (Hover - Centered for better access in 3:4) */}
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <button
                                                onClick={() => handleInstantUse(app.id)}
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
                                                title={app.name}
                                            >
                                                {app.name}
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
                                                        {hasError ? "不可用" : "需同步"}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {allApps.length === 0 && (
                            <div className="col-span-full text-sm text-slate-400 italic">暂无推荐</div>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 pb-10">
                        {isLoadingOfficial ? (
                            <div className="col-span-full flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <span>加载中...</span>
                            </div>
                        ) : (
                            <>
                                {officialApps.map((app) => (
                                    <div
                                        key={app.id}
                                        className="group relative flex flex-col bg-white dark:bg-[#1a1d24] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-brand-300 dark:hover:border-brand-700 transition-all duration-300 overflow-hidden"
                                    >
                                        {/* Card Image Area - 3:4 Aspect Ratio */}
                                        <div className="relative aspect-[3/4] bg-slate-100 dark:bg-[#252830] overflow-hidden">
                                            {app.covers?.[0]?.thumbnailUri ? (
                                                <img
                                                    src={app.covers[0].thumbnailUri}
                                                    alt={app.name}
                                                    loading="lazy"
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                                                    <Globe className="w-8 h-8 opacity-20" />
                                                </div>
                                            )}

                                            {/* Author Badge (Top Left) */}
                                            {app.authorInfo && (
                                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-md flex items-center gap-1 z-10">
                                                    <User className="w-2.5 h-2.5 text-brand-400" />
                                                    <span className="text-[10px] font-medium text-white/90">{app.authorInfo.name}</span>
                                                </div>
                                            )}

                                            {/* Favorite Button (Top Right) */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // For official apps, currently we don't have full node info details cached from list
                                                    // But we can still favorite it. It will fetch details when clicked/loaded if needed.
                                                    // Or better, fetch details now? 
                                                    // The existing fav logic expects WebAppInfo and optionally nodes.
                                                    // The app list item has minimal info.
                                                    // Let's toggle without details, it might miss some info but id/name is there.
                                                    onToggleFavorite({
                                                        webappId: app.id,
                                                        name: app.name,
                                                        upName: app.authorInfo?.name || 'Official',
                                                        // We pass part of what we have. API type mismatch might occur if strict.
                                                        // Using 'as any' or mapping carefully.
                                                        appInfo: {
                                                            webappName: app.name,
                                                            description: app.intro || '',
                                                            covers: app.covers?.map(c => ({
                                                                thumbnailUri: c.thumbnailUri,
                                                                uri: c.fileUri || c.thumbnailUri
                                                            })),
                                                            statisticsInfo: {
                                                                likeCount: String(app.statisticsInfo?.likeCount || 0),
                                                                useCount: String(app.statisticsInfo?.useCount || 0),
                                                                collectCount: String(app.statisticsInfo?.collectCount || 0),
                                                                downloadCount: '0'
                                                            }
                                                        }
                                                    });
                                                }}
                                                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/50 transition-colors z-10 group/fav"
                                            >
                                                <Star
                                                    className={`w-4 h-4 transition-colors ${favorites.some(f => f.webappId === app.id)
                                                        ? 'fill-amber-400 text-amber-400'
                                                        : 'text-white group-hover/fav:text-amber-400'
                                                        }`}
                                                />
                                            </button>

                                            {/* Overlay Gradient */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />

                                            {/* Instant Use Button */}
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                <button
                                                    onClick={() => {
                                                        // Since we don't have nodes yet, just select it.
                                                        // The parent component handles loading if needed, or we rely on 'handleInstantUse' logic?
                                                        // handleInstantUse logic checks cache.
                                                        // If not in cache, onSelectApp is called without details, triggering a fetch in parent/Config?
                                                        // Yes, line 109: onSelectApp(appId)
                                                        onSelectApp(app.id);
                                                    }}
                                                    className="flex items-center gap-1 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg transform scale-90 group-hover:scale-100 transition-transform"
                                                >
                                                    <Play className="w-3.5 h-3.5 fill-current" />
                                                    立即使用
                                                </button>
                                            </div>

                                            {/* Info Overlay */}
                                            <div className="absolute bottom-0 left-0 right-0 p-3 pt-8 bg-gradient-to-t from-black/90 to-transparent flex flex-col gap-1">
                                                <h4
                                                    className="font-bold text-white text-xs line-clamp-2 leading-relaxed"
                                                    title={app.name}
                                                >
                                                    {app.name}
                                                </h4>

                                                <div className="flex items-center justify-between text-[10px] text-slate-300">
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex items-center gap-0.5" title="使用次数">
                                                            <MousePointerClick className="w-3 h-3 text-brand-400" />
                                                            {app.statisticsInfo?.useCount || 0}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex items-center gap-0.5" title="喜欢">
                                                            <Heart className="w-3 h-3 text-red-400" />
                                                            {app.statisticsInfo?.likeCount || 0}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {officialApps.length === 0 && (
                                    <div className="col-span-full text-sm text-slate-400 italic">暂无推荐</div>
                                )}

                                {officialApps.length > 0 && officialApps.length < totalApps && (
                                    <div className="col-span-full flex justify-center py-6">
                                        <button
                                            onClick={() => loadOfficialApps(false)}
                                            disabled={isLoadingMore}
                                            className="px-6 py-2 bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-slate-800 rounded-full text-sm text-slate-600 dark:text-slate-300 hover:border-brand-500 hover:text-brand-500 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isLoadingMore ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    <span>加载中...</span>
                                                </>
                                            ) : (
                                                <span>加载更多</span>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* API Key Alert Modal */}
            {showApiKeyAlert && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-[#1a1d24] rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-amber-500" />
                                提示
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                请先在个人中心配置消费级 API Key 再试
                            </p>
                        </div>
                        <div className="px-6 pb-6">
                            <button
                                onClick={() => setShowApiKeyAlert(false)}
                                className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg transition-colors"
                            >
                                确定
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default HomeView;
