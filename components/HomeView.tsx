import React, { useState, useEffect } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { Globe, RefreshCw, Heart, MousePointerClick, Star, Play, Loader2, User, Search, X, Github, ExternalLink, Gift, Users, Coffee } from 'lucide-react';
import { NodeInfo, WebAppInfo, Favorite, HomeDefaultTab } from '../types';
import { getOfficialAppList, AppListItem } from '../services/api';

interface HomeViewProps {
    onSelectApp: (appId: string, preloadedData?: { nodes: NodeInfo[], appInfo: WebAppInfo }) => void;
    favorites: Favorite[];
    onToggleFavorite: (app: Favorite) => void;
    defaultTab: HomeDefaultTab;
    resetToken: number;
}

const HomeView: React.FC<HomeViewProps> = ({ onSelectApp, favorites, onToggleFavorite, defaultTab, resetToken }) => {
    const [activeTab, setActiveTab] = useState<HomeDefaultTab>(defaultTab);

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

    useEffect(() => {
        if (activeTab === 'official') {
            loadOfficialApps(true);
        }
    }, [activeTab, sortOrder]);


    useEffect(() => {
        setActiveTab(defaultTab);
    }, [defaultTab, resetToken]);

    const loadOfficialApps = async (reset = false, keywordOverride?: string, forceRefresh = false) => {
        const pageToLoad = reset ? 1 : currentPage + 1;
        const currentKeyword = keywordOverride !== undefined ? keywordOverride : searchKeyword;
        const isDefaultFetch = reset && currentKeyword === '' && sortOrder === 'RECOMMEND';

        if (reset) {
            setIsLoadingOfficial(true);
        } else {
            setIsLoadingMore(true);
        }

        try {
            if (isDefaultFetch && !forceRefresh && localStorage.getItem('rh_refresh_store_startup') === 'false') {
                try {
                    const cached = localStorage.getItem('rh_official_apps_cache');
                    if (cached) {
                        const parsedCache = JSON.parse(cached);
                        if (parsedCache?.records?.length > 0) {
                            setOfficialApps(parsedCache.records);
                            setCurrentPage(1);
                            setTotalApps(parsedCache.total);
                            setHasLoadedOfficial(true);
                            setIsLoadingOfficial(false);
                            return;
                        }
                    }
                } catch (e) {}
            }

            const res = await getOfficialAppList(pageToLoad, 50, sortOrder, currentKeyword);

            if (reset) {
                setOfficialApps(res.records);
                setCurrentPage(1);
                if (isDefaultFetch) {
                    localStorage.setItem('rh_official_apps_cache', JSON.stringify({ records: res.records, total: res.total }));
                }
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

    return (
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0F1115] overflow-auto p-6">
            <div className="flex items-center justify-between mb-6 border-b border-slate-200 dark:border-slate-800 pb-2 shrink-0">
                <div className="flex gap-6">
                    <button
                        onClick={() => setActiveTab('official')}
                        className={`pb-2 text-sm font-semibold transition-colors border-b-2 -mb-2.5 px-1 ${activeTab === 'official'
                            ? 'text-brand-600 dark:text-brand-400 border-brand-600 dark:border-brand-400'
                            : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        官方应用商城
                    </button>
                    <button
                        onClick={() => setActiveTab('support')}
                        className={`pb-2 text-sm font-semibold transition-colors border-b-2 -mb-2.5 px-1 ${activeTab === 'support'
                            ? 'text-brand-600 dark:text-brand-400 border-brand-600 dark:border-brand-400'
                            : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        交流与支持
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
                            <button
                                onClick={() => loadOfficialApps(true, searchKeyword, true)}
                                className="flex items-center justify-center p-1.5 ml-2 mr-2 text-brand-600 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/30 dark:hover:bg-brand-900/50 rounded-lg transition-colors border border-brand-200 dark:border-brand-800"
                                title="手动刷新"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
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
                </div>
            </div>

            <div className="flex-1 min-h-0">
                {activeTab === 'official' ? (
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
                                            {app.owner && (
                                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-md flex items-center gap-1 z-10">
                                                    <User className="w-2.5 h-2.5 text-brand-400" />
                                                    <span className="text-[10px] font-medium text-white/90">{app.owner.name}</span>
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
                                                        upName: app.owner?.name || 'Official',
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
                ) : activeTab === 'support' ? (
                    <div className="max-w-7xl mx-auto py-1 px-4 h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-500">

                        
                        <div className="flex flex-col lg:flex-row gap-6 items-start">
                            {/* Left Column: Donation (Enlarged) */}
                            <div className="w-full lg:w-[440px] shrink-0 order-1 lg:order-1">
                                <div className="relative overflow-hidden rounded-[2rem] bg-white dark:bg-[#1a1d24] border-2 border-slate-100 dark:border-slate-800 p-8 shadow-xl hover:shadow-2xl transition-all duration-500 group border-amber-100 dark:border-amber-900/20">
                                    <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-amber-500/10 transition-colors" />
                                    
                                    <div className="relative z-10 flex flex-col gap-6">
                                        <div className="flex items-center gap-3">
                                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-2xl text-amber-500">
                                                <Coffee className="w-6 h-6 animate-bounce" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-slate-900 dark:text-white">赞助项目发展</h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">您的支持是持续维护的动力</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center gap-6 py-4 px-2">
                                            <div className="shrink-0 relative">
                                                <div className="absolute -inset-2 bg-gradient-to-r from-amber-200 to-orange-400 dark:from-amber-900 dark:to-orange-900 rounded-[1.5rem] blur opacity-40 group-hover:opacity-70 transition-opacity duration-700" />
                                                <img 
                                                    src="/kafei.jpg" 
                                                    alt="Donate QR" 
                                                    className="relative w-48 h-48 object-cover rounded-[1.2rem] shadow-lg border-4 border-white dark:border-[#252830] transform group-hover:scale-105 transition-transform duration-500" 
                                                />
                                            </div>
                                            
                                            <div className="space-y-4 text-center">
                                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium px-4">
                                                    RH客户端 的开发与维护需要大量的精力，如果您觉得本工具对您有所帮助，欢迎赞助作者喝杯咖啡。支持是持续维护的动力。
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 italic text-center">
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                                                "开源精神薪火相传，每一份支持都是前进的力量。"
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Other Modules Grid */}
                            <div className="flex-1 w-full order-2 lg:order-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    
                                    {/* Phantom AI */}
                                    <a
                                        href="https://phantomai.top/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group md:col-span-2 relative overflow-hidden rounded-2xl bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-colors" />
                                        <div className="relative z-10 flex items-center gap-4">
                                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
                                                <Globe className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1 group-hover:text-blue-500 transition-colors">幻影AI 项目中心</h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight mb-3">关注开源生态及项目动态，探索 AI 精彩世界。</p>
                                                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                                                    <span>立即前往</span>
                                                    <ExternalLink className="w-3 h-3" />
                                                </div>
                                            </div>
                                        </div>
                                    </a>

                                    {/* Github */}
                                    <a
                                        href="https://github.com/colorAi/RunningHub-AI-Client"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group relative overflow-hidden rounded-2xl bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300"
                                    >
                                        <div className="relative z-10 flex flex-col h-full">
                                            <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300 w-max mb-4">
                                                <Github className="w-6 h-6" />
                                            </div>
                                            <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">GitHub 仓库</h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">欢迎提交 PR 或 Issue，贡献代码与建议。</p>
                                        </div>
                                    </a>

                                    {/* Bilibili */}
                                    <a
                                        href="https://space.bilibili.com/527601196?spm_id_from=333.40164.0.0"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group relative overflow-hidden rounded-2xl bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300"
                                    >
                                        <div className="relative z-10 flex flex-col h-full items-center text-center">
                                            <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-full text-pink-500 mb-4 group-hover:scale-110 transition-transform">
                                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                                                    <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.87.001 17.36V10.03c-.014-1.523.492-2.771 1.518-3.746.955-.907 2.185-1.42 3.69-1.537l-.023-.021L3.99 3.09 5.8 1.28l3.181 3.182h6.038l3.182-3.182 1.81 1.81-1.198 1.563ZM5.333 6.36c-1.005.035-1.842.38-2.51.035 0 0-.256.126-.464.334-.23.23-.377.533-.442.909L1.91 7.64v9.72c.046 1.054.405 1.91 1.077 2.566.671.657 1.545 1.002 2.622 1.034h12.783c1.076-.032 1.95-.377 2.622-1.034.671-.657 1.03-1.512 1.077-2.566V7.64c-.056-1.085-.415-1.954-1.077-2.607-.662-.653-1.526-1.002-2.593-1.046l-.029.012H5.333Zm3.583 3.667h2.5v2.5h-2.5v-2.5Zm6 0h2.5v2.5h-2.5v-2.5Z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">哔哩哔哩</h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">@HooTooH 开发日记</p>
                                        </div>
                                    </a>

                                    {/* Register & Gift */}
                                    <a
                                        href="https://www.runninghub.cn/?inviteCode=rh-v1123"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-brand-500 p-5 shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-700" />
                                        <div className="relative z-10 flex flex-col h-full text-white">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl">
                                                    <Gift className="w-6 h-6" />
                                                </div>
                                                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-[10px] font-black leading-none uppercase tracking-widest">Gift</span>
                                            </div>
                                            <h3 className="text-base font-bold mb-1">1000 RH 币礼包</h3>
                                            <p className="text-xs text-white/80 mb-4 flex-1">邀请码 <strong className="font-mono bg-black/20 px-1.5 py-0.5 rounded ml-1">rh-v1123</strong></p>
                                            <div className="flex items-center gap-2 text-[10px] font-black bg-white text-brand-600 w-max px-5 py-2 rounded-full shadow-lg">
                                                <span>立即体验</span>
                                                <ExternalLink className="w-3 h-3" />
                                            </div>
                                        </div>
                                    </a>

                                    {/* QQ Group */}
                                    <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-[#1a1d24] border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-center text-center">
                                        <div className="absolute inset-0 bg-slate-50 dark:bg-slate-800/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="relative z-10 flex flex-col items-center">
                                            <div className="p-3.5 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-600 dark:text-slate-400 mb-3 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors">
                                                <Users className="w-7 h-7" />
                                            </div>
                                            <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">日常交流答疑</h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">欢迎加入微信/QQ交流</p>
                                            <div className="text-lg font-mono font-black text-brand-600 dark:text-brand-400 select-all border-2 border-dashed border-brand-200 dark:border-brand-900/50 bg-brand-50/50 dark:bg-brand-900/10 px-4 py-1.5 rounded-xl w-max mx-auto shadow-sm">
                                                543917943
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default HomeView;
