import React, { useState } from 'react';
import { History, Star } from 'lucide-react';
import { HistoryItem, DecodeConfig, Favorite } from '../types';
import StepResult from './StepResult';
import FavoritesPanel from './FavoritesPanel';

interface WorkspacePanelProps {
    history: HistoryItem[];
    favorites: Favorite[];
    decodeConfig: DecodeConfig;
    apiKeys: string[];
    onClearHistory: () => void;
    onUpdateFavorites: (favorites: Favorite[]) => void;
    onSelectFavorite: (favorite: Favorite) => void;
}

const WorkspacePanel: React.FC<WorkspacePanelProps> = ({
    history,
    favorites,
    decodeConfig,
    apiKeys,
    onClearHistory,
    onUpdateFavorites,
    onSelectFavorite
}) => {
    const [activeTab, setActiveTab] = useState<'history' | 'favorites'>('history');

    return (
        <div className="flex flex-col h-full bg-white dark:bg-[#161920]">
            {/* Tab Header */}
            <div className="flex items-center gap-1 px-5 pt-5 pb-0 border-b border-slate-200 dark:border-slate-800/50 shrink-0">
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                        activeTab === 'history'
                            ? 'text-brand-600 dark:text-brand-400 border-brand-600 dark:border-brand-400'
                            : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                    <History className="w-4 h-4" />
                    历史记录
                </button>
                <button
                    onClick={() => setActiveTab('favorites')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                        activeTab === 'favorites'
                            ? 'text-brand-600 dark:text-brand-400 border-brand-600 dark:border-brand-400'
                            : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                    <Star className="w-4 h-4" />
                    我的收藏
                </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'history' ? (
                    <StepResult
                        history={history}
                        decodeConfig={decodeConfig}
                        onClear={onClearHistory}
                    />
                ) : (
                    <FavoritesPanel
                        favorites={favorites}
                        onSelectApp={onSelectFavorite}
                        apiKeys={apiKeys}
                        onUpdateFavorites={onUpdateFavorites}
                    />
                )}
            </div>
        </div>
    );
};

export default WorkspacePanel;
