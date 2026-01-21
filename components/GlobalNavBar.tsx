import React from 'react';
import { Home, Star, Briefcase, Settings, User } from 'lucide-react';

export type ViewType = 'home' | 'favorites' | 'workspace' | 'tools';

interface GlobalNavBarProps {
    currentView: ViewType;
    onViewChange: (view: ViewType) => void;
    onOpenSettings: () => void;
}

const GlobalNavBar: React.FC<GlobalNavBarProps> = ({ currentView, onViewChange, onOpenSettings }) => {
    const tabs: { id: ViewType; label: string; icon: React.FC<any> }[] = [
        { id: 'home', label: '首页', icon: Home },
        { id: 'favorites', label: '我的收藏', icon: Star },
        { id: 'workspace', label: '工作区', icon: Briefcase },
        { id: 'tools', label: '其他工具', icon: Settings },
    ];

    return (
        <div className="bg-white dark:bg-[#161920] border-b border-slate-200 dark:border-slate-800/50 flex w-full">
            <div className="flex-1 flex px-4 gap-6">
                {tabs.map((tab) => {
                    const isActive = currentView === tab.id;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onViewChange(tab.id)}
                            className={`flex items-center gap-2 py-3 border-b-2 transition-colors ${isActive
                                    ? 'border-brand-500 text-brand-600 dark:text-brand-400 font-medium'
                                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            <span className="text-sm">{tab.label}</span>
                        </button>
                    );
                })}
            </div>
            <div className="flex items-center px-4 border-l border-slate-200 dark:border-slate-800/50">
                <button
                    onClick={onOpenSettings}
                    className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                    <User className="w-4 h-4" />
                    <span>个人中心</span>
                </button>
            </div>
        </div>
    );
};

export default GlobalNavBar;
